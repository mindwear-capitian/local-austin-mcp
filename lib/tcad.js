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
 * True Prodigy occasionally returns 502/504 under load. One retry with a
 * 600ms delay clears almost all transient failures.
 */
async function retry(fn) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/50\d|timeout|GATEWAY/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 600));
      return await fn();
    }
    throw err;
  }
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
        fullTextSearch: { operator: "match", value: query.trim() },
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

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
