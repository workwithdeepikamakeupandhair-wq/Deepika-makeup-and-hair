/**
 * Deepika's availability calendar: the dashboard marks days (Free / Few slots left / Fully booked), and the WhatsApp
 * assistant reads them before telling a customer whether a date is open. Days nobody has marked count as open.
 *
 * Dates are plain calendar dates (YYYY-MM-DD), so no time zone can shift them; "today" is today in Atlanta.
 */
import type { AvailabilityDay, AvailabilityStatus, CalendarLead } from '../src/data/availability.js';
import { BUSINESS_INFO as B } from '../src/data/portfolioData.js';
import { getDb, pool } from './db.js';

export const TIME_ZONE = 'America/New_York';

/** Today in Atlanta, e.g. { long: "Sunday, November 15, 2026", iso: "2026-11-15" }. */
export function todayInAtlanta() {
  const now = new Date();
  return {
    long: new Intl.DateTimeFormat('en-US', { timeZone: TIME_ZONE, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }).format(now),
    iso: new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now),
  };
}

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** True for a real calendar date written as YYYY-MM-DD (so 2027-02-30 is refused). */
export function isIsoDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(utc(value).getTime()) && utc(value).toISOString().slice(0, 10) === value;
}

export function addDays(iso: string, days: number): string {
  const d = utc(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Number of days from `from` to `to`, counting both ends. */
export const daysInRange = (from: string, to: string) => Math.round((utc(to).getTime() - utc(from).getTime()) / 86_400_000) + 1;

const weekday = (iso: string) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'long' }).format(utc(iso));

/** How the assistant sees a day. Unmarked days are open as far as the calendar shows. */
type AssistantStatus = 'free' | 'few_slots_left' | 'fully_booked' | 'not_marked';
const FOR_ASSISTANT: Record<AvailabilityStatus, AssistantStatus> = {
  available: 'free',
  limited: 'few_slots_left',
  booked: 'fully_booked',
};

export async function marksBetween(from: string, to: string): Promise<Map<string, AvailabilityStatus>> {
  const { rows } = await getDb().query<{ day: string; status: AvailabilityStatus }>(
    `SELECT to_char(day, 'YYYY-MM-DD') AS day, status FROM availability WHERE day BETWEEN $1 AND $2 ORDER BY day`,
    [from, to],
  );
  return new Map(rows.map((r) => [r.day, r.status]));
}

/** The calendar status of one day for the assistant, or null when the calendar can't be read. */
export async function assistantStatusOf(date: string): Promise<AssistantStatus | null> {
  if (!pool) return null;
  try {
    const status = (await marksBetween(date, date)).get(date);
    return status ? FOR_ASSISTANT[status] : 'not_marked';
  } catch (err) {
    console.error('[availability] could not read the calendar:', err instanceof Error ? err.message : err);
    return null;
  }
}

/** The longest range the assistant may check at once (about two months). */
const MAX_CHECK_DAYS = 62;
/** For a fully booked day, open days up to this far either side are suggested. */
const NEARBY_DAYS = 7;

/**
 * The `check_availability` tool: one day gives its status; a range lists every day as open, few slots left or fully
 * booked (open = marked Free or not marked). Past days are skipped.
 */
export async function checkAvailabilityForAssistant(startDate: string, endDate: string) {
  if (!pool) return { ok: false, error: `The calendar can't be read right now. Tell the customer ${B.artist} will confirm availability personally.` };
  if (!isIsoDate(startDate) || !isIsoDate(endDate)) return { ok: false, error: 'Both dates must be real dates written as YYYY-MM-DD.' };
  let [start, end] = startDate <= endDate ? [startDate, endDate] : [endDate, startDate];
  const today = todayInAtlanta().iso;
  if (end < today) return { ok: false, error: `Those dates are in the past (today is ${today}). Ask the customer for a future date.` };
  const skippedPast = start < today;
  if (skippedPast) start = today;
  if (daysInRange(start, end) > MAX_CHECK_DAYS) return { ok: false, error: `Check at most ${MAX_CHECK_DAYS} days at a time.` };

  if (start === end) {
    // One day. If it's fully booked, the open days nearest to it (a week either side) come along, closest first
    const from = addDays(start, -NEARBY_DAYS) < today ? today : addDays(start, -NEARBY_DAYS);
    const around = await marksBetween(from, addDays(start, NEARBY_DAYS));
    const status = around.get(start);
    const result = { ok: true, date: start, weekday: weekday(start), status: status ? FOR_ASSISTANT[status] : 'not_marked' };
    if (status !== 'booked') return result;
    const nearby: string[] = [];
    for (let distance = 1; distance <= NEARBY_DAYS; distance++) {
      for (const day of [addDays(start, -distance), addDays(start, distance)]) {
        const mark = around.get(day);
        if (day >= today && mark !== 'booked' && mark !== 'limited') nearby.push(`${day} (${weekday(day)})`);
      }
    }
    return { ...result, nearest_open_dates: nearby.slice(0, 4) };
  }

  const marks = await marksBetween(start, end);
  // Listed day by day (a model reads "open: [...]" far more reliably than "every other day is open")
  const open: string[] = [];
  const fewSlotsLeft: string[] = [];
  const fullyBooked: string[] = [];
  for (let day = start; day <= end; day = addDays(day, 1)) {
    const label = `${day} (${weekday(day)})`;
    const status = marks.get(day);
    (status === 'booked' ? fullyBooked : status === 'limited' ? fewSlotsLeft : open).push(label);
  }
  return {
    ok: true,
    from: start,
    to: end,
    open,
    few_slots_left: fewSlotsLeft,
    fully_booked: fullyBooked,
    ...(skippedPast ? { note: `Dates before today (${today}) were skipped.` } : {}),
  };
}

// ---------- Dashboard ----------

/** The marked days and the leads with an event date between `from` and `to`. */
export async function calendarBetween(from: string, to: string): Promise<{ days: AvailabilityDay[]; leads: CalendarLead[] }> {
  const db = getDb();
  const [days, leads] = await Promise.all([
    db.query<{ date: string; status: AvailabilityStatus; note: string | null; updated_at: Date; updated_by_name: string | null }>(
      `SELECT to_char(a.day, 'YYYY-MM-DD') AS date, a.status, a.note, a.updated_at, u.name AS updated_by_name
         FROM availability a LEFT JOIN admin_users u ON u.id = a.updated_by
        WHERE a.day BETWEEN $1 AND $2
        ORDER BY a.day`,
      [from, to],
    ),
    db.query<{ id: string; full_name: string; service: string; status: string; event_date: string }>(
      `SELECT id::text, full_name, service, status, to_char(event_date, 'YYYY-MM-DD') AS event_date
         FROM bookings
        WHERE event_date BETWEEN $1 AND $2 AND status <> 'lost'
        ORDER BY event_date, id
        LIMIT 500`,
      [from, to],
    ),
  ]);
  return {
    days: days.rows.map((r) => ({
      date: r.date,
      status: r.status,
      note: r.note,
      updatedAt: r.updated_at.toISOString(),
      updatedByName: r.updated_by_name,
    })),
    leads: leads.rows.map((r) => ({ id: r.id, fullName: r.full_name, service: r.service, stage: r.status, eventDate: r.event_date })),
  };
}

/**
 * Marks days with a status, or clears them (status null, which also removes their note). `note` undefined keeps each
 * day's existing note; null or text replaces it.
 */
export async function markDays(dates: string[], status: AvailabilityStatus | null, note: string | null | undefined, userId: string) {
  const db = getDb();
  if (status === null) {
    await db.query('DELETE FROM availability WHERE day = ANY($1::date[])', [dates]);
    return;
  }
  await db.query(
    `INSERT INTO availability (day, status, note, updated_by)
     SELECT d, $2, $3, $4 FROM unnest($1::date[]) AS d
     ON CONFLICT (day) DO UPDATE
       SET status = EXCLUDED.status,
           note = CASE WHEN $5 THEN EXCLUDED.note ELSE availability.note END,
           updated_by = EXCLUDED.updated_by,
           updated_at = now()`,
    [dates, status, note ?? null, userId, note !== undefined],
  );
}
