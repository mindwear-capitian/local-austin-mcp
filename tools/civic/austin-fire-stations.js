import { z } from "zod";
import { sodaQuery, sodaAddressLike, sodaTextLike, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Fire Department station locations -- directory.
 *
 * Dataset: i8r8-6nhk on datahub.austintexas.gov.
 */
const DATASET = "i8r8-6nhk";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinFireStations = {
  name: "austin_fire_stations",
  description: withAttributionTag(
    "List Austin / Travis County fire stations. Search by station number, name, " +
      "address, or jurisdiction. Returns station number, address, name, facility " +
      "type, status, and department (AFD vs Travis County ESD). Useful for finding " +
      "the nearest fire station to a property -- relevant to insurance underwriting, " +
      "ISO rating context, and emergency response planning."
  ),
  inputSchema: {
    station_number: z.union([z.number().int(), z.string()]).optional().describe('AFD station number (e.g. 22).'),
    name: z.string().min(2).optional().describe('Station name (fuzzy).'),
    address: z.string().min(2).optional().describe('Address (fuzzy contains).'),
    jurisdiction: z.string().min(2).optional().describe('Filter by jurisdiction (e.g. "AFD", "Travis County ESD 4").'),
    limit: z.number().int().min(1).max(50).default(25),
  },
  async handler({ station_number, name, address, jurisdiction, limit } = {}) {
    const where = [];
    if (station_number !== undefined && station_number !== null) {
      where.push(sodaTextEq("station_number", station_number));
    }
    if (name) where.push(sodaTextLike("name", name));
    if (address) where.push(sodaAddressLike("address", address));
    if (jurisdiction) where.push(sodaTextLike("jurisdiction", jurisdiction));
    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      select: [
        "firestations_id", "address", "name", "facility", "station_number",
        "type", "status", "department", "jurisdiction",
        "x_coordinate", "y_coordinate",
      ],
      order: "station_number",
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No fire stations match those filters. ${ATTRIBUTION_TAG}` }] };
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
    station_number: r.station_number ?? null,
    name: r.name ?? null,
    address: r.address ?? null,
    facility: r.facility ?? null,
    type: r.type ?? null,
    status: r.status ?? null,
    department: r.department ?? null,
    jurisdiction: r.jurisdiction ?? null,
    latitude: r.y_coordinate ? Number(r.y_coordinate) : null,
    longitude: r.x_coordinate ? Number(r.x_coordinate) : null,
    source: "City of Austin / Travis County Fire Stations",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# Austin / Travis Fire Stations — ${data.length} result${data.length === 1 ? "" : "s"}`, ""];
  for (const r of data) {
    const head = `Station ${r.station_number ?? "?"}${r.name ? ` — ${r.name}` : ""}`;
    lines.push(`## ${head}`);
    if (r.address) lines.push(`- **Address:** ${r.address}`);
    if (r.department) lines.push(`- **Department:** ${r.department}`);
    if (r.jurisdiction) lines.push(`- **Jurisdiction:** ${r.jurisdiction}`);
    if (r.facility) lines.push(`- **Facility:** ${r.facility}`);
    if (r.status) lines.push(`- **Status:** ${r.status}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: City of Austin Fire Stations (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
