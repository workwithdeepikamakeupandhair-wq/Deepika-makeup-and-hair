import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

/**
 * Local, free embedding model — runs inside Node, no API key.
 * Downloaded once (~90 MB) on first use and cached on disk.
 * Produces 384-dimensional vectors (matches vector(384) in schema.sql).
 */
export const EMBEDDING_MODEL = 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIMENSIONS = 384;

// On Vercel only /tmp is writable: each new function instance downloads the model there once.
if (process.env.VERCEL) env.cacheDir = '/tmp/transformers-cache';

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    extractor = pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' }).catch((err) => {
      extractor = null; // allow a retry on the next request
      throw err;
    }) as Promise<FeatureExtractionPipeline>;
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
  getExtractor()
    .then(() => console.log(`[embeddings] ${EMBEDDING_MODEL} ready`))
    .catch((err) => console.error('[embeddings] failed to load model:', err.message));
}
