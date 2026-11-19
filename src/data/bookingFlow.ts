/**
 * The WhatsApp booking journey, shared by DMH API and the dashboard.
 *
 * Pooja (the WhatsApp assistant) checks the date and time on the calendar, sends the quotation, collects the details
 * and works out who does the makeup from the event's ZIP code (Deepika herself in the Atlanta area, one of her senior
 * artists outside it). She then asks for the 25% advance. The customer sends a payment screenshot, and the team
 * checks it and approves the booking in the dashboard, which sends the customer their confirmation.
 */

export const BOOKING_STATUSES = [
  { id: 'awaiting_payment', label: 'Waiting for advance' },
  { id: 'payment_review', label: 'Payment to verify' },
  { id: 'confirmed', label: 'Confirmed' },
] as const;

export type BookingStatus = (typeof BOOKING_STATUSES)[number]['id'];
export const BOOKING_STATUS_IDS: readonly string[] = BOOKING_STATUSES.map((s) => s.id);
export const bookingStatusLabel = (id: string | null) => BOOKING_STATUSES.find((s) => s.id === id)?.label ?? 'Collecting details';

export type Artist = 'deepika' | 'senior';
export const ARTIST_LABELS: Record<Artist, string> = { deepika: 'Deepika', senior: 'Senior artist' };

/** One line of a booking's quote, priced from the price lists. */
export interface QuoteItem {
  /** Package id, e.g. "airbrush_bridal" */
  package: string;
  /** e.g. "Airbrush Bridal Makeup (Senior Artist)" */
  title: string;
  quantity: number;
  unitPrice: number;
  perPerson: boolean;
}

export interface PaymentProof {
  id: string;
  contentType: string;
  createdAt: string;
}

/** Whether the booking's time is still free on the calendar, ignoring the booking itself. */
export interface SlotCheck {
  status: 'open' | 'taken' | 'fully_booked' | 'no_time';
  /** What else takes that time, e.g. "8:00 AM–10:00 AM · Priya (lead #12)" */
  conflicts: string[];
}

/** Everything the dashboard shows about one lead's WhatsApp booking (GET /api/admin/leads/:id/booking). */
export interface BookingDetails {
  status: BookingStatus | null;
  eventType: string | null;
  /** "08:00" */
  eventTime: string | null;
  eventZip: string | null;
  artist: Artist | null;
  /** A phone number other than their WhatsApp one, if they gave it */
  contactPhone: string | null;
  specialRequirements: string | null;
  items: QuoteItem[];
  total: number | null;
  advance: number | null;
  balance: number | null;
  advancePercent: number;
  paymentRequestedAt: string | null;
  paymentSubmittedAt: string | null;
  confirmedAt: string | null;
  confirmedByName: string | null;
  proofs: PaymentProof[];
  slot: SlotCheck;
  /** The customer's latest WhatsApp message. WhatsApp only delivers our messages within 24 hours of it. */
  lastCustomerMessageAt: string | null;
}

/** Settings the team changes in the dashboard (/admin/settings). */
export interface BookingSettings {
  /** Sent to the customer word for word with the advance request, e.g. "Zelle: +1 980-497-7720 (Deepika S)". */
  paymentDetails: string;
  /** How long one booking takes on the calendar, in hours. */
  appointmentHours: number;
  /** ZIP codes (or their first 3–4 digits) of the Atlanta service area, where Deepika does the makeup herself. */
  atlantaZipPrefixes: string[];
}

/**
 * Until the team saves its own settings. The ZIP prefixes are the US Postal Service's Atlanta-area mail centres
 * (300–303 metro Atlanta, 311 and 399 Atlanta's own business ZIP codes).
 */
export const DEFAULT_BOOKING_SETTINGS: BookingSettings = {
  paymentDetails: '',
  appointmentHours: 2,
  atlantaZipPrefixes: ['300', '301', '302', '303', '311', '399'],
};

/** A time the team marked as taken on one day. */
export interface TimeBlock {
  id: string;
  /** YYYY-MM-DD */
  date: string;
  /** "08:00" */
  start: string;
  end: string;
  note: string | null;
}

/** A WhatsApp booking with a time, shown on the calendar day it's for. */
export interface CalendarAppointment {
  leadId: string;
  fullName: string;
  service: string;
  /** YYYY-MM-DD */
  date: string;
  start: string;
  end: string;
  status: BookingStatus;
  artist: Artist | null;
}

/** "08:00" → "8:00 AM" */
export function timeLabel(hhmm: string | null): string {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

/** "$162.50", "$650" */
export const money = (usd: number) => `$${Number.isInteger(usd) ? usd : usd.toFixed(2)}`;
