/**
 * Logins for the leads dashboard: scrypt password hashes, and a signed session cookie (no session table).
 * The cookie holds the user id and an expiry, signed with SESSION_SECRET; every request re-checks that the
 * user still exists, so deleting an account logs it out.
 */
import crypto from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { getDb } from './db.js';

const COOKIE = 'dmh_admin';
const SESSION_DAYS = 7;
const SCRYPT = { N: 16384, r: 8, p: 1, keyLength: 64 };

/**
 * SESSION_SECRET signs the login cookie. Without it, a key is derived from DATABASE_URL (itself secret): stable
 * across restarts and across Vercel's function instances, which each start separately. A random per-process key
 * would log people out on every restart, and on Vercel at random (each instance would reject the others' cookies).
 */
function sessionSecret(): string {
  const configured = process.env.SESSION_SECRET?.trim();
  if (configured) return configured;
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (databaseUrl) return crypto.createHash('sha256').update(`dmh-admin-session\n${databaseUrl}`).digest('hex');
  console.warn('[auth] Neither SESSION_SECRET nor DATABASE_URL is set; dashboard logins will reset when DMH API restarts.');
  return crypto.randomBytes(32).toString('hex');
}
const secret = sessionSecret();

const scrypt = (password: string, salt: Buffer, keyLength: number, opts: crypto.ScryptOptions) =>
  new Promise<Buffer>((resolve, reject) =>
    crypto.scrypt(password, salt, keyLength, opts, (err, key) => (err ? reject(err) : resolve(key))),
  );

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, SCRYPT.keyLength, { N: SCRYPT.N, r: SCRYPT.r, p: SCRYPT.p });
  return `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split('$');
  if (kind !== 'scrypt' || !salt || !key) return false;
  const expected = Buffer.from(key, 'base64');
  const actual = await scrypt(password, Buffer.from(salt, 'base64'), expected.length, { N: Number(n), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(actual, expected);
}

/** Checked when the email doesn't exist, so a wrong email takes as long as a wrong password. */
export const DUMMY_HASH = `scrypt$${SCRYPT.N}$${SCRYPT.r}$${SCRYPT.p}$${Buffer.alloc(16).toString('base64')}$${Buffer.alloc(64).toString('base64')}`;

const sign = (payload: string) => crypto.createHmac('sha256', secret!).update(payload).digest('base64url');

/** Signs something other than a login (e.g. a payment screenshot link) with the same secret, kept apart by `purpose`. */
export const signWith = (purpose: string, payload: string) => crypto.createHmac('sha256', secret).update(`${purpose}\n${payload}`).digest('base64url');

function createToken(userId: string): string {
  const payload = Buffer.from(JSON.stringify({ uid: userId, exp: Date.now() + SESSION_DAYS * 86_400_000 })).toString('base64url');
  return `${payload}.${sign(payload)}`;
}

function readToken(token: string | undefined): string | null {
  if (!token) return null;
  const [payload, signature] = token.split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return null;
  try {
    const { uid, exp } = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    return typeof uid === 'string' && typeof exp === 'number' && exp > Date.now() ? uid : null;
  } catch {
    return null;
  }
}

function readCookie(req: Request, name: string): string | undefined {
  for (const part of (req.headers.cookie ?? '').split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return undefined;
}

/** HttpOnly so page scripts can't read it; Secure when the request came over HTTPS (e.g. through ngrok). */
function cookie(value: string, maxAgeSeconds: number, req: Request): string {
  return [`${COOKIE}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAgeSeconds}`, ...(req.secure ? ['Secure'] : [])].join('; ');
}

export function startSession(res: Response, req: Request, userId: string) {
  res.setHeader('Set-Cookie', cookie(createToken(userId), SESSION_DAYS * 86_400, req));
}

export function endSession(res: Response, req: Request) {
  res.setHeader('Set-Cookie', cookie('', 0, req));
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
}

// Through the global Express namespace (not 'express-serve-static-core'), so it also type-checks on Vercel, where the
// API project installs no Express type packages
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      adminUser?: SessionUser;
    }
  }
}

/** The logged-in user for this request, or null. */
export async function sessionUser(req: Request): Promise<SessionUser | null> {
  const uid = readToken(readCookie(req, COOKIE));
  if (!uid || !/^\d+$/.test(uid)) return null;
  const { rows } = await getDb().query<SessionUser>('SELECT id::text, name, email FROM admin_users WHERE id = $1', [uid]);
  return rows[0] ?? null;
}

/** Guards every dashboard API route: 401 unless logged in. */
export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  sessionUser(req).then(
    (user) => {
      if (!user) return res.status(401).json({ error: 'Please log in.' });
      req.adminUser = user;
      next();
    },
    next,
  );
}
