/**
 * Loads the project-root .env, whichever folder the DMH API is started from
 * (`pnpm dev` inside server/, or `pnpm dev:server` from the project root).
 * Import this first, before anything that reads process.env.
 */
import dotenv from 'dotenv';
import path from 'node:path';

dotenv.config({ path: path.resolve(import.meta.dirname, '..', '.env'), quiet: true });
