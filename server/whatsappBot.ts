/**
 * Pooja, Deepika's personal assistant on WhatsApp: the part shared by every way of connecting a number.
 * - Meta's WhatsApp Cloud API: server/routes/whatsapp.ts
 * - Twilio (its WhatsApp sandbox, or a number bought from Twilio): server/routes/twilioWhatsapp.ts
 * Each one turns its webhook into an InboundMessage and calls receiveMessage() with a transport that knows how to
 * send replies back the same way. Each also registers itself for messages the dashboard sends later (the booking
 * confirmation), through registerOutboundTransport.
 *
 * Pooja answers questions from the full business facts plus the RAG knowledge base, and takes customers through a
 * booking (server/whatsappBooking.ts): the date and time on Deepika's calendar, the quotation (with brochures), the
 * details and who does the makeup (from the ZIP code), then the 25% advance. A payment screenshot is saved for the
 * team, who approve the booking in the dashboard. She hands chats over to Deepika when asked.
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
 * what lets the assistant remember the chat. Without a database the conversations are kept in memory instead.
 */
import type { ChatCompletionMessageParam } from 'openai/resources';
import { SERVICE_NOT_SPECIFIED } from '../src/data/leads.js';
import { ADVANCE_PERCENT, BUSINESS_INFO as B, WHATSAPP_CONTACTS } from '../src/data/portfolioData.js';
import { APPROVER_HELP, approverCommand, bookingsToVerify, isApprover, notifyApprovers } from './approvals.js';
import { retrieve, searchOnlyAnswer, type ChatMessage, type Retrieved } from './assistant.js';
import { checkAvailabilityTool, todayInAtlanta } from './availability.js';
import { inBackground } from './background.js';
import { getDb, pool } from './db.js';
import { businessFacts } from './knowledge.js';
import { sourceFromAdUrl } from './leads.js';
import { buildWhatsAppSystemPrompt, completeChatWithTools, NO_REPLY, openai, OPENAI_MODEL, type ChatTool } from './llm.js';
import { chatStore as chats, type ChatConnection, type ChatInfo } from './whatsappChats.js';
import {
  approveBooking,
  BookingActionError,
  bookingForPaymentProof,
  currentBooking,
  describeBooking,
  PACKAGE_GUIDE,
  PACKAGE_IDS,
  reopenPayment,
  requestAdvancePayment,
  saveBookingDetails,
  savePaymentProof,
} from './whatsappBooking.js';
import {
  BROCHURES,
  brochureUrl,
  EXTRA_PROOF_MESSAGE,
  PAYMENT_RECEIVED_MESSAGE,
  paymentNotVerifiedMessage,
  QUOTATIONS,
  QUOTE_OCCASIONS,
  WELCOME_MESSAGE,
  type QuoteOccasion,
} from './whatsappQuotes.js';

const LOG = '[whatsapp]';

/** Coexistence: the bot shares Deepika's own number, so she reads these chats. Otherwise the bot has its own number. */
const SHARED_NUMBER = /^(1|true|yes|on)$/i.test(process.env.WHATSAPP_COEXISTENCE?.trim() ?? '');
export const whatsappMode = SHARED_NUMBER ? 'coexistence' : 'own_number';
const TAKEOVER_MS = (Number(process.env.WHATSAPP_HUMAN_TAKEOVER_HOURS) || 12) * 3_600_000;

/** How to reach Deepika herself, for the bot's own number: her WhatsApp links and phone. */
const DIRECT_WHATSAPP = WHATSAPP_CONTACTS.map((c) => `${c.url} (${c.country})`).join(' or ');
const REACH_DEEPIKA = `message ${B.artist} on WhatsApp at ${DIRECT_WHATSAPP}, or call ${B.phonePrimary}`;

/**
 * Pooja answers like a person: about 30 seconds to a minute after the customer's last message, longer for a longer
 * message (time to read it and type). Messages sent meanwhile restart the wait and are answered together.
 * WHATSAPP_REPLY_DELAY_SECONDS="30-55" sets the wait (the reply itself then takes a few seconds more); "0" answers
 * straight away, after the short pause that gathers quick follow-ups (used by the automated tests).
 */
const GATHER_MS = 1500;
const REPLY_DELAY_SECONDS = (() => {
  const m = (process.env.WHATSAPP_REPLY_DELAY_SECONDS ?? '30-55').trim().match(/^(\d+(?:\.\d+)?)(?:\s*-\s*(\d+(?:\.\d+)?))?$/);
  const min = m ? Number(m[1]) : 30;
  return { min, max: m?.[2] ? Math.max(min, Number(m[2])) : min };
})();
/** Messages this long or longer get the longest wait. */
const LONG_MESSAGE_CHARS = 200;

/** How long to wait before answering a message of this length (never less than the follow-up pause). */
function replyDelayMs(text: string): number {
  const { min, max } = REPLY_DELAY_SECONDS;
  const seconds = min + (max - min) * Math.min(1, text.length / LONG_MESSAGE_CHARS);
  return Math.max(GATHER_MS, Math.round(seconds * 1000));
}
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
/** Earlier messages the model sees: plenty for a whole booking conversation. */
const MAX_HISTORY = 40;
/**
 * A customer who writes again after this long without messages starts a new conversation: Pooja welcomes them again
 * and sees only the new messages (plus any saved booking, which she asks about). Everything stays saved.
 */
const NEW_CONVERSATION_AFTER_MS = 20 * 3_600_000;
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
/** Further payment screenshots sent together get one "got it", not one each. */
const EXTRA_PROOF_ACK_EVERY_MS = 2 * 60_000;
/** Largest payment screenshot or receipt kept (WhatsApp images are at most 5 MB). */
const MAX_PROOF_BYTES = 10 * 1024 * 1024;
/** WhatsApp's limit for a text message body is 4096 characters (transports split further if they need to). */
const MAX_REPLY_CHARS = 4000;
const FORGET_AFTER_MS = 24 * 3_600_000;

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
/** A payment screenshot that couldn't be downloaded from WhatsApp. */
const PROOF_FAILED_REPLY = `I'm so sorry, I couldn't open that file 🙏 Could you please send the payment screenshot again?`;

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
  /** Which connection this is, saved with the chat so the dashboard can message the customer later. */
  connection: ChatConnection;
  /** Sends one reply; `withButtons` adds the welcome buttons where the connection supports them. */
  send(to: string, body: string, withButtons: boolean): Promise<void>;
  /** Sends a picture from a public address (a brochure), with an optional caption. */
  sendImage(to: string, url: string, caption?: string): Promise<void>;
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
  /** Downloads the photo or file (for payment screenshots). */
  fetchMedia?: () => Promise<{ data: Buffer; contentType: string }>;
  /** They tapped the "Talk to Deepika" button. */
  wantsDeepika?: boolean;
  /** The hidden id of a template button they tapped, e.g. "approve_105" (approval numbers). */
  buttonPayload?: string;
  referral?: Referral;
}

// ---------- Messages from the dashboard ----------

const outboundTransports = new Map<string, (businessNumber?: string) => WhatsAppTransport>();

/** Each connection registers how to message a customer outside a reply (Twilio: from which business number). */
export function registerOutboundTransport(kind: string, make: (businessNumber?: string) => WhatsAppTransport) {
  outboundTransports.set(kind, make);
}

/**
 * Sends a customer a message from the dashboard (the booking confirmation) through the connection their chat came
 * in on, and keeps it in the conversation so Pooja knows about it. Throws if it can't be sent.
 */
export async function sendToCustomer(waId: string, text: string): Promise<void> {
  const chat = await chats.info(waId);
  // Chats from before connections were saved: the only connection that's set up, if there's just one
  const kind = chat?.transport ?? (outboundTransports.size === 1 ? [...outboundTransports.keys()][0] : undefined);
  if (!kind) throw new Error("This customer's WhatsApp chat isn't known yet.");
  const make = outboundTransports.get(kind);
  if (!make) throw new Error(`WhatsApp via ${kind} isn't set up on this server.`);
  await make(chat?.businessNumber).send(waId, text, false);
  await chats.addReply(waId, text, []);
  console.log(`${LOG} message sent to ${who(waId)} via ${kind} (a confirmation or follow-up, not a reply)`);
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

const GREETING_WORDS = new Set(['hello', 'namaste', 'namaskar', 'namaskaram', 'vanakkam', 'good', 'morning', 'afternoon', 'evening', 'there', 'mam', 'madam', 'sir', 'ji', 'deepika', 'pooja', 'team']);
const GREETING_WORD_RE = /^(h+i+|h+a+i+|h+e+y+|h+e+l+o+|h+l+o+)$/;
const words = (message: string) => message.toLowerCase().replace(/[^\p{L}\s]/gu, ' ').split(/\s+/).filter(Boolean);

/** A message that only says hello ("Hi", "hello madam 🙏"). */
function isGreeting(message: string): boolean {
  const w = words(message);
  return w.length > 0 && w.length <= 5 && w.every((x) => GREETING_WORDS.has(x) || GREETING_WORD_RE.test(x));
}

/** "Hi, I need makeup services." (the website's WhatsApp button) and the like, without saying what for. */
function isGeneralRequest(message: string): boolean {
  const rest = words(message)
    .filter((x) => !GREETING_WORDS.has(x) && !GREETING_WORD_RE.test(x))
    .join(' ');
  return /^(i m |im |i am |i )?(need|want|would like|wanted|am looking for|looking for|require|enquiring about|interested in)( to book| booking)?( a| an| some| your)? ?(makeup|make up|makeup and hair|hair and makeup)( artist)?( services?)?( please)?$/.test(rest);
}

/** The first reply is Pooja's welcome, word for word, when the first message only says hello or "I need makeup". */
const welcomeIsTheWholeReply = (message: string) => isGreeting(message) || isGeneralRequest(message);

// ---------- Ad leads and hand-overs ----------

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** A fixed message, a brochure picture, or the model's reply, in the order they're sent. */
type Outgoing = { text: string } | { image: string; caption?: string };

interface Turn {
  handoff: boolean;
  /** Brochures, quotations and the payment message, sent word for word before the reply. */
  outbox: Outgoing[];
  /** The advance was asked for in this turn (booking number). */
  advanceRequested?: string;
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
 * Own number: nobody reads this chat, so asking for Deepika puts the customer in the leads dashboard for her to
 * contact, with a one-line note (the lead's panel shows the whole chat). Adds to the customer's open WhatsApp lead if
 * they have one. Returns the lead number, or null without a database.
 */
async function saveHandoffLead(waId: string, chat: ChatInfo, reason: string): Promise<string | null> {
  if (!pool) return null;
  const phone = `+${waId}`;
  const note = `Asked to talk to ${B.artist} on ${todayInAtlanta().iso}${reason ? ` (${reason})` : ''}.`;
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

// ---------- The assistant's tools ----------

/** Everything the customer wrote in the chat, so tools can check that a date or name really came from them. */
const customerWords = (messages: ChatMessage[]) => messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n');

function toolsFor(waId: string, chat: ChatInfo, messages: ChatMessage[], turn: Turn): Record<string, ChatTool> {
  const customerSaid = customerWords(messages);
  return {
    check_availability: checkAvailabilityTool(`${LOG} ${who(waId)}`, `+${waId}`, customerSaid),

    send_quotation: {
      definition: {
        type: 'function',
        function: {
          name: 'send_quotation',
          description: `Send the customer the brochure and quotation for their occasion, with the prices of the artist who'll do their makeup: ${B.artist.split(' ')[0]} herself when the event's saved ZIP code is in the Atlanta area, a senior artist otherwise. Works only once the event address and ZIP code are saved (save_booking_details). It goes to them word for word, as its own message(s). Occasions: ${Object.entries(QUOTE_OCCASIONS)
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
        // The prices depend on who does the makeup, which the event's ZIP code decides: no quotation before it
        const booking = await currentBooking(waId);
        const artist = booking?.status !== 'confirmed' ? booking?.artist : null;
        if (!artist) {
          return {
            ok: false,
            error: `The prices depend on where the event is (${B.artist.split(' ')[0]} herself in the Atlanta area, a senior artist outside it), and the event address isn't saved yet. Ask warmly for the complete address of the event with its ZIP code, save it with save_booking_details, then call send_quotation. Don't type out any prices meanwhile.`,
          };
        }
        const quote = QUOTATIONS[occasion as QuoteOccasion][artist];
        if (!quote) {
          return {
            ok: false,
            error: `There's no senior artist price list for ${occasion}. Don't guess a price: tell the customer kindly that ${B.artist.split(' ')[0]}'s team will confirm the quote for their location, and call handoff_to_deepika (reason: "${occasion} quote outside Atlanta").`,
          };
        }
        for (const image of BROCHURES[occasion as QuoteOccasion]?.[artist] ?? []) turn.outbox.push({ image: brochureUrl(image) });
        if (!turn.outbox.some((m) => 'text' in m && m.text === quote)) turn.outbox.push({ text: quote });
        chat.quotedArtist = artist;
        await chats.setQuotedArtist(waId, artist);
        console.log(`${LOG} ${who(waId)}: sending the ${occasion} quotation (${artist})`);
        return {
          ok: true,
          prices_of: artist === 'deepika' ? 'Deepika herself (Atlanta area)' : 'a senior artist (outside the Atlanta area)',
          note: `Don't repeat the quotation's prices or details. Put ${QUOTATION_MARK} on its own line in your reply where the brochure and quotation should appear: after anything you say first (good news, a few words about Deepika, "Here are our packages and pricing 👇"), before your question (e.g. "Have a look and let me know which one you like 😊"). Without it, they're sent before your whole reply.`,
        };
      },
    },

    save_booking_details: {
      definition: {
        type: 'function',
        function: {
          name: 'save_booking_details',
          description: `Save the customer's booking details as you learn them: it creates their booking (a lead for ${B.artist.split(' ')[0]}'s team) the first time and updates it after. Pass only what's new or changed: empty strings and an empty items list keep what's saved. The result says who will do the makeup (from the ZIP code), the prices, and what's still needed.`,
          strict: true,
          parameters: {
            type: 'object',
            additionalProperties: false,
            required: ['full_name', 'contact_phone', 'event_type', 'event_date', 'event_time', 'event_address', 'zip_code', 'items', 'special_requirements', 'start_new_booking'],
            properties: {
              full_name: { type: 'string', description: 'Their full name, as they typed it; or "".' },
              contact_phone: { type: 'string', description: 'A phone number to reach them on, only if it is not this WhatsApp number; otherwise "".' },
              event_type: { type: 'string', description: 'e.g. "Wedding", "Engagement", "Reception", "Birthday party"; or "".' },
              event_date: { type: 'string', description: 'Event date as YYYY-MM-DD; or "".' },
              event_time: { type: 'string', description: 'When the makeup should start, as HH:MM on the 24-hour clock (8 AM = "08:00"); or "".' },
              event_address: { type: 'string', description: 'The complete address where the makeup will be done; or "".' },
              zip_code: { type: 'string', description: 'The ZIP code of that address (copy it here even when it is part of the address); or "".' },
              items: {
                type: 'array',
                description: `The packages the customer has chosen themselves, and for how many people. Never guess a package: leave the list empty until they pick one (an empty list keeps what's saved). When they change their choice, save the new list. Packages: ${PACKAGE_GUIDE}.`,
                items: {
                  type: 'object',
                  additionalProperties: false,
                  required: ['package', 'quantity'],
                  properties: {
                    package: { type: 'string', enum: PACKAGE_IDS },
                    quantity: { type: 'integer', description: 'How many people (1 for the bride).' },
                  },
                },
              },
              special_requirements: { type: 'string', description: 'Anything special they asked for (look, outfit, skin, extra hairstyles…); or "".' },
              start_new_booking: {
                type: 'boolean',
                description: 'true only for the first save of a different, new event than the booking under BOOKING SO FAR (e.g. it is already confirmed, or a returning customer wants something new). Otherwise false.',
              },
            },
          },
        },
      },
      run: (args) => saveBookingDetails(waId, chat, args, customerSaid),
    },

    request_advance_payment: {
      definition: {
        type: 'function',
        function: {
          name: 'request_advance_payment',
          description: `Ask for the ${ADVANCE_PERCENT}% advance that confirms the booking. Call it only once the customer has agreed to the package and the final price (the senior artist's, if their event is outside the Atlanta area) and every detail is saved. It re-checks the calendar and sends the payment message (booking summary, amounts, payment details, asking for the screenshot) word for word.`,
          strict: true,
          parameters: { type: 'object', additionalProperties: false, required: [], properties: {} },
        },
      },
      run: async () => {
        const result = await requestAdvancePayment(waId, chat, customerSaid);
        if (!result.ok) return result;
        turn.outbox.push({ text: result.message });
        turn.advanceRequested = result.bookingId;
        return { ok: true, note: `The payment message will be sent word for word. Reply exactly ${NO_REPLY}, unless the customer asked something else.` };
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
        const lead = await saveHandoffLead(waId, chat, reason).catch((err) => {
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

/** Where in its reply the model wants the brochure and quotation to go. */
const QUOTATION_MARK = '{{quotation}}';
const QUOTATION_MARK_RE = /[ \t]*\{\{\s*quotation\s*\}\}[ \t]*/gi;
/** "Here are our packages and pricing 👇" and the like: words that only make sense with a quotation under them. */
const POINTS_AT_QUOTE = /here (are|is) (our|the|your)[^.!?\n]{0,60}(packages?|pricing|prices|quotation|brochure)|👇/i;

/**
 * The messages for one turn, in order: the model's reply split at its {{quotation}} mark with the fixed messages
 * (brochures, quotations, the payment message) in between, or the fixed messages first when there's no mark.
 */
function inOrder(reply: string, fixed: Outgoing[]): Outgoing[] {
  const texts = (s: string) => {
    const t = toWhatsAppText(s.replace(QUOTATION_MARK_RE, ''));
    return t ? [{ text: t }] : [];
  };
  const at = reply.search(QUOTATION_MARK_RE);
  if (at < 0 || !fixed.length) return [...fixed, ...texts(reply)];
  return [...texts(reply.slice(0, at)), ...fixed, ...texts(reply.slice(at))];
}

/**
 * Writes the reply to `messages`: the current conversation, ending with the customer's latest message(s). `firstReply`:
 * nothing has been sent in this conversation yet, so Pooja introduces herself. `returning`: the customer chatted
 * before, more than NEW_CONVERSATION_AFTER_MS ago. The reply is empty when the fixed messages in `turn.outbox` (sent
 * before it) say everything.
 */
async function answer(waId: string, chat: ChatInfo, messages: ChatMessage[], firstReply: boolean, returning = false): Promise<{ reply: string; turn: Turn }> {
  const turn: Turn = { handoff: false, outbox: [] };
  const searchStarted = Date.now();
  const search = retrieve(messages).catch((err) => {
    console.error(`${LOG} knowledge search failed:`, err instanceof Error ? err.message : err);
    return NO_SEARCH_RESULTS;
  });
  // Without the language model the search result is the answer, so it is always waited for
  if (!openai) return { reply: firstReply ? WELCOME_MESSAGE : searchAnswerForWhatsApp(await search), turn };

  const booking = await currentBooking(waId).catch((err) => {
    console.error(`${LOG} could not read the booking for ${who(waId)}:`, err instanceof Error ? err.message : err);
    return null;
  });
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
    firstReply,
    // An unfinished booking from the earlier conversation: Pooja asks whether to continue it or start a new one
    returningWithBooking: returning && Boolean(booking) && booking!.status !== 'confirmed',
    booking: describeBooking(booking, chat.quotedArtist, customerWords(messages)),
  });
  const script = scriptCheck(messages);
  const aiStarted = Date.now();
  try {
    // Two system messages: the rules are the same for everyone (cached by OpenAI), this chat's details come after
    const prompt: ChatCompletionMessageParam[] = [{ role: 'system', content: rules }, { role: 'system', content: thisChat }, ...messages];
    const reply = await completeChatWithTools(prompt, toolsFor(waId, chat, messages, turn), {
      signal: AbortSignal.timeout(60_000),
      accept: script.accept,
      // The reply points to a quotation ("Here are our packages 👇") that wasn't sent
      revise: (r) =>
        !turn.outbox.length && (new RegExp(QUOTATION_MARK_RE.source, 'i').test(r) || POINTS_AT_QUOTE.test(r))
          ? `You put ${QUOTATION_MARK} in your reply but didn't call send_quotation, so nothing would be shown. Call send_quotation now for their occasion, then write your whole reply again.`
          : null,
      cacheKey: PROMPT_CACHE_KEY,
    });
    if (NO_REPLY_RE.test(reply)) {
      if (turn.outbox.length) return { reply: '', turn };
    } else if (reply) {
      return { reply: script.accept(reply) ? reply : script.clean(reply), turn };
    }
  } catch (err) {
    console.error(`${LOG} OpenAI request failed (${OPENAI_MODEL}):`, err instanceof Error ? err.message : err);
  } finally {
    turn.aiMs = Date.now() - aiStarted;
  }
  // The model failed after a tool may already have run: what it decided still goes out
  if (turn.handoff) return { reply: HANDOFF_REPLY, turn };
  if (turn.outbox.length) return { reply: '', turn };
  if (firstReply) return { reply: WELCOME_MESSAGE, turn };
  // The search has had more time by now
  return { reply: searchAnswerForWhatsApp((await within(search, SEARCH_BUDGET_MS)) ?? retrieved), turn };
}

/**
 * Replies after a human-like wait (replyDelayMs), so messages sent in quick succession get one answer. A newer message
 * to this server instance restarts the wait; one that reaches another instance is caught in replyTo. Just before the
 * reply is written, "typing…" shows again (WhatsApp hides it after about 25 seconds). Resolves once the reply is sent
 * (or the wait was taken over by a newer message).
 */
function replyAfterWait(waId: string, latestId: number, transport: WhatsAppTransport, waitMs: number, messageId: string): Promise<void> {
  cancelWait(waId); // the earlier wait is replaced by this one
  const w: Waiting = {};
  waits.set(waId, w);
  return new Promise<void>((resolve) => {
    w.done = resolve;
    w.timer = setTimeout(() => {
      if (waits.get(waId) === w) waits.delete(waId);
      if (waitMs > GATHER_MS) transport.markReadAndTyping(messageId);
      replyTo(waId, latestId, transport, waitMs).finally(resolve);
    }, waitMs);
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

/** Sends brochures, fixed messages and the reply in order. A brochure that fails is skipped (its quotation still goes). */
async function sendAll(waId: string, transport: WhatsAppTransport, parts: Outgoing[]): Promise<string[]> {
  const sent: string[] = [];
  for (const part of parts) {
    if ('image' in part) {
      try {
        await transport.sendImage(waId, part.image, part.caption);
        sent.push(`[Brochure picture: ${part.image}]`);
      } catch (err) {
        console.error(`${LOG} could not send a brochure to ${who(waId)}:`, err instanceof Error ? err.message : err);
      }
    } else {
      await transport.send(waId, part.text, false);
      sent.push(part.text);
    }
  }
  return sent;
}

/**
 * Answers the customer's waiting messages, from the conversation stored so far. `latestId` is the newest message this
 * call was started for: if an even newer one is waiting, the call started for that one answers them all instead.
 */
async function replyTo(waId: string, latestId: number, transport: WhatsAppTransport, waitedMs = GATHER_MS) {
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
    // The current conversation starts after the last silence of NEW_CONVERSATION_AFTER_MS or more, or at the customer's
    // last "Hi, I need makeup services." (answered with the welcome), whichever is later. It starts afresh: welcome,
    // no old dates or answers. The older messages stay saved.
    const times = [...history.map((m) => m.at), waiting[0].at];
    let since = 0;
    for (let i = times.length - 1; i > 0; i--) {
      if (times[i] - times[i - 1] >= NEW_CONVERSATION_AFTER_MS) {
        since = i;
        break;
      }
    }
    let lastWelcome = -1;
    for (let i = history.length - 1; i >= 0 && lastWelcome < 0; i--) if (history[i].role === 'assistant' && history[i].content === WELCOME_MESSAGE) lastWelcome = i;
    if (lastWelcome > 0) {
      let start = lastWelcome;
      while (start > 0 && history[start - 1].role === 'user') start--;
      since = Math.max(since, start);
    }
    const current = history.slice(since);
    const returning = since > 0;
    const messages: ChatMessage[] = [...current.map(({ role, content }) => ({ role, content })), { role: 'user', content: question }];

    const firstReply = !current.some((m) => m.role === 'assistant');
    // "Hi, I need makeup services." (the website's WhatsApp button) in the middle of a chat: someone starting afresh
    const restart = !firstReply && isGeneralRequest(question);
    // A new conversation: prices shown in an earlier one don't count (they're shown again for this booking)
    if ((restart || (returning && firstReply)) && chat.quotedArtist) {
      await chats.setQuotedArtist(waId, null);
      chat.quotedArtist = undefined;
    }

    // Pooja's welcome is the whole first reply to a hello or "I need makeup services" (with the buttons on Meta)
    if (restart || (firstReply && welcomeIsTheWholeReply(question))) {
      await transport.send(waId, WELCOME_MESSAGE, true);
      await chats.addReply(waId, WELCOME_MESSAGE, answered);
      console.log(`${LOG} welcomed ${who(waId)}${restart ? ' (asked for makeup services again: new conversation)' : returning ? ' (back after a break: new conversation)' : ''} via ${transport.name} ${seconds(Date.now() - started)} after the ${seconds(waitedMs)} wait`);
      return;
    }

    const { reply, turn } = await answer(waId, chat, messages, firstReply, returning);
    // Coexistence: Deepika may have replied from her phone while the answer was being written
    if (SHARED_NUMBER && Date.now() < (await chats.pausedUntil(waId))) return;
    // Brochures, quotations and the payment message word for word, where the reply puts them (or first)
    const parts = reply === WELCOME_MESSAGE ? [{ text: reply }] : inOrder(reply, turn.outbox);
    const sent = await sendAll(waId, transport, parts);
    if (sent.length) await chats.addReply(waId, sent.join('\n\n'), answered);
    else await chats.settle(waId, answered);
    // Coexistence: Deepika takes over this chat. Own number: nobody else answers here, so the bot keeps helping.
    if (turn.handoff && SHARED_NUMBER) await pauseBot(waId);
    const took = `${seconds(Date.now() - started)} after the ${seconds(waitedMs)} wait (search ${seconds(turn.searchMs)}, AI ${seconds(turn.aiMs)})`;
    const fixed = turn.outbox.length ? `${turn.outbox.length} fixed message(s)` : '';
    const what = [fixed, reply && 'reply'].filter(Boolean).join(' + ');
    console.log(`${LOG} sent ${what || 'nothing more'} to ${who(waId)} via ${transport.name} ${took}${turn.advanceRequested ? ` (advance asked for booking #${turn.advanceRequested})` : ''}${turn.handoff ? ' and handed over to Deepika' : ''}`);
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
    const lead = await saveHandoffLead(waId, chat, 'tapped "Talk to Deepika"').catch((err) => {
        console.error(`${LOG} could not save the hand-over for ${who(waId)}:`, err instanceof Error ? err.message : err);
        return null;
      });
    if (!lead) reply = HANDOFF_DIRECT_REPLY;
  }
  await transport.send(waId, reply, false);
  await chats.addReply(waId, reply, []);
  console.log(`${LOG} ${who(waId)} tapped "Talk to Deepika"${SHARED_NUMBER ? '; bot paused in that chat' : ''}`);
}

/**
 * A photo or file from a customer whose booking waits for the advance: their payment screenshot. It's saved for the
 * team and the customer is thanked; nothing is marked as paid until the team approves the booking in the dashboard.
 */
async function receivePaymentProof(waId: string, m: InboundMessage, bookingId: string, transport: WhatsAppTransport, caption: string | null) {
  const id = await chats.addCustomerMessage(waId, ['[The customer sent their payment screenshot]', caption].filter(Boolean).join('\n'), { messageId: m.id, waiting: false });
  if (id === null) return; // delivered before, to another server instance
  transport.markReadAndTyping(m.id);
  let reply: string | null;
  let saved: { first: boolean; proofId: string; contentType: string } | null = null;
  try {
    const file = await m.fetchMedia!();
    if (!file.data.length || file.data.length > MAX_PROOF_BYTES) throw new Error(`file of ${file.data.length} bytes`);
    const { first, proofId } = await savePaymentProof(bookingId, file.data, file.contentType);
    saved = { first, proofId, contentType: file.contentType };
    reply = first ? PAYMENT_RECEIVED_MESSAGE : (await chats.claimMediaAck(waId, EXTRA_PROOF_ACK_EVERY_MS)) ? EXTRA_PROOF_MESSAGE : null;
  } catch (err) {
    console.error(`${LOG} could not keep the payment screenshot from ${who(waId)}:`, err instanceof Error ? err.message : err);
    reply = PROOF_FAILED_REPLY;
  }
  if (reply) {
    // Thanked after the same human-like wait as any reply, with "typing…" again just before
    const wait = replyDelayMs(caption ?? '');
    if (wait > GATHER_MS) {
      await sleep(wait);
      transport.markReadAndTyping(m.id);
      await sleep(1500);
    }
    await transport.send(waId, reply, false);
    await chats.addReply(waId, reply, []);
  }
  // The first screenshot goes to the approval numbers (e.g. Deepika's WhatsApp) to approve with a tap
  if (saved?.first) {
    await notifyApprovers(bookingId, saved.proofId, saved.contentType, transport.connection.businessNumber).catch((err) =>
      console.error(`${LOG} could not send booking #${bookingId} for approval:`, err instanceof Error ? err.message : err),
    );
  }
}

/** Sends a customer a message after an approver's tap; false (and logged) if it couldn't be sent. */
async function messageAfterApproval(waId: string | null, text: string): Promise<boolean> {
  if (!waId) return false;
  try {
    await sendToCustomer(waId, text);
    return true;
  } catch (err) {
    console.error(`${LOG} could not message ${who(waId)} after an approval on WhatsApp:`, err instanceof Error ? err.message : err);
    return false;
  }
}

/**
 * A message from an approval number (Settings), e.g. Deepika's own WhatsApp: not a customer chat. A tap on Approve or
 * Not received under a payment screenshot (or "approve 105" typed) does what the dashboard's buttons do, and the
 * approver gets a short answer. Anything else gets a reminder of how it works.
 */
async function handleApprover(transport: WhatsAppTransport, m: InboundMessage) {
  transport.markReadAndTyping(m.id);
  const answer = (text: string) => transport.send(m.from, text, false);
  const command = approverCommand(m.buttonPayload, m.text);
  if (!command) return answer(APPROVER_HELP);

  let id = command.bookingId;
  if (!id) {
    const pending = await bookingsToVerify();
    if (pending.length !== 1) {
      return answer(
        pending.length
          ? `Which booking? Payments waiting: ${pending.map((p) => `#${p.id} ${p.fullName}`).join(', ')}. Reply *approve 105* or *reject 105* with its number.`
          : 'There are no payments waiting for approval right now. 😊',
      );
    }
    id = pending[0].id;
  }

  try {
    if (command.action === 'approve') {
      const done = await approveBooking(id, null);
      console.log(`${LOG} booking #${id} approved on WhatsApp by ${who(m.from)}`);
      const sent = await messageAfterApproval(done.waId, done.message);
      return answer(
        `✅ Booking #${id} for ${done.fullName} is confirmed.${sent ? ' They got the confirmation on WhatsApp.' : " But the confirmation couldn't be sent to them on WhatsApp: please message them directly."}`,
      );
    }
    const reopened = await reopenPayment(id);
    console.log(`${LOG} booking #${id}: payment not received (said ${who(m.from)} on WhatsApp)`);
    const sent = await messageAfterApproval(reopened.waId, paymentNotVerifiedMessage(reopened.advance));
    return answer(
      `Okay. ${reopened.fullName} (booking #${id}) ${sent ? 'has been asked to send the payment screenshot again.' : "couldn't be messaged on WhatsApp: please contact them directly."}`,
    );
  } catch (err) {
    if (err instanceof BookingActionError) return answer(`Booking #${id}: ${err.message}`);
    throw err;
  }
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
  // Deepika's approval number: payment approvals, not a customer chat
  if (await isApprover(waId).catch(() => false)) return handleApprover(transport, m);
  const ad = m.referral?.source_type === 'ad' ? m.referral : undefined;
  const adSource = ad ? sourceFromAdUrl(ad.source_url) : undefined;
  const chat = await chats.touch(waId, { profileName: m.profileName?.trim().slice(0, 80) || undefined, adSource, connection: transport.connection });

  const msgText = m.text?.trim().slice(0, MAX_MESSAGE_CHARS) || null;
  const paused = Date.now() < chat.pausedUntil;

  // A screenshot (or PDF receipt) while their booking waits for the advance is the payment proof
  if (!paused && (m.media === 'image' || m.media === 'document') && m.fetchMedia) {
    const booking = await bookingForPaymentProof(waId).catch(() => null);
    if (booking) return receivePaymentProof(waId, m, booking.id, transport, msgText);
  }

  const media = m.media ? MEDIA[m.media] : undefined;
  // What to do with it: keep it as context only, answer it (after the short wait), hand over, or acknowledge media
  let action: 'context' | 'answer' | 'handover' | 'media_reply';
  if (paused) action = 'context'; // Deepika is handling this chat
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
  await replyAfterWait(waId, id, transport, replyDelayMs(msgText ?? ''), m.id);
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
