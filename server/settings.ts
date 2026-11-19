/**
 * Booking settings the team changes in the dashboard (/admin/settings): the payment details Pooja sends with the
 * advance request, the ZIP codes of the Atlanta service area, and how long a booking takes on the calendar.
 * Stored as one row in the `settings` table; until the team saves them, the defaults apply.
 */
import { DEFAULT_BOOKING_SETTINGS, type BookingSettings } from '../src/data/bookingFlow.js';
import { getDb, pool } from './db.js';
import { HttpError } from './http.js';

const KEY = 'booking';
const MAX_PAYMENT_DETAILS = 600;

/** Keeps only valid values; anything missing or broken falls back to the default. */
function normalize(value: unknown): BookingSettings {
  const v = (value && typeof value === 'object' ? value : {}) as Partial<Record<keyof BookingSettings, unknown>>;
  const hours = Number(v.appointmentHours);
  const prefixes = Array.isArray(v.atlantaZipPrefixes) ? v.atlantaZipPrefixes.filter((p): p is string => typeof p === 'string' && /^\d{3,5}$/.test(p)) : [];
  return {
    paymentDetails: typeof v.paymentDetails === 'string' ? v.paymentDetails.trim().slice(0, MAX_PAYMENT_DETAILS) : DEFAULT_BOOKING_SETTINGS.paymentDetails,
    appointmentHours: Number.isFinite(hours) && hours >= 0.5 && hours <= 12 ? hours : DEFAULT_BOOKING_SETTINGS.appointmentHours,
    atlantaZipPrefixes: prefixes.length ? prefixes : DEFAULT_BOOKING_SETTINGS.atlantaZipPrefixes,
  };
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

  const raw = Array.isArray(b.atlantaZipPrefixes) ? b.atlantaZipPrefixes : typeof b.atlantaZipPrefixes === 'string' ? b.atlantaZipPrefixes.split(/[\s,;]+/) : null;
  if (!raw) throw new HttpError(400, 'List the Atlanta ZIP codes.');
  const prefixes = [...new Set(raw.map((p) => String(p).trim()).filter(Boolean))];
  const bad = prefixes.filter((p) => !/^\d{3,5}$/.test(p));
  if (bad.length) throw new HttpError(400, `These aren't ZIP codes or ZIP beginnings (3–5 digits): ${bad.slice(0, 5).join(', ')}`);
  if (!prefixes.length) throw new HttpError(400, 'List at least one Atlanta ZIP code.');
  if (prefixes.length > 300) throw new HttpError(400, 'List at most 300 ZIP codes.');

  return { paymentDetails, appointmentHours: hours, atlantaZipPrefixes: prefixes };
}

export async function saveBookingSettings(settings: BookingSettings, userId: string) {
  await getDb().query(
    `INSERT INTO settings (key, value, updated_by) VALUES ($1, $2, $3)
     ON CONFLICT (key) DO UPDATE SET value = excluded.value, updated_by = excluded.updated_by, updated_at = now()`,
    [KEY, JSON.stringify(settings), userId],
  );
}

/** A US ZIP code ("30005" or "30005-1234") → its 5 digits, or null. */
export function usZip(value: string): string | null {
  const m = value.trim().match(/^(\d{5})(?:-\d{4})?$/);
  return m ? m[1] : null;
}

/** True when a ZIP code is in the Atlanta service area (Deepika herself); false for anywhere else, incl. outside the US. */
export function inAtlantaArea(zip: string, settings: BookingSettings): boolean {
  const five = usZip(zip);
  return Boolean(five && settings.atlantaZipPrefixes.some((p) => five.startsWith(p)));
}
