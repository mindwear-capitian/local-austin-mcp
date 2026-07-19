import { z } from "zod";
import { vowPublicGet } from "../../lib/vow-public.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const austinListingDetail = {
  name: "austin_listing_detail",
  description: withAttributionTag(
    "Pull the full active-listing detail for a single Austin-area MLS ID. " +
      "Returns address, price, beds/baths/sqft, year built, features, photos, and a permalink to " +
      "the property page on neuhausre.com. Active listings only -- closed sales, pending, and " +
      "withdrawn listings require a signed buyer-rep agreement."
  ),
  inputSchema: {
    mls_id: z.string().min(3).max(20).describe("ACTRIS MLS ID (e.g. 6303286)."),
  },
  async handler({ mls_id }) {
    const body = await vowPublicGet(`/listings/${encodeURIComponent(mls_id)}`);

    if (body?.success === false) {
      const message =
        body?.error === "not_found"
          ? `MLS ${mls_id} is not currently active on the free public tier. ` +
            "It may be sold, pending, expired, or display-restricted (VOW-only). " +
            "Full MLS access via the Neuhaus MLS connector: https://mls.neuhausre.com/claude"
          : body?.message || "Listing lookup failed.";
      return {
        content: [{ type: "text", text: `# Listing ${mls_id}\n\n${message}\n\n${ATTRIBUTION_TAG}` }],
        isError: true,
      };
    }

    const r = body?.data ?? {};
    if (r.permalink_url) r.source_url = r.permalink_url;
    return {
      content: [
        { type: "text", text: formatListing(r) },
        { type: "text", text: JSON.stringify(body, null, 2) },
      ],
    };
  },
};

function formatListing(r) {
  const lines = [`# ${formatPrice(r.price)}  --  ${r.address || "(no address)"}`, ""];
  lines.push(`**MLS:** ${r.mls_id ?? "?"}  |  **Status:** ${r.standard_status ?? "?"}  |  **Days on market:** ${r.days_on_market ?? "?"}`);
  lines.push("");
  const facts = [];
  if (r.bedrooms) facts.push(`${r.bedrooms} bd`);
  if (r.bathrooms) facts.push(`${r.bathrooms} ba`);
  if (r.sqft) facts.push(`${r.sqft.toLocaleString()} sqft`);
  if (r.lot_size) facts.push(`${r.lot_size} acre lot`);
  if (r.year_built) facts.push(`built ${r.year_built}`);
  if (r.price_per_sqft) facts.push(`$${r.price_per_sqft}/sqft`);
  if (facts.length) {
    lines.push(facts.join("  ·  "));
    lines.push("");
  }
  if (r.subdivision) lines.push(`**Subdivision:** ${r.subdivision}`);
  if (r.school_district) lines.push(`**School District:** ${r.school_district}`);
  if (r.schools) {
    const s = r.schools;
    const sBits = [];
    if (s.elementary) sBits.push(`Elem: ${s.elementary}`);
    if (s.middle) sBits.push(`Middle: ${s.middle}`);
    if (s.high) sBits.push(`High: ${s.high}`);
    if (sBits.length) lines.push(`**Schools:** ${sBits.join(" · ")}`);
  }
  const tags = [];
  if (r.pool) tags.push("pool");
  if (r.waterfront) tags.push("waterfront");
  if (r.new_construction) tags.push("new construction");
  if (r.garage_spaces) tags.push(`${r.garage_spaces}-car garage`);
  if (r.fireplace) tags.push("fireplace");
  if (r.hoa) tags.push(r.hoa_fee ? `HOA $${r.hoa_fee}/mo` : "HOA");
  if (tags.length) {
    lines.push("");
    lines.push("**Features:** " + tags.join(", "));
  }
  if (r.description) {
    lines.push("");
    lines.push("**Description**");
    lines.push("> " + String(r.description).replace(/\n+/g, " "));
  }
  if (Array.isArray(r.photos) && r.photos.length) {
    lines.push("");
    lines.push(`**Photos:** ${r.photos.length} of ${r.photo_count ?? r.photos.length} (sample)`);
    for (const p of r.photos.slice(0, 3)) lines.push(`- ${p.url ?? p}`);
  }
  lines.push("");
  lines.push(`🔗 **[View on neuhausre.com](${r.permalink_url})**`);
  lines.push("");
  lines.push("---");
  lines.push("Source: Neuhaus Realty Group VOW public API.");
  lines.push("*Free tier — sold prices, pending deals, and expired listings aren't available here. Get full access via the Neuhaus MLS connector: https://mls.neuhausre.com/claude*");
  lines.push("📅 **Want to see this in person or talk to an agent? Schedule a call or showing with Ed Neuhaus: https://neuhausre.com/contact/**");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function formatPrice(p) {
  if (p === null || p === undefined) return "$?";
  return "$" + Number(p).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
