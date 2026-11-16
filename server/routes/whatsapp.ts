/**
 * Meta's WhatsApp Cloud API webhook (/api/whatsapp/webhook): connects a number registered directly with Meta to
 * Deepika's virtual assistant (server/whatsappBot.ts, which holds the conversation logic shared with Twilio).
 *
 * This file only speaks Meta's dialect: the webhook handshake and signature, the payload shape, and the Graph API
 * calls that send replies, quick-reply buttons and the "typing…" indicator.
 */
import express, { Router } from 'express';
import { inBackground } from '../background.js';
import { answerVerification, validSignature } from '../meta.js';
import {
  BUTTON_MEANING,
  deepikaRepliedFromApp,
  receiveMessage,
  who,
  type InboundMessage,
  type MediaKind,
  type Referral,
  type WhatsAppTransport,
} from '../whatsappBot.js';

const LOG = '[whatsapp:meta]';

const config = {
  accessToken: process.env.WHATSAPP_ACCESS_TOKEN?.trim(),
  phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  verifyToken: process.env.WHATSAPP_VERIFY_TOKEN?.trim(),
  appSecret: process.env.WHATSAPP_APP_SECRET?.trim(),
  graphVersion: process.env.WHATSAPP_GRAPH_VERSION?.trim() || 'v25.0',
  // Only changed by the automated test, which points it at a local mock of the Graph API
  graphUrl: process.env.WHATSAPP_GRAPH_URL?.trim() || 'https://graph.facebook.com',
};

const REQUIRED = {
  WHATSAPP_ACCESS_TOKEN: config.accessToken,
  WHATSAPP_PHONE_NUMBER_ID: config.phoneNumberId,
  WHATSAPP_VERIFY_TOKEN: config.verifyToken,
  WHATSAPP_APP_SECRET: config.appSecret,
};
export const missingMetaWhatsAppSettings = Object.entries(REQUIRED).filter(([, v]) => !v).map(([k]) => k);
export const metaWhatsAppEnabled = missingMetaWhatsAppSettings.length === 0;
export const metaPhoneNumberId = config.phoneNumberId;

/** WhatsApp's limit for a button message's body. Longer replies are sent as plain text without buttons. */
const MAX_BUTTON_BODY_CHARS = 1024;

/** Quick-reply buttons under the first reply of a conversation (titles max 20 characters). */
const WELCOME_BUTTONS = [
  { id: 'book', title: 'Book appointment' },
  { id: 'services', title: 'Our services' },
  { id: 'deepika', title: 'Talk to Deepika' },
] as const;

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

const metaTransport: WhatsAppTransport = {
  name: 'meta',
  /** A text reply, or the same text with the welcome buttons under it. */
  send(to, body, withButtons) {
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
  },
  /** Blue ticks plus "typing…" (WhatsApp hides it on reply or after ~25 s). */
  markReadAndTyping(messageId) {
    inBackground(
      graphPost(`${config.phoneNumberId}/messages`, {
        messaging_product: 'whatsapp',
        status: 'read',
        message_id: messageId,
        typing_indicator: { type: 'text' },
      }),
      (err) => console.warn(`${LOG} could not mark as read:`, err instanceof Error ? err.message : err),
    );
  },
};

// ---------- Webhook payloads ----------

interface MetaMessage {
  id: string;
  from: string;
  timestamp?: string;
  type: string;
  referral?: Referral;
  text?: { body?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { id?: string; title?: string }; list_reply?: { id?: string; title?: string } };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string };
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
  messages?: MetaMessage[];
  statuses?: { id: string; status: string; recipient_id?: string; errors?: { code?: number; title?: string; message?: string }[] }[];
  message_echoes?: EchoMessage[];
  errors?: { code?: number; title?: string; message?: string }[];
}

interface WebhookBody {
  object?: string;
  entry?: { changes?: { field?: string; value?: ChangeValue }[] }[];
}

const MEDIA_TYPES: Record<string, MediaKind> = { image: 'image', video: 'video', document: 'document', audio: 'audio' };

function toInbound(m: MetaMessage, profileName?: string): InboundMessage {
  const reply = m.interactive?.button_reply ?? m.interactive?.list_reply;
  let text: string | null = null;
  if (m.type === 'text') text = m.text?.body?.trim() || null;
  else if (m.type === 'button') text = m.button?.text?.trim() || null;
  else if (m.type === 'interactive') text = (reply?.id && BUTTON_MEANING[reply.id]) || reply?.title?.trim() || null;
  else if (m.type === 'image' || m.type === 'video' || m.type === 'document') text = m[m.type]?.caption?.trim() || null;
  const sentAt = Number(m.timestamp) * 1000;
  return {
    id: m.id,
    from: m.from,
    sentAt: sentAt || undefined,
    profileName,
    text,
    media: MEDIA_TYPES[m.type],
    wantsDeepika: m.type === 'interactive' && m.interactive?.button_reply?.id === 'deepika',
    referral: m.referral,
  };
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
          receiveMessage(metaTransport, toInbound(m, profile));
        }
        for (const s of value.statuses ?? []) {
          if (s.status === 'failed') {
            const e = s.errors?.[0];
            console.warn(`${LOG} message to ${who(s.recipient_id ?? '')} failed: ${e?.code} ${e?.title ?? ''} ${e?.message ?? ''}`.trim());
          }
        }
        for (const e of value.errors ?? []) console.warn(`${LOG} webhook error: ${e.code} ${e.title ?? ''} ${e.message ?? ''}`.trim());
      } else if (change.field === 'smb_message_echoes') {
        // Coexistence: Deepika replied from the WhatsApp Business app
        for (const e of value.message_echoes ?? []) {
          if (e.to) deepikaRepliedFromApp(e.to, e.id, e.type === 'text' ? e.text?.body : undefined);
        }
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
  if (!metaWhatsAppEnabled) return res.sendStatus(503);
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
