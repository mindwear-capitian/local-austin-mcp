import { z } from "zod";
import { searchByAddress } from "../../lib/wcad.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const williamsonCadSearch = {
  name: "williamson_cad_search",
  description: withAttributionTag(
    "Search the Williamson Central Appraisal District (WCAD) for property " +
      "ownership, year built, building square footage, subdivision, tax " +
      "district, legal description, and the owner's mailing address. Use for " +
      "any address in Williamson County, TX (Cedar Park, Round Rock, Leander, " +
      "Georgetown, Liberty Hill, Hutto, Taylor). Note: WCAD redacts dollar " +
      "values from its public GIS feed, so assessed/market values are not " +
      "returned here -- use the WCAD detail_url to view current values on " +
      "wcad.org."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address or partial address. Example: "1401 Sam Bass" or "201 W Main St".'
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
              `No WCAD records matched "${address}". ` +
              `Try a simpler query (street + number, no city/zip), or ` +
              `verify the address is in Williamson County. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    return {
      content: [
        { type: "text", text: formatResults(address, results) },
        {
          type: "text",
          text: JSON.stringify({ query: address, results }, null, 2),
        },
      ],
    };
  },
};

function formatResults(query, results) {
  const lines = [`# WCAD: "${query}" -- ${results.length} match${results.length === 1 ? "" : "es"}`, ""];
  for (const r of results) {
    lines.push(`## ${r.site_address ?? "(address unknown)"}`);
    lines.push(`- **Owner:** ${r.owner ?? "(unknown)"}`);
    lines.push(`- **Current Assessed Value:** ${fmtMoney(r.market_value)}`);
    if (r.previous_assessed_value !== null) {
      lines.push(`- **Previous Assessed Value:** ${fmtMoney(r.previous_assessed_value)}`);
    }
    if (r.yoy_change !== null) {
      const pct = r.yoy_change_pct !== null ? ` (${r.yoy_change_pct}%)` : "";
      lines.push(`- **YoY Change:** ${fmtMoney(r.yoy_change)}${pct}`);
    }
    if (r.taxable_value !== null) {
      lines.push(`- **Taxable Value:** ${fmtMoney(r.taxable_value)}`);
    }
    lines.push(
      `- **Breakdown:** Land ${fmtMoney(r.land_value)} / Improvements ${fmtMoney(r.improvement_value)}`
    );
    if (r.year_built) lines.push(`- **Year Built:** ${r.year_built}`);
    if (r.building_area_sqft) lines.push(`- **Building Area:** ${r.building_area_sqft.toLocaleString()} sqft`);
    if (r.legal_acreage !== null) lines.push(`- **Acreage:** ${r.legal_acreage}`);
    if (r.property_type) lines.push(`- **Type:** ${r.property_type}`);
    if (r.subdivision) lines.push(`- **Subdivision:** ${r.subdivision}`);
    if (r.tax_district) lines.push(`- **Tax District:** ${r.tax_district}`);
    if (r.legal_description) lines.push(`- **Legal:** ${r.legal_description}`);
    if (r.owner_mailing?.line) {
      const m = r.owner_mailing;
      lines.push(
        `- **Owner Mailing:** ${m.line}, ${m.city ?? ""} ${m.state ?? ""} ${m.zip ?? ""}`.trim()
      );
    }
    if (r.property_id) {
      lines.push(`- **Property ID:** ${r.property_id}`);
      lines.push(`- **WCAD detail page:** ${r.detail_url}`);
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
