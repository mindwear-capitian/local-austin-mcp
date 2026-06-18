/**
 * Water & sewer service-provider lookup by point (Travis County).
 *
 * Texas utilities hold a CCN (Certificate of Convenience and Necessity) issued
 * by the Public Utility Commission obligating them to serve every customer
 * inside a certificated boundary. Travis County re-hosts the PUC CCN polygons
 * as public, no-auth ArcGIS layers:
 *
 *   Layer 0 = PUC CCN - SEWER
 *   Layer 1 = PUC CCN - WATER
 *
 * A point-in-polygon query returns the obligated provider for an address --
 * the single hardest "who turns on my water" question for newcomers, since the
 * Austin metro is a patchwork of MUDs, WCIDs, the city, and private utilities.
 *
 * Public source, no credentials. Travis County only in v1.
 */

import { queryPointInPolygon } from "./arcgis.js";

const BASE =
  "https://gis.traviscountytx.gov/server1/rest/services/Services_and_Facilities/Water_Providers/MapServer";

export const WATER_LAYER = `${BASE}/1`;
export const SEWER_LAYER = `${BASE}/0`;
export const SOURCE_URL = `${BASE}`;

/**
 * Look up the water and sewer providers obligated to serve a point.
 *
 * @param {number} lng  Longitude (WGS-84 / EPSG:4326)
 * @param {number} lat  Latitude (WGS-84 / EPSG:4326)
 * @returns {Promise<{ water: Array<Provider>, sewer: Array<Provider> }>}
 *
 * @typedef {{ utility: string, ccn_no: string|null, county: string|null }} Provider
 */
export async function lookupUtilityProviders(lng, lat) {
  const fields = ["UTILITY", "CCN_NO", "COUNTY"];

  const [waterRows, sewerRows] = await Promise.all([
    queryPointInPolygon(WATER_LAYER, lng, lat, { outFields: fields }),
    queryPointInPolygon(SEWER_LAYER, lng, lat, { outFields: fields }),
  ]);

  return {
    water: waterRows.map(normalizeProvider),
    sewer: sewerRows.map(normalizeProvider),
  };
}

function normalizeProvider(attrs) {
  return {
    utility: cleanName(attrs.UTILITY),
    ccn_no: attrs.CCN_NO ?? null,
    county: attrs.COUNTY ?? null,
  };
}

function cleanName(name) {
  if (!name) return "Unknown";
  return String(name).trim().replace(/\s+/g, " ");
}
