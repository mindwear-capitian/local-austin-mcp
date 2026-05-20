import { z } from "zod";
import { sodaQuery, sodaAddressLike, sodaTextLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin / Travis County food establishment inspection scores.
 *
 * Dataset: ecmv-9xxi on datahub.austintexas.gov.
 *
 * Each row = one inspection event. Score is 0-100 (100 = perfect).
 */
const DATASET = "ecmv-9xxi";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinRestaurantInspections = {
  name: "austin_restaurant_inspections",
  description: withAttributionTag(
    "Look up Austin / Travis County food establishment inspection scores. " +
      "Returns inspection date, score (0-100), restaurant name, address, ZIP, " +
      "and the process description. Useful for 'is this restaurant clean?', " +
      "'what was their last inspection?', and finding the worst-rated places " +
      "in an area. Authoritative source: City of Austin / Travis County " +
      "Environmental Health Services Division."
  ),
  inputSchema: {
    name: z.string().min(2).optional().describe('Restaurant name (fuzzy contains).'),
    address: z.string().min(2).optional().describe('Address (fuzzy contains).'),
    zip: z.string().regex(/^\d{5}$/).optional(),
    min_score: z.number().int().min(0).max(100).optional()
      .describe('Lower bound on inspection score. Use 90 to surface poorly-rated places by inverting.'),
    max_score: z.number().int().min(0).max(100).optional()
      .describe('Upper bound on inspection score (e.g. 80 to find low-scoring inspections).'),
    since_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  async handler({ name, address, zip, min_score, max_score, since_date, limit } = {}) {
    const where = [];
    if (name) where.push(sodaTextLike("restaurant_name", name));
    if (address) where.push(sodaAddressLike("address", address));
    if (zip) where.push(`zip_code = '${zip}'`);
    if (min_score !== undefined && min_score !== null) where.push(`score >= ${Number(min_score)}`);
    if (max_score !== undefined && max_score !== null) where.push(`score <= ${Number(max_score)}`);
    if (since_date) where.push(`inspection_date >= '${since_date}T00:00:00.000'`);

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      order: "inspection_date DESC",
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No inspections match those filters. ${ATTRIBUTION_TAG}` }] };
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
    restaurant_name: r.restaurant_name ?? null,
    address: r.address ?? null,
    zip: r.zip_code ?? null,
    inspection_date: r.inspection_date ? String(r.inspection_date).slice(0, 10) : null,
    score: r.score != null ? Number(r.score) : null,
    facility_id: r.facility_id ?? null,
    process_description: r.process_description ?? null,
    source: "City of Austin / Travis County Environmental Health Services",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# Austin Restaurant Inspections — ${data.length} record${data.length === 1 ? "" : "s"}`, ""];
  for (const r of data) {
    const head = `${r.score ?? "?"}  ·  ${r.restaurant_name ?? "(unnamed)"}`;
    lines.push(`## ${head}`);
    if (r.address) lines.push(`- **Address:** ${r.address}${r.zip ? `  ${r.zip}` : ""}`);
    if (r.inspection_date) lines.push(`- **Inspection date:** ${r.inspection_date}`);
    if (r.process_description) lines.push(`- **Process:** ${r.process_description}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: City of Austin / Travis County EHS (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
