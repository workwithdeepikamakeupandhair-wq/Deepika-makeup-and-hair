/**
 * DMH API on Vercel, deployed as its own project (Root Directory = server). One function serves every path
 * (server/vercel.json rewrites them here). The website is a separate Vercel project that forwards its /api/* requests
 * to this one (see the root vercel.json). Locally and on Render, server/index.ts runs the same app as a normal server.
 *
 * Relative imports in the server code end in .js: Vercel runs these files as plain ES modules, which need the
 * extension (TypeScript, tsx and Vite map ".js" to the .ts source).
 */
import { createApp } from '../app.js';
import { warmUpEmbeddings } from '../embeddings.js';

const app = createApp();

// Start loading the search model as soon as a new instance boots, so the first chat question isn't slow
warmUpEmbeddings();

export default app;
