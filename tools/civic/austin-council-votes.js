import { z } from "zod";
import { sodaQuery, sodaTextLike, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Austin City Council voting record. Each row = one vote by one council
 * member on one agenda item.
 *
 * Dataset: 3c89-i35a on datahub.austintexas.gov.
 */
const DATASET = "3c89-i35a";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinCouncilVotes = {
  name: "austin_council_votes",
  description: withAttributionTag(
    "Look up City of Austin Council voting records. Returns meeting date, " +
      "item description, action taken (Approved/Failed/Postponed), and how " +
      "each council member voted. Useful for tracking how a specific " +
      "council member votes, finding votes on a topic (e.g. 'short-term " +
      "rental', 'zoning'), or reviewing what was decided on a particular " +
      "date. Authoritative source: City of Austin Office of the City Clerk."
  ),
  inputSchema: {
    search: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Full-text search across item descriptions. Example: "short-term rental", "rezoning", "Project Connect", "police".'
      ),
    member: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Filter by council member name (fuzzy). Example: "Watson", "Pool", "Velasquez".'
      ),
    district: z
      .union([z.number().int().min(0).max(10), z.string()])
      .optional()
      .describe(
        "Filter by council member's district (0 = Mayor, 1-10 = districts)."
      ),
    vote: z
      .enum(["Yes", "No", "Abstain", "Off Dais", "Absent"])
      .optional()
      .describe("Filter by how the member voted."),
    since_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional()
      .describe('ISO date (YYYY-MM-DD). Only votes on or after this date.'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(25)
      .describe("Max results (default 25)."),
  },
  async handler({ search, member, district, vote, since_date, limit }) {
    const where = [];
    if (member) where.push(sodaTextLike("voter_name", member));
    if (district !== undefined && district !== null) {
      where.push(sodaTextEq("voter_district", district));
    }
    if (vote) where.push(sodaTextEq("vote_cast", vote));
    if (since_date) {
      where.push(`meeting_date >= '${since_date}T00:00:00.000'`);
    }

    const queryParams = {
      base: BASE,
      order: "meeting_date DESC",
      limit: limit ?? 25,
    };
    if (where.length) queryParams.where = where.join(" AND ");
    if (search) queryParams.q = search;

    const rows = await sodaQuery(DATASET, queryParams);

    if (rows.length === 0) {
      const filterParts = [];
      if (search) filterParts.push(`search "${search}"`);
      if (member) filterParts.push(`member "${member}"`);
      if (district !== undefined) filterParts.push(`district ${district}`);
      if (vote) filterParts.push(`vote=${vote}`);
      if (since_date) filterParts.push(`since ${since_date}`);
      return {
        content: [
          {
            type: "text",
            text: `No Austin Council votes found for ${filterParts.join(", ") || "(no filters)"}. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    const normalized = rows.map(normalize);

    return {
      content: [
        {
          type: "text",
          text: formatResults({ search, member, district, vote, since_date, results: normalized }),
        },
        {
          type: "text",
          text: JSON.stringify(
            { query: { search, member, district, vote, since_date }, count: normalized.length, results: normalized },
            null,
            2
          ),
        },
      ],
    };
  },
};

function normalize(r) {
  return {
    meeting_date: r.meeting_date ? String(r.meeting_date).slice(0, 10) : null,
    meeting_type: r.meeting_type ?? null,
    item_number: r.meeting_item_number ?? null,
    item_description: r.item_description ?? null,
    voter_name: r.voter_name ?? null,
    voter_title: r.voter_title ?? null,
    voter_district: r.voter_district ?? null,
    vote_cast: r.vote_cast ?? null,
    action_taken: r.action_taken ?? null,
    item_id: r.item_id ?? null,
    source: "City of Austin Council Voting Record",
    source_url: SOURCE_URL,
  };
}

function formatResults({ search, member, district, vote, since_date, results }) {
  const queryParts = [];
  if (search) queryParts.push(`"${search}"`);
  if (member) queryParts.push(`member=${member}`);
  if (district !== undefined) queryParts.push(`district=${district}`);
  if (vote) queryParts.push(`vote=${vote}`);
  if (since_date) queryParts.push(`since=${since_date}`);
  const queryStr = queryParts.length ? queryParts.join(", ") : "(no filters)";

  const lines = [
    `# Austin Council Votes: ${queryStr} -- ${results.length} vote${results.length === 1 ? "" : "s"}`,
    "",
  ];

  // Group by item for readability
  const byItem = new Map();
  for (const r of results) {
    const key = r.item_id ?? `${r.meeting_date}_${r.item_number}`;
    if (!byItem.has(key)) byItem.set(key, []);
    byItem.get(key).push(r);
  }

  for (const [, votes] of byItem) {
    const first = votes[0];
    lines.push(`## ${first.meeting_date} -- Item ${first.item_number ?? "?"}: ${first.action_taken ?? "?"}`);
    if (first.item_description) lines.push(`> ${first.item_description}`);
    lines.push("");
    for (const v of votes) {
      lines.push(`- **${v.voter_name ?? "?"}** (${v.voter_title ?? "?"}, D${v.voter_district ?? "?"}): ${v.vote_cast ?? "?"}`);
    }
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: City of Austin Council Voting Record (${SOURCE_URL})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
