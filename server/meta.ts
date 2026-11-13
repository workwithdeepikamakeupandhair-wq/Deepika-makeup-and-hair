/**
 * Helpers shared by Meta webhooks (WhatsApp and Lead Ads): signature checks and the verification handshake.
 */
import crypto from 'node:crypto';
import type { Request, Response } from 'express';

/** Meta signs every webhook body with the App secret (X-Hub-Signature-256). */
export function validSignature(rawBody: Buffer, header: string | undefined, appSecret: string): boolean {
  if (!header?.startsWith('sha256=')) return false;
  const expected = crypto.createHmac('sha256', appSecret).update(rawBody).digest();
  const given = Buffer.from(header.slice('sha256='.length), 'hex');
  return given.length === expected.length && crypto.timingSafeEqual(given, expected);
}

export function sameText(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

/** Answers Meta's one-time GET when a webhook URL is saved in the App Dashboard. Returns true if verified. */
export function answerVerification(req: Request, res: Response, verifyToken: string | undefined): boolean {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (!verifyToken) {
    res.status(503).send('Verify token is not set');
    return false;
  }
  if (mode === 'subscribe' && typeof token === 'string' && sameText(token, verifyToken) && typeof challenge === 'string') {
    res.type('text/plain').send(challenge);
    return true;
  }
  res.sendStatus(403);
  return false;
}
