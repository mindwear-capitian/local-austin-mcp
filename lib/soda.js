/**
 * Generic Socrata Open Data API (SODA) client.
 *
 * Used for all data.austintexas.gov datasets (permits, 311, crime, code
 * violations, restaurants, food trucks, etc.). Same client will work for
 * any Socrata-backed portal.
 *
 * Optional auth: an app token raises the rate limit ceiling. Anonymous
 * requests are throttled but workable for low traffic. Set
 * AUSTIN_SODA_APP_TOKEN in .env when you have one.
 */

import { retryFetch } from "./retry.js";
import { withLimit } from "./semaphore.js";

const DEFAULT_BASE = "https://data.austintexas.gov";

/**
 * Run a SODA $where / $q / $order query against a Socrata dataset.
 *
 * @param {string} resourceId  Dataset identifier (e.g. "3syk-w9eu" for permits).
 * @param {object} [params]    SODA query params. All are optional.
 * @param {string} [params.where]  $where clause (raw SoQL, e.g. "upper(field) like 'X%'")
 * @param {string} [params.q]      $q full-text search across all string fields
 * @param {string} [params.order]  $order clause (e.g. "issue_date DESC")
 * @param {number} [params.limit]  Max rows. Default 25, max 5000.
 * @param {number} [params.offset] Pagination offset. Default 0.
 * @param {string[]} [params.select] Field projection.
 * @param {string} [params.base]   Base URL. Defaults to data.austintexas.gov.
 * @returns {Promise<Array<object>>}
 */
export async function sodaQuery(resourceId, params = {}) {
  const {
    where,
    q,
    order,
    limit = 25,
    offset = 0,
    select,
    base = DEFAULT_BASE,
  } = params;

  if (!resourceId || !/^[a-z0-9]{4}-[a-z0-9]{4}$/i.test(resourceId)) {
    throw new Error(`SODA resourceId must look like "abcd-1234", got "${resourceId}"`);
  }

  const url = new URL(`/resource/${resourceId}.json`, base);
  if (where) url.searchParams.set("$where", where);
  if (q) url.searchParams.set("$q", q);
  if (order) url.searchParams.set("$order", order);
  if (limit !== undefined) url.searchParams.set("$limit", String(Math.min(Math.max(limit, 1), 5000)));
  if (offset !== undefined) url.searchParams.set("$offset", String(Math.max(offset, 0)));
  if (Array.isArray(select) && select.length > 0) {
    url.searchParams.set("$select", select.join(","));
  }

  const headers = { Accept: "application/json" };
  const token = process.env.AUSTIN_SODA_APP_TOKEN;
  if (token) headers["X-App-Token"] = token;

  const res = await withLimit("soda", () =>
    retryFetch(
      (signal) => fetch(url, { headers, signal }),
      {
        source: base.includes("datahub.austintexas.gov")
          ? "City of Austin data hub (Socrata)"
          : "City of Austin Open Data (Socrata)",
        profile: "soda",
        url: url.toString(),
      }
    )
  );

  if (!res.ok) {
    // Non-transient 4xx -- surface plainly. UpstreamError already thrown for 5xx.
    const body = await res.text().catch(() => "");
    throw new Error(
      `SODA query rejected: ${res.status} ${res.statusText} -- ${body.slice(0, 200)}`
    );
  }

  const data = await res.json();
  if (!Array.isArray(data)) {
    throw new Error("SODA response was not an array");
  }
  return data;
}

/**
 * Build a SoQL LIKE clause for an address-style contains-match. Escapes
 * single quotes to prevent injection.
 *
 * Example: sodaAddressLike("original_address1", "9501 San Lucas")
 *   -> "upper(original_address1) like '%9501 SAN LUCAS%'"
 */
export function sodaAddressLike(field, address) {
  return sodaTextLike(field, address, { errorLabel: "sodaAddressLike" });
}

/**
 * Generic case-insensitive contains-match. Used for free-text filters
 * (request_type, description, name, etc.) where the input is not an
 * address. Same escape semantics as sodaAddressLike.
 *
 * Example: sodaTextLike("sr_type_desc", "pothole")
 *   -> "upper(sr_type_desc) like '%POTHOLE%'"
 */
export function sodaTextLike(field, value, { errorLabel = "sodaTextLike" } = {}) {
  if (!field || value === undefined || value === null || value === "") {
    throw new Error(`${errorLabel} requires field and value`);
  }
  const safe = String(value).toUpperCase().replace(/'/g, "''").trim();
  return `upper(${field}) like '%${safe}%'`;
}

/**
 * Pagination helpers.
 *
 * Cursor is a base64url-encoded JSON object `{ offset: <number> }`. Opaque
 * to callers -- they pass it back in as `cursor` to advance. We hand out a
 * cursor only when there is more data; absence means "you've seen it all".
 */
export function encodeCursor(offset) {
  return Buffer.from(JSON.stringify({ offset }), "utf8").toString("base64url");
}

export function decodeCursor(cursor) {
  if (!cursor) return null;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    const offset = Number(parsed?.offset);
    if (!Number.isInteger(offset) || offset < 0) return null;
    return { offset };
  } catch (_) {
    return null;
  }
}

/**
 * Safe equality match -- escapes single quotes. Use for code/category fields
 * (council_district, status, fund, etc.) where the input must match exactly.
 *
 * Example: sodaTextEq("council_district", "1") -> "council_district = '1'"
 * Example: sodaTextEq("fy", 2025)              -> "fy = '2025'"
 */
export function sodaTextEq(field, value) {
  if (!field || value === undefined || value === null || value === "") {
    throw new Error("sodaTextEq requires field and value");
  }
  const safe = String(value).replace(/'/g, "''").trim();
  return `${field} = '${safe}'`;
}
