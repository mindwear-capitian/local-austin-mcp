/**
 * Williamson Central Appraisal District (WCAD) client.
 *
 * Source: WCAD Tax Parcels FeatureServer (published by gisadmin_WCAD on
 * ArcGIS Online). Public, no auth, returns full parcel attributes incl.
 * owner, assessed/taxable values, year built, building area, YoY change.
 *
 * Layer fields (subset we expose):
 *   PARCELID, SITEADDRESS, OWNERNME1, OWNERNME2,
 *   PSTLADDRESS, PSTLCITY, PSTLSTATE, PSTLZIP5,
 *   USEDSCRP, CLASSDSCRP, RESYRBLT, BLDGAREA, RESFLRAREA,
 *   LNDVALUE, CNTASSDVAL, PRVASSDVAL, ASSDVALYRCG, ASSDPCNTCG,
 *   CNTTXBLVAL, PRVTXBLVAL, PRPRTYDSCRP, CNVYNAME
 */

import { queryLayer, likeClause } from "./arcgis.js";

const LAYER =
  "https://services1.arcgis.com/Xff0bbfp6vwIWmlU/arcgis/rest/services/WCAD_Tax_Parcels/FeatureServer/0";

const OUT_FIELDS = [
  "PARCELID",
  "SITEADDRESS",
  "OWNERNME1",
  "OWNERNME2",
  "PSTLADDRESS",
  "PSTLCITY",
  "PSTLSTATE",
  "PSTLZIP5",
  "USEDSCRP",
  "CLASSDSCRP",
  "RESYRBLT",
  "BLDGAREA",
  "RESFLRAREA",
  "LNDVALUE",
  "CNTASSDVAL",
  "PRVASSDVAL",
  "ASSDVALYRCG",
  "ASSDPCNTCG",
  "CNTTXBLVAL",
  "PRPRTYDSCRP",
  "CNVYNAME",
  "STATEDAREA",
  "CVTTXDSCRP",
];

/**
 * Search WCAD by site address (case-insensitive substring).
 *
 * @param {string} address - "1401 Sam Bass" or "1401 SAM BASS RD"
 * @param {object} [opts]
 * @param {number} [opts.limit=5]
 * @returns {Promise<Array<object>>} Normalized property records.
 */
export async function searchByAddress(address, opts = {}) {
  const { limit = 5 } = opts;
  if (!address || typeof address !== "string" || address.trim().length < 3) {
    throw new Error("WCAD search requires an address string of at least 3 characters");
  }

  // Use the leading number+street tokens for a tighter match. The full string
  // search struggles when the user includes city/zip suffixes that aren't in
  // SITEADDRESS verbatim.
  const trimmed = address.trim();
  const numberStreet = /^\s*(\d+)\s+(.+?)\s*$/.exec(trimmed);
  let where;
  if (numberStreet) {
    const num = numberStreet[1];
    const streetWord = numberStreet[2]
      .toUpperCase()
      .replace(/[,]+/g, " ")
      .replace(/\s+(DR|DRIVE|ST|STREET|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|LN|LANE|CT|COURT|PASS|HOLW|TRL|TRAIL|WAY|PL|PLACE|PKWY|HWY|CIR|CIRCLE|TER)\.?$/i, "")
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .join(" ");
    where = `${likeClause("SITEADDRESS", `${num} ${streetWord}`)}`;
  } else {
    where = likeClause("SITEADDRESS", trimmed);
  }

  const rows = await queryLayer(LAYER, {
    where,
    outFields: OUT_FIELDS,
    resultRecordCount: limit,
  });

  return rows.map(normalize);
}

/**
 * Fetch a single WCAD record by parcel ID.
 *
 * @param {string} parcelId - e.g. "R080284"
 */
export async function getByParcelId(parcelId) {
  if (!parcelId || typeof parcelId !== "string") {
    throw new Error("WCAD getByParcelId requires a parcel id string");
  }
  const safe = parcelId.replace(/'/g, "''").toUpperCase();
  const rows = await queryLayer(LAYER, {
    where: `UPPER(PARCELID) = '${safe}'`,
    outFields: OUT_FIELDS,
    resultRecordCount: 1,
  });
  return rows.length ? normalize(rows[0]) : null;
}

function normalize(row) {
  const owner = [row.OWNERNME1, row.OWNERNME2].filter(Boolean).join(" / ") || null;
  // WCAD's public GIS feed redacts all dollar-value fields (every record
  // returns 0 across CNTASSDVAL / LNDVALUE / etc.). Treat 0 as "not
  // published" so callers don't render misleading "$0" values. For real
  // assessed values in Williamson County, fall back to wcad.org's own
  // property search UI (linked via detail_url).
  return {
    property_id: row.PARCELID ?? null,
    geo_id: row.PARCELID ?? null,
    owner,
    site_address: row.SITEADDRESS ?? null,
    market_value: nonZeroOrNull(row.CNTASSDVAL),
    appraised_value: nonZeroOrNull(row.CNTASSDVAL),
    land_value: nonZeroOrNull(row.LNDVALUE),
    improvement_value: improvementValue(row),
    previous_assessed_value: nonZeroOrNull(row.PRVASSDVAL),
    yoy_change: numOrNull(row.ASSDVALYRCG),
    yoy_change_pct: numOrNull(row.ASSDPCNTCG),
    taxable_value: nonZeroOrNull(row.CNTTXBLVAL),
    legal_description: row.PRPRTYDSCRP ?? null,
    legal_acreage: parseAcreage(row.STATEDAREA),
    property_type: row.USEDSCRP ?? row.CLASSDSCRP ?? null,
    year_built: numOrNull(row.RESYRBLT),
    building_area_sqft: numOrNull(row.BLDGAREA),
    residential_floor_area_sqft: numOrNull(row.RESFLRAREA),
    subdivision: row.CNVYNAME ?? null,
    tax_district: row.CVTTXDSCRP ?? null,
    zoning: null,
    owner_mailing: {
      line: row.PSTLADDRESS ?? null,
      city: row.PSTLCITY ?? null,
      state: row.PSTLSTATE ?? null,
      zip: row.PSTLZIP5 ?? null,
    },
    detail_url: row.PARCELID
      ? `https://search.wcad.org/Property-Search/Property-Detail?PropertyID=${row.PARCELID}`
      : null,
    source: "Williamson Central Appraisal District (WCAD) via ArcGIS REST",
    source_url: "https://www.wcad.org",
  };
}

function improvementValue(row) {
  const total = nonZeroOrNull(row.CNTASSDVAL);
  const land = nonZeroOrNull(row.LNDVALUE);
  if (total === null || land === null) return null;
  const diff = total - land;
  return diff >= 0 ? diff : null;
}

function nonZeroOrNull(v) {
  const n = numOrNull(v);
  return n === null || n === 0 ? null : n;
}

function parseAcreage(stated) {
  if (!stated) return null;
  // STATEDAREA is a string like "0.2500 ACRES" or "1.234 ACRES"
  const m = /(\d+(?:\.\d+)?)\s*ACRE/i.exec(String(stated));
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
