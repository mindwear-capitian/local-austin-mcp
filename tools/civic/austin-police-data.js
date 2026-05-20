import { z } from "zod";
import { sodaQuery, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Unified APD reporting tool: arrests, use of force, dispatch incidents.
 *
 * Three datasets behind one tool. Caller picks via `type`:
 *   - "arrests"        -> 9tem-ywan  APD Arrests
 *   - "use_of_force"   -> pzd6-nzny  APD Use of Force
 *   - "dispatch"       -> 22de-7rzg  APD Computer Aided Dispatch Incidents
 *
 * Each dataset has a different schema. The tool normalizes the most useful
 * fields into a common shape so Claude can summarize across types uniformly.
 */
const BASE = "https://datahub.austintexas.gov";

const DATASETS = {
  arrests: {
    id: "9tem-ywan",
    label: "APD Arrests",
    date_field: "occurred_date",
    type_field: "arrest_charges",
    sector_field: "arrest_sector",
    normalize: (r) => ({
      kind: "arrest",
      case_number: r.case_report_number ?? null,
      date: dateOnly(r.occurred_date),
      arrest_type: r.arrest_type_description ?? null,
      charges: r.arrest_charges ?? null,
      sector: r.arrest_sector ?? null,
      warrant: yn(r.warrant_flag_y_n),
      cite_release: yn(r.cite_release_flag_y_n),
      subject_race: r.subject_race_ethnicity ?? null,
      subject_gender: r.subject_gender ?? null,
      census_block_group: r.census_block_group ?? null,
    }),
  },
  use_of_force: {
    id: "pzd6-nzny",
    label: "APD Use of Force",
    date_field: "occurred_date",
    type_field: "highest_force_level",
    sector_field: null,
    normalize: (r) => ({
      kind: "use_of_force",
      case_number: r.subject_case_number ?? null,
      date: dateOnly(r.occurred_date),
      highest_force_level: r.highest_force_level ?? null,
      highest_subject_resistance: r.highest_subject_resistance ?? null,
      highest_subject_injury: r.highest_subject_injury ?? null,
      arrested: yn(r.arrested),
      firearm: yn(r.firearm),
      impact_weapon: yn(r.impact_weapon),
      canine: yn(r.canine),
      taser: yn(r.taser),
      chemical_agent: yn(r.chemical_agent),
    }),
  },
  dispatch: {
    id: "22de-7rzg",
    label: "APD CAD Dispatch",
    date_field: "response_datetime",
    type_field: "incident_type",
    sector_field: "sector",
    normalize: (r) => ({
      kind: "dispatch",
      incident_number: r.incident_number ?? null,
      date: dateOnly(r.response_datetime),
      incident_type: r.incident_type ?? null,
      priority: r.priority_level ?? null,
      mental_health_flag: yn(r.mental_health_flag),
      council_district: r.council_district ?? null,
      sector: r.sector ?? null,
      problem_description: r.initial_problem_description ?? null,
      problem_category: r.initial_problem_category ?? null,
    }),
  },
};

function dateOnly(s) {
  return s ? String(s).slice(0, 10) : null;
}
function yn(s) {
  if (s === undefined || s === null) return null;
  const v = String(s).trim().toUpperCase();
  if (v === "Y" || v === "YES" || v === "1" || v === "TRUE") return true;
  if (v === "N" || v === "NO" || v === "0" || v === "FALSE") return false;
  return null;
}

export const austinPoliceData = {
  name: "austin_police_data",
  description: withAttributionTag(
    "Search Austin Police Department reporting datasets. Pick one type per call: " +
      "`arrests` (charges, dates, sector, demographics), `use_of_force` (force level, " +
      "resistance, injury, weapons used), or `dispatch` (911/CAD incidents with " +
      "council district, priority, problem category). Filter by date range, " +
      "incident/charge type keyword, council district, or sector. Companion to " +
      "`austin_crime` (which covers crime *reports*) and `austin_afd_incidents` " +
      "(fire/EMS dispatches). Authoritative source: City of Austin / APD."
  ),
  inputSchema: {
    type: z
      .enum(["arrests", "use_of_force", "dispatch"])
      .describe('Which APD dataset to query.'),
    search: z
      .string()
      .min(2)
      .optional()
      .describe('Free-text keyword (matches charge/incident type/problem description, dataset-dependent).'),
    council_district: z
      .union([z.number().int().min(0).max(10), z.string()])
      .optional()
      .describe('Filter by council district (dispatch dataset only).'),
    sector: z
      .string()
      .min(2)
      .optional()
      .describe('Filter by APD sector code (arrests + dispatch).'),
    since_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('ISO date (YYYY-MM-DD). Only return records on or after.'),
    until_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('ISO date (YYYY-MM-DD). Only return records on or before.'),
    limit: z.number().int().min(1).max(100).default(25),
  },
  async handler({ type, search, council_district, sector, since_date, until_date, limit } = {}) {
    const ds = DATASETS[type];
    if (!ds) {
      return {
        content: [{ type: "text", text: `Unknown type "${type}". Use arrests, use_of_force, or dispatch. ${ATTRIBUTION_TAG}` }],
        isError: true,
      };
    }
    const where = [];
    if (since_date) where.push(`${ds.date_field} >= '${since_date}T00:00:00.000'`);
    if (until_date) where.push(`${ds.date_field} <= '${until_date}T23:59:59.999'`);
    if (council_district !== undefined && council_district !== null && type === "dispatch") {
      where.push(sodaTextEq("council_district", council_district));
    }
    if (sector && ds.sector_field) {
      where.push(sodaTextEq(`upper(${ds.sector_field})`, String(sector).toUpperCase()));
    }
    const queryParams = {
      base: BASE,
      order: `${ds.date_field} DESC`,
      limit: limit ?? 25,
    };
    if (where.length) queryParams.where = where.join(" AND ");
    if (search) queryParams.q = search;

    const rows = await sodaQuery(ds.id, queryParams);
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No ${ds.label} records match those filters. ${ATTRIBUTION_TAG}` }] };
    }
    const data = rows.map((r) => ({
      ...ds.normalize(r),
      source: ds.label,
      source_url: `${BASE}/d/${ds.id}`,
    }));
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
    const head = `${r.date ?? "(no date)"}`;
    lines.push(`## ${head}`);
    if (type === "arrests") {
      if (r.arrest_type) lines.push(`- **Type:** ${r.arrest_type}`);
      if (r.charges) lines.push(`- **Charges:** ${String(r.charges).slice(0, 200)}`);
      if (r.sector) lines.push(`- **Sector:** ${r.sector}`);
      const flags = [];
      if (r.warrant === true) flags.push("warrant");
      if (r.cite_release === true) flags.push("cite + release");
      if (flags.length) lines.push(`- **Flags:** ${flags.join(", ")}`);
    } else if (type === "use_of_force") {
      if (r.highest_force_level) lines.push(`- **Force level:** ${r.highest_force_level}`);
      if (r.highest_subject_resistance) lines.push(`- **Resistance:** ${r.highest_subject_resistance}`);
      if (r.highest_subject_injury) lines.push(`- **Injury:** ${r.highest_subject_injury}`);
      const weapons = [];
      if (r.firearm) weapons.push("firearm");
      if (r.impact_weapon) weapons.push("impact weapon");
      if (r.canine) weapons.push("canine");
      if (r.taser) weapons.push("taser");
      if (r.chemical_agent) weapons.push("chemical agent");
      if (weapons.length) lines.push(`- **Weapons used:** ${weapons.join(", ")}`);
    } else if (type === "dispatch") {
      if (r.incident_type) lines.push(`- **Incident type:** ${r.incident_type}`);
      if (r.problem_description) lines.push(`- **Problem:** ${r.problem_description}`);
      if (r.priority) lines.push(`- **Priority:** ${r.priority}`);
      if (r.council_district) lines.push(`- **Council District:** ${r.council_district}`);
      if (r.sector) lines.push(`- **Sector:** ${r.sector}`);
      if (r.mental_health_flag === true) lines.push(`- **Flagged mental health**`);
    }
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: ${label} (City of Austin / APD)`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
