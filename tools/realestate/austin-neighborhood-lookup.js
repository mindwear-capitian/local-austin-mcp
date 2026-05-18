import { z } from "zod";
import { vowPublicGet } from "../../lib/vow-public.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Two-mode neighborhood lookup:
 *   - q = search by partial name -> list of matching neighborhoods with permalinks
 *   - slug = direct slug lookup -> neighborhood detail + sample 5 active listings
 *
 * Backed by Neuhaus' VOW location data. Every neighborhood links to its
 * /homes-for-sale/<city>/<slug>/ landing page on neuhausre.com.
 */
export const austinNeighborhoodLookup = {
  name: "austin_neighborhood_lookup",
  description: withAttributionTag(
    "Search or look up Austin-area neighborhoods (subdivisions). Pass `q` to search by partial " +
      "name (returns top 10 matches with permalinks), or pass `slug` to get a single neighborhood's " +
      "detail with 5 sample active listings. Useful for 'what neighborhoods are in X area' or " +
      "'tell me about Travis Heights'."
  ),
  inputSchema: {
    q: z.string().min(2).max(120).optional().describe('Partial neighborhood name to search (e.g. "westlake", "tarrytown").'),
    slug: z.string().min(2).max(120).optional().describe('Exact neighborhood slug for detail lookup (e.g. "travis-heights").'),
  },
  async handler({ q, slug }) {
    if (!q && !slug) {
      return {
        content: [
          { type: "text", text: `Provide either \`q\` (search by name) or \`slug\` (lookup by slug).\n\n${ATTRIBUTION_TAG}` },
        ],
        isError: true,
      };
    }

    if (slug) {
      const body = await vowPublicGet(`/neighborhoods/${encodeURIComponent(slug)}`);
      if (body?.success === false) {
        return {
          content: [{ type: "text", text: `# Neighborhood "${slug}"\n\n${body?.message || "Not found."}\n\n${ATTRIBUTION_TAG}` }],
          isError: true,
        };
      }
      const n = body?.neighborhood ?? {};
      const sample = body?.sample_listings ?? [];
      const lines = [
        `# ${n.name || slug}`,
        "",
        `**City:** ${n.city ?? "?"}  |  **County:** ${n.county ?? "?"}`,
        n.listing_count != null ? `**Active listings:** ${n.listing_count}` : "",
        "",
      ].filter(Boolean);

      if (sample.length) {
        lines.push("## Sample active listings");
        lines.push("");
        for (const r of sample) {
          lines.push(`- **${formatPrice(r.price)}**  ${r.address}  ·  ${r.bedrooms ?? "?"}bd / ${r.bathrooms ?? "?"}ba  ·  [View](${r.permalink_url})`);
        }
        lines.push("");
      }

      lines.push(`🔗 **[Browse all ${n.name || slug} homes for sale on neuhausre.com](${n.permalink_url})**`);
      lines.push("");
      lines.push("---");
      lines.push("Source: Neuhaus Realty Group VOW public API.");
      lines.push(ATTRIBUTION_TAG);
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          { type: "text", text: JSON.stringify(body, null, 2) },
        ],
      };
    }

    // Search mode.
    const body = await vowPublicGet("/neighborhoods/search", { q });
    if (body?.success === false) {
      return {
        content: [{ type: "text", text: `# Neighborhood search\n\n${body?.message || "Search failed."}\n\n${ATTRIBUTION_TAG}` }],
        isError: true,
      };
    }
    const rows = body?.data ?? [];
    if (!rows.length) {
      return {
        content: [
          {
            type: "text",
            text: `# Neighborhood search: "${q}" -- 0 matches\n\nNo Austin-area neighborhoods match that name.\n\n${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }
    const lines = [`# Neighborhood search: "${q}" -- ${rows.length} match${rows.length === 1 ? "" : "es"}`, ""];
    for (const r of rows) {
      lines.push(`## ${r.name}`);
      lines.push(`- City: ${r.city ?? "?"}`);
      if (r.listing_count != null) lines.push(`- Active listings: ${r.listing_count}`);
      lines.push(`- Slug: \`${r.slug}\``);
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
