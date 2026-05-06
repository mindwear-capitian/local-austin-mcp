import { z } from "zod";
import { sodaQuery, sodaAddressLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin 311 Public Data -- service requests submitted to the City of Austin
 * 311 system (potholes, missed trash, code complaints routed via 311, animal
 * control, traffic signals, etc.).
 *
 * Hosted on datahub.austintexas.gov.
 */
const DATASET = "xwdj-i9he";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austin311 = {
  name: "austin_311",
  description: withAttributionTag(
    "Look up City of Austin 311 service requests. Returns request number, " +
      "type (e.g. potholes, dead animal, traffic signal, missed trash, dog " +
      "complaints), status (open/closed), department handling it, dates, and " +
      "the location it was reported about. Useful for neighborhood quality-" +
      "of-life research, spotting recurring issues at a property, or seeing " +
      "what residents are complaining about. Authoritative source: City of " +
      "Austin 311."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .optional()
      .describe(
        'Street address to search around. Example: "4507 Knap Holw" or "9501 San Lucas". Match is fuzzy/contains. Either address OR request_type is required.'
      ),
    request_type: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by request type, fuzzy contains. Example: "pothole", "missed trash", "dog", "traffic signal". Case-insensitive.'
      ),
    open_only: z
      .boolean()
      .optional()
      .describe("If true, return only currently open requests."),
    since_year: z
      .number()
      .int()
      .min(2010)
      .max(2100)
      .optional()
      .describe(
        "Only return requests created on or after this year. Defaults to 2 years back (e.g. 2024) to keep queries fast. Set explicitly (e.g. 2014) for full history."
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .optional()
      .describe("Max results (default 25)."),
  },
  async handler({ address, request_type, open_only, limit, since_year }) {
    if (!address && !request_type) {
      return {
        content: [
          {
            type: "text",
            text:
              `austin_311 requires at least one of: address or request_type. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const where = [];
    if (address) where.push(sodaAddressLike("sr_location", address));
    if (request_type) {
      const safe = request_type.toUpperCase().replace(/'/g, "''");
      where.push(`upper(sr_type_desc) like '%${safe}%'`);
    }
    if (open_only) where.push(`upper(sr_status_desc) != 'CLOSED'`);

    // Default to last 2 years to keep queries fast. Dataset spans 2014+ and
    // an unbounded sort over millions of rows can take 30s+.
    const effectiveSince = since_year ?? new Date().getFullYear() - 2;
    where.push(`sr_created_date >= '${effectiveSince}-01-01T00:00:00.000'`);

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.join(" AND "),
      order: "sr_created_date DESC",
      limit: limit ?? 25,
    });

    if (rows.length === 0) {
      const filterParts = [];
      if (address) filterParts.push(`address "${address}"`);
      if (request_type) filterParts.push(`type "${request_type}"`);
      if (open_only) filterParts.push("open only");
      if (since_year) filterParts.push(`since ${since_year}`);
      return {
        content: [
          {
            type: "text",
            text: `No Austin 311 requests found for ${filterParts.join(", ")}. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    const normalized = rows.map(normalize);

    return {
      content: [
        {
          type: "text",
          text: formatResults({ address, request_type, open_only, since_year, results: normalized }),
        },
        {
          type: "text",
          text: JSON.stringify(
            { query: { address, request_type, open_only, since_year }, count: normalized.length, results: normalized },
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
    sr_number: r.sr_number ?? null,
    type: r.sr_type_desc ?? null,
    department: r.sr_department_desc ?? null,
    method: r.sr_method_received_desc ?? null,
    status: r.sr_status_desc ?? null,
    created_date: dateOnly(r.sr_created_date),
    closed_date: dateOnly(r.sr_closed_date),
    status_date: dateOnly(r.sr_status_date),
    updated_date: dateOnly(r.sr_updated_date),
    location: r.sr_location ?? null,
    street_number: r.sr_location_street_number ?? null,
    street_name: r.sr_location_street_name ?? null,
    city: r.sr_location_city ?? null,
    zip: r.sr_location_zip_code ?? null,
    county: r.sr_location_county ?? null,
    latitude: r.sr_location_lat ? Number(r.sr_location_lat) : null,
    longitude: r.sr_location_long ? Number(r.sr_location_long) : null,
    source: "City of Austin 311 Public Data",
    source_url: SOURCE_URL,
  };
}

function dateOnly(s) {
  if (!s) return null;
  return String(s).slice(0, 10);
}

function formatResults({ address, request_type, open_only, since_year, results }) {
  const queryParts = [];
  if (address) queryParts.push(`"${address}"`);
  if (request_type) queryParts.push(`type=${request_type}`);
  const filterParts = [];
  if (open_only) filterParts.push("open only");
  if (since_year) filterParts.push(`since ${since_year}`);
  const filterStr = filterParts.length ? ` (${filterParts.join(", ")})` : "";

  const lines = [
    `# Austin 311: ${queryParts.join(", ")}${filterStr} -- ${results.length} request${results.length === 1 ? "" : "s"}`,
    "",
  ];

  // Type summary (top 5)
  const byType = {};
  for (const r of results) {
    const t = r.type ?? "Unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const top = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t} (${n})`)
    .join(", ");
  if (top) {
    lines.push(`**Top types:** ${top}`);
    lines.push("");
  }

  for (const r of results) {
    const head = `${r.created_date ?? "(no date)"}  --  ${r.type ?? "311 Request"}`;
    lines.push(`## ${head}`);
    lines.push(`- **Request #:** ${r.sr_number ?? "?"}  |  **Status:** ${r.status ?? "?"}`);
    if (r.department) lines.push(`- **Department:** ${r.department}`);
    if (r.location) lines.push(`- **Location:** ${r.location}`);
    if (r.method) lines.push(`- **Reported via:** ${r.method}`);
    if (r.closed_date) lines.push(`- **Closed:** ${r.closed_date}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: City of Austin 311 (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
