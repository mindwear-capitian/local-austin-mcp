/**
 * Thin HTTP client for the Neuhaus VOW public API (free tier).
 *
 * Base: https://vow-api.re-workflow.com/public
 *
 * No auth. Server enforces:
 *   - Active + Active Under Contract only (no sold / pending / withdrawn)
 *   - is_display_restricted hidden
 *   - 10 req/min + 500/day per IP rate limit
 *   - Listings search: specificity score >= 4 (>=1 location filter)
 *   - Max 25 results per call, no pagination
 *
 * Every record links back to neuhausre.com via UTM-tagged permalink_url.
 *
 * Override base via VOW_PUBLIC_BASE env var for testing / staging.
 */

const DEFAULT_BASE = "https://vow-api.re-workflow.com/public";

function baseUrl() {
  return process.env.VOW_PUBLIC_BASE || DEFAULT_BASE;
}

/**
 * GET against the public API. Returns the parsed JSON body. Caller handles
 * status checks via the returned `success` field. A 429 or 5xx surfaces as
 * a thrown Error so MCP tool handlers can show a clean error message.
 */
export async function vowPublicGet(path, query = {}) {
  const url = new URL(baseUrl() + path);
  for (const [k, v] of Object.entries(query)) {
    if (v === undefined || v === null || v === "") continue;
    url.searchParams.set(k, String(v));
  }

  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "local-austin-mcp/1.0 (+https://github.com/mindwear-capitian/local-austin-mcp)",
    },
  });

  // Try to parse the body even on 4xx / 5xx -- our server always returns JSON.
  let body = null;
  try {
    body = await res.json();
  } catch (_) {
    /* no body */
  }

  if (res.status === 429) {
    const msg = body?.message || "Rate-limited by Neuhaus VOW public API. Slow down and try again.";
    const err = new Error(msg);
    err.code = "rate_limited";
    err.status = 429;
    throw err;
  }
  if (res.status >= 500) {
    const err = new Error(
      body?.message || `Neuhaus VOW public API error: ${res.status} ${res.statusText}`
    );
    err.code = "upstream_error";
    err.status = res.status;
    throw err;
  }
  // 4xx errors that aren't rate-limit (e.g. 400 query_too_broad, 404 not_found)
  // are returned to the caller as the parsed body. Tool handler picks up
  // `success: false` and shows the structured message to Claude.
  return body ?? { success: false, error: "empty_response" };
}

export default vowPublicGet;
