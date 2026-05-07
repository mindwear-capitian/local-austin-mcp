/**
 * Hays Central Appraisal District (HaysCAD) client.
 *
 * Source: HaysCAD Web Service published on Esri ArcGIS Online by BIS
 * Consultants (HaysCAD's GIS vendor). Public, no auth.
 *
 * Layer 0 = Parcels (the one we use for property lookup).
 * Other layers (subdivisions, school districts, city limits, etc.) can be
 * joined client-side later if needed.
 */

import { queryLayer, likeClause } from "./arcgis.js";

const LAYER =
  "https://services6.arcgis.com/j94FvPaik4etwHFk/arcgis/rest/services/HaysCADWebService1/FeatureServer/0";

const OUT_FIELDS = [
  "prop_id",
  "prop_id_text",
  "geo_id",
  "owner_tax_yr",
  "file_as_name",
  "legal_acreage",
  "school",
  "city",
  "county",
  "legal_desc",
  "legal_desc2",
  "land_val",
  "imprv_val",
  "market",
  "block",
  "situs_num",
  "situs_street_prefx",
  "situs_street",
  "situs_street_sufix",
  "situs_city",
  "situs_state",
  "situs_zip",
  "addr_line1",
  "addr_line2",
  "addr_line3",
  "addr_city",
  "addr_state",
  "zip",
  "Deed_Date",
  "Volume",
  "Page",
  "abs_subdv_cd",
];

/**
 * Search Hays CAD by site address (case-insensitive substring on the
 * combined situs_num + situs_street fields).
 */
export async function searchByAddress(address, opts = {}) {
  const { limit = 5 } = opts;
  if (!address || typeof address !== "string" || address.trim().length < 3) {
    throw new Error("HCAD search requires an address string of at least 3 characters");
  }

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
    where = `situs_num = '${num}' AND ${likeClause("situs_street", streetWord)}`;
  } else {
    where = likeClause("situs_street", trimmed);
  }

  const rows = await queryLayer(LAYER, {
    where,
    outFields: OUT_FIELDS,
    resultRecordCount: limit,
  });

  return rows.map(normalize);
}

/**
 * Fetch a single HCAD record by prop_id (numeric).
 */
export async function getByPropId(propId) {
  const num = Number(propId);
  if (!Number.isFinite(num)) {
    throw new Error("HCAD getByPropId requires a numeric prop_id");
  }
  const rows = await queryLayer(LAYER, {
    where: `prop_id = ${num}`,
    outFields: OUT_FIELDS,
    resultRecordCount: 1,
  });
  return rows.length ? normalize(rows[0]) : null;
}

function normalize(row) {
  const situsParts = [
    row.situs_num,
    row.situs_street_prefx,
    row.situs_street,
    row.situs_street_sufix,
  ]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean);
  const situsStreet = situsParts.join(" ").trim() || null;
  const cityZip = [row.situs_city, row.situs_state, row.situs_zip]
    .filter(Boolean)
    .join(", ");
  const fullSitus = [situsStreet, cityZip].filter(Boolean).join(", ") || null;

  const land = numOrNull(row.land_val);
  const imprv = numOrNull(row.imprv_val);
  const market = numOrNull(row.market) ?? sumOrNull(land, imprv);

  const mailingLine = [row.addr_line1, row.addr_line2, row.addr_line3]
    .filter(Boolean)
    .map((s) => String(s).trim())
    .filter(Boolean)
    .join(", ") || null;

  return {
    property_id: row.prop_id_text ?? (row.prop_id != null ? String(row.prop_id) : null),
    geo_id: row.geo_id ?? null,
    owner: row.file_as_name ?? null,
    site_address: fullSitus,
    market_value: market,
    appraised_value: market,
    land_value: land,
    improvement_value: imprv,
    legal_description: [row.legal_desc, row.legal_desc2].filter(Boolean).join(" ") || null,
    legal_acreage: numOrNull(row.legal_acreage),
    property_type: null,
    school_district: row.school ?? null,
    city: row.city ?? row.situs_city ?? null,
    subdivision: row.abs_subdv_cd ?? null,
    last_deed_date: row.Deed_Date ?? null,
    deed_volume: row.Volume ?? null,
    deed_page: row.Page ?? null,
    owner_mailing: {
      line: mailingLine,
      city: row.addr_city ?? null,
      state: row.addr_state ?? null,
      zip: row.zip ?? null,
    },
    detail_url: row.prop_id
      ? `https://propaccess.trueautomation.com/clientdb/Property.aspx?cid=119&prop_id=${row.prop_id}`
      : null,
    source: "Hays Central Appraisal District (HCAD) via ArcGIS REST",
    source_url: "https://www.hayscad.com",
  };
}

function sumOrNull(a, b) {
  if (a === null && b === null) return null;
  return (a ?? 0) + (b ?? 0);
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}
