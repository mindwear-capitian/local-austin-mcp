import { z } from "zod";
import { sodaQuery, sodaAddressLike, sodaTextLike, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Animal Center -- intakes (pets coming in) and outcomes (pets going out).
 *
 * Datasets: pyqf-r2dc (intakes), gsvs-ypi7 (outcomes), both on datahub.austintexas.gov.
 */
const BASE = "https://datahub.austintexas.gov";
const DATASETS = {
  intakes: {
    id: "pyqf-r2dc",
    label: "Austin Animal Center Intakes",
    date_field: "source_date",
    normalize: (r) => ({
      kind: "intake",
      date: r.source_date ? String(r.source_date).slice(0, 10) : null,
      animal_id: r.animal_id ?? null,
      type: r.type ?? null,
      name_at_intake: r.name_at_intake ?? null,
      primary_breed: r.primary_breed ?? null,
      primary_color: r.primary_color ?? null,
      sex: r.sex ?? null,
      intake_health_condition: r.intake_health_condition ?? null,
      date_of_birth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
      found_address: r.found_address ?? null,
      source_name: r.source_name ?? null,
    }),
  },
  outcomes: {
    id: "gsvs-ypi7",
    label: "Austin Animal Center Outcomes",
    date_field: "outcome_date",
    normalize: (r) => ({
      kind: "outcome",
      date: r.outcome_date ? String(r.outcome_date).slice(0, 10) : null,
      animal_id: r.animal_id ?? null,
      type: r.type ?? r.animal_type ?? null,
      name: r.name ?? null,
      primary_breed: r.primary_breed ?? null,
      primary_color: r.primary_color ?? null,
      sex: r.sex ?? null,
      outcome_type: r.outcome_type ?? null,
      outcome_subtype: r.outcome_subtype ?? null,
      date_of_birth: r.date_of_birth ? String(r.date_of_birth).slice(0, 10) : null,
    }),
  },
};

export const austinAnimalCenter = {
  name: "austin_animal_center",
  description: withAttributionTag(
    "Search Austin Animal Center records. Pick `type=intakes` (pets brought " +
      "in, with found-address and breed) or `type=outcomes` (pets adopted / " +
      "returned / transferred / euthanized). Useful for lost-pet searches " +
      "('was a calico cat found near my address?'), adoption availability " +
      "research, and shelter operations reporting. Authoritative source: " +
      "Austin Animal Center."
  ),
  inputSchema: {
    type: z.enum(["intakes", "outcomes"]).describe('Which dataset to query.'),
    animal_type: z
      .string()
      .min(2)
      .optional()
      .describe('Filter by species (e.g. "Dog", "Cat", "Bird", "Other").'),
    breed: z.string().min(2).optional().describe('Breed fuzzy contains.'),
    address: z.string().min(2).optional().describe('Found-address fuzzy contains (intakes only).'),
    outcome_type: z
      .string()
      .min(2)
      .optional()
      .describe('Outcome type filter (outcomes only). Example: "Adoption", "Return to Owner", "Transfer".'),
    since_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    limit: z.number().int().min(1).max(100).default(25),
  },
  async handler({ type, animal_type, breed, address, outcome_type, since_date, limit } = {}) {
    const ds = DATASETS[type];
    if (!ds) {
      return {
        content: [{ type: "text", text: `Unknown type "${type}". Use intakes or outcomes. ${ATTRIBUTION_TAG}` }],
        isError: true,
      };
    }
    const where = [];
    if (animal_type) {
      where.push(sodaTextEq("upper(type)", String(animal_type).toUpperCase()));
    }
    if (breed) where.push(sodaTextLike("primary_breed", breed));
    if (address && type === "intakes") where.push(sodaAddressLike("found_address", address));
    if (outcome_type && type === "outcomes") {
      where.push(sodaTextEq("upper(outcome_type)", String(outcome_type).toUpperCase()));
    }
    if (since_date) where.push(`${ds.date_field} >= '${since_date}T00:00:00.000'`);

    const rows = await sodaQuery(ds.id, {
      base: BASE,
      where: where.length ? where.join(" AND ") : undefined,
      order: `${ds.date_field} DESC`,
      limit: limit ?? 25,
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No ${ds.label} records match those filters. ${ATTRIBUTION_TAG}` }] };
    }
    const data = rows.map((r) => ({ ...ds.normalize(r), source: ds.label, source_url: `${BASE}/d/${ds.id}` }));
    return {
      content: [
        { type: "text", text: format({ type, label: ds.label, data }) },
        { type: "text", text: JSON.stringify({ type, label: ds.label, count: data.length, results: data }, null, 2) },
      ],
    };
  },
};

function format({ type, label, data }) {
  const lines = [`# ${label} — ${data.length} record${data.length === 1 ? "" : "s"}`, ""];
  for (const r of data) {
    lines.push(`## ${r.date ?? "(no date)"} — ${r.type ?? "?"} ${r.primary_breed ?? ""}`.trim());
    if (r.name_at_intake) lines.push(`- **Name at intake:** ${r.name_at_intake}`);
    if (r.name) lines.push(`- **Name:** ${r.name}`);
    if (r.primary_color) lines.push(`- **Color:** ${r.primary_color}`);
    if (r.sex) lines.push(`- **Sex:** ${r.sex}`);
    if (type === "intakes") {
      if (r.found_address) lines.push(`- **Found at:** ${r.found_address}`);
      if (r.intake_health_condition) lines.push(`- **Health:** ${r.intake_health_condition}`);
    } else {
      if (r.outcome_type) lines.push(`- **Outcome:** ${r.outcome_type}${r.outcome_subtype ? ` (${r.outcome_subtype})` : ""}`);
    }
    if (r.date_of_birth) lines.push(`- **DOB:** ${r.date_of_birth}`);
    if (r.animal_id) lines.push(`- **Animal ID:** ${r.animal_id}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: ${label}`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
