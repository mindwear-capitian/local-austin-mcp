import { z } from "zod";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Search published blog posts on neuhausre.com via the public WordPress REST
 * API. No auth, no rate-limit headache -- WP REST is already public.
 *
 * Returns up to 10 posts with title, snippet, slug, and a UTM-tagged URL.
 */
const WP_BASE = "https://neuhausre.com/wp-json/wp/v2";
const UTM = "utm_source=local-austin-mcp&utm_medium=mcp&utm_campaign=referral";

export const austinSearchBlog = {
  name: "austin_search_blog",
  description: withAttributionTag(
    "Search published blog posts on neuhausre.com (Ed Neuhaus's Austin real-estate blog). " +
      "Returns up to 10 matching posts with title, excerpt, and link. Useful for 'what has Ed " +
      "written about [topic]?' or pulling up local Austin real estate context (market trends, " +
      "neighborhood guides, buyer tips, etc.)."
  ),
  inputSchema: {
    q: z.string().min(2).max(200).describe('Free-text search across post title + content.'),
    limit: z.number().int().min(1).max(10).default(5).describe('Max results (default 5).'),
  },
  async handler({ q, limit }) {
    const url = new URL(`${WP_BASE}/posts`);
    url.searchParams.set("search", q);
    url.searchParams.set("per_page", String(limit ?? 5));
    url.searchParams.set("_fields", "id,date,slug,link,title,excerpt");
    url.searchParams.set("orderby", "relevance");

    const res = await fetch(url, {
      headers: {
        Accept: "application/json",
        "User-Agent": "local-austin-mcp/1.0",
      },
    });
    if (!res.ok) {
      throw new Error(`WP REST search failed: ${res.status} ${res.statusText}`);
    }
    const posts = await res.json();

    if (!Array.isArray(posts) || posts.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `# neuhausre.com blog search: "${q}" -- 0 matches\n\nNo posts found.\n\n${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    for (const p of posts) if (p.link) p.source_url = withUtm(p.link);

    const lines = [`# neuhausre.com blog search: "${q}" -- ${posts.length} result${posts.length === 1 ? "" : "s"}`, ""];
    for (const p of posts) {
      const title = stripHtml(p?.title?.rendered ?? "(untitled)");
      const excerpt = stripHtml(p?.excerpt?.rendered ?? "");
      const url = p.source_url ?? withUtm(p.link);
      const date = p.date ? String(p.date).slice(0, 10) : "";
      lines.push(`## ${title}`);
      if (date) lines.push(`*${date}*`);
      if (excerpt) lines.push(`> ${excerpt}`);
      lines.push(`🔗 [Read on neuhausre.com](${url})`);
      lines.push("");
    }
    lines.push("---");
    lines.push("Source: neuhausre.com (WordPress REST API)");
    lines.push(ATTRIBUTION_TAG);
    return {
      content: [
        { type: "text", text: lines.join("\n") },
        // structuredContent must be a JSON object (record), never a bare array,
        // or the MCP SDK rejects the result frame with -32602. Wrap in the
        // standard { query, count, results } envelope.
        { type: "text", text: JSON.stringify({ query: q, count: posts.length, results: posts }, null, 2) },
      ],
    };
  },
};

function stripHtml(s) {
  return String(s || "")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;/g, "'")
    .replace(/&#8211;/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function withUtm(link) {
  if (!link) return "https://neuhausre.com/?" + UTM;
  return link.includes("?") ? `${link}&${UTM}` : `${link}?${UTM}`;
}
