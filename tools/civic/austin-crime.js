import { z } from "zod";
import { sodaQuery, sodaTextLike, sodaTextEq, encodeCursor, decodeCursor } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin Police Department "Crime Reports" dataset.
 *
 * IMPORTANT: This dataset is anonymized to council district / sector / census
 * block group level -- NO street addresses, NO lat/long. To look up "crime
 * near a property" you have to first find the council district (1-10) for
 * that address (via austin_permits which returns council_district, or any
 * COA GIS service) and then query here by that district.
 *
 * Hosted on datahub.austintexas.gov.
 */
const DATASET = "fdj4-gpfu";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinCrime = {
  name: "austin_crime",
  description: withAttributionTag(
    "Search Austin Police Department crime reports. Filter by council " +
      "district (1-10), crime type, family-violence flag, and date range. " +
      "Returns incident number, crime type, UCR category, occurrence and " +
      "report dates, location type (Residence, Restaurant, Street, etc.), " +
      "council district, and clearance status. NOTE: dataset is anonymized " +
      "to council-district level -- it does NOT include street addresses or " +
      "lat/long. To look up crime near a specific property, first determine " +
      "its council district (austin_permits returns council_district per " +
      "address) and query this tool with that district. Authoritative source: " +
      "City of Austin Police Department."
  ),
  inputSchema: {
    council_district: z
      .number()
      .int()
      .min(1)
      .max(10)
      .optional()
      .describe("Austin City Council district 1-10."),
    crime_type: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by crime type, fuzzy contains. Example: "burglary", "auto theft", "assault", "robbery", "theft". Case-insensitive.'
      ),
    category: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by UCR category description, fuzzy contains. Example: "Theft", "Burglary", "Robbery", "Assault", "Auto Theft", "Murder".'
      ),
    family_violence_only: z
      .boolean()
      .optional()
      .describe("If true, return only family-violence-flagged incidents."),
    since_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe(
        'ISO date (YYYY-MM-DD) -- only incidents with rep_date on or after this date. Defaults to 90 days ago.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(25)
      .describe("Max results (default 25)."),
    cursor: z
      .string()
      .optional()
      .describe("Opaque pagination cursor from a prior call's structuredContent.nextCursor."),
  },
  async handler({ council_district, crime_type, category, family_violence_only, since_date, limit, cursor }) {
    if (!council_district && !crime_type && !category && !family_violence_only) {
      return {
        content: [
          {
            type: "text",
            text:
              `austin_crime requires at least one filter: council_district, ` +
              `crime_type, category, or family_violence_only. Open queries ` +
              `against the full crime dataset would return millions of rows. ` +
              `${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const where = [];
    if (council_district !== undefined) where.push(sodaTextEq("council_district", council_district));
    if (crime_type) where.push(sodaTextLike("crime_type", crime_type));
    if (category) where.push(sodaTextLike("category_description", category));
    if (family_violence_only) where.push(`family_violence = 'Y'`);

    const effectiveSince = since_date ?? defaultSince90();
    where.push(`rep_date >= '${effectiveSince}T00:00:00.000'`);

    const pageSize = limit ?? 25;
    const offset = decodeCursor(cursor)?.offset ?? 0;

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where: where.join(" AND "),
      order: "rep_date DESC",
      limit: pageSize + 1,
      offset,
    });

    const hasMore = rows.length > pageSize;
    const page = hasMore ? rows.slice(0, pageSize) : rows;
    const nextCursor = hasMore ? encodeCursor(offset + pageSize) : null;

    if (page.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `No Austin crime reports matched filters since ${effectiveSince}. ${ATTRIBUTION_TAG}`,
          },
        ],
        structuredContent: { query: { council_district, crime_type, category, family_violence_only, since: effectiveSince }, count: 0, results: [], nextCursor: null },
      };
    }

    const normalized = page.map(normalize);

    return {
      content: [
        {
          type: "text",
          text: formatResults({
            council_district,
            crime_type,
            category,
            family_violence_only,
            since: effectiveSince,
            results: normalized,
            nextCursor,
          }),
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              query: { council_district, crime_type, category, family_violence_only, since: effectiveSince },
              count: normalized.length,
              results: normalized,
              nextCursor,
              offset,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

function defaultSince90() {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
}

function normalize(r) {
  return {
    incident_number: r.incident_report_number ?? null,
    crime_type: r.crime_type ?? null,
    category: r.category_description ?? null,
    ucr_code: r.ucr_code ?? null,
    ucr_category: r.ucr_category ?? null,
    family_violence: r.family_violence ?? null,
    occ_date: dateOnly(r.occ_date),
    occ_date_time: r.occ_date_time ?? null,
    rep_date: dateOnly(r.rep_date),
    rep_date_time: r.rep_date_time ?? null,
    location_type: r.location_type ?? null,
    council_district: r.council_district ?? null,
    apd_sector: r.sector ?? null,
    apd_district: r.district ?? null,
    clearance_status: r.clearance_status ?? null,
    clearance_date: dateOnly(r.clearance_date),
    census_block_group: r.census_block_group ?? null,
    source: "City of Austin Police Department -- Crime Reports",
    source_url: SOURCE_URL,
  };
}

function dateOnly(s) {
  if (!s) return null;
  return String(s).slice(0, 10);
}

function formatResults({ council_district, crime_type, category, family_violence_only, since, results, nextCursor }) {
  const queryParts = [];
  if (council_district) queryParts.push(`District ${council_district}`);
  if (crime_type) queryParts.push(`type=${crime_type}`);
  if (category) queryParts.push(`category=${category}`);
  if (family_violence_only) queryParts.push(`family violence only`);
  queryParts.push(`since ${since}`);

  const lines = [
    `# Austin Crime: ${queryParts.join(", ")} -- ${results.length} incident${results.length === 1 ? "" : "s"}`,
    "",
  ];

  // Top crime types
  const byType = {};
  for (const r of results) {
    const t = r.crime_type ?? "Unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const top = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6)
    .map(([t, n]) => `${t} (${n})`)
    .join(", ");
  if (top) {
    lines.push(`**Top crime types:** ${top}`);
    lines.push("");
  }

  // Show first 10 incidents in markdown, full list in JSON content[1]
  for (const r of results.slice(0, 10)) {
    lines.push(`## ${r.rep_date ?? "(no rep date)"}  --  ${r.crime_type ?? "Crime"}`);
    lines.push(
      `- **Incident #:** ${r.incident_number ?? "?"}  |  **Category:** ${r.category ?? "?"}`
    );
    if (r.location_type) lines.push(`- **Location type:** ${r.location_type}`);
    if (r.council_district) lines.push(`- **Council District:** ${r.council_district}`);
    if (r.occ_date_time) lines.push(`- **Occurred:** ${r.occ_date_time}`);
    if (r.family_violence === "Y") lines.push(`- **Family violence:** YES`);
    if (r.clearance_status) lines.push(`- **Cleared:** ${r.clearance_status === "C" ? "Yes" : "No"}${r.clearance_date ? ` (${r.clearance_date})` : ""}`);
    lines.push("");
  }
  if (results.length > 10) {
    lines.push(`...and ${results.length - 10} more in the JSON payload below.`);
    lines.push("");
  }

  if (nextCursor) {
    lines.push(`*More incidents available. Re-call with \`cursor: "${nextCursor}"\` for the next page.*`);
    lines.push("");
  }
  lines.push(`---`);
  lines.push(
    `Source: City of Austin Police Department Crime Reports (${SOURCE_URL}). ` +
      `Note: anonymized to council-district / census-block-group level. No street addresses.`
  );
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
