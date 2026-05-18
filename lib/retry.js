/**
 * Unified retry + upstream-error helpers for every tool.
 *
 * Why this exists
 * ---------------
 * The MCP wraps many third-party data sources (Socrata, ArcGIS, Census,
 * NWS, FEMA, TCAD, etc.). Each has its own flakiness profile -- sometimes a
 * 500 / 504 / timeout for reasons on THEIR side. Without a uniform retry +
 * error-formatting layer, every tool ends up rolling its own (often missing)
 * recovery code and bubbling raw stack traces back to the LLM.
 *
 * This module gives every tool two things:
 *
 *   1. `retryFetch(fn, opts)` -- runs `fn`, retries on transient failures
 *      (5xx, 429, network/timeout) with jittered backoff. Throws an
 *      UpstreamError with a structured `.upstream` payload on final failure.
 *
 *   2. `upstreamErrorText(source, err)` -- turns an UpstreamError into a
 *      clear, LLM-friendly message that explains:
 *         a. WHO is failing (the data source by name)
 *         b. That the MCP itself is working
 *         c. What the LLM/user should do (retry, try alternate tool, etc.)
 *
 * Source profiles
 * ---------------
 * Different sources have different reasonable retry policies. Use one of the
 * named profiles (or pass a custom config):
 *
 *   - "fast"      -- 1 retry, 500ms (use for NWS, Census, AirNow, simple APIs)
 *   - "soda"      -- 1 retry, 800ms (data.austintexas.gov Socrata)
 *   - "arcgis"    -- 2 retries, 600/1500ms (ArcGIS REST, FEMA, county CADs)
 *   - "tcad"      -- 2 retries, 600/1500ms (kept for reference -- lib/tcad.js
 *                    has its own bespoke handling with escalating timeouts)
 *   - "rss"       -- 0 retries (per-feed; one source failing must not block
 *                    aggregation across the other voices)
 *   - "scraper"   -- 0 retries (Travis tax HTML pages -- expensive to retry)
 *
 * The retry layer NEVER retries 4xx other than 429. 404 / 400 / 403 are
 * permanent failures and surface to the user immediately.
 */

export const PROFILES = {
  fast:    { retries: 1, delays: [500],         timeoutMs: 12000 },
  soda:    { retries: 1, delays: [800],         timeoutMs: 25000 },
  arcgis:  { retries: 2, delays: [600, 1500],   timeoutMs: 25000 },
  tcad:    { retries: 2, delays: [600, 1500],   timeoutMs: 20000 },
  rss:     { retries: 0, delays: [],            timeoutMs: 12000 },
  scraper: { retries: 0, delays: [],            timeoutMs: 30000 },
};

/**
 * An error thrown by retryFetch when an upstream call fails after retries.
 * Always carries a structured `.upstream` payload so the tool layer can
 * decide whether to format with `upstreamErrorText()` or do something custom.
 */
export class UpstreamError extends Error {
  constructor(message, { source, kind, status, attempts, lastErrorMessage, url }) {
    super(message);
    this.name = "UpstreamError";
    this.upstream = {
      source,            // human label e.g. "Travis CAD (True Prodigy)"
      kind,              // 'timeout' | 'server_error' | 'rate_limited' | 'network' | 'not_found' | 'bad_request' | 'unknown'
      status,             // HTTP status or null
      attempts,           // how many tries we made
      last_error_message: lastErrorMessage,
      url,
    };
  }
}

function classifyError(err, res) {
  if (res) {
    if (res.status === 429) return "rate_limited";
    if (res.status >= 500) return "server_error";
    if (res.status === 404) return "not_found";
    if (res.status >= 400) return "bad_request";
  }
  const msg = String(err?.message ?? err ?? "").toLowerCase();
  if (msg.includes("abort") || msg.includes("timeout")) return "timeout";
  if (msg.includes("enotfound") || msg.includes("econnreset") || msg.includes("econnrefused") || msg.includes("fetch failed")) return "network";
  return "unknown";
}

function isTransient(kind) {
  return kind === "server_error" || kind === "timeout" || kind === "network" || kind === "rate_limited";
}

/**
 * Sleep with random jitter (0.5..1.5x of base).
 */
function jitter(baseMs) {
  return new Promise((r) => setTimeout(r, Math.round(baseMs * (0.5 + Math.random()))));
}

/**
 * @param {(signal: AbortSignal) => Promise<Response>} fetchFn  -- given an AbortSignal, return a Response or throw
 * @param {object} opts
 * @param {string} opts.source            -- human label e.g. "Travis CAD"
 * @param {'fast'|'soda'|'arcgis'|'tcad'|'rss'|'scraper'} [opts.profile]
 * @param {{retries:number, delays:number[], timeoutMs?:number}} [opts.custom]
 * @param {string} [opts.url]             -- for error context
 * @returns {Promise<Response>}
 *
 * The caller still owns parsing the body. We only retry the HTTP request.
 * Non-retryable 4xx are returned as the Response (caller decides). 5xx,
 * 429, timeouts, and network errors are retried, then thrown as UpstreamError.
 *
 * Each attempt gets its own AbortController + timeoutMs from the profile.
 * Backwards compat: if `fetchFn` is a 0-arg function, we still call it.
 */
export async function retryFetch(fetchFn, opts) {
  const { source = "upstream", profile = "fast", custom, url } = opts || {};
  const policy = custom || PROFILES[profile] || PROFILES.fast;
  const totalAttempts = policy.retries + 1;
  const timeoutMs = policy.timeoutMs ?? 15000;
  let lastErr = null;
  let lastRes = null;
  let lastKind = "unknown";

  for (let attempt = 0; attempt < totalAttempts; attempt++) {
    let res = null;
    const ac = new AbortController();
    const tid = setTimeout(() => ac.abort(new Error(`timeout after ${timeoutMs}ms`)), timeoutMs);
    try {
      // Allow both 0-arg (legacy) and 1-arg (signal-aware) fetchFn.
      res = await (fetchFn.length >= 1 ? fetchFn(ac.signal) : fetchFn());
    } catch (err) {
      clearTimeout(tid);
      lastErr = err;
      const kind = classifyError(err, null);
      lastKind = kind;
      if (attempt < totalAttempts - 1 && isTransient(kind)) {
        await jitter(policy.delays[attempt] ?? policy.delays.at(-1) ?? 500);
        continue;
      }
      throw new UpstreamError(
        `${source} call failed: ${kind} (${err?.message || err})`,
        { source, kind, status: null, attempts: attempt + 1, lastErrorMessage: String(err?.message || err).slice(0, 200), url }
      );
    }

    // Got a Response back.
    clearTimeout(tid);
    if (res.ok) return res;

    lastRes = res;
    const kind = classifyError(null, res);
    lastKind = kind;

    // 4xx (except 429) -- return as-is, caller handles.
    if (!isTransient(kind)) return res;

    if (attempt < totalAttempts - 1) {
      await jitter(policy.delays[attempt] ?? policy.delays.at(-1) ?? 500);
      continue;
    }

    throw new UpstreamError(
      `${source} returned ${res.status} ${res.statusText} after ${totalAttempts} attempt(s)`,
      { source, kind, status: res.status, attempts: totalAttempts, lastErrorMessage: `${res.status} ${res.statusText}`, url }
    );
  }

  // Should not reach here, but keep safe.
  throw new UpstreamError(
    `${source} call failed after ${totalAttempts} attempt(s)`,
    { source, kind: lastKind, status: lastRes?.status ?? null, attempts: totalAttempts, lastErrorMessage: lastErr?.message ?? "unknown", url }
  );
}

/**
 * Convert an UpstreamError (or any error) into LLM-friendly text. Always
 * names the source, makes clear the MCP is not at fault, and tells the LLM
 * what to do next.
 *
 * Returns a string ready to drop into a tool's content[0].text with isError:true.
 */
export function upstreamErrorText(err, { toolName = "tool", alternateTools = [] } = {}) {
  const u = err?.upstream;
  if (!u) {
    // Non-UpstreamError -- show what we can but stay calm.
    return [
      `# ${toolName}: unexpected error`,
      "",
      `The MCP itself appears healthy, but ${toolName} threw an unexpected error: \`${String(err?.message || err).slice(0, 200)}\`.`,
      "",
      "**What to do:** retry once. If it keeps failing, the issue is likely with the upstream data source. Try again in a minute.",
    ].join("\n");
  }

  const labels = {
    server_error: `${u.source}'s server returned a ${u.status || "5xx"} error`,
    timeout: `${u.source} timed out`,
    rate_limited: `${u.source} rate-limited this request`,
    network: `Could not reach ${u.source} (network / DNS issue)`,
    not_found: `${u.source} returned 404 for that query`,
    bad_request: `${u.source} rejected the query (${u.status || "4xx"})`,
    unknown: `${u.source} returned an unexpected error`,
  };
  const what = labels[u.kind] || labels.unknown;

  const advice = {
    server_error: "Try again in 30-60 seconds — this is a transient outage on their side, not a problem with this MCP. If it keeps failing, the data provider may be having a broader incident.",
    timeout: "Try again in 30 seconds. The data provider's server is slow but usually recovers within a minute.",
    rate_limited: "Wait 60 seconds before retrying. We hit a rate cap on the upstream.",
    network: "Likely a DNS or connectivity blip. Retry in 10-30 seconds.",
    not_found: "The query didn't match any records. Double-check spelling / address / ID and try a different query.",
    bad_request: "The query parameters were rejected. Adjust filters and try again.",
    unknown: "Try again. If it persists, the data provider may be having an incident.",
  };
  const whatToDo = advice[u.kind] || advice.unknown;

  const lines = [
    `# ${toolName}: ${what}`,
    "",
    `**The MCP is working correctly.** This error is on the upstream data source's side.`,
    "",
    `**Details**`,
    `- Source: ${u.source}`,
    `- Kind: ${u.kind}${u.status ? ` (HTTP ${u.status})` : ""}`,
    `- Attempts made: ${u.attempts}`,
    u.last_error_message ? `- Last error: \`${u.last_error_message}\`` : null,
    "",
    `**What to do**`,
    whatToDo,
  ].filter(Boolean);

  if (alternateTools.length) {
    lines.push("");
    lines.push(`**Alternate tools that may answer the same question:** ${alternateTools.join(", ")}`);
  }

  return lines.join("\n");
}
