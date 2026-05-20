import { z } from "zod";
import { sodaQuery, sodaTextLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Roadway Work Zones -- active road construction / closures.
 *
 * Dataset: qyfh-gwei on datahub.austintexas.gov.
 */
const DATASET = "qyfh-gwei";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinRoadwayWorkZones = {
  name: "austin_roadway_work_zones",
  description: withAttributionTag(
    "Search current and upcoming Austin roadway work zones / construction " +
      "closures. Returns event type, affected roads, direction, description, " +
      "and start/end dates. Useful for commute planning, event logistics, and " +
      "knowing what construction is happening near a property. Authoritative " +
      "source: City of Austin Transportation and Public Works Department."
  ),
  inputSchema: {
    road: z.string().min(2).optional().describe('Road / street name (fuzzy contains).'),
    event_type: z.string().min(2).optional().describe('Event type filter (e.g. "construction", "maintenance", "event").'),
    active_only: z.boolean().optional().describe('Only return work zones currently in their active window (default true).'),
    limit: z.number().int().min(1).max(100).default(25),
  },
  async handler({ road, event_type, active_only, limit } = {}) {
    const where = [];
    if (road) where.push(sodaTextLike("road_names", road));
    if (event_type) where.push(sodaTextLike("event_type", event_type));
    // Default to active-only unless caller explicitly passes false.
    const wantActive = active_only !== false;
    if (wantActive) {
      const now = new Date().toISOString();
      where.push(`start_date <= '${now}'`);
      where.push(`(end_date IS NULL OR end_date >= '${now}')`);
    }
    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      order: "start_date DESC",
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No work zones match those filters. ${ATTRIBUTION_TAG}` }] };
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
    id: r.id ?? null,
    event_type: r.event_type ?? null,
    road_names: r.road_names ?? null,
    direction: r.direction ?? null,
    description: r.description ?? null,
    start_date: r.start_date ? String(r.start_date).slice(0, 16).replace("T", " ") : null,
    end_date: r.end_date ? String(r.end_date).slice(0, 16).replace("T", " ") : null,
    source: "City of Austin Transportation and Public Works",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# Austin Roadway Work Zones — ${data.length} active`, ""];
  for (const r of data) {
    const head = `${r.event_type ?? "(work)"}  --  ${r.road_names ?? "(unknown road)"}`;
    lines.push(`## ${head}`);
    if (r.direction) lines.push(`- **Direction:** ${r.direction}`);
    if (r.start_date || r.end_date) lines.push(`- **Window:** ${r.start_date ?? "?"} → ${r.end_date ?? "?"}`);
    if (r.description) lines.push(`- ${String(r.description).slice(0, 300)}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: City of Austin Transportation (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
