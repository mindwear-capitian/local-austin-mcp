import { z } from "zod";
import { sodaQuery, sodaAddressLike, sodaTextLike, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Public Library locations -- branch directory.
 *
 * Dataset: tc36-hn4j on datahub.austintexas.gov.
 */
const DATASET = "tc36-hn4j";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinLibraries = {
  name: "austin_libraries",
  description: withAttributionTag(
    "List Austin Public Library branches. Search by branch name, address, or " +
      "council district. Returns branch name, address, phone, council district, " +
      "and amenity flags (wi-fi, computers, training rooms). Useful for finding " +
      "the nearest library to an address. Authoritative source: City of Austin " +
      "Library Department."
  ),
  inputSchema: {
    name: z
      .string()
      .min(2)
      .optional()
      .describe('Branch name fuzzy match. Example: "central", "carver", "manchaca road".'),
    address: z
      .string()
      .min(2)
      .optional()
      .describe('Address fuzzy match.'),
    district: z
      .union([z.number().int().min(0).max(10), z.string()])
      .optional()
      .describe('Council district 1-10.'),
    limit: z.number().int().min(1).max(50).default(25),
  },
  async handler({ name, address, district, limit } = {}) {
    const where = [];
    if (name) where.push(sodaTextLike("name", name));
    if (address) where.push(sodaAddressLike("address", address));
    if (district !== undefined && district !== null) {
      where.push(sodaTextEq("district", district));
    }
    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      order: "name",
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return {
        content: [{ type: "text", text: `No Austin libraries match those filters. ${ATTRIBUTION_TAG}` }],
      };
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
    name: r.name ?? null,
    address: r.address ?? null,
    phone: r.phone ?? null,
    district: r.district ?? null,
    wifi: r.wifi ?? null,
    computers: r.computers ?? null,
    training: r.training ?? null,
    source: "City of Austin Public Library",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# Austin Public Library — ${data.length} branch${data.length === 1 ? "" : "es"}`, ""];
  for (const r of data) {
    lines.push(`## ${r.name ?? "(unnamed)"}`);
    if (r.address) lines.push(`- **Address:** ${r.address}`);
    if (r.phone) lines.push(`- **Phone:** ${r.phone}`);
    if (r.district) lines.push(`- **Council District:** ${r.district}`);
    const amen = [];
    if (r.wifi) amen.push(`wifi: ${r.wifi}`);
    if (r.computers) amen.push(`computers: ${r.computers}`);
    if (r.training) amen.push(`training: ${r.training}`);
    if (amen.length) lines.push(`- ${amen.join("  ·  ")}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: City of Austin Public Library (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
