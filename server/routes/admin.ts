/**
 * Leads dashboard API (/api/admin). Everything except login needs the session cookie.
 */
import { Router } from 'express';
import { LEAD_SOURCES, LEAD_STAGE_IDS } from '../../src/data/leads.js';
import { DUMMY_HASH, endSession, requireAdmin, sessionUser, startSession, verifyPassword } from '../auth.js';
import { getDb } from '../db.js';
import { asyncHandler, cleanString, HttpError, rateLimit } from '../http.js';
import { LEAD_COLUMNS, LEAD_FROM, toLead, type LeadRow } from '../leads.js';

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

/** GET /api/admin/leads?stage=new&source=instagram_ad&q=priya&offset=0 */
adminRouter.get(
  '/leads',
  asyncHandler(async (req, res) => {
    const stage = typeof req.query.stage === 'string' && LEAD_STAGE_IDS.includes(req.query.stage) ? req.query.stage : null;
    const source = typeof req.query.source === 'string' && req.query.source in LEAD_SOURCES ? req.query.source : null;
    const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const search = q ? `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%` : null;
    const offset = Math.max(0, Math.min(100_000, Number(req.query.offset) || 0));

    // Filters shared by the list and the per-stage counts (the counts ignore the stage filter)
    const where = `($1::text IS NULL OR b.source = $1)
      AND ($2::text IS NULL OR b.full_name ILIKE $2 OR b.phone ILIKE $2 OR b.email ILIKE $2
           OR b.campaign ILIKE $2 OR b.service ILIKE $2 OR b.event_location ILIKE $2)`;
    const db = getDb();
    const [list, counts] = await Promise.all([
      db.query<LeadRow>(
        `SELECT ${LEAD_COLUMNS} FROM ${LEAD_FROM}
          WHERE ${where} AND ($3::text IS NULL OR b.status = $3)
          ORDER BY b.created_at DESC, b.id DESC
          LIMIT ${PAGE_SIZE + 1} OFFSET $4`,
        [source, search, stage, offset],
      ),
      db.query<{ status: string; n: number }>(
        `SELECT b.status, count(*)::int AS n FROM bookings b WHERE ${where} GROUP BY b.status`,
        [source, search],
      ),
    ]);
    res.json({
      leads: list.rows.slice(0, PAGE_SIZE).map(toLead),
      hasMore: list.rows.length > PAGE_SIZE,
      counts: Object.fromEntries(counts.rows.map((r) => [r.status, r.n])),
    });
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
    const { rows } = await getDb().query<LeadRow>(`SELECT ${LEAD_COLUMNS} FROM ${LEAD_FROM} WHERE b.id = $1`, [id]);
    console.log(`[admin] ${req.adminUser!.name} updated lead #${id} (${sets.map((s) => s.split(' ')[0]).join(', ')})`);
    res.json({ lead: toLead(rows[0]) });
  }),
);
