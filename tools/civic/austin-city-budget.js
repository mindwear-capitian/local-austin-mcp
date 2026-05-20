import { z } from "zod";
import { sodaQuery, sodaTextLike, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * City of Austin expense budget (Open Budget, revised). One row = one
 * line-item (department / fund / division / unit / object).
 *
 * Dataset: yeeq-kk6v on datahub.austintexas.gov.
 *
 * Useful fields:
 *  - fy            fiscal year
 *  - dept_nm       department name (e.g. "Austin Police", "Parks and Recreation")
 *  - fund_nm       fund (e.g. "General Fund")
 *  - div_nm / gp_nm / unit_nm  drill-down
 *  - obj_cat       expense category (Personnel, Contractuals, Commodities, ...)
 *  - obj_desc      specific line description
 *  - act           actual spent
 *  - bud           budgeted
 *  - cye           current-year estimate
 */
const DATASET = "yeeq-kk6v";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinCityBudget = {
  name: "austin_city_budget",
  description: withAttributionTag(
    "Look up City of Austin operating expense budget (Open Budget data). " +
      "Returns budgeted / actual / current-year-estimate amounts for any " +
      "department, fund, division, or expense category, across fiscal years. " +
      "Useful for civic research, comparing department budgets over time, " +
      "or finding what a city department spends on a specific category. " +
      "Authoritative source: City of Austin Financial Services Department."
  ),
  inputSchema: {
    department: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by department name (fuzzy contains). Example: "Police", "Parks", "Fire", "Austin Energy".'
      ),
    fund: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by fund (fuzzy contains). Example: "General Fund", "Drainage", "Convention Center".'
      ),
    fiscal_year: z
      .union([z.number().int().min(2010).max(2100), z.string()])
      .optional()
      .describe("Filter by fiscal year (e.g. 2024)."),
    search: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Full-text search across all columns. Example: "homeless", "body cameras", "library books".'
      ),
    category: z
      .enum(["Personnel", "Contractuals", "Commodities", "Capital", "Other", "Transfers"])
      .optional()
      .describe("Filter by expense category."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(500)
      .default(50)
      .describe("Max results (default 50)."),
  },
  async handler({ department, fund, fiscal_year, search, category, limit }) {
    const where = [];
    if (department) where.push(sodaTextLike("dept_nm", department));
    if (fund) where.push(sodaTextLike("fund_nm", fund));
    if (fiscal_year !== undefined && fiscal_year !== null) {
      where.push(sodaTextEq("fy", fiscal_year));
    }
    if (category) where.push(sodaTextEq("obj_cat", category));

    const queryParams = {
      base: BASE,
      order: "fy DESC, bud DESC",
      limit: limit ?? 50,
    };
    if (where.length) queryParams.where = where.join(" AND ");
    if (search) queryParams.q = search;

    const rows = await sodaQuery(DATASET, queryParams);

    if (rows.length === 0) {
      const filterParts = [];
      if (department) filterParts.push(`dept "${department}"`);
      if (fund) filterParts.push(`fund "${fund}"`);
      if (fiscal_year) filterParts.push(`fy ${fiscal_year}`);
      if (category) filterParts.push(`category ${category}`);
      if (search) filterParts.push(`search "${search}"`);
      return {
        content: [
          {
            type: "text",
            text: `No Austin city budget rows found for ${filterParts.join(", ") || "(no filters)"}. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    const normalized = rows.map(normalize);
    const totals = totalize(normalized);

    return {
      content: [
        {
          type: "text",
          text: formatResults({ department, fund, fiscal_year, category, search, results: normalized, totals }),
        },
        {
          type: "text",
          text: JSON.stringify(
            { query: { department, fund, fiscal_year, category, search }, count: normalized.length, totals, results: normalized },
            null,
            2
          ),
        },
      ],
    };
  },
};

function normalize(r) {
  return {
    fy: r.fy ?? null,
    department: r.dept_nm ?? null,
    fund: r.fund_nm ?? null,
    division: r.div_nm ?? null,
    group: r.gp_nm ?? null,
    unit: r.unit_nm ?? null,
    category: r.obj_cat ?? null,
    description: r.obj_desc ?? null,
    actual: toNum(r.act),
    budget: toNum(r.bud),
    current_year_estimate: toNum(r.cye),
    source: "City of Austin Open Budget (Expense, Revised)",
    source_url: SOURCE_URL,
  };
}

function toNum(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function totalize(rows) {
  let act = 0;
  let bud = 0;
  let cye = 0;
  for (const r of rows) {
    if (r.actual) act += r.actual;
    if (r.budget) bud += r.budget;
    if (r.current_year_estimate) cye += r.current_year_estimate;
  }
  return {
    actual: round2(act),
    budget: round2(bud),
    current_year_estimate: round2(cye),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function fmt(n) {
  if (n === null || n === undefined) return "?";
  return n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
}

function formatResults({ department, fund, fiscal_year, category, search, results, totals }) {
  const queryParts = [];
  if (department) queryParts.push(`dept=${department}`);
  if (fund) queryParts.push(`fund=${fund}`);
  if (fiscal_year) queryParts.push(`fy=${fiscal_year}`);
  if (category) queryParts.push(`cat=${category}`);
  if (search) queryParts.push(`"${search}"`);
  const queryStr = queryParts.length ? queryParts.join(", ") : "(no filters)";

  const lines = [
    `# Austin City Budget: ${queryStr} -- ${results.length} line${results.length === 1 ? "" : "s"}`,
    "",
    `**Totals across returned rows:**  Budgeted ${fmt(totals.budget)}  |  Actual ${fmt(totals.actual)}  |  Current Yr Est ${fmt(totals.current_year_estimate)}`,
    "",
  ];

  for (const r of results.slice(0, 25)) {
    lines.push(`## FY${r.fy ?? "?"}  --  ${r.department ?? "?"}  /  ${r.division ?? r.unit ?? "?"}`);
    lines.push(`- ${r.description ?? "?"}  (${r.category ?? "?"})`);
    lines.push(`- **Budget:** ${fmt(r.budget)}  |  **Actual:** ${fmt(r.actual)}  |  **Est:** ${fmt(r.current_year_estimate)}`);
    if (r.fund) lines.push(`- Fund: ${r.fund}`);
    lines.push("");
  }
  if (results.length > 25) {
    lines.push(`...(${results.length - 25} more rows in JSON below)`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: City of Austin Open Budget (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
