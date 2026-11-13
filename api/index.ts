/**
 * DMH API on Vercel: one function serves every /api/* path (vercel.json rewrites them here), while Vercel serves the
 * website from dist/ itself. Locally and on Render, server/index.ts runs the same app as a normal server.
 *
 * Relative imports in the server code end in .js: Vercel runs these files as plain ES modules, which need the
 * extension (TypeScript, tsx and Vite map ".js" to the .ts source).
 */
import { createApp } from '../server/app.js';
import { warmUpEmbeddings } from '../server/embeddings.js';

const app = createApp();

// Start loading the search model as soon as a new instance boots, so the first chat question isn't slow
warmUpEmbeddings();

export default app;
