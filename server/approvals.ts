/**
 * Approvals on WhatsApp. Each approval number (Settings, e.g. Deepika's own WhatsApp) gets, from the assistant's
 * number:
 * - every complete enquiry form, with two buttons: Approve (the customer gets their artist and prices) and Not
 *   available (the customer is told);
 * - every payment screenshot, with the booking details and two buttons: Approve (the booking is confirmed) and Not
 *   received (the customer is asked to send it again).
 * A tap does exactly what the dashboard's buttons do (handled in server/whatsappBot.ts).
 *
 * WhatsApp only lets a business message someone out of the blue with a template Meta has approved. These are Twilio
 * Content templates (`twilio/card`, created with server/scripts/create-approval-template.ts); their IDs are kept in
 * the `settings` table under "whatsapp_templates". A screenshot reaches WhatsApp through a signed link that expires.
 */
import { artistForPlace, money, timeLabel } from '../src/data/bookingFlow.js';
import { BUSINESS_INFO as B } from '../src/data/portfolioData.js';
import { signWith } from './auth.js';
import { checkTime } from './availability.js';
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

/** The enquiry template's variables (Twilio Content), filled in for one enquiry. */
export interface EnquiryTemplateVariables {
  /** booking number, also inside the buttons' hidden ids: "enq_approve_105" / "enq_reject_105" */
  '1': string;
  /** customer name */
  '2': string;
  /** occasion and people, e.g. "Wedding: 1 bridal, 3 non-bridal" */
  '3': string;
  /** event date */
  '4': string;
  /** location, with who that means: "Hilton, Alpharetta (Atlanta area: Deepika)" */
  '5': string;
  /** times: "Event starts 6:00 PM · makeup ready by 4:00 PM" */
  '6': string;
  /** number of events */
  '7': string;
  /** additional requirements */
  '8': string;
  /** Deepika's calendar at that time */
  '9': string;
}

/** The IDs of the WhatsApp templates created in Twilio. */
export interface WhatsAppTemplates {
  paymentApproval: string;
  enquiryApproval: string;
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

/**
 * Sends a complete enquiry to every approval number, with the Approve / Not available buttons. Best effort: problems
 * are logged (the dashboard still shows the enquiry to approve).
 */
export async function notifyEnquiryApprovers(bookingId: string, businessNumber?: string): Promise<number> {
  const settings = await getBookingSettings();
  if (!settings.approverWhatsapp.length) return 0;
  const { enquiryApproval } = await getSetting<WhatsAppTemplates>('whatsapp_templates');
  if (!enquiryApproval) {
    console.warn(`${LOG} no WhatsApp enquiry template yet (run server/scripts/create-approval-template.ts); approve enquiry #${bookingId} in the dashboard`);
    return 0;
  }
  if (!sendTemplate) {
    console.warn(`${LOG} WhatsApp approvals need the Twilio connection; approve enquiry #${bookingId} in the dashboard`);
    return 0;
  }
  const { rows } = await getDb().query<{
    full_name: string;
    service: string;
    event_type: string | null;
    event_date: string | null;
    event_time: string | null;
    event_start_time: string | null;
    event_location: string | null;
    event_city: string | null;
    event_state: string | null;
    events_count: number | null;
    special_requirements: string | null;
  }>(
    `SELECT full_name, service, event_type, to_char(event_date, 'YYYY-MM-DD') AS event_date, to_char(event_time, 'HH24:MI') AS event_time,
            to_char(event_start_time, 'HH24:MI') AS event_start_time, event_location, event_city, event_state, events_count, special_requirements
       FROM bookings WHERE id = $1`,
    [bookingId],
  );
  const b = rows[0];
  if (!b) return 0;
  const artist = artistForPlace({ city: b.event_city, state: b.event_state, location: b.event_location }, settings.atlantaAreas);
  // The location as the customer wrote it, plus the city and state if it doesn't name them
  const location = b.event_location ?? '';
  const missingFrom = (part: string | null) => (part && !location.toLowerCase().includes(part.toLowerCase()) ? part : null);
  const place = [location, missingFrom(b.event_city), missingFrom(b.event_state)].filter(Boolean).join(', ');
  let calendar = 'not needed: a senior artist does the makeup';
  if (artist === 'deepika') {
    if (!b.event_date || !b.event_time) calendar = 'no time to check';
    else {
      const slot = await checkTime(b.event_date, b.event_time, { bookingId });
      calendar = slot.dayStatus === 'fully_booked' ? 'the day is marked Fully booked' : slot.open ? `${timeLabel(b.event_time)} is free` : `${timeLabel(b.event_time)} clashes with ${slot.conflicts.join('; ')}`;
    }
  }
  // Kept short enough for WhatsApp's 1024 characters per message, with the template's own text
  const variables: EnquiryTemplateVariables = {
    '1': bookingId,
    '2': oneLine(b.full_name, 60),
    '3': oneLine(b.service, 100),
    '4': b.event_date ? longDate(b.event_date) : '-',
    '5': `${oneLine(place || '-', 100)} (${artist === 'deepika' ? `Atlanta area: ${B.artist.split(' ')[0]}` : 'outside Atlanta: senior artist'})`,
    '6': oneLine([b.event_start_time && `event starts ${timeLabel(b.event_start_time)}`, b.event_time && `makeup ready / reporting ${timeLabel(b.event_time)}`].filter(Boolean).join(' · ') || '-', 100),
    '7': b.events_count !== null ? String(b.events_count) : '-',
    '8': oneLine(b.special_requirements || 'none', 140),
    '9': oneLine(calendar, 120),
  };
  let sent = 0;
  for (const to of settings.approverWhatsapp) {
    try {
      await sendTemplate({ from: businessNumber, to, contentSid: enquiryApproval, variables: { ...variables } });
      sent++;
      console.log(`${LOG} enquiry #${bookingId} sent for approval to …${digits(to).slice(-4)}`);
    } catch (err) {
      console.error(`${LOG} could not send enquiry #${bookingId} for approval to …${digits(to).slice(-4)}:`, err instanceof Error ? err.message : err);
    }
  }
  return sent;
}

/**
 * What an approver's message asks for: a tapped button ("enq_approve_105", "approve_105") or typed text ("approve
 * 105", "not available", "not received"). `kind` is "enquiry" or "payment" for a button; a typed command applies to
 * whatever the booking waits for (null).
 */
export function approverCommand(
  buttonPayload: string | undefined,
  text: string | null | undefined,
): { action: 'approve' | 'reject'; bookingId: string | null; kind: 'enquiry' | 'payment' | null } | null {
  const button = buttonPayload?.match(/^(enq_)?(approve|reject)_(\d+)$/);
  if (button) return { action: button[2] as 'approve' | 'reject', bookingId: button[3], kind: button[1] ? 'enquiry' : 'payment' };
  const typed = (text ?? '').trim().toLowerCase().match(/^(approve|approved|ok|confirm|yes|reject|not received|not available|no)\b[\s#:.-]*(\d+)?\s*$/);
  if (!typed) return null;
  return { action: /^(reject|not|no)/.test(typed[1]) ? 'reject' : 'approve', bookingId: typed[2] ?? null, kind: null };
}

/** The enquiries and payment screenshots that wait for approval, oldest first. */
export async function waitingForApproval(): Promise<{ id: string; fullName: string; kind: 'enquiry' | 'payment' }[]> {
  const { rows } = await getDb().query<{ id: string; full_name: string; booking_status: string }>(
    `SELECT id::text, full_name, booking_status FROM bookings
      WHERE booking_status IN ('enquiry_review', 'payment_review') AND status <> 'lost'
      ORDER BY coalesce(payment_submitted_at, enquiry_submitted_at) ASC NULLS LAST LIMIT 10`,
  );
  return rows.map((r) => ({ id: r.id, fullName: r.full_name, kind: r.booking_status === 'enquiry_review' ? 'enquiry' : 'payment' }));
}

/** What a booking waits for the team to approve, if anything. */
export async function approvalKind(bookingId: string): Promise<'enquiry' | 'payment' | null> {
  const { rows } = await getDb().query<{ booking_status: string | null }>('SELECT booking_status FROM bookings WHERE id = $1', [bookingId]);
  const s = rows[0]?.booking_status;
  return s === 'enquiry_review' ? 'enquiry' : s === 'payment_review' || s === 'awaiting_payment' ? 'payment' : null;
}

/** Shown to an approver who writes something that isn't a command. */
export const APPROVER_HELP = `Hi! 👋 This is ${B.name}'s booking assistant. I send you here:
• every new enquiry form: tap *Approve* to send the customer their artist and prices, or *Not available* to let them know;
• every advance payment screenshot: tap *Approve* to confirm the booking, or *Not received* to ask them to send it again.

You can also type *approve 105* or *reject 105* (with the booking number).`;
