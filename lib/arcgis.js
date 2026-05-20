/**
 * Generic ArcGIS REST FeatureServer / MapServer client.
 *
 * Many Texas county appraisal districts publish their parcel layers via
 * Esri ArcGIS Online. The endpoints are public, return JSON, and require
 * no auth. This module wraps the /query endpoint with sane defaults and
 * one transient-failure retry.
 *
 * ArcGIS REST query reference:
 *   https://developers.arcgis.com/rest/services-reference/query-feature-service-layer.htm
 */

import { currentSignal } from "./request-context.js";
import { withLimit } from "./semaphore.js";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/**
 * Query an ArcGIS FeatureServer / MapServer layer.
 *
 * @param {string} layerUrl - Full URL to the layer, e.g.
 *   "https://services1.arcgis.com/<id>/arcgis/rest/services/<svc>/FeatureServer/0"
 * @param {object} opts
 * @param {string} [opts.where="1=1"] - SQL WHERE clause. Use UPPER() for
 *   case-insensitive matches: "UPPER(SITEADDRESS) LIKE '%MAIN ST%'".
 * @param {string|string[]} [opts.outFields="*"] - Fields to return.
 * @param {number} [opts.resultRecordCount=10] - Max records.
 * @param {number} [opts.resultOffset] - Pagination offset.
 * @param {string} [opts.orderByFields] - SQL ORDER BY clause.
 * @param {boolean} [opts.returnGeometry=false] - Include polygon geometry.
 * @returns {Promise<Array<object>>} Array of attribute objects.
 */
export async function queryLayer(layerUrl, opts = {}) {
  const {
    where = "1=1",
    outFields = "*",
    resultRecordCount = 10,
    resultOffset,
    orderByFields,
    returnGeometry = false,
  } = opts;

  const params = new URLSearchParams({
    where,
    outFields: Array.isArray(outFields) ? outFields.join(",") : outFields,
    returnGeometry: String(returnGeometry),
    f: "json",
    resultRecordCount: String(resultRecordCount),
  });
  if (resultOffset !== undefined) {
    params.set("resultOffset", String(resultOffset));
  }
  if (orderByFields) {
    params.set("orderByFields", orderByFields);
  }

  const url = `${layerUrl.replace(/\/$/, "")}/query?${params.toString()}`;

  return withLimit("arcgis", () => retry(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: currentSignal(),
    });
    if (!res.ok) {
      throw new Error(`ArcGIS query failed: ${res.status} ${res.statusText} -- ${url}`);
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(
        `ArcGIS query error: ${data.error.code} ${data.error.message ?? ""}`
      );
    }
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.map((f) => f.attributes ?? {});
  }));
}

/**
 * Point-in-polygon spatial query against an ArcGIS FeatureServer layer.
 * Returns the attributes of every polygon feature that contains the point.
 *
 * @param {string} layerUrl  Full layer URL (FeatureServer/<n>).
 * @param {number} lng       Longitude (WGS-84 / EPSG:4326).
 * @param {number} lat       Latitude (WGS-84 / EPSG:4326).
 * @param {object} [opts]
 * @param {string|string[]} [opts.outFields="*"]
 * @returns {Promise<Array<object>>}
 */
export async function queryPointInPolygon(layerUrl, lng, lat, opts = {}) {
  const { outFields = "*" } = opts;
  if (typeof lng !== "number" || typeof lat !== "number") {
    throw new Error("queryPointInPolygon requires numeric lng + lat");
  }

  const params = new URLSearchParams({
    geometry: `${lng},${lat}`,
    geometryType: "esriGeometryPoint",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    where: "1=1",
    outFields: Array.isArray(outFields) ? outFields.join(",") : outFields,
    returnGeometry: "false",
    f: "json",
  });

  const url = `${layerUrl.replace(/\/$/, "")}/query?${params.toString()}`;

  return withLimit("arcgis", () => retry(async () => {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": UA,
        Accept: "application/json,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
      },
      signal: currentSignal(),
    });
    if (!res.ok) {
      throw new Error(
        `ArcGIS point query failed: ${res.status} ${res.statusText} -- ${url}`
      );
    }
    const data = await res.json();
    if (data?.error) {
      throw new Error(
        `ArcGIS point query error: ${data.error.code} ${data.error.message ?? ""}`
      );
    }
    const features = Array.isArray(data?.features) ? data.features : [];
    return features.map((f) => f.attributes ?? {});
  }));
}

/**
 * Build an ArcGIS-safe SQL LIKE clause for a column. Escapes single quotes
 * by doubling them (standard SQL) and wraps with `%`.
 *
 * @param {string} column - Column name (already in correct case).
 * @param {string} value - User-provided text. Will be uppercased.
 * @param {object} [opts]
 * @param {boolean} [opts.uppercase=true] - Wrap column in UPPER() for case-insensitive match.
 * @returns {string} A SQL fragment safe to use in a `where` clause.
 */
export function likeClause(column, value, opts = {}) {
  const { uppercase = true } = opts;
  const safe = String(value).replace(/'/g, "''").toUpperCase();
  return uppercase
    ? `UPPER(${column}) LIKE '%${safe}%'`
    : `${column} LIKE '%${safe}%'`;
}

/**
 * One retry on 5xx / network glitches with a 600ms delay.
 */
async function retry(fn) {
  try {
    return await fn();
  } catch (err) {
    const msg = String(err?.message ?? err);
    if (/50\d|timeout|GATEWAY|ENOTFOUND|ECONNRESET/i.test(msg)) {
      await new Promise((r) => setTimeout(r, 600));
      return await fn();
    }
    throw err;
  }
}
