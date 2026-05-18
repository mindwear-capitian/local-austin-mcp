import { z } from "zod";
import { queryLayer, likeClause } from "../../lib/arcgis.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * TxDOT roadway construction + maintenance projects.
 *
 * Statewide ArcGIS FeatureServer; we filter to the Austin TxDOT district
 * by default (DISTRICT_NUMBER = 14) but accept overrides.
 */
const LAYER =
  "https://services.arcgis.com/KTcxiTD9dsQw4r7Z/arcgis/rest/services/TxDOT_Projects/FeatureServer/0";
const SOURCE_URL = "https://gis-txdot.opendata.arcgis.com/datasets/txdot-projects/";

// TxDOT district numbers for the Austin metro: Austin = 14. Travis is in 14,
// Williamson + Hays + Bastrop are also in 14, Burnet/Blanco/Caldwell partially.
const DEFAULT_DISTRICT = 14;

export const austinTxdotProjects = {
  name: "austin_txdot_projects",
  description: withAttributionTag(
    "Search TxDOT roadway construction + maintenance projects in the Austin " +
      "district. Returns project class, type of work, highway, project limits " +
      "(from / to), district + county, and letting date. Useful for tracking " +
      "MoPac / I-35 / SH-130 work, commute impact planning, and property " +
      "due-diligence on parcels near planned highway expansion. Authoritative " +
      "source: Texas Department of Transportation (TxDOT)."
  ),
  inputSchema: {
    highway: z.string().min(1).max(20).optional().describe('Highway number filter (e.g. "35", "MOPAC", "183").'),
    county: z.string().min(2).optional().describe('Filter by county name (e.g. "TRAVIS", "WILLIAMSON", "HAYS").'),
    work_type: z.string().min(2).optional().describe('Type-of-work fuzzy match (e.g. "BRIDGE", "MILL", "OVERLAY", "SIGNAL").'),
    district: z.number().int().min(1).max(25).optional().describe('TxDOT district number. Defaults to 14 (Austin).'),
    limit: z.number().int().min(1).max(50).optional(),
  },
  async handler({ highway, county, work_type, district, limit } = {}) {
    const conds = [`DISTRICT_NUMBER = ${district ?? DEFAULT_DISTRICT}`];
    if (highway) conds.push(likeClause("HIGHWAY_NUMBER", highway));
    if (county) conds.push(likeClause("COUNTY_NAME", county));
    if (work_type) conds.push(likeClause("TYPE_OF_WORK", work_type));

    const rows = await queryLayer(LAYER, {
      where: conds.join(" AND "),
      outFields: [
        "CONTROL_SECT_JOB", "DISTRICT_NUMBER", "DISTRICT_NAME",
        "COUNTY_NAME", "HIGHWAY_NUMBER", "PROJ_CLASS", "TYPE_OF_WORK",
        "LIMITS_FROM", "LIMITS_TO", "BEG_MILE_POINT", "END_MILE_POINT",
        "DIST_LET_DATE", "ACTUAL_LET_DATE", "PROJ_LENGTH",
      ],
      resultRecordCount: limit ?? 25,
      orderByFields: "DIST_LET_DATE DESC",
    });
    if (rows.length === 0) {
      return { content: [{ type: "text", text: `No TxDOT projects match those filters. ${ATTRIBUTION_TAG}` }] };
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
    csj: r.CONTROL_SECT_JOB ?? null,
    district: r.DISTRICT_NUMBER ?? null,
    district_name: r.DISTRICT_NAME ?? null,
    county: r.COUNTY_NAME ?? null,
    highway: r.HIGHWAY_NUMBER ?? null,
    project_class: r.PROJ_CLASS ?? null,
    work_type: r.TYPE_OF_WORK ?? null,
    limits_from: r.LIMITS_FROM ?? null,
    limits_to: r.LIMITS_TO ?? null,
    begin_milepost: r.BEG_MILE_POINT ?? null,
    end_milepost: r.END_MILE_POINT ?? null,
    length_miles: r.PROJ_LENGTH ?? null,
    district_let_date: r.DIST_LET_DATE ? new Date(r.DIST_LET_DATE).toISOString().slice(0, 10) : null,
    actual_let_date: r.ACTUAL_LET_DATE ? new Date(r.ACTUAL_LET_DATE).toISOString().slice(0, 10) : null,
    source: "Texas Department of Transportation -- TxDOT Projects",
    source_url: SOURCE_URL,
  };
}

function format(data) {
  const lines = [`# TxDOT Projects — ${data.length} match${data.length === 1 ? "" : "es"}`, ""];
  for (const r of data) {
    lines.push(`## ${r.highway ?? "?"}  --  ${r.work_type ?? "(unknown work)"}`);
    if (r.limits_from || r.limits_to) lines.push(`- **Limits:** ${r.limits_from ?? "?"} → ${r.limits_to ?? "?"}`);
    if (r.county) lines.push(`- **County:** ${r.county}  ·  **District:** ${r.district_name ?? r.district}`);
    if (r.project_class) lines.push(`- **Class:** ${r.project_class}`);
    if (r.length_miles) lines.push(`- **Length:** ${r.length_miles} mi`);
    if (r.actual_let_date) lines.push(`- **Let:** ${r.actual_let_date}`);
    else if (r.district_let_date) lines.push(`- **Scheduled let:** ${r.district_let_date}`);
    if (r.csj) lines.push(`- **CSJ:** ${r.csj}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(`Source: TxDOT Open Data (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
