/**
 * Travis Central Appraisal District (TCAD) client via True Prodigy public API.
 *
 * Source: https://prod-container.trueprodigyapi.com (True Prodigy CAD Public)
 *
 * Hardening:
 *   1. Token cache: True Prodigy tokens live ~5 minutes. We cache for 4
 *      minutes in-memory, cutting traffic in half (no per-call /auth/token
 *      hit). Concurrent callers share the same in-flight token promise.
 *   2. Concurrency lock: Cap parallel TCAD requests at MAX_INFLIGHT to
 *      prevent the composed property_360 from self-DDoSing True Prodigy
 *      when 8 sections fan out at once.
 *   3. Jittered backoff: Exponential backoff with random jitter (50-150%)
 *      kills retry-stampede when multiple parallel callers all retry at
 *      the same delay window.
 */

const TP_BASE = "https://prod-container.trueprodigyapi.com";
const OFFICE = "Travis";
const MAX_INFLIGHT = 2; // True Prodigy 504s when we slam it; 2 keeps below threshold
const TOKEN_TTL_MS = 4 * 60 * 1000; // 4 minutes (token actual TTL = 5)

// ---------------------------------------------------------------------------
// Token cache
// ---------------------------------------------------------------------------

let cachedToken = null;
let cachedTokenExpiresAt = 0;
let inflightTokenPromise = null;

async function getToken() {
  const now = Date.now();
  if (cachedToken && now < cachedTokenExpiresAt) return cachedToken;
  if (inflightTokenPromise) return inflightTokenPromise;

  inflightTokenPromise = (async () => {
    try {
      const token = await fetchTokenRaw();
      cachedToken = token;
      cachedTokenExpiresAt = Date.now() + TOKEN_TTL_MS;
      return token;
    } finally {
      inflightTokenPromise = null;
    }
  })();
  return inflightTokenPromise;
}

async function fetchTokenRaw() {
  return retry(async () => {
    const res = await fetch(`${TP_BASE}/trueprodigy/cadpublic/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ office: OFFICE }),
    });
    if (!res.ok) {
      throw new Error(`TCAD token fetch failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const token = data?.user?.token;
    if (!token) throw new Error("TCAD token response missing token");
    return token;
  });
}

function invalidateToken() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
}

// ---------------------------------------------------------------------------
// Concurrency lock (semaphore)
// ---------------------------------------------------------------------------

let inflightCount = 0;
const waitQueue = [];

async function acquire() {
  if (inflightCount < MAX_INFLIGHT) {
    inflightCount++;
    return;
  }
  await new Promise((resolve) => waitQueue.push(resolve));
  inflightCount++;
}

function release() {
  inflightCount = Math.max(0, inflightCount - 1);
  const next = waitQueue.shift();
  if (next) next();
}

async function withSlot(fn) {
  await acquire();
  try {
    return await fn();
  } finally {
    release();
  }
}

// ---------------------------------------------------------------------------
// Retry with jittered exponential backoff
// ---------------------------------------------------------------------------

/**
 * Three attempts total with escalating per-attempt timeouts:
 *   - Attempt 1: 8s deadline. Fast-fails if backend is fully down.
 *   - Attempt 2: 14s deadline. Some queries (delinquent properties with
 *     long tax history) genuinely take 11s+ to compute.
 *   - Attempt 3: 20s deadline. Last resort.
 * Backoff between attempts: 600ms / 1500ms (with 0.5..1.5x jitter).
 *
 * The current attempt's timeout is exposed via getCurrentAttemptTimeout()
 * so the fetch call can wire its AbortController to it.
 */
const ATTEMPT_TIMEOUTS_MS = [8000, 14000, 20000];
let currentAttemptTimeout = ATTEMPT_TIMEOUTS_MS[0];

export function getCurrentAttemptTimeout() {
  return currentAttemptTimeout;
}

async function retry(fn) {
  const baseDelays = [600, 1500];
  let lastErr;
  for (let attempt = 0; attempt <= baseDelays.length; attempt++) {
    currentAttemptTimeout = ATTEMPT_TIMEOUTS_MS[attempt] ?? ATTEMPT_TIMEOUTS_MS.at(-1);
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      // Retry on 5xx (transient backend) and on token-invalidation (401/403)
      // since we want a fresh token + immediate re-attempt.
      if (!/50\d|timeout|GATEWAY|token invalidated|empty body|malformed body|client timeout/i.test(msg)) throw err;
      if (attempt < baseDelays.length) {
        const jitter = 0.5 + Math.random();
        await new Promise((r) => setTimeout(r, baseDelays[attempt] * jitter));
      }
    }
  }
  throw lastErr;
}

/**
 * Search TCAD by address (full-text fuzzy match).
 *
 * @param {string} query - Address text. Examples: "9501 San Lucas", "1234 Main St".
 * @param {object} [opts]
 * @param {number} [opts.year=2025] - Tax year. Defaults to current.
 * @param {number} [opts.limit=5] - Max results.
 * @returns {Promise<Array<object>>} Array of property records.
 */
export async function searchByAddress(query, opts = {}) {
  const { year = 2025, limit = 5 } = opts;

  if (!query || typeof query !== "string" || query.trim().length < 3) {
    throw new Error(
      "TCAD search requires an address string of at least 3 characters"
    );
  }

  // True Prodigy's `match` operator tokenizes but struggles with city/state/zip
  // tokens that aren't in TCAD's fullSitus column. Strip those to keep the
  // match focused on number + street.
  const cleaned = stripCityStateZip(query);

  return withSlot(() =>
    retry(async () => {
      const token = await getToken();

      const url = new URL(`${TP_BASE}/public/property/searchfulltext`);
      url.searchParams.set("page", "1");
      url.searchParams.set("pageSize", String(limit));

      // Escalating per-attempt deadline (8s / 14s / 20s). Fast-fails on
      // real outages, but patient enough for legitimately slow queries
      // (e.g. properties with long delinquent tax history take 11s+).
      const deadlineMs = getCurrentAttemptTimeout();
      const ac = new AbortController();
      const timeout = setTimeout(() => ac.abort(), deadlineMs);

      let res;
      try {
        res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: token },
          body: JSON.stringify({
            pYear: { operator: "=", value: String(year) },
            fullTextSearch: { operator: "match", value: cleaned },
          }),
          signal: ac.signal,
        });
      } catch (err) {
        if (err?.name === "AbortError") {
          throw new Error(`TCAD search failed: ${deadlineMs}ms client timeout (backend slow)`);
        }
        throw err;
      } finally {
        clearTimeout(timeout);
      }

      if (res.status === 401 || res.status === 403) {
        // Stale cached token. Invalidate and let retry() re-run with fresh.
        invalidateToken();
        throw new Error(`TCAD search failed: ${res.status} ${res.statusText} -- token invalidated`);
      }
      // 204 No Content = legitimate zero-results. NOT an error.
      if (res.status === 204) {
        return [];
      }
      if (!res.ok) {
        throw new Error(`TCAD search failed: ${res.status} ${res.statusText}`);
      }
      // 200 with empty / truncated body = backend timeout (rare). Retry.
      const text = await res.text();
      if (!text || text.trim().length === 0) {
        throw new Error("TCAD search failed: 200 empty body (backend timeout)");
      }
      let data;
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error("TCAD search failed: 200 malformed body (backend timeout)");
      }
      const rows = Array.isArray(data?.results) ? data.results : [];
      return rows.map(normalizeProperty);
    })
  );
}

function normalizeProperty(row) {
  return {
    property_id: row.pid ?? null,
    geo_id: row.geoID ?? null,
    owner: row.displayName ?? null,
    site_address: row.fullSitus ?? null,
    market_value: numOrNull(row.marketValue),
    appraised_value: numOrNull(row.appraisedValue),
    land_value: numOrNull(row.landValue),
    improvement_value: numOrNull(row.improvementValue),
    legal_description: row.legalDescription ?? null,
    legal_acreage: numOrNull(row.legalAcreage),
    property_type: row.propType ?? null,
    zoning: row.zoning ?? null,
    owner_mailing: {
      line: row.addrDeliveryLine ?? null,
      city: row.addrCity ?? null,
      state: row.addrState ?? null,
      zip: row.addrZip ?? null,
    },
    detail_url: row.pid
      ? `https://travis.prodigycad.com/property-detail/${row.pid}/${row.pYear ?? "2025"}`
      : null,
    source: "Travis Central Appraisal District (TCAD) via True Prodigy public API",
    source_url: "https://www.traviscad.org",
  };
}

function stripCityStateZip(query) {
  // Drop trailing ", City, ST 78XXX" / ", City, TX" / " City TX 78XXX" patterns.
  // Also drops a bare 5-digit zip suffix.
  let s = query.trim();
  // Cut at the first comma if anything looks like state/zip after it.
  const commaIdx = s.indexOf(",");
  if (commaIdx !== -1) {
    const tail = s.slice(commaIdx + 1).toUpperCase();
    if (/\b(TX|TEXAS)\b|\b\d{5}\b/.test(tail)) {
      s = s.slice(0, commaIdx);
    }
  }
  // Strip trailing zip / state without commas: "Lakeway TX 78734".
  s = s.replace(/\s+(TX|TEXAS)\s+\d{5}(-\d{4})?\s*$/i, "");
  s = s.replace(/\s+\d{5}(-\d{4})?\s*$/i, "");
  // Strip a trailing city name if it appears AFTER the street (best-effort).
  s = s.replace(
    /\s+(AUSTIN|LAKEWAY|BEE\s+CAVE|WEST\s*LAKE\s+HILLS|ROLLINGWOOD|MANOR|PFLUGERVILLE|DEL\s+VALLE|LAGO\s+VISTA|SUNSET\s+VALLEY|JONESTOWN|VOLENTE)\s*$/i,
    ""
  );
  return s.trim();
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
