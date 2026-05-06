import { z } from "zod";
import { sodaQuery, sodaAddressLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * City of Austin "Austin Code Complaint Cases" dataset.
 * Hosted on datahub.austintexas.gov (NOT data.austintexas.gov).
 */
const DATASET = "6wtj-zbtb";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinCodeCases = {
  name: "austin_code_cases",
  description: withAttributionTag(
    "Look up City of Austin Code Compliance complaint cases at an address. " +
      "Returns case ID, priority, status (open/closed), case type, " +
      "description (e.g. land use violation, junk vehicle, dangerous structure), " +
      "opened/closed dates, inspector, and TCAD parcel ID. Useful for " +
      "spotting open code cases on a property before purchase or for " +
      "neighborhood quality-of-life research. Authoritative source: " +
      "City of Austin Code Department."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address. Example: "1100 Blair Way" or "9501 San Lucas". Match is fuzzy/contains.'
      ),
    open_only: z
      .boolean()
      .optional()
      .describe("If true, return only currently open cases. Default false (all)."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Max results (default 25)."),
    since_year: z
      .number()
      .int()
      .min(1990)
      .max(2100)
      .optional()
      .describe("Only return cases opened on or after this year."),
  },
  async handler({ address, open_only, limit, since_year }) {
    const where = [sodaAddressLike("address", address)];
    if (open_only) where.push(`upper(status) != 'CLOSED'`);
    if (since_year !== undefined) {
      where.push(`opened_date >= '${since_year}-01-01T00:00:00.000'`);
    }

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.join(" AND "),
      order: "opened_date DESC",
      limit: limit ?? 25,
    });

    if (rows.length === 0) {
      const filterDesc =
        (open_only ? " open" : "") +
        (since_year ? ` since ${since_year}` : "");
      return {
        content: [
          {
            type: "text",
            text:
              `No${filterDesc} Austin code cases found for "${address}". ` +
              `${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    const normalized = rows.map(normalizeCase);

    return {
      content: [
        { type: "text", text: formatResults(address, normalized, open_only, since_year) },
        {
          type: "text",
          text: JSON.stringify(
            { query: address, open_only, since_year, count: normalized.length, results: normalized },
            null,
            2
          ),
        },
      ],
    };
  },
};

function normalizeCase(r) {
  return {
    case_id: r.case_id ?? null,
    status: r.status ?? null,
    priority: r.priority ?? null,
    case_type: r.case_type ?? null,
    description: r.description ?? null,
    department: r.department ?? null,
    address: r.address ?? null,
    city: r.city ?? null,
    state: r.state ?? null,
    zip: r.zip_code ?? null,
    opened_date: dateOnly(r.opened_date),
    closed_date: dateOnly(r.closed_date),
    date_updated: dateOnly(r.date_updated),
    last_update: r.last_update ?? null,
    inspector: r.inspector ?? null,
    reported_by: r.reportedby ?? null,
    repeat_offender: r.repeatoffenderrelated ?? null,
    tcad_parcel_id: r.parcelid ?? null,
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
    source: "City of Austin Code Department -- Austin Code Complaint Cases",
    source_url: SOURCE_URL,
  };
}

function dateOnly(s) {
  if (!s) return null;
  return String(s).slice(0, 10);
}

function formatResults(query, results, open_only, since_year) {
  const filterParts = [];
  if (open_only) filterParts.push("open only");
  if (since_year) filterParts.push(`since ${since_year}`);
  const filterStr = filterParts.length ? ` (${filterParts.join(", ")})` : "";

  const lines = [
    `# Austin Code Cases: "${query}"${filterStr} -- ${results.length} case${results.length === 1 ? "" : "s"}`,
    "",
  ];

  // Status summary
  const byStatus = {};
  for (const r of results) {
    const s = r.status ?? "Unknown";
    byStatus[s] = (byStatus[s] ?? 0) + 1;
  }
  const summary = Object.entries(byStatus)
    .sort((a, b) => b[1] - a[1])
    .map(([s, n]) => `${s} (${n})`)
    .join(", ");
  lines.push(`**By status:** ${summary}`);
  lines.push("");

  for (const r of results) {
    const head = `${r.opened_date ?? "(no date)"}  --  ${r.description ?? r.case_type ?? "Code Case"}`;
    lines.push(`## ${head}`);
    lines.push(
      `- **Case #:** ${r.case_id ?? "?"}  |  **Status:** ${r.status ?? "?"}  |  **Priority:** ${r.priority ?? "?"}`
    );
    if (r.case_type) lines.push(`- **Type:** ${r.case_type}`);
    if (r.address) {
      const cityZip = [r.city, r.state, r.zip].filter(Boolean).join(" ");
      lines.push(`- **Address:** ${r.address}, ${cityZip}`);
    }
    if (r.opened_date) lines.push(`- **Opened:** ${r.opened_date}`);
    if (r.closed_date) lines.push(`- **Closed:** ${r.closed_date}`);
    if (r.last_update) lines.push(`- **Last update:** ${r.last_update}${r.date_updated ? ` (${r.date_updated})` : ""}`);
    if (r.inspector) lines.push(`- **Inspector:** ${r.inspector}`);
    if (r.repeat_offender && r.repeat_offender !== "No") {
      lines.push(`- **Repeat offender related:** ${r.repeat_offender}`);
    }
    if (r.tcad_parcel_id) lines.push(`- **TCAD Parcel ID:** ${r.tcad_parcel_id}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: City of Austin Code Department (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
