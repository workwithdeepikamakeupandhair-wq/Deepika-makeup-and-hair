/**
 * WhatsApp Cloud API webhook: Deepika's virtual assistant on WhatsApp.
 *
 * It answers questions from the full business facts plus the RAG knowledge base, takes booking requests (saved to
 * the same `bookings` table as the website form, with source 'whatsapp'), and hands chats over to Deepika when asked.
 *
 * Works with Meta's test number now, and with Deepika's real number after "coexistence" onboarding, where she keeps
 * using the WhatsApp Business app on her phone. Customers' messages then reach both her app and this webhook. When
 * she replies from the app, Meta sends an `smb_message_echoes` webhook, and the bot steps back from that chat for
 * WHATSAPP_HUMAN_TAKEOVER_HOURS so the two never talk over each other.
 *
 * State (chat history, pauses, duplicate checks) is kept in memory: a restart only forgets recent context.
 * On Vercel that memory lasts only while a function instance stays warm, so after a quiet spell the bot starts
 * the conversation fresh (bookings are still saved in the database).
 */
import express, { Router } from 'express';
import { SERVICE_NOT_SPECIFIED } from '../../src/data/leads.js';
import { BUSINESS_INFO as B } from '../../src/data/portfolioData.js';
import { retrieve, searchOnlyAnswer, type ChatMessage } from '../assistant.js';
import { inBackground } from '../background.js';
import { getDb, pool } from '../db.js';
import { BOOKABLE_SERVICES, businessFacts } from '../knowledge.js';
import { sourceFromAdUrl } from '../leads.js';
import { buildWhatsAppSystemPrompt, completeChatWithTools, openai, OPENAI_MODEL, type ChatTool } from '../llm.js';
import { answerVerification, validSignature } from '../meta.js';

const LOG = '[whatsapp]';

const config = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim(),
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim(),
  appSecret: process.env.WHATSAPP_APP_SECRET?.trim(),
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v25.0',
  // Only changed by the automated test, which points it at a local mock of the Graph API
  graphUrl: process.env.WHATSAPP_GRAPH_URL?.trim() || 'https://graph.facebook.com',
  takeoverMs: (Number(process.env.WHATSAPP_HUMAN_TAKEOVER_HOURS) || 12) * 3_600_000,
};

const REQUIRED = {
  WHATSAPP_ACCESS_TOKEN: config.accessToken,
  WHATSAPP_PHONE_NUMBER_ID: config.phoneNumberId,
  WHATSAPP_VERIFY_TOKEN: config.verifyToken,
  WHATSAPP_APP_SECRET: config.appSecret,
};
export const missingWhatsAppSettings = Object.entries(REQUIRED).filter(([, v]) => !v).map(([k]) => k);
export const whatsappEnabled = missingWhatsAppSettings.length === 0;
export const whatsappPhoneNumberId = config.phoneNumberId;

/** Wait this long after a message for more ("hi" … "how much for bridal?") and answer them together. */
const GATHER_MS = 1500;
/** Customer messages older than this (e.g. redelivered after downtime) are left for Deepika. */
const MAX_MESSAGE_AGE_MS = 10 * 60_000;
/** Enough turns to collect a booking request (name, service, date, place, people, confirmation). */
const MAX_HISTORY = 20;
const MAX_REPLIES_PER_10_MIN = 15;
/** Photos, voice notes and files are acknowledged at most this often per chat. */
const MEDIA_ACK_EVERY_MS = 30 * 60_000;
/** WhatsApp's limit for a text message body is 4096 characters; button messages allow 1024. */
const MAX_REPLY_CHARS = 4000;
const MAX_BUTTON_BODY_CHARS = 1024;
const FORGET_AFTER_MS = 24 * 3_600_000;
const TIME_ZONE = 'America/New_York';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FALLBACK = `Thank you for your message! I don't have that detail on hand, but ${B.artist} will reply to you personally here soon.`;
const HANDOFF_REPLY = `Of course! I've let ${B.artist} know, and she'll reply to you personally here soon.`;

/** Quick-reply buttons under the first reply of a conversation (titles max 20 characters). */
const WELCOME_BUTTONS = [
  { id: 'book', title: 'Book appointment' },
  { id: 'services', title: 'Our services' },
  { id: 'deepika', title: 'Talk to Deepika' },
] as const;
/** What a button tap means, as the customer's message to the assistant. "deepika" is handled without the model. */
const BUTTON_MEANING: Record<string, string> = {
  book: 'I would like to book an appointment.',
  services: 'What services do you offer?',
};

/** How media shows up in the chat history, and the reply when there is no language model. */
const MEDIA = {
  image: { marker: '[The customer sent a photo, which you cannot see]', reply: `Thank you for sharing this! I can't view photos myself, but ${B.artist} will look at it and reply personally. Meanwhile, I'm happy to answer any questions by text.` },
  video: { marker: '[The customer sent a video, which you cannot watch]', reply: `Thank you for sharing this! I can't watch videos myself, but ${B.artist} will see it and reply personally. Meanwhile, I'm happy to answer any questions by text.` },
  document: { marker: '[The customer sent a file, which you cannot open]', reply: `Thank you! I can't open files myself, but ${B.artist} will look at it and reply personally. Meanwhile, I'm happy to answer any questions by text.` },
  audio: { marker: '[The customer sent a voice message, which you cannot listen to: ask them to type their question]', reply: `I can't listen to voice messages yet. Could you type your question? ${B.artist} will also hear your message and reply personally.` },
} as const;

const FACTS = businessFacts();

interface Contact {
  history: ChatMessage[];
  lastActive: number;
  /** The bot stays quiet in this chat until then, because Deepika is handling it. */
  pausedUntil: number;
  pending: string[];
  timer?: NodeJS.Timeout;
  /** Ends the background wait for `timer` (it keeps a Vercel function alive until the reply is sent). */
  timerDone?: () => void;
  busy: boolean;
  replyTimes: number[];
  lastMediaAck: number;
  profileName?: string;
  /** Set when the chat started from a click-to-WhatsApp ad: 'instagram_ad' or 'facebook_ad'. */
  adSource?: string;
}

const contacts = new Map<string, Contact>();
const seenMessageIds = new Map<string, number>();

/** Logs only the last 4 digits of a phone number. */
const who = (waId: string) => `…${waId.slice(-4)}`;

function contactFor(waId: string): Contact {
  let c = contacts.get(waId);
  if (!c) {
    c = { history: [], lastActive: Date.now(), pausedUntil: 0, pending: [], busy: false, replyTimes: [], lastMediaAck: 0 };
    contacts.set(waId, c);
  }
  return c;
}

function remember(c: Contact, message: ChatMessage) {
  c.history.push(message);
  if (c.history.length > MAX_HISTORY) c.history.splice(0, c.history.length - MAX_HISTORY);
}

/** Meta retries webhooks, so the same message can arrive more than once. */
function alreadySeen(id: string): boolean {
  if (seenMessageIds.has(id)) return true;
  seenMessageIds.set(id, Date.now());
  return false;
}

function pauseBot(c: Contact) {
  c.pausedUntil = Date.now() + config.takeoverMs;
  c.pending = [];
  clearTimeout(c.timer);
  c.timer = undefined;
  c.timerDone?.();
  c.timerDone = undefined;
}

function today() {
  const now = new Date();
  return {
    long: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now),
    iso: new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
  };
}

setInterval(() => {
  const now = Date.now();
  for (const [id, at] of seenMessageIds) if (now - at > FORGET_AFTER_MS) seenMessageIds.delete(id);
  for (const [waId, c] of contacts) {
    if (now - c.lastActive > FORGET_AFTER_MS && c.pausedUntil < now && !c.busy && !c.timer) contacts.delete(waId);
  }
}, 30 * 60_000).unref();

// ---------- Graph API ----------

async function graphPost(path: string, body: unknown): Promise<void> {
  const res = await fetch(`${config.graphUrl}/${config.graphVersion}/${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.accessToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Graph API ${res.status}: ${(await res.text()).slice(0, 400)}`);
}

/** Blue ticks plus "typing…" while the answer is prepared (WhatsApp hides it on reply or after ~25 s). */
function markReadAndTyping(messageId: string) {
  inBackground(
    graphPost(`${config.phoneNumberId}/messages`, {
      messaging_product: 'whatsapp',
      status: 'read',
      message_id: messageId,
      typing_indicator: { type: 'text' },
    }),
    (err) => console.warn(`${LOG} could not mark as read:`, err instanceof Error ? err.message : err),
  );
}

/** Sends a text reply, or the same text with the welcome buttons under it. */
function sendReply(to: string, body: string, withButtons = false) {
  const message =
    withButtons && body.length <= MAX_BUTTON_BODY_CHARS
      ? {
          type: 'interactive',
          interactive: {
            type: 'button',
            body: { text: body },
            action: { buttons: WELCOME_BUTTONS.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
          },
        }
      : { type: 'text', text: { body, preview_url: false } };
  return graphPost(`${config.phoneNumberId}/messages`, { messaging_product: 'whatsapp', recipient_type: 'individual', to, ...message });
}

/** WhatsApp shows *bold* and plain URLs; turn any stray markdown from the model into that. */
function toWhatsAppText(text: string): string {
  const out = text
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1: $2')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
  return out.length > MAX_REPLY_CHARS ? `${out.slice(0, MAX_REPLY_CHARS - 1)}…` : out;
}

// ---------- Booking requests ----------

const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/**
 * Saves a booking request from the chat. It updates instead of adding a row when the same customer already has
 * (a) a request for the same service from the last day (they were correcting a detail), or (b) an open lead from a
 * click-to-WhatsApp ad in the last 30 days that doesn't say what they want yet.
 */
async function saveBookingRequest(waId: string, c: Contact, args: Record<string, unknown>) {
  if (!pool) return { ok: false, error: `Booking requests can't be saved right now. Tell the customer ${B.artist} will reply personally.` };

  const fullName = text(args.full_name, 120);
  const service = text(args.service, 200);
  const eventDate = text(args.event_date, 10);
  const eventLocation = text(args.event_location, 200);
  const partySize = text(args.party_size, 100);
  const email = text(args.email, 200);
  const notes = text(args.notes, 2000);

  const problems: string[] = [];
  if (!fullName) problems.push('the full name is missing');
  if (!BOOKABLE_SERVICES.includes(service)) problems.push(`the service must be one of: ${BOOKABLE_SERVICES.join('; ')}`);
  if (!eventLocation) problems.push('the event location is missing');
  if (eventDate) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate) || Number.isNaN(Date.parse(eventDate))) problems.push('the event date must be a real date (YYYY-MM-DD)');
    else if (eventDate < today().iso) problems.push('the event date is in the past');
  }
  if (email && !EMAIL_RE.test(email)) problems.push('the email address looks invalid');
  if (problems.length) return { ok: false, error: `Not saved: ${problems.join('; ')}. Ask the customer about this.` };

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
    const wasAdLead = earlier.rows[0].service === SERVICE_NOT_SPECIFIED;
    console.log(`${LOG} ${wasAdLead ? 'ad lead' : 'booking request'} #${earlier.rows[0].id} from ${who(waId)} updated with the booking details`);
    return wasAdLead ? { ok: true, request_number: earlier.rows[0].id } : { ok: true, request_number: earlier.rows[0].id, updated_existing_request: true };
  }
  const { rows } = await db.query<{ id: string }>(
    `INSERT INTO bookings (full_name, phone, email, service, event_date, event_location, party_size, notes, source, channel)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'whatsapp')
     RETURNING id`,
    [fullName, phone, email || null, service, eventDate || null, eventLocation, partySize || null, notes || null, c.adSource ?? 'whatsapp'],
  );
  console.log(`${LOG} new booking request #${rows[0].id} from ${who(waId)} for "${service}"`);
  return { ok: true, request_number: rows[0].id };
}

interface Turn {
  handoff: boolean;
  savedRequest?: string;
}

/**
 * A chat that starts from a click-to-WhatsApp ad is a lead straight away, even before any booking details.
 * One open lead per customer: a repeat ad click within 30 days reuses it.
 */
async function saveAdLead(waId: string, c: Contact, referral: Referral) {
  if (!pool) return;
  const phone = `+${waId}`;
  const source = sourceFromAdUrl(referral.source_url);
  c.adSource = source;
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
      c.profileName || 'WhatsApp lead',
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

function toolsFor(waId: string, c: Contact, turn: Turn): Record<string, ChatTool> {
  return {
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
              notes: { type: 'string', description: 'Other useful details: ready-by time, outfit, look preferences, other events. Empty string if none.' },
            },
          },
        },
      },
      run: async (args) => {
        const result = await saveBookingRequest(waId, c, args);
        if (result.ok && 'request_number' in result) turn.savedRequest = result.request_number;
        return result;
      },
    },
    handoff_to_deepika: {
      definition: {
        type: 'function',
        function: {
          name: 'handoff_to_deepika',
          description: `Hand this chat over to ${B.artist}: the assistant stops replying here so she can reply personally.`,
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
        console.log(`${LOG} ${who(waId)} handed over to Deepika (${text(args.reason, 120) || 'no reason given'})`);
        return { ok: true, note: `${B.artist} will reply personally in this chat. Tell the customer that, briefly.` };
      },
    },
  };
}

// ---------- Answering ----------

/**
 * Without the language model, the best-matching knowledge entry is sent as is. Entries written for the website
 * point people to WhatsApp links or the website's booking button, which makes no sense inside WhatsApp, so those
 * get the general fallback instead.
 */
function searchAnswerForWhatsApp(retrieved: Awaited<ReturnType<typeof retrieve>>): string {
  const found = searchOnlyAnswer(retrieved, FALLBACK);
  return /wa\.me|Book a Consultation/i.test(found) ? FALLBACK : found;
}

async function answer(waId: string, c: Contact): Promise<{ reply: string; turn: Turn }> {
  const turn: Turn = { handoff: false };
  const retrieved = await retrieve(c.history);
  if (!openai) return { reply: searchAnswerForWhatsApp(retrieved), turn };

  const date = today();
  const system = buildWhatsAppSystemPrompt({
    facts: FACTS,
    context: retrieved.context,
    todayLong: date.long,
    todayIso: date.iso,
    profileName: c.profileName,
    canSaveBookings: Boolean(pool),
  });
  try {
    const reply = await completeChatWithTools([{ role: 'system', content: system }, ...c.history], toolsFor(waId, c, turn), AbortSignal.timeout(60_000));
    if (reply) return { reply, turn };
  } catch (err) {
    console.error(`${LOG} OpenAI request failed (${OPENAI_MODEL}):`, err instanceof Error ? err.message : err);
  }
  // The model failed after a tool may already have run: still tell the customer what happened
  if (turn.savedRequest) {
    return { reply: `Thank you! Your booking request #${turn.savedRequest} has been sent to ${B.artist}. She'll personally confirm availability and the quote, usually within 24 hours.`, turn };
  }
  if (turn.handoff) return { reply: HANDOFF_REPLY, turn };
  return { reply: searchAnswerForWhatsApp(retrieved), turn };
}

function scheduleReply(waId: string, delay = GATHER_MS) {
  const c = contactFor(waId);
  clearTimeout(c.timer);
  c.timerDone?.(); // the earlier wait is replaced by this one
  const replied = new Promise<void>((resolve) => {
    c.timerDone = resolve;
    c.timer = setTimeout(() => {
      c.timer = undefined;
      c.timerDone = undefined;
      replyTo(waId).finally(resolve);
    }, delay);
  });
  inBackground(replied, (err) => console.error(`${LOG} could not reply to ${who(waId)}:`, err));
}

async function replyTo(waId: string) {
  const c = contactFor(waId);
  if (c.busy) return scheduleReply(waId, 1000); // still answering the previous message
  if (!c.pending.length || Date.now() < c.pausedUntil) return;

  const question = c.pending.join('\n').slice(0, 1500);
  c.pending = [];
  const firstReply = !c.history.some((m) => m.role === 'assistant');
  remember(c, { role: 'user', content: question });

  const now = Date.now();
  c.replyTimes = c.replyTimes.filter((t) => now - t < 10 * 60_000);
  if (c.replyTimes.length >= MAX_REPLIES_PER_10_MIN) {
    console.warn(`${LOG} ${who(waId)} sent too many messages; not replying for a few minutes`);
    return;
  }

  c.busy = true;
  try {
    const { reply, turn } = await answer(waId, c);
    const body = toWhatsAppText(reply);
    // Deepika may have replied from her phone while the answer was being written
    if (Date.now() < c.pausedUntil) return;
    await sendReply(waId, body, firstReply && !turn.handoff && !turn.savedRequest);
    c.replyTimes.push(Date.now());
    remember(c, { role: 'assistant', content: body });
    if (turn.handoff) pauseBot(c);
    console.log(`${LOG} replied to ${who(waId)}${turn.savedRequest ? ` (booking request #${turn.savedRequest})` : ''}${turn.handoff ? ' and handed over to Deepika' : ''}`);
  } catch (err) {
    console.error(`${LOG} could not reply to ${who(waId)}:`, err instanceof Error ? err.message : err);
  } finally {
    c.busy = false;
  }
}

/** "Talk to Deepika" button: no model needed. */
async function handOver(waId: string, c: Contact) {
  remember(c, { role: 'user', content: 'Talk to Deepika' });
  pauseBot(c);
  try {
    await sendReply(waId, HANDOFF_REPLY);
    remember(c, { role: 'assistant', content: HANDOFF_REPLY });
    console.log(`${LOG} ${who(waId)} tapped "Talk to Deepika"; bot paused in that chat`);
  } catch (err) {
    console.error(`${LOG} could not reply to ${who(waId)}:`, err instanceof Error ? err.message : err);
  }
}

// ---------- Webhook payloads ----------

/** Present on the first message of a chat opened from a click-to-WhatsApp ad. */
interface Referral {
  source_url?: string;
  source_id?: string;
  source_type?: string;
  headline?: string;
  body?: string;
  ctwa_clid?: string;
}

interface IncomingMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  referral?: Referral;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
}

interface EchoMessage {
  to?: string;
  id?: string;
  type?: string;
  text?: { body?: string };
}

interface ChangeValue {
  metadata?: { phone_number_id?: string };
  contacts?: { wa_id?: string; profile?: { name?: string } }[];
  messages?: IncomingMessage[];
  statuses?: { id: string; status: string; recipient_id?: string; errors?: { code?: number; title?: string; message?: string }[] }[];
  message_echoes?: EchoMessage[];
  errors?: { code?: number; title?: string; message?: string }[];
}

interface WebhookBody {
  object?: string;
  entry?: { changes?: { field?: string; value?: ChangeValue }[] }[];
}

function textOf(m: IncomingMessage): string | null {
  if (m.type === 'text') return m.text?.body?.trim() || null;
  if (m.type === 'button') return m.button?.text?.trim() || null;
  if (m.type === 'interactive') {
    const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
    return (reply?.id && BUTTON_MEANING[reply.id]) || reply?.title?.trim() || null;
  }
  return null;
}

function onCustomerMessage(m: IncomingMessage, profileName?: string) {
  if (!m.id || !m.from || alreadySeen(m.id)) return;
  const sentAt = Number(m.timestamp) * 1000;
  if (sentAt && Date.now() - sentAt > MAX_MESSAGE_AGE_MS) {
    console.log(`${LOG} ${who(m.from)}: message is ${Math.round((Date.now() - sentAt) / 60_000)} min old, leaving it for Deepika`);
    return;
  }
  const c = contactFor(m.from);
  c.lastActive = Date.now();
  if (profileName) c.profileName = profileName.slice(0, 80);
  if (m.referral?.source_type === 'ad') {
    inBackground(saveAdLead(m.from, c, m.referral), (err) =>
      console.error(`${LOG} could not save ad lead:`, err instanceof Error ? err.message : err),
    );
  }
  const msgText = textOf(m);
  const media = MEDIA[m.type as keyof typeof MEDIA];

  if (Date.now() < c.pausedUntil) {
    // Deepika is handling this chat: only keep the context
    if (msgText || media) remember(c, { role: 'user', content: msgText?.slice(0, 1000) ?? media!.marker });
    return;
  }

  if (m.type === 'interactive' && m.interactive?.button_reply?.id === 'deepika') {
    markReadAndTyping(m.id);
    inBackground(handOver(m.from, c), (err) => console.error(`${LOG} could not hand over ${who(m.from)}:`, err));
    return;
  }

  if (msgText) {
    c.pending.push(msgText);
  } else if (media) {
    // Acknowledge photos, voice notes and files, at most every 30 minutes per chat
    if (Date.now() - c.lastMediaAck < MEDIA_ACK_EVERY_MS) {
      remember(c, { role: 'user', content: media.marker });
      return;
    }
    c.lastMediaAck = Date.now();
    if (!openai) {
      markReadAndTyping(m.id);
      remember(c, { role: 'user', content: media.marker });
      inBackground(
        sendReply(m.from, media.reply).then(() => remember(c, { role: 'assistant', content: media.reply })),
        (err) => console.error(`${LOG} could not reply to ${who(m.from)}:`, err instanceof Error ? err.message : err),
      );
      return;
    }
    c.pending.push(media.marker); // the model answers it together with any text sent alongside
  } else {
    return; // stickers, reactions, locations…: nothing to answer
  }
  markReadAndTyping(m.id);
  scheduleReply(m.from);
}

/** Deepika replied from the WhatsApp Business app (coexistence only). */
function onBusinessAppReply(e: EchoMessage) {
  if (!e.to || (e.id && alreadySeen(e.id))) return;
  const c = contactFor(e.to);
  c.lastActive = Date.now();
  pauseBot(c);
  if (e.type === 'text' && e.text?.body) remember(c, { role: 'assistant', content: e.text.body.slice(0, 4000) });
  console.log(`${LOG} Deepika replied to ${who(e.to)} from her phone; bot paused in that chat for ${config.takeoverMs / 3_600_000} h`);
}

function handleWebhook(body: WebhookBody) {
  if (body.object !== 'whatsapp_business_account') return;
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      // One Meta account can hold several numbers: only answer for ours
      if (value.metadata?.phone_number_id && value.metadata.phone_number_id !== config.phoneNumberId) continue;

      if (change.field === 'messages') {
        for (const m of value.messages ?? []) {
          const profile = value.contacts?.find((c) => c.wa_id === m.from)?.profile?.name;
          onCustomerMessage(m, profile);
        }
        for (const s of value.statuses ?? []) {
          if (s.status === 'failed') {
            const e = s.errors?.[0];
            console.warn(`${LOG} message to ${who(s.recipient_id ?? '')} failed: ${e?.code} ${e?.title ?? ''} ${e?.message ?? ''}`.trim());
          }
        }
        for (const e of value.errors ?? []) console.warn(`${LOG} webhook error: ${e.code} ${e.title ?? ''} ${e.message ?? ''}`.trim());
      } else if (change.field === 'smb_message_echoes') {
        for (const e of value.message_echoes ?? []) onBusinessAppReply(e);
      }
      // history, smb_app_state_sync and account_update need no action from the bot
    }
  }
}

// ---------- Routes (mounted at /api/whatsapp, before express.json, so the raw body can be signature-checked) ----------

export const whatsappRouter = Router();

/** Meta calls this once when you save the webhook URL in the App Dashboard. */
whatsappRouter.get('/webhook', (req, res) => {
  if (answerVerification(req, res, config.verifyToken)) console.log(`${LOG} webhook verified by Meta`);
});

whatsappRouter.post('/webhook', express.raw({ type: () => true, limit: '10mb' }), (req, res) => {
  if (!whatsappEnabled) return res.sendStatus(503);
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  if (!validSignature(raw, req.header('x-hub-signature-256'), config.appSecret!)) {
    console.warn(`${LOG} rejected a webhook with a missing or wrong signature (check WHATSAPP_APP_SECRET)`);
    return res.sendStatus(401);
  }
  let body: WebhookBody;
  try {
    body = JSON.parse(raw.toString('utf8'));
  } catch {
    return res.sendStatus(400);
  }
  // Acknowledge at once (Meta retries slow webhooks), then answer in the background
  res.sendStatus(200);
  try {
    handleWebhook(body);
  } catch (err) {
    console.error(`${LOG} could not process webhook:`, err);
  }
});
