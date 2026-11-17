/**
 * Deepika's virtual assistant on WhatsApp: the part shared by every way of connecting a number.
 * - Meta's WhatsApp Cloud API: server/routes/whatsapp.ts
 * - Twilio (its WhatsApp sandbox, or a number bought from Twilio): server/routes/twilioWhatsapp.ts
 * Each one turns its webhook into an InboundMessage and calls receiveMessage() with a transport that knows how to
 * send replies back the same way.
 *
 * It answers questions from the full business facts plus the RAG knowledge base, checks Deepika's availability
 * calendar (marked by her team in the dashboard), takes booking requests (saved to the same `bookings` table as the
 * website form, with source 'whatsapp'), and hands chats over to Deepika when asked.
 *
 * Two ways to run it:
 * - Own number (default): the assistant has its own WhatsApp number, separate from Deepika's. Nobody reads these
 *   chats, so for anything personal it gives Deepika's own WhatsApp and phone, and "Talk to Deepika" saves the
 *   customer as a lead in the dashboard for her to contact. The bot keeps answering afterwards.
 * - Coexistence (WHATSAPP_COEXISTENCE=true, Meta only): the assistant answers on Deepika's own number, which she keeps
 *   using in the WhatsApp Business app. She sees every chat; when she replies from the app, the bot steps back from
 *   that chat for WHATSAPP_HUMAN_TAKEOVER_HOURS so the two never talk over each other.
 *
 * Every conversation is saved in the database (server/whatsappChats.ts), and each reply is written from what is
 * stored there. On Vercel each message can reach a different, freshly started instance with empty memory, so this is
 * what lets the assistant remember the chat: earlier questions, the date and details already given, and that it has
 * already welcomed the customer. Without a database the conversations are kept in memory instead.
 */
import type { ChatCompletionMessageParam } from 'openai/resources';
import { SERVICE_NOT_SPECIFIED } from '../src/data/leads.js';
import { BUSINESS_INFO as B, WHATSAPP_CONTACTS } from '../src/data/portfolioData.js';
import { retrieve, searchOnlyAnswer, type ChatMessage, type Retrieved } from './assistant.js';
import { assistantStatusOf, checkAvailabilityTool, isIsoDate, todayInAtlanta } from './availability.js';
import { inBackground } from './background.js';
import { getDb, pool } from './db.js';
import { BOOKABLE_SERVICES, businessFacts } from './knowledge.js';
import { sourceFromAdUrl } from './leads.js';
import { buildWhatsAppSystemPrompt, completeChatWithTools, NO_REPLY, openai, OPENAI_MODEL, type ChatTool } from './llm.js';
import { chatStore as chats, type ChatInfo } from './whatsappChats.js';
import { QUOTATIONS, QUOTE_OCCASIONS, WELCOME_MESSAGE, type QuoteOccasion } from './whatsappQuotes.js';

const LOG = '[whatsapp]';

/** Coexistence: the bot shares Deepika's own number, so she reads these chats. Otherwise the bot has its own number. */
const SHARED_NUMBER = /^(1|true|yes|on)$/i.test(process.env.WHATSAPP_COEXISTENCE?.trim() ?? '');
export const whatsappMode = SHARED_NUMBER ? 'coexistence' : 'own_number';
const TAKEOVER_MS = (Number(process.env.WHATSAPP_HUMAN_TAKEOVER_HOURS) || 12) * 3_600_000;

/** How to reach Deepika herself, for the bot's own number: her WhatsApp links and phone. */
const DIRECT_WHATSAPP = WHATSAPP_CONTACTS.map((c) => `${c.url} (${c.country})`).join(' or ');
const REACH_DEEPIKA = `message ${B.artist} on WhatsApp at ${DIRECT_WHATSAPP}, or call ${B.phonePrimary}`;

/** Wait this long after a message for more ("hi" … "how much for bridal?") and answer them together. */
const GATHER_MS = 1500;
/**
 * Longest a reply waits for the knowledge search. On a running server it takes well under 100 ms, but a freshly
 * started Vercel instance first has to download and load the search model, which takes seconds. The reply then goes
 * ahead without the extra search results: the business facts (services, prices, FAQs) are always in the prompt.
 */
const SEARCH_BUDGET_MS = 1000;
/** Every WhatsApp reply starts with the same prompt, so they share one place in OpenAI's prompt cache. */
const PROMPT_CACHE_KEY = 'dmh-whatsapp-assistant';
/** Customer messages older than this (e.g. redelivered after downtime) are left for Deepika. */
const MAX_MESSAGE_AGE_MS = 10 * 60_000;
/** Earlier messages the model sees: plenty to collect a booking request (name, service, date, place, people, confirmation). */
const MAX_HISTORY = 30;
/** Longest customer message kept, and longest question (messages sent together) the model answers. */
const MAX_MESSAGE_CHARS = 1500;
const MAX_QUESTION_CHARS = 2000;
const MAX_REPLIES_PER_10_MIN = 15;
/**
 * One reply is written per chat at a time, even across server instances. A message that comes in meanwhile waits
 * for that reply, then gets its own. The claim expires on its own if an instance dies while holding it.
 */
const REPLY_CLAIM_MS = 100_000;
const REPLY_WAIT_MS = 45_000;
/** Photos, voice notes and files are acknowledged at most this often per chat. */
const MEDIA_ACK_EVERY_MS = 30 * 60_000;
/** WhatsApp's limit for a text message body is 4096 characters (transports split further if they need to). */
const MAX_REPLY_CHARS = 4000;
const FORGET_AFTER_MS = 24 * 3_600_000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FALLBACK = SHARED_NUMBER
  ? `Thank you for your message! I don't have that detail on hand, but ${B.artist} will reply to you personally here soon.`
  : `Thank you for your message! I don't have that detail on hand. To ask ${B.artist} personally, please ${REACH_DEEPIKA}.`;
const HANDOFF_REPLY = SHARED_NUMBER
  ? `Of course! I've let ${B.artist} know, and she'll reply to you personally here soon.`
  : `Of course! I've passed your number to ${B.artist}, and she'll contact you personally. To reach her right away, ${REACH_DEEPIKA}.`;
/** Own number, when the hand-over couldn't be saved for Deepika. */
const HANDOFF_DIRECT_REPLY = `Of course! To talk to ${B.artist} personally, please ${REACH_DEEPIKA}.`;
/** How a tap on the "Talk to Deepika" button is saved in the conversation. */
const TALK_TO_DEEPIKA = 'Talk to Deepika';

/** What a tapped quick-reply button means, as the customer's message to the assistant (see the Meta transport). */
export const BUTTON_MEANING: Record<string, string> = {
  book: 'I would like to book an appointment.',
  services: 'What services do you offer?',
};

export type MediaKind = 'image' | 'video' | 'document' | 'audio';

/** How media shows up in the chat history, and the reply when there is no language model. */
const MEDIA: Record<MediaKind, { marker: string; reply: string }> = SHARED_NUMBER
  ? {
      image: { marker: '[The customer sent a photo, which you cannot see]', reply: `Thank you for sharing this! I can't view photos myself, but ${B.artist} will look at it and reply personally. Meanwhile, I'm happy to answer any questions by text.` },
      video: { marker: '[The customer sent a video, which you cannot watch]', reply: `Thank you for sharing this! I can't watch videos myself, but ${B.artist} will see it and reply personally. Meanwhile, I'm happy to answer any questions by text.` },
      document: { marker: '[The customer sent a file, which you cannot open]', reply: `Thank you! I can't open files myself, but ${B.artist} will look at it and reply personally. Meanwhile, I'm happy to answer any questions by text.` },
      audio: { marker: '[The customer sent a voice message, which you cannot listen to: ask them to type their question]', reply: `I can't listen to voice messages yet. Could you type your question? ${B.artist} will also hear your message and reply personally.` },
    }
  : {
      image: { marker: '[The customer sent a photo, which you cannot see]', reply: `Thank you for sharing this! I can't view photos myself. To show ${B.artist} your inspiration or outfit, please send it to her directly on WhatsApp: ${DIRECT_WHATSAPP}. Meanwhile, I'm happy to answer any questions here.` },
      video: { marker: '[The customer sent a video, which you cannot watch]', reply: `Thank you for sharing this! I can't watch videos myself. Please send it to ${B.artist} directly on WhatsApp: ${DIRECT_WHATSAPP}. Meanwhile, I'm happy to answer any questions here.` },
      document: { marker: '[The customer sent a file, which you cannot open]', reply: `Thank you! I can't open files myself. Please send it to ${B.artist} directly on WhatsApp: ${DIRECT_WHATSAPP}. Meanwhile, I'm happy to answer any questions here.` },
      audio: { marker: '[The customer sent a voice message, which you cannot listen to: ask them to type their question]', reply: `I can't listen to voice messages yet. Could you type your question? Voice messages for ${B.artist} herself can go to her WhatsApp: ${DIRECT_WHATSAPP}.` },
    };

const FACTS = businessFacts();

// ---------- What a connection (Meta, Twilio) provides ----------

/** Sends replies back through the connection a customer's message came in on. */
export interface WhatsAppTransport {
  /** For logs, e.g. "meta" or "twilio". */
  name: string;
  /** Sends one reply; `withButtons` adds the welcome buttons where the connection supports them. */
  send(to: string, body: string, withButtons: boolean): Promise<void>;
  /** Blue ticks plus "typing…" while the answer is prepared. Best effort: never throws. */
  markReadAndTyping(messageId: string): void;
}

/** Present on the first message of a chat opened from a click-to-WhatsApp ad. */
export interface Referral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}

/** One customer message, in the same shape whichever connection it came from. */
export interface InboundMessage {
  /** The connection's message ID (used to ignore redeliveries). */
  id: string;
  /** The customer's WhatsApp number, digits only, e.g. "15551234567". */
  from: string;
  /** When the customer sent it (ms since 1970), if the connection says. */
  sentAt?: number;
  profileName?: string;
  /** What they typed, a photo caption, or what a tapped button means. */
  text?: string | null;
  /** A photo, video, file or voice message, which the bot can't open. */
  media?: MediaKind;
  /** They tapped the "Talk to Deepika" button. */
  wantsDeepika?: boolean;
  referral?: Referral;
}

// ---------- Chat state ----------
// The conversation itself is in the database (whatsappChats.ts). This server instance only keeps its wait before
// replying, so that messages sent in quick succession are answered together.

interface Waiting {
  timer?: NodeJS.Timeout;
  /** Ends the background wait for `timer` (it keeps a Vercel function alive until the reply is sent). */
  done?: () => void;
}

const waits = new Map<string, Waiting>();
const seenMessageIds = new Map<string, number>();

/** Logs only the last 4 digits of a phone number. */
export const who = (waId: string) => `…${waId.slice(-4)}`;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** For the logs, e.g. "1.8 s"; "-" when not measured. */
const seconds = (ms: number | undefined) => (ms === undefined ? '-' : `${(ms / 1000).toFixed(1)} s`);

/** Webhooks can be delivered more than once (the database also catches a redelivery to another instance). */
function alreadySeen(id: string): boolean {
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.set(id, Date.now());
  return false;
}

function cancelWait(waId: string) {
  const w = waits.get(waId);
  if (!w) return;
  clearTimeout(w.timer);
  w.done?.();
  waits.delete(waId);
}

/** Coexistence: Deepika is handling the chat, so the bot stays quiet in it for a while. */
async function pauseBot(waId: string) {
  cancelWait(waId);
  await chats.pause(waId, Date.now() + TAKEOVER_MS);
}

setInterval(() => {
  const now = Date.now();
  for (const [id, at] of seenMessageIds) if (now - at > FORGET_AFTER_MS) seenMessageIds.delete(id);
}, 30 * 60_000).unref();

/** WhatsApp shows *bold* and plain URLs; turn any stray markdown from the model into that. */
function toWhatsAppText(text: string): string {
  const out = text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
  return out.length > MAX_REPLY_CHARS ? `${out.slice(0, MAX_REPLY_CHARS - 1)}…` : out;
}

const GREETING_WORDS = new Set(['hello', 'namaste', 'namaskar', 'namaskaram', 'vanakkam', 'good', 'morning', 'afternoon', 'evening', 'there', 'mam', 'madam', 'sir', 'ji', 'deepika', 'team']);
const GREETING_WORD_RE = /^(h+i+|h+a+i+|h+e+y+|h+e+l+o+|h+l+o+)$/;

/** A message that only says hello ("Hi", "hello madam 🙏"): the welcome message is the whole reply. */
function isGreeting(message: string): boolean {
  const words = message.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);
  return words.length > 0 && words.length <= 5 && words.every((w) => GREETING_WORDS.has(w) || GREETING_WORD_RE.test(w));
}

// ---------- Booking requests ----------

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

const CALENDAR_NOTE: Record<string, string> = {
  fully_booked: 'The calendar showed this date as FULLY BOOKED when the request was sent.',
  few_slots_left: 'The calendar showed only a few slots left on this date when the request was sent.',
};

/**
 * Saves a booking request from the chat. It updates instead of adding a row when the same customer already has
 * (a) a request for the same service from the last day (they were correcting a detail), or (b) an open lead from a
 * click-to-WhatsApp ad in the last 30 days that doesn't say what they want yet.
 * The result tells the model the date's calendar status; a full or nearly full date is also noted for Deepika.
 */
async function saveBookingRequest(waId: string, chat: ChatInfo, args: Record<string, unknown>) {
  if (!pool) return { ok: false, error: `Booking requests can't be saved right now. Tell the customer ${B.artist} will reply personally.` };

  const fullName = text(args.full_name, 120);
  const service = text(args.service, 200);
  const eventDate = text(args.event_date, 10);
  const eventLocation = text(args.event_location, 200);
  const partySize = text(args.party_size, 100);
  const email = text(args.email, 200);
  let notes = text(args.notes, 2000);

  const problems: string[] = [];
  if (!fullName) problems.push('the full name is missing');
  if (!BOOKABLE_SERVICES.includes(service)) problems.push(`the service must be one of: ${BOOKABLE_SERVICES.join('; ')}`);
  if (!eventLocation) problems.push('the event location is missing');
  if (eventDate) {
    if (!isIsoDate(eventDate)) problems.push('the event date must be a real date (YYYY-MM-DD)');
    else if (eventDate < todayInAtlanta().iso) problems.push('the event date is in the past');
  }
  if (email && !EMAIL_RE.test(email)) problems.push('the email address looks invalid');
  if (problems.length) return { ok: false, error: `Not saved: ${problems.join('; ')}. Ask the customer about this.` };

  const dateStatus = eventDate ? await assistantStatusOf(eventDate) : null;
  if (dateStatus && CALENDAR_NOTE[dateStatus]) notes = [notes, CALENDAR_NOTE[dateStatus]].filter(Boolean).join('\n');
  const calendar = dateStatus ? { date_status: dateStatus } : {};

  const phone = `+${waId}`;
  const db = getDb();
  const earlier = await db.query<{ id: string; service: string }>(
    `SELECT id, service FROM bookings
      WHERE channel = 'whatsapp' AND phone = $1
        AND ((service = $2 AND created_at > now() - interval '1 day')
          OR (service = $3 AND created_at > now() - interval '30 days' AND status NOT IN ('converted', 'lost')))
      ORDER BY id DESC LIMIT 1`,
    [phone, service, SERVICE_NOT_SPECIFIED],
  );
  if (earlier.rows[0]) {
    await db.query(
      `UPDATE bookings SET full_name = $1, email = $2, service = $3, event_date = $4, event_location = $5,
              party_size = $6, notes = $7, updated_at = now()
        WHERE id = $8`,
      [fullName, email || null, service, eventDate || null, eventLocation, partySize || null, notes || null, earlier.rows[0].id],
    );
    // A lead without a service yet (from an ad, or an earlier "talk to Deepika") now gets the booking details
    const wasOpenLead = earlier.rows[0].service === SERVICE_NOT_SPECIFIED;
    console.log(`${LOG} ${wasOpenLead ? 'lead' : 'booking request'} #${earlier.rows[0].id} from ${who(waId)} updated with the booking details`);
    return wasOpenLead
      ? { ok: true, request_number: earlier.rows[0].id, ...calendar }
      : { ok: true, request_number: earlier.rows[0].id, updated_existing_request: true, ...calendar };
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (full_name, phone, email, service, event_date, event_location, party_size, notes, source, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'whatsapp')
     RETURNING id`,
    [fullName, phone, email || null, service, eventDate || null, eventLocation, partySize || null, notes || null, chat.adSource ?? 'whatsapp'],
  );
  console.log(`${LOG} new booking request #${rows[0].id} from ${who(waId)} for "${service}"`);
  return { ok: true, request_number: rows[0].id, ...calendar };
}

interface Turn {
  handoff: boolean;
  savedRequest?: string;
  /** Quotations to send word for word, each as its own message before the reply (send_quotation). */
  quotes: string[];
  /** How long the knowledge search and the language model took, for the log. */
  searchMs?: number;
  aiMs?: number;
}

/**
 * A chat that starts from a click-to-WhatsApp ad is a lead straight away, even before any booking details.
 * One open lead per customer: a repeat ad click within 30 days reuses it.
 */
async function saveAdLead(waId: string, chat: ChatInfo, referral: Referral, source: string) {
  if (!pool) return;
  const phone = `+${waId}`;
  const db = getDb();
  const open = await db.query(
    `SELECT 1 FROM bookings WHERE channel = 'whatsapp' AND phone = $1 AND created_at > now() - interval '30 days'
        AND status NOT IN ('converted', 'lost')`,
    [phone],
  );
  if (open.rowCount) return;
  const headline = referral.headline?.trim().slice(0, 200) || null;
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (full_name, phone, service, notes, source, channel, campaign, ad_name, external_id)
     VALUES ($1, $2, $3, $4, $5, 'whatsapp', $6, $7, $8)
     ON CONFLICT (external_id) WHERE external_id IS NOT NULL DO NOTHING
     RETURNING id`,
    [
      chat.profileName || 'WhatsApp lead',
      phone,
      SERVICE_NOT_SPECIFIED,
      `Started a WhatsApp chat from an ad${headline ? `: "${headline}"` : ''}.${referral.body ? `\nAd text: ${referral.body.slice(0, 500)}` : ''}`,
      source,
      headline,
      referral.source_id ? `Ad ${referral.source_id}` : null,
      referral.ctwa_clid ? `ctwa:${referral.ctwa_clid}` : null,
    ],
  );
  if (rows[0]) console.log(`${LOG} new ${source === 'instagram_ad' ? 'Instagram' : 'Facebook'} ad lead #${rows[0].id} from ${who(waId)}`);
}

/**
 * Own number: nobody reads this chat, so asking for Deepika puts the customer in the leads dashboard (reason and
 * recent messages in "What they told us") for her to contact. Adds to the customer's open WhatsApp lead if they have
 * one. Returns the lead number, or null without a database.
 */
async function saveHandoffLead(waId: string, chat: ChatInfo, messages: ChatMessage[], reason: string): Promise<string | null> {
  if (!pool) return null;
  const phone = `+${waId}`;
  const recent = messages
    .filter((m) => m.role === 'user' && m.content !== TALK_TO_DEEPIKA)
    .slice(-4)
    .map((m) => `- ${m.content.slice(0, 300)}`)
    .join('\n');
  const note = `Asked to talk to ${B.artist} on ${todayInAtlanta().iso}${reason ? ` (${reason})` : ''}.${recent ? `\nRecent messages to the assistant:\n${recent}` : ''}`;
  const db = getDb();
  const open = await db.query<{ id: string }>(
    `SELECT id FROM bookings WHERE channel = 'whatsapp' AND phone = $1 AND created_at > now() - interval '30 days'
        AND status NOT IN ('converted', 'lost')
      ORDER BY id DESC LIMIT 1`,
    [phone],
  );
  if (open.rows[0]) {
    await db.query(`UPDATE bookings SET notes = concat_ws(E'\\n\\n', notes, $1::text), updated_at = now() WHERE id = $2`, [note, open.rows[0].id]);
    console.log(`${LOG} ${who(waId)} asked for ${B.artist}; noted on lead #${open.rows[0].id}`);
    return open.rows[0].id;
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (full_name, phone, service, notes, source, channel)
     VALUES ($1, $2, $3, $4, $5, 'whatsapp')
     RETURNING id`,
    [chat.profileName || 'WhatsApp contact', phone, SERVICE_NOT_SPECIFIED, note, chat.adSource ?? 'whatsapp'],
  );
  console.log(`${LOG} ${who(waId)} asked for ${B.artist}; new lead #${rows[0].id}`);
  return rows[0].id;
}

function toolsFor(waId: string, chat: ChatInfo, messages: ChatMessage[], turn: Turn): Record<string, ChatTool> {
  return {
    check_availability: checkAvailabilityTool(`${LOG} ${who(waId)}`),
    send_quotation: {
      definition: {
        type: 'function',
        function: {
          name: 'send_quotation',
          description: `Send the customer ${B.artist}'s quotation for their occasion. It goes to them word for word, as its own message just before your reply. Occasions: ${Object.entries(QUOTE_OCCASIONS)
            .map(([occasion, meaning]) => `${occasion} = ${meaning}`)
            .join('; ')}.`,
          strict: true,
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['occasion'],
            properties: { occasion: { type: 'string', enum: Object.keys(QUOTE_OCCASIONS), description: 'What they need makeup for.' } },
          },
        },
      },
      run: async (args) => {
        const occasion = text(args.occasion, 40);
        if (!Object.hasOwn(QUOTATIONS, occasion)) return { ok: false, error: `occasion must be one of: ${Object.keys(QUOTE_OCCASIONS).join(', ')}` };
        const quote = QUOTATIONS[occasion as QuoteOccasion];
        if (!turn.quotes.includes(quote)) turn.quotes.push(quote);
        console.log(`${LOG} ${who(waId)}: sending the ${occasion} quotation`);
        return { ok: true, note: "The quotation will be sent just before your reply. Don't repeat its prices or details in your reply." };
      },
    },
    save_booking_request: {
      definition: {
        type: 'function',
        function: {
          name: 'save_booking_request',
          description: `Send the customer's booking request to ${B.artist}. Call it after the customer confirms the summary of their details. Calling it again for the same service updates their earlier request: use that when they correct a detail.`,
          strict: true,
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['full_name', 'service', 'event_date', 'event_location', 'party_size', 'email', 'notes'],
            properties: {
              full_name: { type: 'string', description: "The customer's full name, as they gave it." },
              service: { type: 'string', enum: BOOKABLE_SERVICES, description: 'The service or package they want.' },
              event_date: { type: 'string', description: 'Event date as YYYY-MM-DD, or an empty string if they have not decided yet.' },
              event_location: { type: 'string', description: 'City or venue of the event, e.g. "Alpharetta, GA".' },
              party_size: { type: 'string', description: 'Who needs makeup or hair, e.g. "Bride only" or "Bride + 3 family members".' },
              email: { type: 'string', description: 'Email address, or an empty string if not given.' },
              notes: { type: 'string', description: 'Other useful details: ready-by time, outfit, look preferences, other events, waitlist wish. Empty string if none.' },
            },
          },
        },
      },
      run: async (args) => {
        const result = await saveBookingRequest(waId, chat, args);
        if (result.ok && 'request_number' in result) turn.savedRequest = result.request_number;
        return result;
      },
    },
    handoff_to_deepika: {
      definition: {
        type: 'function',
        function: {
          name: 'handoff_to_deepika',
          description: SHARED_NUMBER
            ? `Hand this chat over to ${B.artist}: the assistant stops replying here so she can reply personally.`
            : `Pass this customer to ${B.artist}: saves their number and question to her leads list so she contacts them personally. You keep helping in this chat.`,
          strict: true,
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['reason'],
            properties: { reason: { type: 'string', description: 'Short reason, e.g. "asked to speak to Deepika".' } },
          },
        },
      },
      run: async (args) => {
        turn.handoff = true;
        const reason = text(args.reason, 200);
        console.log(`${LOG} ${who(waId)} handed over to Deepika (${reason || 'no reason given'})`);
        if (SHARED_NUMBER) return { ok: true, note: `${B.artist} will reply personally in this chat. Tell the customer that, briefly.` };
        const lead = await saveHandoffLead(waId, chat, messages, reason).catch((err) => {
          console.error(`${LOG} could not save the hand-over for ${who(waId)}:`, err instanceof Error ? err.message : err);
          return null;
        });
        return lead
          ? { ok: true, note: `Saved for ${B.artist}. Tell the customer briefly that she'll contact them personally, and that to reach her right away they can ${REACH_DEEPIKA}.` }
          : { ok: false, note: `Couldn't pass it on. Tell the customer to ${REACH_DEEPIKA}.` };
      },
    },
  };
}

// ---------- Answering ----------

/** Indian scripts (Devanagari … Sinhala). */
const INDIC = /[ऀ-෿]/;
/** A word that mixes an Indian script with Latin letters ("प्रियa"): always a model glitch. */
const MIXED_WORD = /[ऀ-෿][A-Za-z]|[A-Za-z][ऀ-෿]/;

/**
 * The model now and then writes a name in the wrong alphabet ("15 May is fully booked, प्रियa."). Such a reply is
 * rejected and written again; this checks it. A reply written mostly in an Indian script is a language choice, not
 * a glitch (e.g. answering Hinglish in Devanagari), and so is any reply to a customer who writes in one.
 */
function scriptCheck(messages: ChatMessage[]) {
  const writesIndic = messages.some((m) => m.role === 'user' && INDIC.test(m.content));
  const strayIndic = (reply: string) => {
    const indic = reply.match(/[ऀ-෿]/g)?.length ?? 0;
    const latin = reply.match(/[A-Za-z]/g)?.length ?? 0;
    return indic > 0 && indic < 0.3 * (indic + latin);
  };
  return {
    accept: (reply: string) => !MIXED_WORD.test(reply) && (writesIndic || !strayIndic(reply)),
    /** Last resort if the second try is garbled too: drop the stray word from an otherwise Latin reply. */
    clean: (reply: string) =>
      writesIndic || !strayIndic(reply) ? reply : reply.replace(/[,\s]*[ऀ-෿]+[A-Za-z]*/g, '').replace(/\s+([.,!?])/g, '$1'),
  };
}

/**
 * Without the language model, the best-matching knowledge entry is sent as is. Entries written for the website
 * point people to the website's booking button, which makes no sense inside WhatsApp, so those get the general
 * fallback instead; so do Deepika's WhatsApp links when the customer is already on her number (coexistence).
 */
function searchAnswerForWhatsApp(retrieved: Awaited<ReturnType<typeof retrieve>>): string {
  const found = searchOnlyAnswer(retrieved, FALLBACK);
  const unsuitable = SHARED_NUMBER ? /wa\.me|Book a Consultation/i : /Book a Consultation/i;
  return unsuitable.test(found) ? FALLBACK : found;
}

/** Search results to answer without (the search failed, or wasn't ready in time). */
const NO_SEARCH_RESULTS: Retrieved = { context: [], latest: [] };

/** `promise`'s value, or undefined if it isn't ready within `ms`. */
function within<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: NodeJS.Timeout | undefined;
  const late = new Promise<undefined>((resolve) => {
    timer = setTimeout(() => resolve(undefined), ms);
  });
  return Promise.race([promise, late]).finally(() => clearTimeout(timer));
}

/** The model's reply when it has nothing to add (e.g. "NO_REPLY" or "NO_REPLY."). */
const NO_REPLY_RE = new RegExp(`^\\W*${NO_REPLY}\\W*$`);

/**
 * Writes the reply to `messages`: the stored conversation, ending with the customer's latest message(s). `welcomed`:
 * Deepika's welcome message has just been sent as the first reply. The reply is empty when there's nothing to add to
 * the welcome or to the quotations (`turn.quotes`), which are sent before it.
 */
async function answer(waId: string, chat: ChatInfo, messages: ChatMessage[], welcomed: boolean): Promise<{ reply: string; turn: Turn }> {
  const turn: Turn = { handoff: false, quotes: [] };
  const searchStarted = Date.now();
  const search = retrieve(messages).catch((err) => {
    console.error(`${LOG} knowledge search failed:`, err instanceof Error ? err.message : err);
    return NO_SEARCH_RESULTS;
  });
  // Without the language model the search result is the answer, so it is always waited for
  if (!openai) return { reply: searchAnswerForWhatsApp(await search), turn };

  const found = await within(search, SEARCH_BUDGET_MS);
  turn.searchMs = Date.now() - searchStarted;
  if (!found) console.log(`${LOG} ${who(waId)}: search not ready after ${SEARCH_BUDGET_MS} ms (search model still loading on a new server instance); answering from the business facts`);
  const retrieved = found ?? NO_SEARCH_RESULTS;

  const date = todayInAtlanta();
  const [rules, thisChat] = buildWhatsAppSystemPrompt({
    facts: FACTS,
    context: retrieved.context,
    todayLong: date.long,
    todayIso: date.iso,
    profileName: chat.profileName,
    canSaveBookings: Boolean(pool),
    sharedNumber: SHARED_NUMBER,
    reachDeepika: REACH_DEEPIKA,
    welcomed,
  });
  const script = scriptCheck(messages);
  const aiStarted = Date.now();
  try {
    // Two system messages: the rules are the same for everyone (cached by OpenAI), this chat's details come after
    const prompt: ChatCompletionMessageParam[] = [{ role: 'system', content: rules }, { role: 'system', content: thisChat }, ...messages];
    const reply = await completeChatWithTools(prompt, toolsFor(waId, chat, messages, turn), {
      signal: AbortSignal.timeout(60_000),
      accept: script.accept,
      cacheKey: PROMPT_CACHE_KEY,
    });
    if (NO_REPLY_RE.test(reply)) {
      if (welcomed || turn.quotes.length) return { reply: '', turn };
    } else if (reply) {
      return { reply: script.accept(reply) ? reply : script.clean(reply), turn };
    }
  } catch (err) {
    console.error(`${LOG} OpenAI request failed (${OPENAI_MODEL}):`, err instanceof Error ? err.message : err);
  } finally {
    turn.aiMs = Date.now() - aiStarted;
  }
  // The model failed after a tool may already have run: still tell the customer what happened
  if (turn.savedRequest) {
    return { reply: `Thank you! Your booking request #${turn.savedRequest} has been sent to ${B.artist}. She'll personally confirm availability and the quote, usually within 24 hours.`, turn };
  }
  if (turn.handoff) return { reply: HANDOFF_REPLY, turn };
  // The welcome message has gone out, or a quotation will: better that alone than a guessed answer
  if (welcomed || turn.quotes.length) return { reply: '', turn };
  // The search has had more time by now
  return { reply: searchAnswerForWhatsApp((await within(search, SEARCH_BUDGET_MS)) ?? retrieved), turn };
}

/**
 * Replies after a short wait, so messages sent in quick succession get one answer. A newer message to this server
 * instance restarts the wait; one that reaches another instance is caught in replyTo. Resolves once the reply is sent
 * (or the wait was taken over by a newer message).
 */
function replyAfterWait(waId: string, latestId: number, transport: WhatsAppTransport): Promise<void> {
  cancelWait(waId); // the earlier wait is replaced by this one
  const w: Waiting = {};
  waits.set(waId, w);
  return new Promise<void>((resolve) => {
    w.done = resolve;
    w.timer = setTimeout(() => {
      if (waits.get(waId) === w) waits.delete(waId);
      replyTo(waId, latestId, transport).finally(resolve);
    }, GATHER_MS);
  });
}

/** Waits (up to REPLY_WAIT_MS) until no other reply is being written in this chat, and claims it. */
async function claimReplying(waId: string): Promise<string | null> {
  const giveUpAt = Date.now() + REPLY_WAIT_MS;
  for (;;) {
    const token = await chats.claimReplying(waId, REPLY_CLAIM_MS);
    if (token || Date.now() > giveUpAt) return token;
    await sleep(500);
  }
}

/**
 * Answers the customer's waiting messages, from the conversation stored so far. `latestId` is the newest message this
 * call was started for: if an even newer one is waiting, the call started for that one answers them all instead.
 */
async function replyTo(waId: string, latestId: number, transport: WhatsAppTransport) {
  const started = Date.now();
  const token = await claimReplying(waId);
  if (!token) {
    console.warn(`${LOG} ${who(waId)}: another reply in this chat took too long; this message will be answered with the next one`);
    return;
  }
  try {
    const { chat, history, waiting, recentReplies } = await chats.conversation(waId, MAX_HISTORY);
    // Already answered along with an earlier message, or a newer message is waiting and its own call answers both
    if (!waiting.length || waiting[waiting.length - 1].id > latestId) return;
    if (Date.now() < chat.pausedUntil) return;
    const answered = waiting.map((m) => m.id);
    if (recentReplies >= MAX_REPLIES_PER_10_MIN) {
      console.warn(`${LOG} ${who(waId)} sent too many messages; not replying for a few minutes`);
      await chats.settle(waId, answered);
      return;
    }

    const question = waiting.map((m) => m.content).join('\n').slice(0, MAX_QUESTION_CHARS);
    const messages: ChatMessage[] = [...history, { role: 'user', content: question }];

    // Deepika's welcome message is the first reply in every chat, sent straight away (with the buttons on Meta)
    const firstReply = !history.some((m) => m.role === 'assistant');
    let settles = answered;
    if (firstReply) {
      await transport.send(waId, WELCOME_MESSAGE, true);
      await chats.addReply(waId, WELCOME_MESSAGE, answered);
      settles = [];
      if (isGreeting(question)) {
        console.log(`${LOG} welcomed ${who(waId)} via ${transport.name}`);
        return;
      }
    }

    const { reply, turn } = await answer(waId, chat, messages, firstReply);
    // Coexistence: Deepika may have replied from her phone while the answer was being written
    if (SHARED_NUMBER && Date.now() < (await chats.pausedUntil(waId))) return;
    // Quotations first, word for word, then the reply (empty when there's nothing to add)
    const parts = [...turn.quotes, ...(reply ? [toWhatsAppText(reply)] : [])];
    for (const part of parts) await transport.send(waId, part, false);
    if (parts.length) await chats.addReply(waId, parts.join('\n\n'), settles);
    // Coexistence: Deepika takes over this chat. Own number: nobody else answers here, so the bot keeps helping.
    if (turn.handoff && SHARED_NUMBER) await pauseBot(waId);
    const took = `${seconds(Date.now() - started)} after the ${seconds(GATHER_MS)} wait for follow-ups (search ${seconds(turn.searchMs)}, AI ${seconds(turn.aiMs)})`;
    const what = [firstReply && 'welcome', turn.quotes.length && `${turn.quotes.length} quotation(s)`, reply && 'reply'].filter(Boolean).join(' + ');
    console.log(`${LOG} sent ${what || 'nothing more'} to ${who(waId)} via ${transport.name} ${took}${turn.savedRequest ? ` (booking request #${turn.savedRequest})` : ''}${turn.handoff ? ' and handed over to Deepika' : ''}`);
  } catch (err) {
    console.error(`${LOG} could not reply to ${who(waId)}:`, err instanceof Error ? err.message : err);
  } finally {
    await chats.releaseReplying(waId, token).catch((err) => console.error(`${LOG} could not release the reply claim for ${who(waId)}:`, err instanceof Error ? err.message : err));
  }
}

/**
 * "Talk to Deepika" button: no model needed. Coexistence: the bot pauses so Deepika can reply in this chat.
 * Own number: the customer is saved as a lead for Deepika and gets her direct WhatsApp and phone.
 */
async function handOver(waId: string, chat: ChatInfo, transport: WhatsAppTransport) {
  let reply = HANDOFF_REPLY;
  if (SHARED_NUMBER) {
    await pauseBot(waId);
  } else {
    const lead = await chats
      .conversation(waId, MAX_HISTORY)
      .then(({ history, waiting }) =>
        saveHandoffLead(waId, chat, [...history, ...waiting.map((m) => ({ role: 'user' as const, content: m.content }))], 'tapped "Talk to Deepika"'),
      )
      .catch((err) => {
        console.error(`${LOG} could not save the hand-over for ${who(waId)}:`, err instanceof Error ? err.message : err);
        return null;
      });
    if (!lead) reply = HANDOFF_DIRECT_REPLY;
  }
  await transport.send(waId, reply, false);
  await chats.addReply(waId, reply, []);
  console.log(`${LOG} ${who(waId)} tapped "Talk to Deepika"${SHARED_NUMBER ? '; bot paused in that chat' : ''}`);
}

// ---------- Incoming messages ----------

/** A customer's message, from any connection. Returns at once; the reply is sent in the background. */
export function receiveMessage(transport: WhatsAppTransport, m: InboundMessage) {
  if (!m.id || !m.from || alreadySeen(m.id)) return;
  if (m.sentAt && Date.now() - m.sentAt > MAX_MESSAGE_AGE_MS) {
    console.log(`${LOG} ${who(m.from)}: message is ${Math.round((Date.now() - m.sentAt) / 60_000)} min old, leaving it for Deepika`);
    return;
  }
  inBackground(handleMessage(transport, m), (err) =>
    console.error(`${LOG} could not handle a message from ${who(m.from)}:`, err instanceof Error ? err.message : err),
  );
}

async function handleMessage(transport: WhatsAppTransport, m: InboundMessage) {
  const waId = m.from;
  const ad = m.referral?.source_type === 'ad' ? m.referral : undefined;
  const adSource = ad ? sourceFromAdUrl(ad.source_url) : undefined;
  const chat = await chats.touch(waId, { profileName: m.profileName?.trim().slice(0, 80) || undefined, adSource });

  const msgText = m.text?.trim().slice(0, MAX_MESSAGE_CHARS) || null;
  const media = m.media ? MEDIA[m.media] : undefined;
  // What to do with it: keep it as context only, answer it (after the short wait), hand over, or acknowledge media
  let action: 'context' | 'answer' | 'handover' | 'media_reply';
  if (Date.now() < chat.pausedUntil) action = 'context'; // Deepika is handling this chat
  else if (m.wantsDeepika) action = 'handover';
  // Photos, voice notes and files are acknowledged at most every 30 minutes per chat; any caption is still answered
  else if (media && (await chats.claimMediaAck(waId, MEDIA_ACK_EVERY_MS))) action = openai || msgText ? 'answer' : 'media_reply';
  else action = msgText ? 'answer' : 'context';

  const content = action === 'handover' ? TALK_TO_DEEPIKA : [media?.marker, msgText].filter(Boolean).join('\n');
  if (!content) return; // stickers, reactions, locations
  const id = await chats.addCustomerMessage(waId, content, { messageId: m.id, waiting: action === 'answer' });
  if (id === null) return; // delivered before, to another server instance

  // Blue ticks and "typing…" straight away, before anything else
  if (action !== 'context') transport.markReadAndTyping(m.id);
  if (ad) {
    await saveAdLead(waId, chat, ad, adSource!).catch((err) =>
      console.error(`${LOG} could not save ad lead:`, err instanceof Error ? err.message : err),
    );
  }
  if (action === 'context') return;
  if (action === 'handover') return handOver(waId, chat, transport);
  if (action === 'media_reply') {
    // No language model: a fixed reply
    await transport.send(waId, media!.reply, false);
    await chats.addReply(waId, media!.reply, []);
    return;
  }
  await replyAfterWait(waId, id, transport);
}

/** Deepika replied from the WhatsApp Business app (coexistence only): the bot steps back from that chat. */
export function deepikaRepliedFromApp(to: string, messageId: string | undefined, body: string | undefined) {
  if (!to || (messageId && alreadySeen(messageId))) return;
  inBackground(
    (async () => {
      await pauseBot(to);
      if (body) await chats.addReply(to, body.slice(0, 4000), [], messageId);
      console.log(`${LOG} Deepika replied to ${who(to)} from her phone; bot paused in that chat for ${TAKEOVER_MS / 3_600_000} h`);
    })(),
    (err) => console.error(`${LOG} could not note Deepika's reply to ${who(to)}:`, err instanceof Error ? err.message : err),
  );
}
