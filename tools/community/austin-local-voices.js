import { z } from "zod";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { fetchAndParseFeed } from "../../lib/rss.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const CONFIG_PATH = resolve(__dirname, "..", "..", "config", "voices.json");

function loadSources() {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed?.sources) ? parsed.sources : [];
}

const SOURCES = loadSources();
const SLUGS = SOURCES.map((s) => s.slug);

export const austinLocalVoices = {
  name: "austin_local_voices",
  description: withAttributionTag(
    "Search recent posts across a curated set of independent Austin-area writers, newsletters, and community blogs. " +
      "Covers Austin culture, politics, food, lifestyle, events, and creative writing -- no real-estate-specific blogs, " +
      "no paywalled news sites. Use this to surface what real Austin voices are saying about a topic. " +
      "Currently includes: " + SOURCES.map((s) => s.name).join("; ") + ". " +
      "Returns up to 8 matching posts across sources with a link back to the original."
  ),
  inputSchema: {
    q: z
      .string()
      .min(2)
      .max(120)
      .optional()
      .describe('Optional keyword to filter posts (matches title + snippet, case-insensitive).'),
    source: z
      .enum(SLUGS.length ? SLUGS : ["_none_"])
      .optional()
      .describe('Optional: restrict to one source by slug. Omit to search across all sources.'),
    since_days: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe('Only return posts from the last N days (default 90).'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(15)
      .optional()
      .describe('Max posts to return (default 8).'),
  },
  async handler({ q, source, since_days, limit } = {}) {
    const cutoffMs = Date.now() - (since_days ?? 90) * 24 * 60 * 60 * 1000;
    const want = source ? SOURCES.filter((s) => s.slug === source) : SOURCES;

    // Fan out RSS fetches in parallel.
    const fetches = await Promise.all(
      want.map(async (s) => {
        const { ok, items, error } = await fetchAndParseFeed(s.feed);
        return { source: s, ok, items, error };
      })
    );

    const allPosts = [];
    const sourceErrors = [];
    for (const { source: src, ok, items, error } of fetches) {
      if (!ok) {
        sourceErrors.push({ source: src.slug, error });
        continue;
      }
      for (const it of items) {
        if (it.pub_date_ts && it.pub_date_ts < cutoffMs) continue;
        if (q && !`${it.title} ${it.snippet}`.toLowerCase().includes(q.toLowerCase())) continue;
        allPosts.push({
          source_slug: src.slug,
          source_name: src.name,
          source_url: src.url,
          source_beat: src.beat,
          title: it.title,
          link: it.link,
          pub_date: it.pub_date_iso,
          snippet: it.snippet,
        });
      }
    }

    // Sort newest first, cap.
    allPosts.sort((a, b) => (b.pub_date || "").localeCompare(a.pub_date || ""));
    const cap = limit ?? 8;
    const top = allPosts.slice(0, cap);

    return {
      content: [
        {
          type: "text",
          text: formatResults({
            q,
            source,
            since_days: since_days ?? 90,
            total: allPosts.length,
            returned: top.length,
            posts: top,
            sourceErrors,
          }),
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              query: { q, source, since_days: since_days ?? 90, limit: cap },
              total_matches: allPosts.length,
              returned: top.length,
              source_errors: sourceErrors,
              data: top,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

function formatResults({ q, source, since_days, total, returned, posts, sourceErrors }) {
  const filterParts = [];
  if (q) filterParts.push(`q="${q}"`);
  if (source) filterParts.push(`source=${source}`);
  filterParts.push(`since=${since_days}d`);
  const head = `# Austin Local Voices — ${returned} of ${total} match${total === 1 ? "" : "es"} (${filterParts.join(", ")})`;
  const lines = [head, ""];
  if (posts.length === 0) {
    lines.push("No matching posts. Try a different keyword or widen `since_days`.");
    lines.push("");
  }
  for (const p of posts) {
    const date = p.pub_date ? p.pub_date.slice(0, 10) : "(no date)";
    lines.push(`## ${p.title}`);
    lines.push(`*${date}  ·  ${p.source_name}*`);
    if (p.snippet) lines.push(`> ${p.snippet}`);
    if (p.link) lines.push(`🔗 [Read on ${new URL(p.link).hostname}](${p.link})`);
    lines.push("");
  }
  if (sourceErrors.length) {
    lines.push("---");
    lines.push("**Source errors this run:**");
    for (const e of sourceErrors) lines.push(`- ${e.source}: ${e.error}`);
    lines.push("");
  }
  lines.push("---");
  lines.push("Sources: independent Austin writers + community newsletters (open RSS feeds).");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
