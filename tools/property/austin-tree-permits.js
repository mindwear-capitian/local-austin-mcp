import { z } from "zod";
import { sodaQuery, sodaAddressLike, sodaTextLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Issued Tree Permits -- tree removal / pruning permits.
 *
 * Dataset: ac2h-ha3r on datahub.austintexas.gov.
 */
const DATASET = "ac2h-ha3r";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinTreePermits = {
  name: "austin_tree_permits",
  description: withAttributionTag(
    "Look up City of Austin issued tree permits at a given address. Permits " +
      "are required for removal or critical-root-zone work on regulated trees " +
      "(19\" diameter+) and heritage trees (24\" of certain species). Returns " +
      "permit class, issue date, status, and flags for heritage / public / " +
      "removal / root encroachment. Useful for pre-listing prep, " +
      "buyer due-diligence ('what trees were removed from this property?'), " +
      "and code-compliance research. Authoritative source: City of Austin " +
      "Development Services Department."
  ),
  inputSchema: {
    address: z.string().min(2).optional().describe('Address (fuzzy contains). Example: "9501 San Lucas".'),
    permit_class: z.string().min(2).optional().describe('Permit class filter (e.g. "Regulated", "Heritage").'),
    permit_status: z.string().min(2).optional().describe('Status filter (e.g. "Final", "Active", "Withdrawn").'),
    heritage_only: z.boolean().optional().describe('Only heritage-tree permits.'),
    since_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  async handler({ address, permit_class, permit_status, heritage_only, since_date, limit } = {}) {
    const where = [];
    if (address) where.push(sodaAddressLike("permit_address", address));
    if (permit_class) where.push(sodaTextLike("permit_class", permit_class));
    if (permit_status) where.push(sodaTextLike("permit_status", permit_status));
    if (heritage_only) where.push(`upper(heritage_tree) = 'YES'`);
    if (since_date) where.push(`issued_date >= '${since_date}T00:00:00.000'`);

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      order: "issued_date DESC",
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No tree permits match those filters. ${ATTRIBUTION_TAG}` }] };
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
    permit_number: r.permit_number ?? null,
    address: r.permit_address ?? null,
    permit_class: r.permit_class ?? null,
    application_type: r.application_type ?? null,
    permit_status: r.permit_status ?? null,
    issued_date: r.issued_date ? String(r.issued_date).slice(0, 10) : null,
    expires_date: r.expires_date ? String(r.expires_date).slice(0, 10) : null,
    heritage_tree: r.heritage_tree ?? null,
    public_tree: r.public_tree ?? null,
    removal_of_regulated_tree: r.removal_of_regulated_tree ?? null,
    encroachment_of_root_zone: r.encroachment_of_root_zone ?? null,
    source: "City of Austin Development Services -- Tree Permits",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# Austin Tree Permits — ${data.length} record${data.length === 1 ? "" : "s"}`, ""];
  for (const r of data) {
    lines.push(`## ${r.permit_number ?? "(no number)"}  --  ${r.issued_date ?? "(no date)"}`);
    if (r.address) lines.push(`- **Address:** ${r.address}`);
    if (r.permit_class) lines.push(`- **Class:** ${r.permit_class}`);
    if (r.application_type) lines.push(`- **Application:** ${r.application_type}`);
    if (r.permit_status) lines.push(`- **Status:** ${r.permit_status}`);
    const flags = [];
    if (yes(r.heritage_tree)) flags.push("heritage tree");
    if (yes(r.public_tree)) flags.push("public tree");
    if (yes(r.removal_of_regulated_tree)) flags.push("regulated removal");
    if (yes(r.encroachment_of_root_zone)) flags.push("root zone encroachment");
    if (flags.length) lines.push(`- **Flags:** ${flags.join(", ")}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: City of Austin Tree Permits (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function yes(v) {
  return v && String(v).trim().toUpperCase() === "YES";
}
