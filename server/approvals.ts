/**
 * Payment approvals on WhatsApp. When a customer sends their payment screenshot, each approval number (Settings, e.g.
 * Deepika's own WhatsApp) gets it as a WhatsApp message: the screenshot, the booking details, and two buttons,
 * Approve and Not received. A tap does exactly what the dashboard's buttons do (handled in server/whatsappBot.ts).
 *
 * WhatsApp only lets a business message someone out of the blue with a template Meta has approved. It's a Twilio
 * Content template (`twilio/card`, created with server/scripts/create-approval-template.ts); its ID is kept in the
 * `settings` table under "whatsapp_templates". The screenshot reaches WhatsApp through a signed link that expires.
 */
import { money, timeLabel } from '../src/data/bookingFlow.js';
import { BUSINESS_INFO as B } from '../src/data/portfolioData.js';
import { signWith } from './auth.js';
import { getDb, pool } from './db.js';
import { getBookingSettings, getSetting } from './settings.js';
import { ARTIST_FOR_CUSTOMER, longDate } from './whatsappQuotes.js';

const LOG = '[approvals]';

/** Where WhatsApp fetches a screenshot from (on the website's domain, which forwards /api to DMH API). */
export const PROOF_PATH = '/api/whatsapp/proof';
/** How long a screenshot link works. */
const PROOF_LINK_DAYS = 14;

/** A link token for one screenshot: "<id>.<expiry>.<signature>". */
export function proofToken(proofId: string): string {
  const payload = `${proofId}.${(Math.floor(Date.now() / 1000) + PROOF_LINK_DAYS * 86_400).toString(36)}`;
  return `${payload}.${signWith('payment-proof', payload)}`;
}

/** The screenshot's id, if the token is genuine and hasn't expired. */
export function readProofToken(token: string): string | null {
  const [id, exp, signature] = token.replace(/\.(jpe?g|png)$/i, '').split('.');
  if (!/^\d+$/.test(id ?? '') || !exp || !signature) return null;
  if (signWith('payment-proof', `${id}.${exp}`) !== signature) return null;
  return parseInt(exp, 36) * 1000 > Date.now() ? id : null;
}

/** The template's variables (Twilio Content), filled in for one booking. */
export interface ApprovalTemplateVariables {
  /** booking number, also inside the buttons' hidden ids: "approve_105" / "reject_105" */
  '1': string;
  /** customer name */
  '2': string;
  /** package(s) */
  '3': string;
  /** date and time */
  '4': string;
  /** artist */
  '5': string;
  /** total */
  '6': string;
  /** advance */
  '7': string;
  /** path of the screenshot on the website's domain, e.g. "api/whatsapp/proof/<token>.jpg" */
  '8': string;
}

/** Sends a template message; returns the message ID. Registered by the WhatsApp connection that supports it (Twilio). */
export type TemplateSender = (opts: { from?: string; to: string; contentSid: string; variables: Record<string, string> }) => Promise<string>;
let sendTemplate: TemplateSender | null = null;
export function registerTemplateSender(sender: TemplateSender) {
  sendTemplate = sender;
}

/** The IDs of the WhatsApp templates created in Twilio. */
export interface WhatsAppTemplates {
  paymentApproval: string;
}

/** WhatsApp numbers are compared as digits only. */
const digits = (phone: string) => phone.replace(/\D/g, '');

/** True when this WhatsApp number (digits, as messages arrive) is one of the approval numbers in Settings. */
export async function isApprover(waId: string): Promise<boolean> {
  if (!pool) return false;
  const settings = await getBookingSettings();
  return settings.approverWhatsapp.some((n) => digits(n) === digits(waId));
}

/** Text is limited in a template variable: one line, no tabs, not too long. */
const oneLine = (value: string, max = 120) => value.replace(/\s+/g, ' ').trim().slice(0, max) || '-';

/**
 * Sends the payment screenshot and booking details to every approval number, with the Approve / Not received buttons.
 * Best effort: problems are logged (the dashboard still shows the payment to verify).
 */
export async function notifyApprovers(bookingId: string, proofId: string, contentType: string, businessNumber?: string): Promise<number> {
  const settings = await getBookingSettings();
  if (!settings.approverWhatsapp.length) return 0;
  if (!/^image\/(jpeg|png)$/i.test(contentType)) {
    console.log(`${LOG} booking #${bookingId}: the payment proof is a ${contentType}, not a picture; approve it in the dashboard`);
    return 0;
  }
  const { paymentApproval } = await getSetting<WhatsAppTemplates>('whatsapp_templates');
  if (!paymentApproval) {
    console.warn(`${LOG} no WhatsApp approval template yet (run server/scripts/create-approval-template.ts); approve booking #${bookingId} in the dashboard`);
    return 0;
  }
  if (!sendTemplate) {
    console.warn(`${LOG} WhatsApp approvals need the Twilio connection; approve booking #${bookingId} in the dashboard`);
    return 0;
  }

  const { rows } = await getDb().query<{
    full_name: string;
    service: string;
    event_date: string | null;
    event_time: string | null;
    artist: 'deepika' | 'senior' | null;
    total_price: number | null;
    advance_amount: number | null;
  }>(
    `SELECT full_name, service, to_char(event_date, 'YYYY-MM-DD') AS event_date, to_char(event_time, 'HH24:MI') AS event_time, artist,
            total_price::float8 AS total_price, advance_amount::float8 AS advance_amount
       FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const b = rows[0];
  if (!b) return 0;
  const variables: ApprovalTemplateVariables = {
    '1': bookingId,
    '2': oneLine(b.full_name),
    '3': oneLine(b.service),
    '4': oneLine(b.event_date ? `${longDate(b.event_date)}${b.event_time ? ` at ${timeLabel(b.event_time)}` : ''}` : 'not given'),
    '5': oneLine(b.artist ? ARTIST_FOR_CUSTOMER[b.artist] : 'not known'),
    '6': b.total_price !== null ? money(b.total_price) : '-',
    '7': b.advance_amount !== null ? money(b.advance_amount) : '-',
    '8': `${PROOF_PATH.slice(1)}/${proofToken(proofId)}.jpg`,
  };
  let sent = 0;
  for (const to of settings.approverWhatsapp) {
    try {
      await sendTemplate({ from: businessNumber, to, contentSid: paymentApproval, variables: { ...variables } });
      sent++;
      console.log(`${LOG} booking #${bookingId}: payment screenshot sent for approval to …${digits(to).slice(-4)}`);
    } catch (err) {
      console.error(`${LOG} could not send booking #${bookingId} for approval to …${digits(to).slice(-4)}:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

/** What an approver's message asks for: a tapped button ("approve_105") or typed text ("approve 105", "not received"). */
export function approverCommand(buttonPayload: string | undefined, text: string | null | undefined): { action: 'approve' | 'reject'; bookingId: string | null } | null {
  const button = buttonPayload?.match(/^(approve|reject)_(\d+)$/);
  if (button) return { action: button[1] as 'approve' | 'reject', bookingId: button[2] };
  const typed = (text ?? '').trim().toLowerCase().match(/^(approve|approved|ok|confirm|yes|reject|not received|no)\b[\s#:.-]*(\d+)?\s*$/);
  if (!typed) return null;
  return { action: /^(reject|not received|no)/.test(typed[1]) ? 'reject' : 'approve', bookingId: typed[2] ?? null };
}

/** The bookings whose payment screenshot waits for approval, newest first. */
export async function bookingsToVerify(): Promise<{ id: string; fullName: string }[]> {
  const { rows } = await getDb().query<{ id: string; full_name: string }>(
    `SELECT id::text, full_name FROM bookings WHERE booking_status = 'payment_review' AND status <> 'lost' ORDER BY payment_submitted_at DESC NULLS LAST LIMIT 10`,
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name }));
}

/** Shown to an approver who writes something that isn't a command. */
export const APPROVER_HELP = `Hi! 👋 This is ${B.name}'s booking assistant. When a customer sends their advance payment screenshot, I send it to you here with the booking details: tap *Approve* to confirm the booking, or *Not received* to ask them to send it again.\n\nYou can also type *approve 105* or *reject 105* (with the booking number).`;
