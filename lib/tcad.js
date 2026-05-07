/**
 * Travis Central Appraisal District (TCAD) client via True Prodigy public API.
 *
 * Source: https://prod-container.trueprodigyapi.com (True Prodigy CAD Public)
 *
 * Tokens are public (anyone can request one) and expire in 5 minutes. We
 * fetch a fresh token per call to keep the implementation stateless. If
 * rate limits become an issue, add a 4-minute in-memory cache.
 */

const TP_BASE = "https://prod-container.trueprodigyapi.com";
const OFFICE = "Travis";

async function fetchToken() {
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

/**
 * True Prodigy gets flaky under load (502/504). Two retries with
 * exponential backoff (600ms, 1500ms) clears almost all transient
 * failures while keeping the worst-case latency under 5s.
 */
async function retry(fn) {
  const delays = [600, 1500];
  let lastErr;
  for (let attempt = 0; attempt <= delays.length; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      const msg = String(err?.message ?? err);
      if (!/50\d|timeout|GATEWAY/i.test(msg)) throw err;
      if (attempt < delays.length) {
        await new Promise((r) => setTimeout(r, delays[attempt]));
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

  return retry(async () => {
    const token = await fetchToken();

    const url = new URL(`${TP_BASE}/public/property/searchfulltext`);
    url.searchParams.set("page", "1");
    url.searchParams.set("pageSize", String(limit));

    const res = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: token },
      body: JSON.stringify({
        pYear: { operator: "=", value: String(year) },
        fullTextSearch: { operator: "match", value: cleaned },
      }),
    });

    if (!res.ok) {
      throw new Error(`TCAD search failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const rows = Array.isArray(data?.results) ? data.results : [];
    return rows.map(normalizeProperty);
  });
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
