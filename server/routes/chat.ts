import { Router, type Response } from 'express';
import { retrieve, searchOnlyAnswer, type ChatMessage } from '../assistant';
import { asyncHandler, cleanString, HttpError, rateLimit } from '../http';
import { buildSystemPrompt, openai, OPENAI_MODEL, streamChatCompletion } from '../llm';

export const chatRouter = Router();

const MAX_HISTORY = 8;

/** Accepts { messages: [...] } (chat widget) or { question } (simple clients). */
function parseMessages(body: unknown): ChatMessage[] {
  const b = (body ?? {}) as { messages?: unknown; question?: unknown };
  if (b.messages === undefined && b.question !== undefined) {
    const question = cleanString(b.question, 'Question', 1000);
    if (!question) throw new HttpError(400, 'Please type a question.');
    return [{ role: 'user', content: question }];
  }
  if (!Array.isArray(b.messages) || b.messages.length === 0) {
    throw new HttpError(400, 'messages must be a non-empty array.');
  }
  const messages = b.messages.slice(-MAX_HISTORY).map((m, i): ChatMessage => {
    const role = (m as ChatMessage)?.role;
    if (role !== 'user' && role !== 'assistant') throw new HttpError(400, `messages[${i}].role is invalid.`);
    const content = cleanString((m as ChatMessage).content, 'Message', role === 'user' ? 1000 : 4000);
    if (!content) throw new HttpError(400, 'Messages cannot be empty.');
    return { role, content };
  });
  if (messages.at(-1)!.role !== 'user') throw new HttpError(400, 'The last message must be from the user.');
  return messages;
}

function startTextStream(res: Response, mode: 'ai' | 'search') {
  res.status(200).set({
    'Content-Type': 'text/plain; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'X-Accel-Buffering': 'no', // stop reverse proxies from buffering the stream
    'X-Chat-Mode': mode,
  });
  res.flushHeaders();
}

/**
 * RAG chat: retrieve the closest knowledge chunks from Neon (pgvector), then have
 * OpenAI write the answer from them, streamed as plain text. Without OPENAI_API_KEY
 * (or if OpenAI fails before replying) it returns the best search match instead.
 */
chatRouter.post(
  '/',
  rateLimit({ windowMs: 60_000, max: 20 }),
  asyncHandler(async (req, res) => {
    const messages = parseMessages(req.body);
    const retrieved = await retrieve(messages);

    // With no matches the model still runs (greetings, off-topic) — its rules keep it on topic.
    if (!openai) {
      startTextStream(res, 'search');
      res.end(searchOnlyAnswer(retrieved));
      return;
    }

    const abort = new AbortController();
    res.on('close', () => abort.abort()); // visitor closed the chat — stop paying for tokens

    let stream;
    try {
      stream = await streamChatCompletion(
        [{ role: 'system', content: buildSystemPrompt(retrieved.context) }, ...messages],
        abort.signal,
      );
    } catch (err) {
      console.error(`[chat] OpenAI request failed (${OPENAI_MODEL}):`, err instanceof Error ? err.message : err);
      startTextStream(res, 'search');
      res.end(searchOnlyAnswer(retrieved));
      return;
    }

    startTextStream(res, 'ai');
    let wroteAnything = false;
    try {
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content;
        if (text) {
          res.write(text);
          wroteAnything = true;
        }
      }
      if (!wroteAnything) res.write(searchOnlyAnswer(retrieved));
    } catch (err) {
      if (!abort.signal.aborted) {
        console.error('[chat] OpenAI stream error:', err instanceof Error ? err.message : err);
        res.write(wroteAnything ? '\n\n(Sorry, my reply was cut off.) ' : searchOnlyAnswer(retrieved));
      }
    } finally {
      res.end();
    }
  }),
);
