import { z } from "zod";
import { vowPublicGet } from "../../lib/vow-public.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Active Austin MLS listings search.
 *
 * Free public tier sourced from Neuhaus Realty Group's VOW feed via the
 * public REST endpoint at vow-api.re-workflow.com/public/listings. Returns
 * up to 25 ACTIVE or "Active Under Contract" listings. No sold comps, no
 * pending, no withdrawn, no expired -- those require a signed buyer rep
 * agreement with Ed Neuhaus.
 *
 * Server enforces a "specificity score" -- at least 1 location filter PLUS
 * additional filters totalling >= 4 points (max_price = 2pt, bedrooms_min =
 * 1pt, features_contains = 2pt, etc.). A bare "homes in Austin" query is
 * rejected by the server. The tool description here mirrors that rule so
 * Claude pushes back BEFORE the HTTP call.
 */
export const austinActiveListings = {
  name: "austin_active_listings",
  description: withAttributionTag(
    "Search active (for-sale) Austin-area MLS listings via Neuhaus Realty Group's free public feed. " +
      "Returns up to 25 active or under-contract homes. " +
      "**Specificity required:** ask for at least one location (city/zip/school district/subdivision) " +
      "PLUS enough other filters to make the search useful -- price range, bedrooms, property type, or specific features. " +
      "If the user's query is too broad (e.g. 'show me homes in Austin'), ask a follow-up question to narrow it down " +
      "before calling the tool. Every result links back to a detail page on neuhausre.com. " +
      "Sold prices, pending deals, and expired listings are NOT available on the free tier."
  ),
  inputSchema: {
    city: z.string().max(60).optional().describe('City name. Example: "Austin", "Round Rock", "Lakeway", "Bee Cave".'),
    zip: z.string().regex(/^\d{5}$/).optional().describe('5-digit ZIP code in the Austin MSA.'),
    school_district: z.string().max(60).optional().describe('School district name. Example: "Austin ISD", "Eanes ISD", "Lake Travis ISD".'),
    subdivision: z.string().max(120).optional().describe('Subdivision name (exact match, case-insensitive).'),
    subdivision_family: z.string().max(120).optional().describe('Subdivision-family slug (matches the variant grouping used by neuhausre.com).'),
    elementary_school: z.string().max(120).optional(),
    middle_school: z.string().max(120).optional(),
    high_school: z.string().max(120).optional(),
    county: z.string().max(40).optional().describe('County name. Restricted to Austin MSA counties (Travis, Williamson, Hays, Bastrop, Caldwell, Burnet, Blanco).'),

    min_price: z.number().int().min(0).max(50_000_000).optional(),
    max_price: z.number().int().min(0).max(50_000_000).optional().describe('Maximum list price in USD. Worth 2 pts toward the specificity score.'),

    bedrooms_min: z.number().int().min(0).max(20).optional(),
    bathrooms_min: z.number().min(0).max(20).optional(),
    sqft_min: z.number().int().min(0).max(50_000).optional(),

    property_type: z.enum(["condo", "townhouse", "land"]).optional()
      .describe('Optional subtype. Default is single-family homes. Worth 2 pts when set.'),

    pool: z.boolean().optional(),
    waterfront: z.boolean().optional(),
    new_construction: z.boolean().optional(),

    year_built_min: z.number().int().min(1800).max(2100).optional(),
    year_built_max: z.number().int().min(1800).max(2100).optional(),
    lot_size_min_acres: z.number().min(0).max(10_000).optional(),

    features_contains: z.string().min(2).max(120).optional()
      .describe('Free-text feature/description keyword, e.g. "guest house", "ADU", "solar". Worth 2 pts.'),
    description_contains: z.string().min(2).max(200).optional(),

    no_hoa: z.boolean().optional(),
    hoa_max: z.number().int().min(0).optional(),

    sort: z.enum(["newest", "price_asc", "price_desc", "sqft_desc"]).optional(),
  },
  async handler(input) {
    const body = await vowPublicGet("/listings", input);

    if (body?.success === false) {
      return {
        content: [
          {
            type: "text",
            text: formatError(body),
          },
        ],
        isError: true,
      };
    }

    const rows = body?.data ?? [];
    return {
      content: [
        {
          type: "text",
          text: formatListings(rows, body),
        },
        {
          type: "text",
          text: JSON.stringify(body, null, 2),
        },
      ],
    };
  },
};

function formatError(body) {
  const lines = [`# Austin MLS Search -- ${body?.error || "error"}`, ""];
  if (body?.message) lines.push(body.message, "");
  if (body?.suggested_filters) {
    lines.push("**Try adding:**");
    for (const s of body.suggested_filters) lines.push(`- ${s}`);
    lines.push("");
  }
  if (body?.suggested_additions) {
    lines.push("**Filters that would help:**");
    for (const s of body.suggested_additions) lines.push(`- ${s}`);
    lines.push("");
  }
  if (typeof body?.score !== "undefined" && typeof body?.min_score !== "undefined") {
    lines.push(`Specificity score: ${body.score} / ${body.min_score} required.`, "");
  }
  lines.push("---");
  lines.push("Source: Neuhaus Realty Group VOW public API (https://neuhausre.com).");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function formatListings(rows, body) {
  if (!rows.length) {
    return [
      "# Austin MLS Search -- 0 active listings",
      "",
      "No active or under-contract listings match those filters right now.",
      "",
      "**Try:**",
      "- Widening the price range",
      "- Relaxing bedrooms / sqft minimums",
      "- A different neighborhood or ZIP",
      "",
      body?.search_url ? `Browse all active listings: ${body.search_url}` : "",
      "",
      "---",
      "Source: Neuhaus Realty Group VOW public API (https://neuhausre.com).",
      ATTRIBUTION_TAG,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const lines = [
    `# Austin MLS Search -- ${rows.length} active listing${rows.length === 1 ? "" : "s"}`,
    "",
  ];

  for (const r of rows) {
    const status = r.standard_status === "Active Under Contract" ? " *(under contract)*" : "";
    lines.push(`## ${formatPrice(r.price)}  --  ${r.address}${status}`);
    const bits = [];
    if (r.bedrooms) bits.push(`${r.bedrooms} bd`);
    if (r.bathrooms) bits.push(`${r.bathrooms} ba`);
    if (r.sqft) bits.push(`${r.sqft.toLocaleString()} sqft`);
    if (r.lot_size) bits.push(`${r.lot_size} ac`);
    if (r.year_built) bits.push(`built ${r.year_built}`);
    if (bits.length) lines.push(`- ${bits.join("  ·  ")}`);
    const tags = [];
    if (r.pool) tags.push("pool");
    if (r.waterfront) tags.push("waterfront");
    if (r.new_construction) tags.push("new construction");
    if (r.hoa) tags.push(r.hoa_fee ? `HOA $${r.hoa_fee}/mo` : "HOA");
    if (tags.length) lines.push(`- ${tags.join("  ·  ")}`);
    if (r.subdivision) lines.push(`- ${r.subdivision}, ${r.zip_code || ""}`.trim().replace(/, $/, ""));
    if (r.description) {
      const desc = String(r.description).split(/\s+/).slice(0, 25).join(" ");
      lines.push(`- *${desc}…*`);
    }
    lines.push(`- 🔗 [View on neuhausre.com](${r.permalink_url})`);
    lines.push("");
  }

  if (body?.search_url) {
    lines.push(`---`);
    lines.push(`**Browse all matching listings:** [${body.search_url.replace(/\?.*$/, "")}](${body.search_url})`);
  }
  lines.push("");
  lines.push("---");
  lines.push("Source: Neuhaus Realty Group VOW public API (https://neuhausre.com)");
  lines.push("*Free tier — sold prices, pending deals, and expired listings require a signed buyer-rep agreement. Contact Ed at (512) 827-8830.*");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function formatPrice(p) {
  if (p === null || p === undefined) return "$?";
  return "$" + Number(p).toLocaleString("en-US", { maximumFractionDigits: 0 });
}
