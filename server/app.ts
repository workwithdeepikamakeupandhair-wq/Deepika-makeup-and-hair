/**
 * The DMH API as an Express app, shared by both ways of running it:
 * - server/index.ts: a normal Node server (local development, `npm start`, Render), which also serves the website;
 * - server/api/index.ts: a Vercel Function in the API's own Vercel project (the website is a separate project).
 */
import './env.js';
import express, { type Express, type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { PROOF_PATH, readProofToken } from './approvals.js';
import { pool } from './db.js';
import { asyncHandler, HttpError } from './http.js';
import { paymentProof } from './whatsappBooking.js';
import { openai, OPENAI_MODEL } from './llm.js';
import { adminRouter } from './routes/admin.js';
import { bookingsRouter } from './routes/bookings.js';
import { chatRouter } from './routes/chat.js';
import { metaLeadsRouter, metaLeadsStatus } from './routes/metaLeads.js';
import { twilioWhatsAppEnabled, twilioWhatsAppPath, twilioWhatsAppRouter } from './routes/twilioWhatsapp.js';
import { metaWhatsAppEnabled, whatsappRouter } from './routes/whatsapp.js';
import { chatStorage } from './whatsappChats.js';

export const SERVICE_NAME = 'DMH API';
export const LOG = '[dmh-api]';

interface AppOptions {
  /** Serve the built website from this folder (with index.html for every other path). */
  websiteDir?: string;
}

export function createApp({ websiteDir }: AppOptions = {}): Express {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // correct client IPs behind a host's proxy (for rate limiting)
  // Before express.json: Meta's webhooks (WhatsApp, Lead Ads) are signature-checked against the raw body, and
  // Twilio's arrive as forms
  app.use('/api/whatsapp', whatsappRouter);
  app.use(twilioWhatsAppPath, twilioWhatsAppRouter);
  app.use('/api/meta', metaLeadsRouter);
  app.use(express.json({ limit: '20kb' }));

  // ---------- API ----------
  app.get('/api/health', async (req, res) => {
    let database: 'connected' | 'not_configured' | 'error' = 'not_configured';
    if (pool) {
      try {
        await pool.query('SELECT 1');
        database = 'connected';
      } catch {
        database = 'error';
      }
    }
    res.json({
      service: SERVICE_NAME,
      status: 'ok',
      database,
      chat: openai ? `openai:${OPENAI_MODEL}` : 'search-only',
      whatsapp: metaWhatsAppEnabled || twilioWhatsAppEnabled ? 'enabled' : 'not_configured',
      whatsappConnections: [...(metaWhatsAppEnabled ? ['meta'] : []), ...(twilioWhatsAppEnabled ? ['twilio'] : [])],
      // Where the WhatsApp assistant keeps conversations: 'database' (survives restarts and new instances) or 'memory'
      whatsappMemory: chatStorage,
      metaLeads: metaLeadsStatus,
      // The caller's own IP as the API sees it. Behind a proxy (the website forwarding /api here) it must still be
      // the visitor's IP, or the per-visitor rate limits would be shared by everyone.
      yourIp: req.ip,
    });
  });

  app.use('/api/bookings', bookingsRouter);
  app.use('/api/chat', chatRouter);
  app.use('/api/admin', adminRouter);

  // A payment screenshot for WhatsApp to show the approver: only through a signed link that expires
  app.get(
    `${PROOF_PATH}/:token`,
    asyncHandler(async (req, res) => {
      const id = readProofToken(req.params.token);
      const proof = id ? await paymentProof(id) : null;
      if (!proof || !/^image\/(jpeg|png)$/i.test(proof.contentType)) throw new HttpError(404, 'Not found');
      res.set({ 'Content-Type': proof.contentType, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex' });
      res.send(proof.data);
    }),
  );

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'Not found' });
  });

  // ---------- Website ----------
  if (websiteDir && fs.existsSync(websiteDir)) {
    app.use(express.static(websiteDir));
    app.get('*', (_req, res) => res.sendFile(path.join(websiteDir, 'index.html')));
  }

  // ---------- Errors ----------
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof HttpError) {
      return res.status(err.status).json({ error: err.message });
    }
    if (err instanceof SyntaxError && 'body' in err) {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    console.error(`${LOG} unexpected error:`, err);
    res.status(500).json({ error: 'Something went wrong. Please try again.' });
  });

  return app;
}
