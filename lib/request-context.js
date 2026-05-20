/**
 * Per-request context propagated via AsyncLocalStorage.
 *
 * Why this exists
 * ---------------
 * MCP handlers receive a context object from the SDK that includes an
 * AbortSignal. We want every downstream fetch (sodaQuery, vowPublicGet,
 * retryFetch, county-CAD clients, etc.) to honor that signal so the upstream
 * call gets cancelled when the MCP client disconnects mid-request.
 *
 * Threading a `signal` arg through every helper would touch ~25 files. ALS
 * lets the central wrapHandler() open a scope once and every awaiting helper
 * underneath transparently reads the signal via `currentSignal()`.
 *
 * Design notes
 * ------------
 * - `runWithContext(ctx, fn)` enters a scope. wrapHandler() in register.js
 *   calls this so the entire handler body runs inside it.
 * - `currentSignal()` returns the signal if one is in scope, else `undefined`.
 *   Helpers that already have their own timeout AbortController should merge
 *   via `linkAbort()` so EITHER source can abort the fetch.
 * - Outside an MCP request (smoke tests, ad-hoc scripts) ALS is empty and
 *   helpers just see undefined -- preserves existing behavior.
 */

import { AsyncLocalStorage } from "node:async_hooks";

const ALS = new AsyncLocalStorage();

export function runWithContext(ctx, fn) {
  return ALS.run(ctx || {}, fn);
}

export function currentSignal() {
  return ALS.getStore()?.signal;
}

export function currentRequestId() {
  return ALS.getStore()?.requestId;
}

/**
 * Wire an external AbortSignal into a local AbortController so either source
 * can cancel the fetch.
 *
 *   const ac = new AbortController();
 *   const unlink = linkAbort(ac, externalSignal);
 *   try {
 *     await fetch(url, { signal: ac.signal });
 *   } finally {
 *     unlink();
 *   }
 *
 * Returns a cleanup function. Always call it (the listener leaks otherwise).
 */
export function linkAbort(controller, externalSignal) {
  if (!externalSignal) return () => {};
  if (externalSignal.aborted) {
    controller.abort(externalSignal.reason);
    return () => {};
  }
  const onAbort = () => controller.abort(externalSignal.reason);
  externalSignal.addEventListener("abort", onAbort, { once: true });
  return () => externalSignal.removeEventListener("abort", onAbort);
}
