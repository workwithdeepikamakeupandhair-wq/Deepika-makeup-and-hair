/**
 * Twilio WhatsApp webhook (/api/twilio/whatsapp): connects a WhatsApp number on Twilio to Deepika's virtual
 * assistant (server/whatsappBot.ts). It works the same for Twilio's WhatsApp sandbox (for testing) and for a number
 * bought from Twilio later, because every reply is sent from the number the customer wrote to.
 *
 * Twilio posts each incoming message as a form, signed with the account's Auth Token (X-Twilio-Signature). We
 * check the signature, answer the webhook at once with empty TwiML, and send the reply through Twilio's Messages
 * API once it's ready (the assistant waits 1.5 s for follow-up messages and may look things up first).
 *
 * Settings: TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN (Twilio Console → Account info). ACCOUNT_SID and AUTH_TOKEN
 * are accepted too.
 */
import crypto from 'node:crypto';
import express, { Router, type Request } from 'express';
import { registerTemplateSender } from '../approvals.js';
import { inBackground } from '../background.js';
import { receiveMessage, registerOutboundTransport, who, type InboundMessage, type MediaKind, type WhatsAppTransport } from '../whatsappBot.js';

const LOG = '[whatsapp:twilio]';

const config = {
  accountSid: (process.env.TWILIO_ACCOUNT_SID || process.env.ACCOUNT_SID || '').trim(),
  authToken: (process.env.TWILIO_AUTH_TOKEN || process.env.AUTH_TOKEN || '').trim(),
  /**
   * The exact webhook address entered in Twilio, if requests reach this server through another address (the
   * signature covers the full URL). Usually not needed: the address is worked out from the request.
   */
  webhookUrl: process.env.TWILIO_WEBHOOK_URL?.trim(),
  /** Only answer messages sent to this WhatsApp number (e.g. "+14155238886"). Empty: any of the account's numbers. */
  number: process.env.TWILIO_WHATSAPP_NUMBER?.trim().replace(/^whatsapp:/i, ''),
  // Only changed by the automated test, which points them at a local mock of Twilio
  apiUrl: process.env.TWILIO_API_URL?.trim() || 'https://api.twilio.com',
  messagingUrl: process.env.TWILIO_MESSAGING_URL?.trim() || 'https://messaging.twilio.com',
};

export const twilioWhatsAppEnabled = Boolean(config.accountSid && config.authToken);
export const twilioWhatsAppPath = '/api/twilio/whatsapp';

/** Twilio's shared sandbox number. People join it by sending "join <two-words>" first. */
const SANDBOX_NUMBER = '+14155238886';
/** Twilio refuses WhatsApp message bodies over 1600 characters, so longer replies go out in parts. */
const MAX_BODY = 1600;

/** What Twilio's error codes mean, for the logs. */
const ERROR_HINTS: Record<string, string> = {
  '63015': 'sandbox: this phone has not joined the sandbox (send "join <code>" to the sandbox number first), or joined more than 3 days ago',
  '63016': "outside WhatsApp's 24-hour window: the customer must message first",
  '63038': 'daily message limit reached for this account (trial accounts have a low limit)',
  '63007': 'Twilio has no WhatsApp sender for this "From" number',
  '21211': 'invalid "To" number',
  '20003': 'wrong TWILIO_ACCOUNT_SID or TWILIO_AUTH_TOKEN',
};
const hint = (code: unknown) => (code != null && ERROR_HINTS[String(code)] ? ` (${ERROR_HINTS[String(code)]})` : '');

// ---------- Signature ----------

/** Twilio's request signature: HMAC-SHA1 of the full URL followed by every form field (sorted) as name + value. */
export function twilioSignature(authToken: string, url: string, params: Record<string, unknown>): string {
  let data = url;
  for (const key of Object.keys(params).sort()) {
    const value = params[key];
    const values = Array.isArray(value) ? value.map(String).sort() : [String(value ?? '')];
    for (const v of values) data += key + v;
  }
  return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf8')).digest('base64');
}

/** The addresses Twilio may have signed: the configured one, and the one this request arrived at. */
function possibleUrls(req: Request): string[] {
  const origins = new Set([req.get('x-forwarded-host')?.split(',')[0].trim(), req.get('host')].filter(Boolean).map((host) => `${req.protocol}://${host}`));
  const urls: string[] = [];
  if (config.webhookUrl) {
    urls.push(config.webhookUrl);
    try {
      origins.add(new URL(config.webhookUrl).origin); // e.g. delivery reports, sent to the same site
    } catch {
      console.warn(`${LOG} TWILIO_WEBHOOK_URL is not a valid address`);
    }
  }
  for (const origin of origins) urls.push(`${origin}${req.originalUrl}`);
  return urls;
}

/** Returns the URL whose signature matched, or null. */
function verifiedUrl(req: Request): string | null {
  const given = req.get('x-twilio-signature');
  if (!given || !req.body || typeof req.body !== 'object') return null;
  for (const url of possibleUrls(req)) {
    const expected = twilioSignature(config.authToken, url, req.body);
    if (expected.length === given.length && crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return url;
  }
  return null;
}

// ---------- Twilio REST API ----------

class TwilioError extends Error {
  constructor(public status: number, public code: unknown, message: string) {
    super(message);
  }
}

const basicAuth = () => `Basic ${Buffer.from(`${config.accountSid}:${config.authToken}`).toString('base64')}`;

async function twilioPost(url: string, form: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: basicAuth(),
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(form),
    signal: AbortSignal.timeout(15_000),
  });
  const data = (await res.json().catch(() => ({}))) as { code?: unknown; message?: string };
  if (!res.ok) throw new TwilioError(res.status, data.code, `Twilio ${res.status}${data.code ? ` error ${data.code}` : ''}: ${data.message ?? 'request failed'}${hint(data.code)}`);
  return data;
}

/** Splits a long reply at paragraph, line or sentence breaks into parts Twilio accepts. */
export function splitForTwilio(body: string, max = MAX_BODY): string[] {
  const parts: string[] = [];
  let rest = body.trim();
  while (rest.length > max) {
    const window = rest.slice(0, max);
    const cut = Math.max(window.lastIndexOf('\n\n'), window.lastIndexOf('\n'), window.lastIndexOf('. ') + 1);
    const at = cut > max / 3 ? cut : max;
    parts.push(rest.slice(0, at).trim());
    rest = rest.slice(at).trim();
  }
  if (rest) parts.push(rest);
  return parts;
}

/** Typing indicators are a Twilio public beta: if Twilio refuses them, stop asking. */
let typingSupported = true;

const transports = new Map<string, WhatsAppTransport>();

/** Replies from `botNumber` (the number the customer wrote to), e.g. "+14155238886". */
function transportFor(botNumber: string, statusCallback: string | undefined): WhatsAppTransport {
  const key = `${botNumber} ${statusCallback ?? ''}`;
  let t = transports.get(key);
  if (t) return t;
  const messagesUrl = `${config.apiUrl}/2010-04-01/Accounts/${config.accountSid}/Messages.json`;
  const common = (to: string) => ({ From: `whatsapp:${botNumber}`, To: `whatsapp:+${to}`, ...(statusCallback ? { StatusCallback: statusCallback } : {}) });
  t = {
    name: botNumber === SANDBOX_NUMBER ? 'twilio sandbox' : 'twilio',
    connection: { transport: 'twilio', businessNumber: botNumber },
    async send(to, body) {
      // Twilio has no quick-reply buttons without approved content templates, so replies are plain text
      for (const part of splitForTwilio(body)) await twilioPost(messagesUrl, { ...common(to), Body: part });
    },
    async sendImage(to, url, caption) {
      await twilioPost(messagesUrl, { ...common(to), MediaUrl: url, ...(caption ? { Body: caption.slice(0, MAX_BODY) } : {}) });
    },
    markReadAndTyping(messageId) {
      if (!typingSupported) return;
      inBackground(twilioPost(`${config.messagingUrl}/v2/Indicators/Typing.json`, { messageId, channel: 'whatsapp' }), (err) => {
        if (err instanceof TwilioError && err.status >= 400 && err.status < 500 && err.status !== 429) {
          typingSupported = false;
          console.warn(`${LOG} typing indicator refused by Twilio, so it's switched off (replies still work): ${err.message}`);
        } else {
          console.warn(`${LOG} could not show "typing…":`, err instanceof Error ? err.message : err);
        }
      });
    },
  };
  transports.set(key, t);
  return t;
}

/** Messages the dashboard sends later (the booking confirmation) go out from the business number the customer wrote to. */
if (twilioWhatsAppEnabled) {
  const statusCallback = config.webhookUrl ? `${config.webhookUrl.split('?')[0].replace(/\/?$/, '/')}status` : undefined;
  registerOutboundTransport('twilio', (businessNumber) => {
    const from = businessNumber || config.number;
    if (!from) throw new Error('Which Twilio WhatsApp number to send from is unknown (set TWILIO_WHATSAPP_NUMBER).');
    return transportFor(from, statusCallback);
  });
  // Approved WhatsApp templates (Twilio Content), e.g. a payment screenshot for Deepika to approve
  registerTemplateSender(async ({ from, to, contentSid, variables }) => {
    const sender = from || config.number;
    if (!sender) throw new Error('Which Twilio WhatsApp number to send from is unknown (set TWILIO_WHATSAPP_NUMBER).');
    const sent = (await twilioPost(`${config.apiUrl}/2010-04-01/Accounts/${config.accountSid}/Messages.json`, {
      From: `whatsapp:${sender}`,
      To: `whatsapp:${to}`,
      ContentSid: contentSid,
      ContentVariables: JSON.stringify(variables),
      ...(statusCallback ? { StatusCallback: statusCallback } : {}),
    })) as { sid?: string };
    return sent.sid ?? '';
  });
}

/** Photos and files customers send (payment screenshots), downloaded with the account's credentials. */
async function twilioMedia(url: string, declaredType: string | undefined): Promise<{ data: Buffer; contentType: string }> {
  const host = new URL(url).hostname;
  if (!host.endsWith('.twilio.com') && host !== new URL(config.apiUrl).hostname) throw new Error(`unexpected media address ${host}`);
  const res = await fetch(url, { headers: { Authorization: basicAuth() }, signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Twilio media download failed: ${res.status}`);
  return {
    data: Buffer.from(await res.arrayBuffer()),
    contentType: res.headers.get('content-type')?.split(';')[0].trim() || declaredType || 'application/octet-stream',
  };
}

// ---------- Incoming messages ----------

type Form = Record<string, string | undefined>;

const digits = (address: string | undefined) => (address ?? '').replace(/^whatsapp:/i, '').replace(/\D/g, '');

function mediaKind(contentType: string | undefined): MediaKind | 'sticker' {
  const type = (contentType ?? '').toLowerCase();
  if (type === 'image/webp') return 'sticker'; // WhatsApp stickers arrive as WebP images
  if (type.startsWith('image/')) return 'image';
  if (type.startsWith('video/')) return 'video';
  if (type.startsWith('audio/')) return 'audio';
  return 'document';
}

/** Twilio's form fields → the assistant's message shape. Null for anything that isn't a customer message. */
function toInbound(p: Form): InboundMessage | null {
  const id = p.MessageSid || p.SmsMessageSid;
  const from = p.WaId?.replace(/\D/g, '') || digits(p.From);
  if (!id || !from || !/^whatsapp:/i.test(p.From ?? '')) return null;
  const kind = Number(p.NumMedia) > 0 ? mediaKind(p.MediaContentType0) : undefined;
  const text = p.Body?.trim() || p.ButtonText?.trim() || null;
  if (kind === 'sticker' && !text) return null;
  const mediaUrl = p.MediaUrl0;
  return {
    id,
    from,
    profileName: p.ProfileName?.trim() || undefined,
    text,
    media: kind === 'sticker' ? undefined : kind,
    fetchMedia: kind && kind !== 'sticker' && mediaUrl ? () => twilioMedia(mediaUrl, p.MediaContentType0) : undefined,
    buttonPayload: p.ButtonPayload?.trim() || undefined,
    referral: p.ReferralSourceType
      ? {
          source_type: p.ReferralSourceType.toLowerCase(),
          source_url: p.ReferralSourceUrl,
          source_id: p.ReferralSourceId,
          headline: p.ReferralHeadline,
          body: p.ReferralBody,
          ctwa_clid: p.ReferralCtwaClid,
        }
      : undefined,
  };
}

// ---------- Routes (mounted at /api/twilio/whatsapp) ----------

export const twilioWhatsAppRouter = Router();
twilioWhatsAppRouter.use(express.urlencoded({ extended: false, limit: '100kb' }));

const EMPTY_TWIML = '<?xml version="1.0" encoding="UTF-8"?><Response></Response>';

/** Opening the address in a browser shows whether it's set up (Twilio itself only POSTs). */
twilioWhatsAppRouter.get('/', (_req, res) => {
  res
    .status(twilioWhatsAppEnabled ? 200 : 503)
    .type('text/plain')
    .send(
      twilioWhatsAppEnabled
        ? 'DMH API: the Twilio WhatsApp webhook is ready. Paste this address into Twilio as the "When a message comes in" URL (method POST).'
        : 'DMH API: the Twilio WhatsApp webhook is off. Set TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN.',
    );
});

twilioWhatsAppRouter.post('/', (req, res) => {
  if (!twilioWhatsAppEnabled) return res.sendStatus(503);
  const url = verifiedUrl(req);
  const p = req.body as Form;
  if (!url || p.AccountSid !== config.accountSid) {
    console.warn(
      `${LOG} rejected a webhook with a missing or wrong signature (check TWILIO_AUTH_TOKEN${config.webhookUrl ? ' and TWILIO_WEBHOOK_URL' : ', or set TWILIO_WEBHOOK_URL to the exact address entered in Twilio'})`,
    );
    return res.sendStatus(403);
  }
  // Acknowledge at once (Twilio waits at most 15 s), then answer in the background
  res.type('text/xml').send(EMPTY_TWIML);

  try {
    const botNumber = `+${digits(p.To)}`;
    if (config.number && botNumber !== config.number) return;
    // The sandbox handles "join <code>" itself
    if (botNumber === SANDBOX_NUMBER && /^join\s+\S+$/i.test(p.Body?.trim() ?? '')) return;
    const message = toInbound(p);
    if (!message) return;
    const statusCallback = new URL('status', `${url.split('?')[0].replace(/\/?$/, '/')}`).toString();
    receiveMessage(transportFor(botNumber, statusCallback), message);
  } catch (err) {
    console.error(`${LOG} could not process webhook:`, err);
  }
});

/** Delivery reports for our replies: only failures are logged, with what the error code means. */
twilioWhatsAppRouter.post('/status', (req, res) => {
  if (!twilioWhatsAppEnabled) return res.sendStatus(503);
  if (!verifiedUrl(req)) return res.sendStatus(403);
  res.sendStatus(204);
  const p = req.body as Form;
  if (p.MessageStatus === 'failed' || p.MessageStatus === 'undelivered') {
    console.warn(`${LOG} reply to ${who(digits(p.To))} ${p.MessageStatus}: error ${p.ErrorCode ?? '?'}${hint(p.ErrorCode)}`);
  }
});
