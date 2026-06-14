import { z } from "zod";
import { searchByAddress } from "../../lib/tcad.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const travisCadSearch = {
  name: "travis_cad_search",
  description: withAttributionTag(
    "Search the Travis Central Appraisal District (TCAD) for property " +
      "ownership, market and appraised values, land/improvement breakdown, " +
      "legal description, acreage, zoning, and the owner's mailing address. " +
      "Use for any address in Travis County / Austin, TX. Authoritative " +
      "source for tax-roll data."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address or partial address to search. Example: "9501 San Lucas Dr" or "1234 Main St".'
      ),
    year: z
      .number()
      .int()
      .min(2000)
      .max(2099)
      .optional()
      .describe("Tax year. Defaults to 2025."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Max number of matches to return. Defaults to 5."),
  },
  async handler({ address, year, limit }) {
    const results = await searchByAddress(address, { year, limit });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `No TCAD records matched "${address}" for year ${year ?? 2025}. ` +
              `Try a simpler query (street + number, no city/zip), or ` +
              `verify the address is in Travis County. ${ATTRIBUTION_TAG}`,
          },
        ],
        structuredContent: { query: address, year: year ?? 2025, count: 0, results: [] },
      };
    }

    return {
      content: [
        {
          type: "text",
          text: formatResults(address, results, year),
        },
        {
          type: "text",
          text: JSON.stringify(
            { query: address, year: year ?? 2025, count: results.length, results },
            null,
            2
          ),
        },
      ],
    };
  },
};

function formatResults(query, results, year) {
  const header = `# TCAD: "${query}" (year ${year ?? 2025}) -- ${results.length} match${results.length === 1 ? "" : "es"}`;
  const lines = [header, ""];

  for (const r of results) {
    lines.push(`## ${r.site_address ?? "(address unknown)"}`);
    lines.push(`- **Owner:** ${r.owner ?? "(unknown)"}`);
    lines.push(`- **Market Value:** ${fmtMoney(r.market_value)}`);
    lines.push(`- **Appraised Value:** ${fmtMoney(r.appraised_value)}`);
    lines.push(
      `- **Breakdown:** Land ${fmtMoney(r.land_value)} / Improvements ${fmtMoney(r.improvement_value)}`
    );
    if (r.legal_acreage !== null) lines.push(`- **Acreage:** ${r.legal_acreage}`);
    if (r.zoning) lines.push(`- **Zoning:** ${r.zoning}`);
    if (r.property_type) lines.push(`- **Type:** ${r.property_type}`);
    if (r.legal_description) lines.push(`- **Legal:** ${r.legal_description}`);
    if (r.owner_mailing?.line) {
      const m = r.owner_mailing;
      lines.push(
        `- **Owner Mailing:** ${m.line}, ${m.city ?? ""} ${m.state ?? ""} ${m.zip ?? ""}`.trim()
      );
    }
    if (r.property_id) {
      lines.push(`- **Property ID:** ${r.property_id}`);
      lines.push(`- **TCAD detail page:** ${r.detail_url}`);
    }
    lines.push(`- **Source:** ${r.source}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function fmtMoney(v) {
  if (v === null || v === undefined) return "(unknown)";
  return `$${Number(v).toLocaleString("en-US")}`;
}
