/**
 * DMH API as a normal Node server: local development (`pnpm dev`), `npm start`, or a host like Render.
 * After `npm run build`, the same server also serves the website from dist/.
 * (On Vercel, server/api/index.ts runs the same app as a function instead.)
 */
import './env.js';
import fs from 'node:fs';
import path from 'node:path';
import { createApp, LOG, SERVICE_NAME } from './app.js';
import { pool } from './db.js';
import { warmUpEmbeddings } from './embeddings.js';
import { openai, OPENAI_MODEL } from './llm.js';
import { twilioWhatsAppEnabled, twilioWhatsAppPath } from './routes/twilioWhatsapp.js';
import { metaPhoneNumberId, metaWhatsAppEnabled, missingMetaWhatsAppSettings } from './routes/whatsapp.js';
import { whatsappMode } from './whatsappBot.js';

const PORT = Number(process.env.PORT) || 4000;
const distDir = path.resolve(import.meta.dirname, '..', 'dist');

const app = createApp({ websiteDir: distDir });

const server = app.listen(PORT, () => {
  console.log(`${LOG} ${SERVICE_NAME} listening on http://localhost:${PORT}`);
  if (!pool) console.warn(`${LOG} DATABASE_URL is not set — bookings and chat will return 503.`);
  console.log(
    openai
      ? `${LOG} chat: OpenAI ${OPENAI_MODEL} + pgvector RAG`
      : `${LOG} chat: search-only (set OPENAI_API_KEY in .env for AI answers)`,
  );
  if (metaWhatsAppEnabled) {
    const mode = whatsappMode === 'coexistence' ? "coexistence on Deepika's number" : 'own number';
    console.log(`${LOG} whatsapp: bot on via Meta (${mode}), webhook at /api/whatsapp/webhook (number id …${metaPhoneNumberId!.slice(-4)})`);
  } else if (missingMetaWhatsAppSettings.length < 4) {
    console.warn(`${LOG} whatsapp: Meta connection off, missing ${missingMetaWhatsAppSettings.join(', ')} in .env`);
  }
  if (twilioWhatsAppEnabled) console.log(`${LOG} whatsapp: bot on via Twilio, webhook at ${twilioWhatsAppPath}`);
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
