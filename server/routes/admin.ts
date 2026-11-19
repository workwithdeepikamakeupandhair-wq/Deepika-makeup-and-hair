/**
 * Leads dashboard API (/api/admin). Everything except login needs the session cookie.
 */
import { Router } from 'express';
import { AVAILABILITY_STATUS_IDS, MAX_DAYS_PER_CHANGE, type AvailabilityStatus } from '../../src/data/availability.js';
import { BOOKING_STATUS_IDS } from '../../src/data/bookingFlow.js';
import { LEAD_SOURCES, LEAD_STAGE_IDS } from '../../src/data/leads.js';
import { DUMMY_HASH, endSession, requireAdmin, sessionUser, startSession, verifyPassword } from '../auth.js';
import { addTimeBlock, calendarBetween, daysInRange, isIsoDate, markDays, removeTimeBlock, toMinutes, fromMinutes } from '../availability.js';
import { getDb } from '../db.js';
import { asyncHandler, cleanString, HttpError, rateLimit } from '../http.js';
import { LEAD_COLUMNS, LEAD_FROM, toLead, type LeadRow } from '../leads.js';
import { getBookingSettings, parseBookingSettings, saveBookingSettings } from '../settings.js';
import { sendToCustomer } from '../whatsappBot.js';
import { approveBooking, BookingActionError, bookingDetails, paymentProof, reopenPayment } from '../whatsappBooking.js';
import { paymentNotVerifiedMessage } from '../whatsappQuotes.js';

export const adminRouter = Router();

const PAGE_SIZE = 50;

adminRouter.post(
  '/login',
  rateLimit({ windowMs: 15 * 60_000, max: 10 }),
  asyncHandler(async (req, res) => {
    const email = cleanString(req.body?.email, 'Email', 200)?.toLowerCase();
    const password = typeof req.body?.password === 'string' ? req.body.password : '';
    if (!email || !password) throw new HttpError(400, 'Please enter your email and password.');

    const { rows } = await getDb().query<{ id: string; name: string; email: string; password_hash: string }>(
      'SELECT id::text, name, email, password_hash FROM admin_users WHERE email = $1',
      [email],
    );
    const ok = await verifyPassword(password.slice(0, 200), rows[0]?.password_hash ?? DUMMY_HASH);
    if (!rows[0] || !ok) {
      console.warn('[admin] failed login attempt');
      throw new HttpError(401, 'Wrong email or password.');
    }
    startSession(res, req, rows[0].id);
    console.log(`[admin] ${rows[0].name} logged in`);
    res.json({ user: { id: rows[0].id, name: rows[0].name, email: rows[0].email } });
  }),
);

adminRouter.post('/logout', (req, res) => {
  endSession(res, req);
  res.json({ ok: true });
});

adminRouter.get(
  '/me',
  asyncHandler(async (req, res) => {
    const user = await sessionUser(req);
    if (!user) throw new HttpError(401, 'Please log in.');
    res.json({ user });
  }),
);

// ---------- Everything below needs a login ----------
adminRouter.use(requireAdmin);

adminRouter.get(
  '/users',
  asyncHandler(async (_req, res) => {
    const { rows } = await getDb().query('SELECT id::text, name, email FROM admin_users ORDER BY name');
    res.json({ users: rows });
  }),
);

/** WhatsApp bookings whose payment screenshot the team still has to check. */
async function paymentsToVerify(): Promise<number> {
  const { rows } = await getDb().query<{ n: number }>(`SELECT count(*)::int AS n FROM bookings WHERE booking_status = 'payment_review' AND status <> 'lost'`);
  return rows[0].n;
}

/** GET /api/admin/summary → what needs the team's attention (polled by the header's badge). */
adminRouter.get(
  '/summary',
  asyncHandler(async (_req, res) => {
    res.json({ paymentsToVerify: await paymentsToVerify() });
  }),
);

/** GET /api/admin/leads?stage=new&source=instagram_ad&booking=payment_review&q=priya&offset=0 */
adminRouter.get(
  '/leads',
  asyncHandler(async (req, res) => {
    const stage = typeof req.query.stage === 'string' && LEAD_STAGE_IDS.includes(req.query.stage) ? req.query.stage : null;
    const source = typeof req.query.source === 'string' && req.query.source in LEAD_SOURCES ? req.query.source : null;
    const booking = typeof req.query.booking === 'string' && BOOKING_STATUS_IDS.includes(req.query.booking) ? req.query.booking : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const search = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const offset = Math.max(0, Math.min(100_000, Number(req.query.offset) || 0));

    // Filters shared by the list and the per-stage counts (the counts ignore the stage filter)
    const where = `($1::text IS NULL OR b.source = $1)
      AND ($2::text IS NULL OR b.full_name ILIKE $2 OR b.phone ILIKE $2 OR b.email ILIKE $2
           OR b.campaign ILIKE $2 OR b.service ILIKE $2 OR b.event_location ILIKE $2)`;
    const db = getDb();
    const [list, counts, toVerify] = await Promise.all([
      db.query<LeadRow>(
        `SELECT ${LEAD_COLUMNS} FROM ${LEAD_FROM}
          WHERE ${where} AND ($3::text IS NULL OR b.status = $3) AND ($5::text IS NULL OR (b.booking_status = $5 AND b.status <> 'lost'))
          ORDER BY ${booking === 'payment_review' ? 'b.payment_submitted_at ASC NULLS LAST,' : ''} b.created_at DESC, b.id DESC
          LIMIT ${PAGE_SIZE + 1} OFFSET $4`,
        [source, search, stage, offset, booking],
      ),
      db.query<{ status: string; n: number }>(
        `SELECT b.status, count(*)::int AS n FROM bookings b WHERE ${where} GROUP BY b.status`,
        [source, search],
      ),
      paymentsToVerify(),
    ]);
    res.json({
      leads: list.rows.slice(0, PAGE_SIZE).map(toLead),
      hasMore: list.rows.length > PAGE_SIZE,
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
      paymentsToVerify: toVerify,
    });
  }),
);

const leadId = (id: string) => {
  if (!/^\d+$/.test(id)) throw new HttpError(400, 'Invalid lead.');
  return id;
};

async function leadById(id: string) {
  const { rows } = await getDb().query<LeadRow>(`SELECT ${LEAD_COLUMNS} FROM ${LEAD_FROM} WHERE b.id = $1`, [id]);
  return rows[0] ? toLead(rows[0]) : null;
}

/** GET /api/admin/leads/:id/booking → the lead's WhatsApp booking: quote, artist, payment screenshots, calendar check. */
adminRouter.get(
  '/leads/:id/booking',
  asyncHandler(async (req, res) => {
    const booking = await bookingDetails(leadId(req.params.id));
    if (!booking) throw new HttpError(404, 'Lead not found.');
    res.json({ booking });
  }),
);

/**
 * Sends the customer a message from the dashboard over WhatsApp (and keeps it in the chat, so Pooja knows). WhatsApp
 * only delivers it within 24 hours of the customer's last message; the dashboard warns about that.
 */
async function messageCustomer(waId: string | null, message: string): Promise<{ sent: boolean; error?: string }> {
  if (!waId) return { sent: false, error: 'This lead has no WhatsApp chat with the assistant.' };
  try {
    await sendToCustomer(waId, message);
    return { sent: true };
  } catch (err) {
    console.error(`[admin] could not message …${waId.slice(-4)} on WhatsApp:`, err instanceof Error ? err.message : err);
    return { sent: false, error: err instanceof Error ? err.message : 'Sending failed.' };
  }
}

/** POST /api/admin/leads/:id/approve → the booking is confirmed and the customer gets the confirmation on WhatsApp. */
adminRouter.post(
  '/leads/:id/approve',
  asyncHandler(async (req, res) => {
    const id = leadId(req.params.id);
    let result;
    try {
      result = await approveBooking(id, req.adminUser!.id);
    } catch (err) {
      if (err instanceof BookingActionError) throw new HttpError(409, err.message);
      throw err;
    }
    console.log(`[admin] ${req.adminUser!.name} approved booking #${id}`);
    const message = await messageCustomer(result.waId, result.message);
    res.json({ lead: await leadById(id), booking: await bookingDetails(id), message });
  }),
);

/** POST /api/admin/leads/:id/reopen-payment → the payment couldn't be verified: the customer is asked to send it again. */
adminRouter.post(
  '/leads/:id/reopen-payment',
  asyncHandler(async (req, res) => {
    const id = leadId(req.params.id);
    let result;
    try {
      result = await reopenPayment(id);
    } catch (err) {
      if (err instanceof BookingActionError) throw new HttpError(409, err.message);
      throw err;
    }
    console.log(`[admin] ${req.adminUser!.name} could not verify the payment for booking #${id}; customer asked again`);
    const message = await messageCustomer(result.waId, paymentNotVerifiedMessage(result.advance));
    res.json({ lead: await leadById(id), booking: await bookingDetails(id), message });
  }),
);

/** GET /api/admin/payment-proofs/:id → the screenshot (or PDF) the customer sent. */
adminRouter.get(
  '/payment-proofs/:id',
  asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) throw new HttpError(400, 'Invalid file.');
    const proof = await paymentProof(req.params.id);
    if (!proof) throw new HttpError(404, 'File not found.');
    // Customer uploads: pictures are shown, anything else (PDF receipts) is downloaded, never opened as a page
    const image = /^image\/(jpeg|png|webp|gif)$/i.test(proof.contentType);
    const ext = proof.contentType === 'application/pdf' ? 'pdf' : image ? proof.contentType.split('/')[1].toLowerCase() : 'bin';
    res.set({
      'Content-Type': image || ext === 'pdf' ? proof.contentType : 'application/octet-stream',
      'Content-Disposition': `${image ? 'inline' : 'attachment'}; filename="payment-${req.params.id}.${ext}"`,
      'Cache-Control': 'private, max-age=3600',
      'X-Content-Type-Options': 'nosniff',
      ...(image ? { 'Content-Security-Policy': "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'" } : {}),
    });
    res.send(proof.data);
  }),
);

// ---------- Settings (payment details, Atlanta area, booking length) ----------

adminRouter.get(
  '/settings',
  asyncHandler(async (_req, res) => {
    res.json({ settings: await getBookingSettings() });
  }),
);

adminRouter.put(
  '/settings',
  asyncHandler(async (req, res) => {
    const settings = parseBookingSettings(req.body);
    await saveBookingSettings(settings, req.adminUser!.id);
    console.log(`[admin] ${req.adminUser!.name} updated the booking settings`);
    res.json({ settings });
  }),
);

/** PATCH /api/admin/leads/:id { stage?, assignedTo?, adminNotes? } */
adminRouter.patch(
  '/leads/:id',
  asyncHandler(async (req, res) => {
    const id = req.params.id;
    if (!/^\d+$/.test(id)) throw new HttpError(400, 'Invalid lead.');
    const body = req.body ?? {};
    const sets: string[] = [];
    const values: unknown[] = [];

    if (body.stage !== undefined) {
      if (!LEAD_STAGE_IDS.includes(body.stage)) throw new HttpError(400, 'Unknown stage.');
      values.push(body.stage);
      sets.push(`status = $${values.length}`);
    }
    if (body.assignedTo !== undefined) {
      if (body.assignedTo !== null && !/^\d+$/.test(String(body.assignedTo))) throw new HttpError(400, 'Invalid team member.');
      if (body.assignedTo !== null) {
        const { rowCount } = await getDb().query('SELECT 1 FROM admin_users WHERE id = $1', [body.assignedTo]);
        if (!rowCount) throw new HttpError(400, 'That team member no longer exists.');
      }
      values.push(body.assignedTo);
      sets.push(`assigned_to = $${values.length}`);
    }
    if (body.adminNotes !== undefined) {
      values.push(cleanString(body.adminNotes, 'Notes', 4000));
      sets.push(`admin_notes = $${values.length}`);
    }
    if (!sets.length) throw new HttpError(400, 'Nothing to update.');

    values.push(id);
    const updated = await getDb().query(`UPDATE bookings SET ${sets.join(', ')}, updated_at = now() WHERE id = $${values.length}`, values);
    if (!updated.rowCount) throw new HttpError(404, 'Lead not found.');
    console.log(`[admin] ${req.adminUser!.name} updated lead #${id} (${sets.map((s) => s.split(' ')[0]).join(', ')})`);
    res.json({ lead: await leadById(id) });
  }),
);

// ---------- Availability calendar (read by the WhatsApp assistant) ----------

/** The calendar shows up to six weeks at a time; allow a little more. */
const MAX_CALENDAR_DAYS = 93;

/** GET /api/admin/availability?from=2026-11-01&to=2026-12-12 → marked days and the leads with an event then. */
adminRouter.get(
  '/availability',
  asyncHandler(async (req, res) => {
    const from = typeof req.query.from === 'string' ? req.query.from : '';
    const to = typeof req.query.to === 'string' ? req.query.to : '';
    if (!isIsoDate(from) || !isIsoDate(to) || to < from) throw new HttpError(400, 'Choose a valid date range.');
    if (daysInRange(from, to) > MAX_CALENDAR_DAYS) throw new HttpError(400, `Choose at most ${MAX_CALENDAR_DAYS} days.`);
    res.json(await calendarBetween(from, to));
  }),
);

/** PUT /api/admin/availability { dates: ["2026-12-05"], status: "booked" | "limited" | "available" | null, note? } */
adminRouter.put(
  '/availability',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const dates: unknown[] = Array.isArray(body.dates) ? body.dates : [];
    if (!dates.length || dates.length > MAX_DAYS_PER_CHANGE || !dates.every((d) => typeof d === 'string' && isIsoDate(d))) {
      throw new HttpError(400, `Choose between 1 and ${MAX_DAYS_PER_CHANGE} valid days.`);
    }
    const status = body.status === null ? null : String(body.status);
    if (status !== null && !AVAILABILITY_STATUS_IDS.includes(status)) throw new HttpError(400, 'Unknown status.');
    const note = body.note === undefined ? undefined : cleanString(body.note, 'Note', 500);
    const unique = [...new Set(dates as string[])].sort();

    await markDays(unique, status as AvailabilityStatus | null, note, req.adminUser!.id);
    console.log(`[admin] ${req.adminUser!.name} marked ${unique.length} day(s) as ${status ?? 'cleared'} (${unique[0]}${unique.length > 1 ? ` … ${unique.at(-1)}` : ''})`);
    res.json({ ok: true });
  }),
);

/** POST /api/admin/availability/blocks { date, start: "08:00", end: "11:00", note? } → marks that time as taken. */
adminRouter.post(
  '/availability/blocks',
  asyncHandler(async (req, res) => {
    const body = req.body ?? {};
    const date = typeof body.date === 'string' ? body.date : '';
    if (!isIsoDate(date)) throw new HttpError(400, 'Choose a valid day.');
    const [start, end] = [toMinutes(String(body.start ?? '')), toMinutes(String(body.end ?? ''))];
    if (start === null || end === null) throw new HttpError(400, 'Enter a start and an end time.');
    if (end <= start) throw new HttpError(400, 'The end time must be after the start time.');
    const note = cleanString(body.note, 'Note', 200);
    const block = { date, start: fromMinutes(start), end: fromMinutes(end), note };
    const id = await addTimeBlock(date, block.start, block.end, note, req.adminUser!.id);
    console.log(`[admin] ${req.adminUser!.name} blocked ${block.start}–${block.end} on ${date}`);
    res.json({ block: { id, ...block } });
  }),
);

/** DELETE /api/admin/availability/blocks/:id → frees that time again. */
adminRouter.delete(
  '/availability/blocks/:id',
  asyncHandler(async (req, res) => {
    if (!/^\d+$/.test(req.params.id)) throw new HttpError(400, 'Invalid time block.');
    if (!(await removeTimeBlock(req.params.id))) throw new HttpError(404, 'That time block no longer exists.');
    res.json({ ok: true });
  }),
);
