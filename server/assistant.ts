/**
 * Retrieval shared by every chat channel (website widget and WhatsApp): finds the knowledge chunks closest to the
 * conversation in Neon (pgvector), and picks a search-only answer when no language model is available.
 */
import { getDb, toVectorLiteral } from './db.js';
import { embed } from './embeddings.js';
import { FALLBACK_ANSWER } from './knowledge.js';

/** Matches below this are not passed to the model at all. */
const CONTEXT_MIN_SIMILARITY = 0.2;
/** Without an OpenAI key, only answer with a match at least this close. */
const SEARCH_ONLY_MIN_SIMILARITY = 0.3;
const TOP_K = 6;

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface Match {
  id: string;
  source: string;
  title: string;
  content: string;
  similarity: number;
}

async function search(text: string): Promise<Match[]> {
  const { rows } = await getDb().query<Match>(
    `SELECT id, source, title, content, 1 - (embedding <=> $1::vector) AS similarity
       FROM knowledge_chunks
      ORDER BY embedding <=> $1::vector
      LIMIT $2`,
    [toVectorLiteral(await embed(text)), TOP_K],
  );
  return rows;
}

export interface Retrieved {
  /** Merged matches for the latest question and the follow-up-aware query, best first (model context). */
  context: Match[];
  /** Matches for the latest question on its own, best first. */
  latest: Match[];
}

/**
 * Retrieves context for the latest question. Follow-ups like "how long does it take?"
 * are also searched together with the previous question so they keep their topic.
 */
export async function retrieve(messages: ChatMessage[]): Promise<Retrieved> {
  const userTurns = messages.filter((m) => m.role === 'user').map((m) => m.content);
  const latest = userTurns.at(-1)!;
  const previous = userTurns.at(-2);
  const queries = previous ? [latest, `${previous}\n${latest}`] : [latest];

  const results = await Promise.all(queries.map(search));
  const best = new Map<string, Match>();
  for (const rows of results) {
    for (const row of rows) {
      const seen = best.get(row.id);
      if (!seen || row.similarity > seen.similarity) best.set(row.id, row);
    }
  }
  const context = [...best.values()]
    .filter((m) => m.similarity >= CONTEXT_MIN_SIMILARITY)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOP_K);
  return { context, latest: results[0] };
}

/**
 * Without a model to weigh the context, answer the latest question on its own terms first, so a
 * change of topic isn't pulled back to the previous one. The follow-up-aware match is the fallback
 * for questions that only make sense with the previous turn ("how long does it take?").
 */
export function searchOnlyAnswer({ context, latest }: Retrieved, fallback: string = FALLBACK_ANSWER): string {
  const own = latest[0];
  const top = own && own.similarity >= SEARCH_ONLY_MIN_SIMILARITY ? own : context[0];
  return top && top.similarity >= SEARCH_ONLY_MIN_SIMILARITY ? top.content : fallback;
}
