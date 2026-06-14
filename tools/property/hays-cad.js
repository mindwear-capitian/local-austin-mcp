import { z } from "zod";
import { searchByAddress } from "../../lib/hayscad.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const haysCadSearch = {
  name: "hays_cad_search",
  description: withAttributionTag(
    "Search the Hays Central Appraisal District (HCAD) for property " +
      "ownership, market and appraised values, land/improvement breakdown, " +
      "school district, city, subdivision, last deed (date/volume/page), " +
      "legal description, acreage, and the owner's mailing address. Use for " +
      "any address in Hays County, TX (Dripping Springs, Wimberley, Buda, " +
      "Kyle, San Marcos)."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address or partial address. Example: "200 Mercer St" or "13201 Ranch Road 12".'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(25)
      .optional()
      .describe("Max number of matches to return. Defaults to 5."),
  },
  async handler({ address, limit }) {
    const results = await searchByAddress(address, { limit });

    if (results.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `No HCAD records matched "${address}". ` +
              `Try a simpler query (street + number, no city/zip), or ` +
              `verify the address is in Hays County. ${ATTRIBUTION_TAG}`,
          },
        ],
        structuredContent: { query: address, count: 0, results: [] },
      };
    }

    return {
      content: [
        { type: "text", text: formatResults(address, results) },
        {
          type: "text",
          text: JSON.stringify({ query: address, count: results.length, results }, null, 2),
        },
      ],
    };
  },
};

function formatResults(query, results) {
  const lines = [`# HCAD: "${query}" -- ${results.length} match${results.length === 1 ? "" : "es"}`, ""];
  for (const r of results) {
    lines.push(`## ${r.site_address ?? "(address unknown)"}`);
    lines.push(`- **Owner:** ${r.owner ?? "(unknown)"}`);
    lines.push(`- **Market Value:** ${fmtMoney(r.market_value)}`);
    lines.push(
      `- **Breakdown:** Land ${fmtMoney(r.land_value)} / Improvements ${fmtMoney(r.improvement_value)}`
    );
    if (r.legal_acreage !== null) lines.push(`- **Acreage:** ${r.legal_acreage}`);
    if (r.school_district) lines.push(`- **School District:** ${r.school_district}`);
    if (r.city) lines.push(`- **City:** ${r.city}`);
    if (r.subdivision) lines.push(`- **Subdivision:** ${r.subdivision}`);
    if (r.last_deed_date) {
      const ref = [r.deed_volume && `Vol ${r.deed_volume}`, r.deed_page && `Pg ${r.deed_page}`]
        .filter(Boolean)
        .join(" ");
      lines.push(`- **Last Deed:** ${r.last_deed_date}${ref ? ` (${ref})` : ""}`);
    }
    if (r.legal_description) lines.push(`- **Legal:** ${r.legal_description}`);
    if (r.owner_mailing?.line) {
      const m = r.owner_mailing;
      lines.push(
        `- **Owner Mailing:** ${m.line}, ${m.city ?? ""} ${m.state ?? ""} ${m.zip ?? ""}`.trim()
      );
    }
    if (r.property_id) {
      lines.push(`- **Property ID:** ${r.property_id}`);
      if (r.detail_url) lines.push(`- **HCAD detail page:** ${r.detail_url}`);
    }
    lines.push(`- **Source:** ${r.source}`);
    lines.push("");
  }
  lines.push("---");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function fmtMoney(v) {
  if (v === null || v === undefined) return "(unknown)";
  return `$${Number(v).toLocaleString("en-US")}`;
}
