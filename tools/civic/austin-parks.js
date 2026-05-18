import { z } from "zod";
import { sodaQuery, sodaAddressLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * City of Austin Parks -- GIS boundaries dataset (v8hw-gz65). Includes
 * neighborhood parks, district parks, greenbelts, golf courses, and pools.
 *
 * Each row has address, park_type, development_status, council_district,
 * service_area, and the polygon geometry. We omit geometry from the public
 * response to keep payloads small.
 */
const DATASET = "v8hw-gz65";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinParks = {
  name: "austin_parks",
  description: withAttributionTag(
    "Search City of Austin parks by name, address, council district, or park type. " +
      "Returns name, address, park type (neighborhood / district / greenbelt / golf / pool / preserve), " +
      "council district, and development status. Useful for finding the parks near an address, " +
      "what kind of park-land is in a council district, or what city-managed open space is at a given location. " +
      "Authoritative source: City of Austin Parks and Recreation Department."
  ),
  inputSchema: {
    name: z.string().min(2).optional().describe('Park name (fuzzy contains).'),
    address: z.string().min(2).optional(),
    district: z.union([z.number().int().min(0).max(10), z.string()]).optional().describe('Council district 1-10.'),
    park_type: z
      .string()
      .min(2)
      .optional()
      .describe('Filter by type. Common values: "Neighborhood Park", "District Park", "Greenbelt", "Pool", "Preserve", "Special District".'),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async handler({ name, address, district, park_type, limit } = {}) {
    const where = [];
    if (name) {
      // Parks boundary dataset has no "park_name" column. Match against
      // street_name + address which encode the location label.
      const safe = name.toUpperCase().replace(/'/g, "''");
      where.push(`(upper(street_name) like '%${safe}%' OR upper(address) like '%${safe}%')`);
    }
    if (address) where.push(sodaAddressLike("address", address));
    if (district !== undefined && district !== null) {
      where.push(`council_district = '${String(district).replace(/'/g, "''")}'`);
    }
    if (park_type) {
      const safe = park_type.toUpperCase().replace(/'/g, "''");
      where.push(`upper(park_type) like '%${safe}%'`);
    }
    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      // Omit geometry. Caller doesn't need polygons for chat.
      select: [
        "address", "city_municipal", "street_name", "park_type",
        "development_status", "service_area", "council_district",
        "tpl_landuse", "acre_source",
      ],
      order: "address",
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No Austin parks match those filters. ${ATTRIBUTION_TAG}` }] };
    }
    const data = rows.map(normalize);
    return {
      content: [
        { type: "text", text: format(data) },
        { type: "text", text: JSON.stringify({ count: data.length, results: data }, null, 2) },
      ],
    };
  },
};

function normalize(r) {
  return {
    label: r.street_name ?? r.address ?? null,
    address: r.address ?? null,
    city: r.city_municipal ?? null,
    park_type: r.park_type ?? null,
    development_status: r.development_status ?? null,
    service_area: r.service_area ?? null,
    council_district: r.council_district ?? null,
    landuse: r.tpl_landuse ?? null,
    source: "City of Austin Parks and Recreation",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# Austin Parks — ${data.length} match${data.length === 1 ? "" : "es"}`, ""];
  for (const r of data) {
    lines.push(`## ${r.label ?? "(unlabeled park parcel)"}`);
    if (r.address) lines.push(`- **Address:** ${r.address}${r.city ? `, ${r.city}` : ""}`);
    if (r.park_type) lines.push(`- **Type:** ${r.park_type}`);
    if (r.council_district) lines.push(`- **Council District:** ${r.council_district}`);
    if (r.development_status) lines.push(`- **Status:** ${r.development_status}`);
    if (r.landuse) lines.push(`- **Land use:** ${r.landuse}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: City of Austin Parks (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
