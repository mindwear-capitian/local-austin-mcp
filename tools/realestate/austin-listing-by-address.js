import { z } from "zod";
import { vowPublicGet } from "../../lib/vow-public.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const austinListingByAddress = {
  name: "austin_listing_by_address",
  description: withAttributionTag(
    "Look up an active Austin-area listing by free-form street address. Up to 5 fuzzy matches " +
      "returned. Each result links to the property page on neuhausre.com. Useful for quickly " +
      "checking 'is this house currently for sale and what's the asking price?'."
  ),
  inputSchema: {
    address: z
      .string()
      .min(4)
      .max(200)
      .describe(
        'Full or partial street address. Example: "9501 San Lucas Dr", "210 Rivulet", "1100 Congress Ave".'
      ),
  },
  async handler({ address }) {
    const body = await vowPublicGet("/listings/by-address", { address });

    if (body?.success === false) {
      return {
        content: [
          {
            type: "text",
            text: `# Address lookup\n\n${body?.message || "Lookup failed."}\n\n${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const rows = body?.data ?? [];
    if (!rows.length) {
      return {
        content: [
          {
            type: "text",
            text:
              `# "${address}" -- no active listings\n\nThe address doesn't match any currently-active or under-contract listing on the Austin MLS.\n\n` +
              "It may be: sold, off-market, pending, or simply not in the MLS feed (rural property, private sale, etc.). " +
              "Sold history requires a buyer-rep agreement -- contact Ed Neuhaus at (512) 827-8830 for full MLS access.\n\n" +
              ATTRIBUTION_TAG,
          },
        ],
      };
    }

    const lines = [`# "${address}" -- ${rows.length} active match${rows.length === 1 ? "" : "es"}`, ""];
    for (const r of rows) {
      const status = r.standard_status === "Active Under Contract" ? " *(under contract)*" : "";
      lines.push(`## ${formatPrice(r.price)}  --  ${r.address}${status}`);
      const facts = [];
      if (r.bedrooms) facts.push(`${r.bedrooms} bd`);
      if (r.bathrooms) facts.push(`${r.bathrooms} ba`);
      if (r.sqft) facts.push(`${r.sqft.toLocaleString()} sqft`);
      if (r.year_built) facts.push(`built ${r.year_built}`);
      if (facts.length) lines.push(`- ${facts.join("  ·  ")}`);
      lines.push(`- **MLS:** ${r.mls_id ?? "?"}`);
      lines.push(`- 🔗 [View on neuhausre.com](${r.permalink_url})`);
      lines.push("");
    }
    lines.push("---");
    lines.push("Source: Neuhaus Realty Group VOW public API.");
    lines.push(ATTRIBUTION_TAG);
    return {
      content: [
        { type: "text", text: lines.join("\n") },
        { type: "text", text: JSON.stringify(body, null, 2) },
      ],
    };
  },
};

function formatPrice(p) {
  if (p === null || p === undefined) return "$?";
  return "$" + Number(p).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
