import './env';
import express, { type NextFunction, type Request, type Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { pool } from './db';
import { warmUpEmbeddings } from './embeddings';
import { HttpError } from './http';
import { openai, OPENAI_MODEL } from './llm';
import { adminRouter } from './routes/admin';
import { bookingsRouter } from './routes/bookings';
import { chatRouter } from './routes/chat';
import { metaLeadsRouter, metaLeadsStatus } from './routes/metaLeads';
import { missingWhatsAppSettings, whatsappEnabled, whatsappPhoneNumberId, whatsappRouter } from './routes/whatsapp';

const SERVICE_NAME = 'DMH API';
const LOG = '[dmh-api]';

const app = express();
const PORT = Number(process.env.PORT) || 4000;

app.disable('x-powered-by');
app.set('trust proxy', 1); // correct client IPs behind a host's proxy (for rate limiting)
// Before express.json: Meta's webhooks (WhatsApp, Lead Ads) are signature-checked against the raw body
app.use('/api/whatsapp', whatsappRouter);
app.use('/api/meta', metaLeadsRouter);
app.use(express.json({ limit: '20kb' }));

// ---------- API ----------
app.get('/api/health', async (_req, res) => {
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
    whatsapp: whatsappEnabled ? 'enabled' : 'not_configured',
    metaLeads: metaLeadsStatus,
  });
});

app.use('/api/bookings', bookingsRouter);
app.use('/api/chat', chatRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ---------- Frontend (production) ----------
// After `npm run build`, the same server also serves the website from dist/.
const distDir = path.resolve(import.meta.dirname, '..', 'dist');
if (fs.existsSync(distDir)) {
  app.use(express.static(distDir));
  app.get('*', (_req, res) => res.sendFile(path.join(distDir, 'index.html')));
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

const server = app.listen(PORT, () => {
  console.log(`${LOG} ${SERVICE_NAME} listening on http://localhost:${PORT}`);
  if (!pool) console.warn(`${LOG} DATABASE_URL is not set — bookings and chat will return 503.`);
  console.log(
    openai
      ? `${LOG} chat: OpenAI ${OPENAI_MODEL} + pgvector RAG`
      : `${LOG} chat: search-only (set OPENAI_API_KEY in .env for AI answers)`,
  );
  if (whatsappEnabled) {
    console.log(`${LOG} whatsapp: bot on, webhook at /api/whatsapp/webhook (number id …${whatsappPhoneNumberId!.slice(-4)})`);
  } else if (missingWhatsAppSettings.length < 4) {
    console.warn(`${LOG} whatsapp: bot off, missing ${missingWhatsAppSettings.join(', ')} in .env`);
  }
  if (fs.existsSync(distDir)) console.log(`${LOG} serving website from ${distDir}`);
  warmUpEmbeddings();
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`${LOG} port ${PORT} is already in use — is ${SERVICE_NAME} already running in another terminal?`);
    process.exit(1);
  }
  throw err;
});
