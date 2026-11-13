/**
 * Work that continues after the HTTP response has been sent (webhooks answer Meta at once, then reply to the
 * customer or fetch the lead).
 *
 * On a normal server (local, Render) the process keeps running, so nothing extra is needed. On Vercel a function
 * may be frozen as soon as its response is sent, unless the work is registered with the platform's `waitUntil`.
 * This is what `waitUntil` from `@vercel/functions` does internally; outside Vercel the context is absent and the
 * call is a no-op.
 */
const REQUEST_CONTEXT = Symbol.for('@vercel/request-context');

interface VercelRequestContext {
  waitUntil?: (promise: Promise<unknown>) => void;
}

function vercelContext(): VercelRequestContext | undefined {
  const holder = (globalThis as Record<symbol, { get?: () => VercelRequestContext | undefined } | undefined>)[REQUEST_CONTEXT];
  return holder?.get?.();
}

/** Runs `task` after the response, logging (not throwing) its failure. */
export function inBackground(task: Promise<unknown>, onError: (err: unknown) => void): void {
  const settled = task.then(
    () => undefined,
    (err) => onError(err),
  );
  vercelContext()?.waitUntil?.(settled);
}
