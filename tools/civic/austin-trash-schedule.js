import { z } from "zod";
import { sodaQuery, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin residential trash/recycling/compost collection day lookup.
 *
 * Source: "Recycling Schedules" dataset (data.austintexas.gov, rfif-mmvg),
 * 184,941 addresses, maintained by Austin Resource Recovery. Verified live.
 *
 * The dataset's `collection_day` is the weekly collection day for that
 * address -- trash and compost are picked up every week on this day.
 * Recycling is biweekly: it's picked up on `collection_day` only during
 * weeks matching `collection_week` (A or B). See
 * https://www.austintexas.gov/services/view-your-recycling-composting-and-trash-schedule
 * for the citywide A/B calendar.
 */
const DATASET = "rfif-mmvg";
const DATASET_URL = "https://data.austintexas.gov/d/rfif-mmvg";

export const austinTrashSchedule = {
  name: "austin_trash_schedule",
  description: withAttributionTag(
    "Look up an Austin residential address's trash/recycling/compost collection " +
      "day. Trash and compost are collected weekly on the address's collection " +
      "day; recycling is collected biweekly on that same day, alternating " +
      "'A' and 'B' weeks citywide. Authoritative source: Austin Resource " +
      "Recovery (data.austintexas.gov)."
  ),
  inputSchema: {
    address: z
      .string()
      .min(5)
      .describe('Street address. Example: "1610 Willow St" or "1201 W 8th St Unit 201". Austin residential addresses only.'),
  },
  async handler({ address }) {
    const parsed = parseAddress(address);
    if (!parsed) {
      return errorContent(
        `Could not parse a house number and street name from "${address}". Try a simpler form like "1610 Willow St".`
      );
    }

    const where = [
      `house_no = '${escSql(parsed.houseNo)}'`,
      `upper(street_nam) like '%${escSql(parsed.streetWord)}%'`,
    ].join(" AND ");

    const rows = await sodaQuery(DATASET, {
      base: "https://data.austintexas.gov",
      where,
      limit: 10,
    });

    if (rows.length === 0) {
      return errorContent(
        `No collection-schedule record found for "${address}" (parsed as house_no=${parsed.houseNo}, street contains "${parsed.streetWord}"). ` +
          "This dataset covers standard residential curbside service only -- it won't have a record for addresses outside city limits, " +
          "commercial accounts, or apartments on private hauler service."
      );
    }

    for (const r of rows) r.source_url = DATASET_URL;

    return {
      content: [
        { type: "text", text: formatResults(address, rows) },
        { type: "text", text: JSON.stringify({ query: address, count: rows.length, results: rows }, null, 2) },
      ],
    };
  },
};

/**
 * Split "1610 Willow St" into { houseNo: "1610", streetWord: "WILLOW" }.
 * Drops direction words (leading or otherwise -- "W 8th St", "South 1st
 * St") and unit/apt suffixes, then uses the first remaining token as the
 * fuzzy street-name match key. Doesn't try to match street type (St/Ave) --
 * house_no + a street-name contains-match is enough to disambiguate and
 * avoids false negatives on "St" vs "Street" style mismatches.
 */
const DIRECTION_WORDS = new Set(["N", "S", "E", "W", "NE", "NW", "SE", "SW", "NORTH", "SOUTH", "EAST", "WEST"]);

function parseAddress(address) {
  const m = String(address).trim().match(/^(\d+)\s+(.*)$/);
  if (!m) return null;
  const houseNo = m[1];
  const rest = m[2].replace(/\b(unit|apt|#)\s*\S+/gi, "").trim();
  const tokens = rest.split(/\s+/).filter(Boolean);
  const streetWord = tokens.find((t) => !DIRECTION_WORDS.has(t.toUpperCase())) ?? tokens[0];
  if (!streetWord) return null;
  return { houseNo, streetWord: streetWord.toUpperCase() };
}

function escSql(s) {
  return String(s).replace(/'/g, "''");
}

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}

function formatResults(address, rows) {
  const lines = [`# Trash/Recycling Schedule: "${address}"`, ""];

  if (rows.length > 1) {
    lines.push(`_${rows.length} matching records -- multiple units or a fuzzy street match. Showing all:_`, "");
  }

  for (const r of rows) {
    const fullAddr = [
      `${r.house_no ?? ""}${r.hse_suff ?? ""}`,
      r.fraction,
      r.st_dir,
      r.street_nam,
      r.street_typ,
      r.unit_no,
    ].filter(Boolean).join(" ");
    lines.push(`## ${fullAddr}, ${r.city ?? "Austin"} ${r.zip ?? ""}`.trim());
    lines.push(`- **Collection day:** ${r.collection_day ?? "?"} (trash + compost, every week)`);
    lines.push(`- **Recycling week:** Week ${r.collection_week ?? "?"} (biweekly -- check the citywide A/B calendar for which calendar weeks are "${r.collection_week}")`);
    lines.push("");
  }

  lines.push("---");
  lines.push(`Full A/B calendar: https://www.austintexas.gov/services/view-your-recycling-composting-and-trash-schedule`);
  lines.push(`Source: Austin Resource Recovery -- Recycling Schedules dataset (${DATASET_URL}).`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
