/**
 * Deepika's availability calendar: the dashboard marks days (Free / Few slots left / Fully booked), and the chat
 * assistants (WhatsApp and the website) read them before telling a customer whether a date is open. Days nobody has
 * marked count as open.
 *
 * Times of day: a requested time is free unless the day is fully booked, the team marked that time as taken
 * (`calendar_blocks`), or one of Deepika's WhatsApp bookings already holds it (each booking takes the length set in
 * the dashboard's Settings). Senior artists' bookings don't take Deepika's time.
 *
 * Dates are plain calendar dates (YYYY-MM-DD), so no time zone can shift them; "today" is today in Atlanta. Times are
 * Atlanta clock times ("08:00").
 */
import type { PoolClient } from 'pg';
import type { AvailabilityDay, AvailabilityStatus, CalendarLead } from '../src/data/availability.js';
import { timeLabel, type Artist, type BookingStatus, type CalendarAppointment, type TimeBlock } from '../src/data/bookingFlow.js';
import { BUSINESS_INFO as B } from '../src/data/portfolioData.js';
import { getDb, pool } from './db.js';
import type { ChatTool } from './llm.js';
import { getBookingSettings } from './settings.js';

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
/** "2026-12-15" → "Tuesday" */
export const weekdayOf = weekday;

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
 * The `check_availability` tool: one day gives its status and the times a booking can still start; a range lists every
 * day as open, few slots left or fully booked (open = marked Free or not marked). Past days are skipped. `except`
 * leaves out the customer's own booking.
 */
export async function checkAvailabilityForAssistant(startDate: string, endDate: string, except: { phone?: string } = {}) {
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
    if (status !== 'booked') {
      // The hours still free that day, so a customer asking "which times are free?" gets a real answer
      const check = await checkTime(start, '12:00', except);
      const free = freeStartTimes(check.free);
      return {
        ...result,
        free_start_times: free,
        note: free.length
          ? 'A booking can start at any whole hour in free_start_times. Ask the customer what time they want, then check that time.'
          : 'Every time that day is already taken: say so kindly and offer to check another date.',
      };
    }
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

// ---------- Times of day ----------

/** "8:00", "08:00" or "08:00:00" → minutes after midnight, or null. */
export function toMinutes(time: string): number | null {
  const m = time.trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return null;
  const [h, min] = [Number(m[1]), Number(m[2])];
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/** Minutes after midnight → "08:00". */
export const fromMinutes = (minutes: number) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

/**
 * A booking whose customer was asked for the advance keeps its time this long (unless they send the screenshot,
 * which keeps it until the team decides), so two customers can't pay for the same time.
 */
export const PAYMENT_HOLD_HOURS = 24;

/** Deepika's WhatsApp bookings that take their time on the calendar (a senior artist's don't). */
const HOLDS_TIME = `b.event_time IS NOT NULL AND b.status <> 'lost' AND (b.artist IS NULL OR b.artist = 'deepika')
  AND (b.booking_status IN ('confirmed', 'payment_review')
       OR (b.booking_status = 'awaiting_payment' AND b.payment_requested_at > now() - interval '${PAYMENT_HOLD_HOURS} hours'))`;

interface Busy {
  start: number;
  end: number;
  /** For the dashboard, e.g. "8:00 AM–10:00 AM · Priya Sharma (lead #12)" */
  label: string;
}

/** The times already taken on a day: the team's blocks and Deepika's bookings (each `lengthMinutes` long). */
async function busyTimes(date: string, lengthMinutes: number, except: { phone?: string; bookingId?: string } = {}): Promise<Busy[]> {
  const db = getDb();
  const [blocks, bookings] = await Promise.all([
    db.query<{ start: string; end: string; note: string | null }>(
      `SELECT to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS "end", note FROM calendar_blocks WHERE day = $1`,
      [date],
    ),
    db.query<{ id: string; full_name: string; start: string }>(
      `SELECT b.id::text, b.full_name, to_char(b.event_time, 'HH24:MI') AS start FROM bookings b
        WHERE b.event_date = $1 AND ${HOLDS_TIME}
          AND ($2::text IS NULL OR b.phone <> $2) AND ($3::bigint IS NULL OR b.id <> $3)`,
      [date, except.phone ?? null, except.bookingId ?? null],
    ),
  ]);
  const span = (start: number, end: number) => `${timeLabel(fromMinutes(start))}–${timeLabel(fromMinutes(end))}`;
  return [
    ...blocks.rows.map((r) => {
      const [start, end] = [toMinutes(r.start)!, toMinutes(r.end)!];
      return { start, end, label: `${span(start, end)} · blocked${r.note ? `: ${r.note}` : ''}` };
    }),
    ...bookings.rows.map((r) => {
      const start = toMinutes(r.start)!;
      return { start, end: start + lengthMinutes, label: `${span(start, start + lengthMinutes)} · ${r.full_name} (lead #${r.id})` };
    }),
  ];
}

/** Start times the assistant suggests (and the dashboard's hour buttons show): whole hours from 4 AM to 9 PM. */
export const DAY_FROM_HOUR = 4;
export const DAY_UNTIL_HOUR = 21;
const SUGGEST_FROM = DAY_FROM_HOUR * 60;
const SUGGEST_UNTIL = DAY_UNTIL_HOUR * 60;

/** The whole hours a booking can still start at, as ranges: ["5:00 AM–7:00 AM", "11:00 AM–9:00 PM"]. */
function freeStartTimes(free: (t: number) => boolean): string[] {
  const ranges: string[] = [];
  let first: number | null = null;
  for (let t = SUGGEST_FROM; t <= SUGGEST_UNTIL + 60; t += 60) {
    if (t <= SUGGEST_UNTIL && free(t)) {
      first ??= t;
    } else if (first !== null) {
      const last = t - 60;
      ranges.push(first === last ? timeLabel(fromMinutes(first)) : `${timeLabel(fromMinutes(first))}–${timeLabel(fromMinutes(last))}`);
      first = null;
    }
  }
  return ranges;
}

/**
 * Whether `time` on `date` is free for a booking: the day isn't fully booked and nothing else takes any part of the
 * booking's length from then. `except` leaves out the customer's own booking (so it never clashes with itself).
 */
export async function checkTime(date: string, time: string, except: { phone?: string; bookingId?: string } = {}) {
  const settings = await getBookingSettings();
  const length = Math.round(settings.appointmentHours * 60);
  const start = toMinutes(time)!;
  const [marks, busy] = await Promise.all([marksBetween(date, date), busyTimes(date, length, except)]);
  const dayStatus = marks.get(date);
  const clashes = (t: number) => busy.filter((b) => t < b.end && b.start < t + length);
  const free = (t: number) => dayStatus !== 'booked' && !clashes(t).length;
  return { dayStatus: dayStatus ? FOR_ASSISTANT[dayStatus] : ('not_marked' as AssistantStatus), free, conflicts: clashes(start).map((b) => b.label), open: free(start), start };
}

/** check_availability with a time: is that time free, and if not, which nearby times are (all checked here). */
export async function checkTimeForAssistant(date: string, time: string, except: { phone?: string } = {}) {
  if (!pool) return { ok: false, error: `The calendar can't be read right now. Tell the customer ${B.artist} will confirm availability personally.` };
  if (!isIsoDate(date)) return { ok: false, error: 'The date must be a real date written as YYYY-MM-DD.' };
  const minutes = toMinutes(time);
  if (minutes === null) return { ok: false, error: 'The time must be written as HH:MM (24-hour clock), e.g. "08:00" or "14:30".' };
  const today = todayInAtlanta().iso;
  if (date < today) return { ok: false, error: `That date is in the past (today is ${today}). Ask the customer for a future date.` };

  const check = await checkTime(date, fromMinutes(minutes), except);
  const base = { ok: true, date, weekday: weekday(date), requested_time: timeLabel(fromMinutes(minutes)), day_status: check.dayStatus };
  if (check.dayStatus === 'fully_booked') {
    const day = await checkAvailabilityForAssistant(date, date);
    return { ...base, time_status: 'fully_booked', nearest_open_dates: 'nearest_open_dates' in day ? day.nearest_open_dates : [] };
  }
  if (check.open) return { ...base, time_status: 'open' };

  const inWindow = (t: number) => t >= SUGGEST_FROM && t <= SUGGEST_UNTIL;
  const option = (t: number) => (inWindow(t) ? { time: timeLabel(fromMinutes(t)), status: check.free(t) ? 'open' : 'booked' } : null);
  // The nearest other free times that day, closest first (searching the whole day if the hours around are busy)
  const others: string[] = [];
  for (let hours = 2; hours <= DAY_UNTIL_HOUR - DAY_FROM_HOUR && others.length < 4; hours++) {
    for (const t of [minutes - hours * 60, minutes + hours * 60]) if (inWindow(t) && check.free(t) && others.length < 4) others.push(timeLabel(fromMinutes(t)));
  }
  return {
    ...base,
    time_status: 'booked',
    one_hour_earlier: option(minutes - 60),
    one_hour_later: option(minutes + 60),
    nearest_free_times: others,
    free_start_times: freeStartTimes(check.free),
    note: 'Offer only times listed here as open or free: one hour earlier or later first, then the nearest free times. If none is free, offer to check another date.',
  };
}

/** Lower case, letters and digits only: "March 12th, 2027!" → "march 12th 2027". */
export const plain = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

/** Words that say when: a number, a month or weekday, "today", "next week"… (also Hindi aaj/kal/parso, Telugu repu/ivala/eeroju). */
const SAYS_WHEN =
  /\d|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\b|\b(mon|tues?|wed(nes)?|thu(rs)?|fri|sat(ur)?|sun)(day)?s?\b|\b(today|tonight|tomorrow|tmrw|weekend|week|month|year|next|this|coming|aaj|kal|parso|repu|ivala|eeroju)\b/;

/**
 * The check_availability tool for the chat assistants. `log` starts the log line, e.g. "[whatsapp] …1234".
 * `customerPhone` (WhatsApp) keeps the customer's own booking from counting against the time they asked for.
 * `customerSaid` is everything the customer wrote in the chat: the model must quote the words they used for the date,
 * so it can't check a date nobody gave (left alone, it sometimes "helpfully" checks today).
 */
export function checkAvailabilityTool(log: string, customerPhone?: string, customerSaid?: string): ChatTool {
  const text = (value: unknown, max: number) => (typeof value === 'string' ? value.trim().slice(0, max) : '');
  /** Words, with "19th" counted as "19". */
  const wordsOf = (s: string) => plain(s).split(' ').filter(Boolean).map((w) => w.replace(/^(\d+)(st|nd|rd|th)$/, '$1'));
  const said = customerSaid === undefined ? null : new Set(wordsOf(customerSaid));
  return {
    definition: {
      type: 'function',
      function: {
        name: 'check_availability',
        description: `Look up ${B.artist}'s availability calendar for one date (optionally at a time of day) or a range of dates (at most ${MAX_CHECK_DAYS} days). Use it every time the customer mentions an event date or a time, asks whether ${B.artist} is free, or wants other dates or times.`,
        strict: true,
        parameters: {
          type: 'object',
          additionalProperties: false,
          required: ['customer_words', 'start_date', 'end_date', 'time'],
          properties: {
            customer_words: {
              type: 'string',
              description: 'The words the customer used for this date (and time), taken from their messages, e.g. "March 12" or "next Saturday 8 am". Only check dates the customer gave.',
            },
            start_date: { type: 'string', description: 'First date to check, as YYYY-MM-DD.' },
            end_date: { type: 'string', description: 'Last date to check, as YYYY-MM-DD. The same as start_date to check a single day.' },
            time: {
              type: 'string',
              description:
                'For a single day: when the customer wants their makeup to start, as HH:MM on the 24-hour clock (8 AM = "08:00", 2:30 PM = "14:30"). Empty string if they haven\'t said a time, or for a range.',
            },
          },
        },
      },
    },
    run: async (args) => {
      const [start, end, time] = [text(args.start_date, 10), text(args.end_date, 10), text(args.time, 8)];
      // Every word quoted must come from the customer (from any of their messages), and together say when
      const quoted = wordsOf(text(args.customer_words, 200));
      if (said !== null && (!quoted.length || !SAYS_WHEN.test(quoted.join(' ')) || quoted.some((w) => !said.has(w)))) {
        console.log(`${log}: calendar check refused (the customer didn't give that date)`);
        return {
          ok: false,
          error: `customer_words must use only the customer's own words for the date (from any of their messages, e.g. "19 march 2027" and "10 am"). If they did give the date, call again with their words. If they haven't told you a date, don't check one (not even today's): ask them for it.`,
        };
      }
      console.log(`${log}: checked the calendar for ${start}${end !== start ? ` to ${end}` : ''}${time ? ` at ${time}` : ''}`);
      if (time && (!end || end === start)) return checkTimeForAssistant(start, time, { phone: customerPhone });
      return checkAvailabilityForAssistant(start, end || start, { phone: customerPhone });
    },
  };
}

/** Runs `work` in one database transaction. */
async function inTransaction<T>(work: (db: PoolClient) => Promise<T>): Promise<T> {
  const client = await getDb().connect();
  try {
    await client.query('BEGIN');
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

const BLOCK_RETURNING = `id::text, to_char(day, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS "end", note`;

/**
 * The team marks a time as taken on one day. Blocks with the same note that overlap or touch it become one block
 * (tapping 8, 9 and 10 AM gives one 8–11 AM block).
 */
export async function addTimeBlock(date: string, start: string, end: string, note: string | null, userId: string): Promise<TimeBlock> {
  return inTransaction(async (db) => {
    const { rows: joined } = await db.query<TimeBlock>(
      `DELETE FROM calendar_blocks WHERE day = $1 AND start_time <= $3 AND end_time >= $2 AND coalesce(note, '') = coalesce($4, '')
       RETURNING ${BLOCK_RETURNING}`,
      [date, start, end, note],
    );
    const from = [start, ...joined.map((b) => b.start)].sort()[0];
    const to = [end, ...joined.map((b) => b.end)].sort().at(-1)!;
    const { rows } = await db.query<TimeBlock>(
      `INSERT INTO calendar_blocks (day, start_time, end_time, note, created_by) VALUES ($1, $2, $3, $4, $5) RETURNING ${BLOCK_RETURNING}`,
      [date, from, to, note, userId],
    );
    return rows[0];
  });
}

/** Frees a time on one day: blocks inside it go, blocks that stick out are cut back (one may split in two). */
export async function freeTimeRange(date: string, start: string, end: string, userId: string): Promise<number> {
  return inTransaction(async (db) => {
    const { rows } = await db.query<TimeBlock>(
      `DELETE FROM calendar_blocks WHERE day = $1 AND start_time < $3 AND end_time > $2 RETURNING ${BLOCK_RETURNING}`,
      [date, start, end],
    );
    for (const b of rows) {
      const keep = [b.start < start && [b.start, start], b.end > end && [end, b.end]].filter((x): x is string[] => Boolean(x));
      for (const [s, e] of keep) {
        await db.query(`INSERT INTO calendar_blocks (day, start_time, end_time, note, created_by) VALUES ($1, $2, $3, $4, $5)`, [date, s, e, b.note, userId]);
      }
    }
    return rows.length;
  });
}

export async function removeTimeBlock(id: string): Promise<boolean> {
  const { rowCount } = await getDb().query('DELETE FROM calendar_blocks WHERE id = $1', [id]);
  return Boolean(rowCount);
}

// ---------- Dashboard ----------

/** The marked days, the leads with an event date, the blocked times and the timed bookings between `from` and `to`. */
export async function calendarBetween(
  from: string,
  to: string,
): Promise<{ days: AvailabilityDay[]; leads: CalendarLead[]; blocks: TimeBlock[]; appointments: CalendarAppointment[]; appointmentHours: number }> {
  const db = getDb();
  const [days, leads, blocks, appointments, settings] = await Promise.all([
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
    db.query<TimeBlock>(
      `SELECT id::text, to_char(day, 'YYYY-MM-DD') AS date, to_char(start_time, 'HH24:MI') AS start, to_char(end_time, 'HH24:MI') AS "end", note
         FROM calendar_blocks WHERE day BETWEEN $1 AND $2 ORDER BY day, start_time`,
      [from, to],
    ),
    db.query<{ id: string; full_name: string; service: string; date: string; start: string; booking_status: BookingStatus; artist: Artist | null }>(
      `SELECT id::text, full_name, service, to_char(event_date, 'YYYY-MM-DD') AS date, to_char(event_time, 'HH24:MI') AS start, booking_status, artist
         FROM bookings
        WHERE event_date BETWEEN $1 AND $2 AND event_time IS NOT NULL AND booking_status IS NOT NULL AND status <> 'lost'
        ORDER BY event_date, event_time
        LIMIT 500`,
      [from, to],
    ),
    getBookingSettings(),
  ]);
  const length = Math.round(settings.appointmentHours * 60);
  return {
    blocks: blocks.rows,
    appointments: appointments.rows.map((r) => ({
      leadId: r.id,
      fullName: r.full_name,
      service: r.service,
      date: r.date,
      start: r.start,
      end: fromMinutes(Math.min(toMinutes(r.start)! + length, 24 * 60 - 1)),
      status: r.booking_status,
      artist: r.artist,
    })),
    appointmentHours: settings.appointmentHours,
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
