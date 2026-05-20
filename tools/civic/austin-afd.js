import { z } from "zod";
import { sodaQuery, sodaAddressLike, sodaTextLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Fire Department real-time incidents. Live feed of dispatched fire
 * department calls (alarms, structure fires, grass fires, EMS-fire response,
 * traffic injuries). Updated continuously.
 *
 * Dataset: wpu4-x69d on datahub.austintexas.gov.
 */
const DATASET = "wpu4-x69d";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinAfd = {
  name: "austin_afd_incidents",
  description: withAttributionTag(
    "Look up Austin Fire Department real-time incident dispatches. Returns " +
      "incident type (fire alarm, structure fire, grass fire, traffic " +
      "injury, etc.), address, status (active/archived), and timestamps. " +
      "Useful for neighborhood incident research, property due diligence " +
      "(how many fire calls at this address?), or checking what's happening " +
      "right now in a specific area. Authoritative source: City of Austin AFD."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .optional()
      .describe(
        'Street address or street name to search around. Fuzzy/contains match. Example: "2501 Dies Ranch" or "Riverside Dr".'
      ),
    issue_type: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by issue type, fuzzy contains. Example: "fire alarm", "grass", "structure fire", "traffic injury".'
      ),
    active_only: z
      .boolean()
      .optional()
      .describe("If true, return only currently active (non-archived) incidents."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(25)
      .describe("Max results (default 25)."),
  },
  async handler({ address, issue_type, active_only, limit }) {
    const where = [];
    if (address) where.push(sodaAddressLike("address", address));
    if (issue_type) where.push(sodaTextLike("issue_reported", issue_type));
    if (active_only) where.push(`upper(traffic_report_status) = 'ACTIVE'`);

    if (where.length === 0) {
      // Default to last 24 hours snapshot so the response stays meaningful.
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000)
        .toISOString()
        .replace("Z", "");
      where.push(`published_date >= '${since}'`);
    }

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.join(" AND "),
      order: "published_date DESC",
      limit: limit ?? 25,
    });

    if (rows.length === 0) {
      const filterParts = [];
      if (address) filterParts.push(`address "${address}"`);
      if (issue_type) filterParts.push(`type "${issue_type}"`);
      if (active_only) filterParts.push("active only");
      return {
        content: [
          {
            type: "text",
            text: `No Austin AFD incidents found for ${filterParts.join(", ") || "last 24 hours"}. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    const normalized = rows.map(normalize);

    return {
      content: [
        {
          type: "text",
          text: formatResults({ address, issue_type, active_only, results: normalized }),
        },
        {
          type: "text",
          text: JSON.stringify(
            { query: { address, issue_type, active_only }, count: normalized.length, results: normalized },
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
    report_id: r.traffic_report_id ?? null,
    issue: r.issue_reported ?? null,
    address: r.address ?? null,
    status: r.traffic_report_status ?? null,
    published_date: r.published_date ?? null,
    status_date: r.traffic_report_status_date_time ?? null,
    agency: r.agency ?? null,
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
    source: "City of Austin Fire Department Real-Time Incidents",
    source_url: SOURCE_URL,
  };
}

function formatResults({ address, issue_type, active_only, results }) {
  const queryParts = [];
  if (address) queryParts.push(`"${address}"`);
  if (issue_type) queryParts.push(`type=${issue_type}`);
  if (active_only) queryParts.push("active only");
  const queryStr = queryParts.length ? queryParts.join(", ") : "last 24 hours";

  const lines = [
    `# Austin AFD: ${queryStr} -- ${results.length} incident${results.length === 1 ? "" : "s"}`,
    "",
  ];

  // Issue summary (top 5)
  const byIssue = {};
  for (const r of results) {
    const t = r.issue ?? "Unknown";
    byIssue[t] = (byIssue[t] ?? 0) + 1;
  }
  const top = Object.entries(byIssue)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t} (${n})`)
    .join(", ");
  if (top) {
    lines.push(`**Top types:** ${top}`);
    lines.push("");
  }

  for (const r of results) {
    const date = r.published_date ? String(r.published_date).slice(0, 16).replace("T", " ") : "(no date)";
    lines.push(`## ${date} UTC -- ${r.issue ?? "Incident"}`);
    if (r.address) lines.push(`- **Address:** ${r.address}`);
    lines.push(`- **Status:** ${r.status ?? "?"}  |  **Agency:** ${r.agency ?? "?"}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: City of Austin AFD Real-Time (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
