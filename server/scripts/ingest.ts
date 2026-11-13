/**
 * Builds the RAG knowledge base and stores it in Neon (pgvector).
 *
 * Sources:
 *   1. Website content  — src/data/portfolioData.ts + FAQ in server/knowledge.ts
 *   2. Instagram export — data/instagram/ (optional; see server/instagram.ts)
 *
 * Usage:  npm run db:ingest                 (uses data/instagram/ if present)
 *         npm run db:ingest -- path/to/export
 *
 * Re-run whenever the site content changes or you download a newer Instagram export.
 * Entries that no longer exist in either source are removed.
 */
import '../env.js';
import path from 'node:path';
import { getDb, pool, toVectorLiteral } from '../db.js';
import { embed } from '../embeddings.js';
import { INSTAGRAM_EXPORT_DIR, loadInstagramKnowledge } from '../instagram.js';
import { buildKnowledge, embeddingText, type KnowledgeChunk } from '../knowledge.js';

const db = getDb(); // fail fast if DATABASE_URL is missing

const siteChunks = buildKnowledge();
console.log(`Website content: ${siteChunks.length} entries`);

const exportDir = process.argv[2] ? path.resolve(process.argv[2]) : INSTAGRAM_EXPORT_DIR;
let instagramChunks: KnowledgeChunk[] = [];
try {
  const ig = loadInstagramKnowledge(exportDir);
  if (ig) {
    instagramChunks = ig.chunks;
    const { posts, reels, skipped, profile } = ig.stats;
    console.log(
      `Instagram export: ${posts} posts, ${reels} reels${profile ? ', profile bio' : ''} ` +
        `→ ${ig.chunks.length} entries (${skipped} skipped: empty, too short or duplicate)`,
    );
  } else {
    console.log(`Instagram export: none found at ${exportDir} — skipping.`);
  }
} catch (err) {
  console.error(`Instagram export error: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
}

const chunks = [...siteChunks, ...instagramChunks];

console.log(`Embedding ${chunks.length} entries locally (first run downloads the model)...`);
const vectors: string[] = [];
for (const [i, chunk] of chunks.entries()) {
  vectors.push(toVectorLiteral(await embed(embeddingText(chunk))));
  process.stdout.write(`\r  ${i + 1}/${chunks.length}`);
}
process.stdout.write('\n');

const client = await db.connect();
try {
  await client.query('BEGIN');
  for (const [i, chunk] of chunks.entries()) {
    await client.query(
      `INSERT INTO knowledge_chunks (id, source, title, content, embedding, updated_at)
       VALUES ($1, $2, $3, $4, $5::vector, now())
       ON CONFLICT (id) DO UPDATE
         SET source = EXCLUDED.source, title = EXCLUDED.title, content = EXCLUDED.content,
             embedding = EXCLUDED.embedding, updated_at = now()`,
      [chunk.id, chunk.source, chunk.title, chunk.content, vectors[i]],
    );
  }
  const { rowCount } = await client.query(
    'DELETE FROM knowledge_chunks WHERE NOT (id = ANY($1::text[]))',
    [chunks.map((c) => c.id)],
  );
  await client.query('COMMIT');
  console.log(`Done. ${chunks.length} entries stored in Neon, ${rowCount ?? 0} old entries removed.`);
} catch (err) {
  await client.query('ROLLBACK');
  console.error('Ingest failed:', err instanceof Error ? err.message : err);
  process.exitCode = 1;
} finally {
  client.release();
  await pool?.end();
}
