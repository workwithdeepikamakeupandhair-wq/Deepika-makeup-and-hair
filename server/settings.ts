/**
 * Booking settings the team changes in the dashboard (/admin/settings): the payment details Pooja sends with the
 * advance request, the places of the Atlanta service area, how long a booking takes on the calendar, and the WhatsApp
 * numbers that approve enquiries and payments. Stored as one row in the `settings` table; until the team saves them,
 * the defaults apply.
 */
import { DEFAULT_BOOKING_SETTINGS, type BookingSettings } from '../src/data/bookingFlow.js';
import { getDb, pool } from './db.js';
import { HttpError } from './http.js';

const KEY = 'booking';
const MAX_PAYMENT_DETAILS = 600;
/** A place name: letters, spaces and a little punctuation ("Peachtree City", "St. Mary's"). */
const AREA_RE = /^[\p{L}][\p{L} .'’-]{1,59}$/u;
const MAX_AREAS = 300;

/** Keeps only valid values; anything missing or broken falls back to the default. */
function normalize(value: unknown): BookingSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof BookingSettings, unknown>>;
  const hours = Number(v.appointmentHours);
  // Settings saved before 2026-11-24 have ZIP codes instead of places: those get the default places
  const areas = Array.isArray(v.atlantaAreas) ? v.atlantaAreas.filter((p): p is string => typeof p === 'string' && AREA_RE.test(p.trim())).map((p) => p.trim()) : [];
  const approvers = Array.isArray(v.approverWhatsapp) ? v.approverWhatsapp.filter((p): p is string => typeof p === 'string' && PHONE_RE.test(p)) : [];
  return {
    paymentDetails: typeof v.paymentDetails === 'string' ? v.paymentDetails.trim().slice(0, MAX_PAYMENT_DETAILS) : DEFAULT_BOOKING_SETTINGS.paymentDetails,
    appointmentHours: Number.isFinite(hours) && hours >= 0.5 && hours <= 12 ? hours : DEFAULT_BOOKING_SETTINGS.appointmentHours,
    atlantaAreas: areas.length ? areas : DEFAULT_BOOKING_SETTINGS.atlantaAreas,
    approverWhatsapp: approvers,
  };
}

/** An international phone number as WhatsApp uses it: "+" and 8–15 digits. */
const PHONE_RE = /^\+\d{8,15}$/;

/** "+91 70229 08519", "917022908519" → "+917022908519"; null if it isn't an international number. */
export function e164(value: string): string | null {
  const digits = value.replace(/[^\d+]/g, '').replace(/^00/, '+');
  const withPlus = digits.startsWith('+') ? digits : `+${digits}`;
  return PHONE_RE.test(withPlus) ? withPlus : null;
}

export async function getBookingSettings(): Promise<BookingSettings> {
  if (!pool) return DEFAULT_BOOKING_SETTINGS;
  const { rows } = await pool.query<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', [KEY]);
  return normalize(rows[0]?.value);
}

/** Checks a settings form from the dashboard; throws a message for the team if something is off. */
export function parseBookingSettings(body: unknown): BookingSettings {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (typeof b.paymentDetails !== 'string') throw new HttpError(400, 'Payment details must be text.');
  const paymentDetails = b.paymentDetails.trim();
  if (paymentDetails.length > MAX_PAYMENT_DETAILS) throw new HttpError(400, `Payment details can be at most ${MAX_PAYMENT_DETAILS} characters.`);

  const hours = Number(b.appointmentHours);
  if (!Number.isFinite(hours) || hours < 0.5 || hours > 12 || (hours * 2) % 1 !== 0) {
    throw new HttpError(400, 'Booking length must be between 0.5 and 12 hours, in half hours.');
  }

  const raw = Array.isArray(b.atlantaAreas) ? b.atlantaAreas.map(String) : typeof b.atlantaAreas === 'string' ? b.atlantaAreas.split(/[,;\n]+/) : null;
  if (!raw) throw new HttpError(400, 'List the places of the Atlanta service area.');
  const areas: string[] = [];
  for (const place of raw.map((p) => p.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
    if (!areas.some((a) => a.toLowerCase() === place.toLowerCase())) areas.push(place);
  }
  const bad = areas.filter((p) => !AREA_RE.test(p));
  if (bad.length) throw new HttpError(400, `These don't look like place names (letters and spaces, up to 60 characters): ${bad.slice(0, 5).join(', ')}`);
  if (!areas.length) throw new HttpError(400, 'List at least one place, e.g. Atlanta.');
  if (areas.length > MAX_AREAS) throw new HttpError(400, `List at most ${MAX_AREAS} places.`);

  // Optional: who approves payments on WhatsApp
  const rawApprovers = Array.isArray(b.approverWhatsapp) ? b.approverWhatsapp.map(String) : typeof b.approverWhatsapp === 'string' ? b.approverWhatsapp.split(/[,;\n]+/) : [];
  const approverWhatsapp: string[] = [];
  for (const raw of rawApprovers.map((r) => r.trim()).filter(Boolean)) {
    const number = e164(raw);
    if (!number) throw new HttpError(400, `"${raw.slice(0, 30)}" isn't a full international WhatsApp number (with the country code, e.g. +91 70229 08519).`);
    if (!approverWhatsapp.includes(number)) approverWhatsapp.push(number);
  }
  if (approverWhatsapp.length > 5) throw new HttpError(400, 'List at most 5 approval numbers.');

  return { paymentDetails, appointmentHours: hours, atlantaAreas: areas, approverWhatsapp };
}

/** A setting other than the booking settings, e.g. the WhatsApp template IDs. */
export async function getSetting<T extends object>(key: string): Promise<Partial<T>> {
  if (!pool) return {};
  const { rows } = await pool.query<{ value: unknown }>('SELECT value FROM settings WHERE key = $1', [key]);
  return (rows[0]?.value && typeof rows[0].value === 'object' ? rows[0].value : {}) as Partial<T>;
}

export async function saveBookingSettings(settings: BookingSettings, userId: string) {
  await getDb().query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [KEY, JSON.stringify(settings), userId],
  );
}
