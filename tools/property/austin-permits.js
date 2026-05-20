import { z } from "zod";
import { sodaQuery, sodaAddressLike, encodeCursor, decodeCursor } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * City of Austin "Issued Construction Permits" dataset.
 * https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu
 */
const PERMITS_DATASET = "3syk-w9eu";
const SOURCE_URL =
  "https://data.austintexas.gov/Building-and-Development/Issued-Construction-Permits/3syk-w9eu";

export const austinPermits = {
  name: "austin_permits",
  description: withAttributionTag(
    "Look up issued construction permits at a City of Austin address. " +
      "Returns permit number, type (mechanical/electrical/plumbing/building/etc), " +
      "work class, status, dates (applied, issued, status, expires), description, " +
      "contractor info, and a link to the AB+C public detail page. Useful for " +
      "verifying permitted work history (additions, pools, HVAC, electrical, " +
      "demolition, change of use) before buying or remodeling. Authoritative " +
      "source: City of Austin Open Data Portal."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address or partial address. Example: "9501 San Lucas Dr" or "2512 Tremolo Pass". Address only -- do NOT include city, state, or zip. Match is fuzzy/contains.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(25)
      .describe("Max results (default 25). Use higher for full history."),
    since_year: z
      .number()
      .int()
      .min(1950)
      .max(2100)
      .optional()
      .describe(
        "Only return permits issued on or after this year (e.g. 2015). Omit for all history."
      ),
    cursor: z
      .string()
      .optional()
      .describe(
        "Opaque pagination cursor returned in structuredContent.nextCursor. " +
          "Pass back verbatim to fetch the next page."
      ),
  },
  async handler({ address, limit, since_year, cursor }) {
    const where = [sodaAddressLike("original_address1", address)];
    if (since_year !== undefined) {
      where.push(`issue_date >= '${since_year}-01-01T00:00:00.000'`);
    }

    const pageSize = limit ?? 25;
    const offset = decodeCursor(cursor)?.offset ?? 0;

    const rows = await sodaQuery(PERMITS_DATASET, {
      where: where.join(" AND "),
      order: "issue_date DESC",
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
              `No City of Austin construction permits found for "${address}"` +
              `${since_year ? ` since ${since_year}` : ""}. Note: this dataset ` +
              `covers City of Austin jurisdictional permits only -- ETJ, ` +
              `Travis County unincorporated, and other municipalities use ` +
              `different permit systems. ${ATTRIBUTION_TAG}`,
          },
        ],
        structuredContent: { query: address, since_year, count: 0, results: [], nextCursor: null },
      };
    }

    const normalized = page.map(normalizePermit);

    return {
      content: [
        { type: "text", text: formatResults(address, normalized, since_year, nextCursor) },
        {
          type: "text",
          text: JSON.stringify(
            { query: address, since_year, count: normalized.length, results: normalized, nextCursor, offset },
            null,
            2
          ),
        },
      ],
    };
  },
};

function normalizePermit(r) {
  return {
    permit_number: r.permit_number ?? null,
    permit_type: r.permit_type_desc ?? r.permittype ?? null,
    permit_class: r.permit_class ?? null,
    work_class: r.work_class ?? null,
    description: r.description ?? null,
    status: r.status_current ?? null,
    applied_date: dateOnly(r.applieddate),
    issue_date: dateOnly(r.issue_date),
    status_date: dateOnly(r.statusdate),
    expires_date: dateOnly(r.expiresdate),
    address: r.original_address1 ?? null,
    city: r.original_city ?? null,
    state: r.original_state ?? null,
    zip: r.original_zip ?? null,
    council_district: r.council_district ?? null,
    jurisdiction: r.jurisdiction ?? null,
    tcad_id: r.tcad_id ?? null,
    contractor: {
      company: r.contractor_company_name ?? null,
      name: r.contractor_full_name ?? null,
      trade: r.contractor_trade ?? null,
      phone: r.contractor_phone ?? null,
    },
    abc_detail_url: r.link?.url ?? null,
    project_id: r.project_id ?? null,
    latitude: r.latitude ? Number(r.latitude) : null,
    longitude: r.longitude ? Number(r.longitude) : null,
    source: "City of Austin Open Data -- Issued Construction Permits",
    source_url: SOURCE_URL,
  };
}

function dateOnly(s) {
  if (!s) return null;
  return String(s).slice(0, 10);
}

function formatResults(query, results, since_year, nextCursor) {
  const since = since_year ? ` since ${since_year}` : "";
  const lines = [`# Austin Permits: "${query}"${since} -- ${results.length} permit${results.length === 1 ? "" : "s"}`, ""];

  // Group counts by type for quick scan
  const byType = {};
  for (const r of results) {
    const t = r.permit_type ?? "Unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const summary = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} (${n})`)
    .join(", ");
  lines.push(`**By type:** ${summary}`);
  lines.push("");

  for (const r of results) {
    const head = `${r.issue_date ?? "(no issue date)"}  --  ${r.permit_type ?? "Permit"}  --  ${r.work_class ?? ""}`.trim();
    lines.push(`## ${head}`);
    lines.push(`- **Permit #:** ${r.permit_number ?? "(unknown)"}  |  **Status:** ${r.status ?? "?"}`);
    if (r.description) lines.push(`- **Description:** ${r.description}`);
    if (r.address) {
      const cityZip = [r.city, r.state, r.zip].filter(Boolean).join(" ");
      lines.push(`- **Address:** ${r.address}, ${cityZip}`);
    }
    if (r.permit_class) lines.push(`- **Class:** ${r.permit_class}`);
    if (r.applied_date) lines.push(`- **Applied:** ${r.applied_date}`);
    if (r.expires_date) lines.push(`- **Expires:** ${r.expires_date}`);
    if (r.contractor?.company) {
      lines.push(
        `- **Contractor:** ${r.contractor.company}${r.contractor.trade ? ` (${r.contractor.trade})` : ""}`
      );
    }
    if (r.tcad_id) lines.push(`- **TCAD ID:** ${r.tcad_id}`);
    if (r.abc_detail_url) lines.push(`- **AB+C link:** ${r.abc_detail_url}`);
    lines.push("");
  }

  if (nextCursor) {
    lines.push("");
    lines.push(`*More permits available. Re-call with \`cursor: "${nextCursor}"\` for the next page.*`);
  }
  lines.push(`---`);
  lines.push(`Source: City of Austin Open Data Portal (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
