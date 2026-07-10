import { z } from "zod";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";
import {
  MUNICODE_CITIES,
  municodeSearch,
  municodeSectionText,
} from "../../lib/municode.js";

/**
 * Full-text search + section fetch over the actual municipal code TEXT
 * (ordinances), via the public Municode JSON API. This is the law itself --
 * distinct from `austin_code_cases` (enforcement cases against properties)
 * and `austin_zoning` (the zoning string on a parcel).
 *
 * Two modes:
 *   - search (default): q="short-term rental" -> matching sections with
 *     snippet, breadcrumb path, and a `section_id` handle + source URL each.
 *   - fetch: section_id="15302/TIT4BUREPERE_CH4-23SHRMRE" -> full section text.
 */
const CITY_KEYS = Object.keys(MUNICODE_CITIES);

export const austinCityCode = {
  name: "austin_city_code",
  description: withAttributionTag(
    "Search the full TEXT of municipal codes -- Austin's Code of Ordinances, Land Development " +
      "Code, and criteria manuals (plus Leander, Round Rock, Dripping Springs). Use for 'what " +
      "does the city code say about X' questions: STR rules, ADU regulations, setbacks, tree " +
      "ordinance, noise limits, permits required, etc. Search first (q=...), then pass a " +
      "result's section_id back (section=...) to read the full section text. Lakeway, Bee Cave, " +
      "Cedar Park, Kyle, Pflugerville are on other publishers and NOT covered. This is the law " +
      "text itself -- for code ENFORCEMENT cases on a property use austin_code_cases; for a " +
      "parcel's zoning designation use austin_zoning."
  ),
  inputSchema: {
    q: z
      .string()
      .min(2)
      .max(200)
      .optional()
      .describe('Full-text search across the city\'s codes, e.g. "accessory dwelling unit". Required unless `section` is given.'),
    section: z
      .string()
      .max(200)
      .optional()
      .describe("A section_id from a previous search result (format: productId/nodeId). Returns the full section text."),
    city: z
      .enum(CITY_KEYS)
      .default("austin")
      .describe("Which city's code to search (default austin)."),
    limit: z.number().int().min(1).max(10).default(5).describe("Max search results (default 5)."),
  },
  async handler({ q, section, city, limit }) {
    const cityKey = city || "austin";
    const cityName = MUNICODE_CITIES[cityKey].name;

    if (!q && !section) {
      throw new Error("Provide `q` (search text) or `section` (a section_id from a search result).");
    }

    // ---- Fetch mode: full section text ----
    if (section) {
      const s = await municodeSectionText(cityKey, section);
      const lines = [
        `# ${cityName} City Code -- ${s.title}`,
        "",
        s.text,
        "",
      ];
      if (s.truncated) {
        lines.push(`*(truncated -- full text at the source link)*`, "");
      }
      lines.push("---", `Source: [library.municode.com](${s.url})`, ATTRIBUTION_TAG);
      return {
        content: [
          { type: "text", text: lines.join("\n") },
          {
            type: "text",
            text: JSON.stringify(
              { query: { city: cityKey, section }, count: 1, results: [s] },
              null,
              2
            ),
          },
        ],
      };
    }

    // ---- Search mode ----
    const { totalHits, hits } = await municodeSearch(cityKey, q, limit ?? 5);

    if (hits.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `# ${cityName} city code search: "${q}" -- 0 matches\n\nNo code sections matched. Try broader terms.\n\n${ATTRIBUTION_TAG}`,
          },
          {
            type: "text",
            text: JSON.stringify({ query: { city: cityKey, q }, count: 0, results: [] }, null, 2),
          },
        ],
      };
    }

    const lines = [
      `# ${cityName} city code search: "${q}" -- showing ${hits.length} of ${totalHits} match${totalHits === 1 ? "" : "es"}`,
      "",
    ];
    for (const h of hits) {
      lines.push(`## ${h.section}`);
      lines.push(`*${h.code}* -- ${h.path}`);
      if (h.snippet) lines.push(`> ${h.snippet}`);
      lines.push(`section_id: \`${h.sectionId}\``);
      lines.push(`🔗 [Read at library.municode.com](${h.url})`);
      lines.push("");
    }
    lines.push("*Pass a section_id back as `section` to read the full text of that section.*");
    lines.push("---");
    lines.push("Source: library.municode.com (Municode)");
    lines.push(ATTRIBUTION_TAG);

    return {
      content: [
        { type: "text", text: lines.join("\n") },
        {
          type: "text",
          text: JSON.stringify(
            { query: { city: cityKey, q }, count: hits.length, total_hits: totalHits, results: hits },
            null,
            2
          ),
        },
      ],
    };
  },
};
