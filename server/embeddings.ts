import type { FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Local, free embedding model — runs inside Node, no API key.
 * Downloaded once (~90 MB) on first use and cached on disk.
 * Produces 384-dimensional vectors (matches vector(384) in schema.sql).
 *
 * The library (with its native ONNX runtime) is only loaded when the model is, not when the server starts. A fresh
 * Vercel instance can then answer webhooks and start replying straight away while the model loads in the background
 * (see warmUpEmbeddings and the WhatsApp assistant's SEARCH_BUDGET_MS).
 */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

async function loadExtractor(): Promise<FeatureExtractionPipeline> {
  const { env, pipeline } = await import('@huggingface/transformers');
  // On Vercel only /tmp is writable: each new function instance downloads the model there once.
  if (process.env.VERCEL) env.cacheDir = '/tmp/transformers-cache';
  return (await pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' })) as FeatureExtractionPipeline;
}

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = loadExtractor().catch((err) => {
      extractor = null; // allow a retry on the next request
      throw err;
    });
  }
  return extractor;
}

export async function embed(text: string): Promise<number[]> {
  const model = await getExtractor();
  const output = await model(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data as Float32Array);
}

/** Start loading the model in the background so the first chat isn't slow. */
export function warmUpEmbeddings(): void {
  const started = Date.now();
  getExtractor()
    .then(() => console.log(`[embeddings] ${EMBEDDING_MODEL} ready in ${((Date.now() - started) / 1000).toFixed(1)} s`))
    .catch((err) => console.error('[embeddings] failed to load model:', err.message));
}
