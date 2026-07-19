import { z } from "zod";
import { sodaQuery, sodaTextEq } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Texas Education Agency school lookup -- merges two data.texas.gov datasets:
 *
 *   1. nui6-x374 -- "School Year 2022-2023 Statewide Accountability Ratings"
 *      (overall A-F rating + sub-scores per campus and per district)
 *
 *   2. hzek-udky -- "AskTED Data" (campus directory: address, phone, website,
 *      enrollment, ESC region)
 *
 * NOTE: TEA does NOT publish address-to-assigned-school mapping (attendance
 * zones live with individual ISDs). This tool searches by campus name,
 * district, county, or city. To find a property's assigned schools by
 * address, use the AISD/Eanes/LTISD attendance-zone GIS in a future tool.
 */

const BASE = "https://data.texas.gov";
const RATINGS_DATASET = "nui6-x374";
const ASKTED_DATASET = "hzek-udky";
const RATINGS_URL = `${BASE}/d/${RATINGS_DATASET}`;
const ASKTED_URL = `${BASE}/d/${ASKTED_DATASET}`;

export const teaSchools = {
  name: "tea_schools",
  description: withAttributionTag(
    "Look up Texas public schools and their TEA accountability ratings. " +
      "Search by campus name, district, county, or city. Returns the A-F " +
      "overall rating, sub-scores (Student Achievement, School Progress, " +
      "Closing the Gaps), enrollment, demographics, district info, address, " +
      "phone, and website. Authoritative sources: Texas Education Agency " +
      "(2022-2023 ratings) and AskTED directory. Note: this does NOT map " +
      "an address to its assigned schools -- attendance zones are managed " +
      "by individual ISDs."
  ),
  inputSchema: {
    campus: z
      .string()
      .min(2)
      .optional()
      .describe(
        'Campus name, fuzzy contains. Example: "Lake Travis Elementary" or "Bowie HS".'
      ),
    district: z
      .string()
      .min(2)
      .optional()
      .describe(
        'District name, fuzzy contains. Example: "Austin ISD", "Eanes", "Lake Travis", "Leander".'
      ),
    county: z
      .string()
      .min(2)
      .optional()
      .describe(
        'County name (e.g. "TRAVIS", "WILLIAMSON", "HAYS"). Returns all campuses in that county.'
      ),
    city: z
      .string()
      .min(2)
      .optional()
      .describe('Campus city (e.g. "AUSTIN", "BEE CAVE", "CEDAR PARK"). Filters AskTED directory by city.'),
    rating: z
      .enum(["A", "B", "C", "D", "F"])
      .optional()
      .describe("Filter by 2022-2023 overall rating."),
    school_type: z
      .enum(["Elementary School", "Middle School", "High School", "District", "Other"])
      .optional()
      .describe("Filter by campus level."),
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(25)
      .describe("Max results (default 25)."),
  },
  async handler(args) {
    const { campus, district, county, city, rating, school_type, limit } = args;
    if (!campus && !district && !county && !city) {
      return errorContent(
        "tea_schools requires at least one of: campus, district, county, or city."
      );
    }

    // Pull ratings (campus rows only -- the dataset includes district rows
    // but they don't have campus_number).
    const ratingsWhere = ["campus_number IS NOT NULL"];
    if (campus) ratingsWhere.push(`upper(campus) like '%${esc(campus)}%'`);
    if (district) ratingsWhere.push(`upper(district) like '%${esc(district)}%'`);
    if (county) ratingsWhere.push(`upper(county) like '%${esc(county)}%'`);
    if (rating) ratingsWhere.push(`overall_rating = '${rating}'`);
    if (school_type) ratingsWhere.push(sodaTextEq("school_type", school_type));

    const ratings = await sodaQuery(RATINGS_DATASET, {
      base: BASE,
      where: ratingsWhere.join(" AND "),
      order: "overall_score DESC NULLS LAST",
      limit: limit ?? 25,
    });

    // Optional AskTED directory join. AskTED uses school_number which matches
    // ratings.campus_number but with a leading apostrophe-quote (Socrata
    // string-padding artifact). Match on the trailing 9 digits.
    let askTedByNum = new Map();
    const campusNumbers = ratings.map((r) => r.campus_number).filter(Boolean);
    if (campusNumbers.length > 0) {
      const inList = campusNumbers
        .map((n) => `'${n}'`)
        .concat(campusNumbers.map((n) => `'\\'${n}'`)) // try with leading apostrophe encoding
        .join(",");
      try {
        const ted = await sodaQuery(ASKTED_DATASET, {
          base: BASE,
          where: `school_number in (${campusNumbers.map((n) => `'${n}'`).join(",")}) OR school_number in (${campusNumbers.map((n) => `'\\'${n}'`).join(",")})`,
          limit: campusNumbers.length,
        });
        for (const t of ted) {
          const n = (t.school_number ?? "").replace(/^'/, "");
          askTedByNum.set(n, t);
        }
      } catch {
        // AskTED join is best-effort; don't fail the whole tool.
      }
    }

    // City filter applied after directory join (AskTED has school_city).
    let merged = ratings.map((r) => mergeRow(r, askTedByNum.get(r.campus_number)));
    if (city) {
      const c = city.toUpperCase();
      merged = merged.filter(
        (r) => r.school_city && r.school_city.toUpperCase().includes(c)
      );
    }

    if (merged.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No TEA campuses matched the filters. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    return {
      content: [
        { type: "text", text: formatResults(args, merged) },
        {
          type: "text",
          text: JSON.stringify(
            { query: args, count: merged.length, results: merged },
            null,
            2
          ),
        },
      ],
    };
  },
};

function esc(s) {
  return String(s).toUpperCase().replace(/'/g, "''");
}

function mergeRow(rating, ted) {
  return {
    campus: rating.campus ?? null,
    campus_number: rating.campus_number ?? null,
    school_type: rating.school_type ?? null,
    grades_served: rating.grades_served ?? null,
    district: rating.district ?? null,
    district_number: rating.district_number ?? null,
    county: rating.county ?? null,
    region: rating.region ?? null,
    enrollment: numOrNull(rating.number_of_students),
    economically_disadvantaged_pct: pctOrNull(rating.economically_disadvantaged),
    el_pct: pctOrNull(rating.eb_el_students),
    rating: {
      overall: rating.overall_rating ?? null,
      overall_score: numOrNull(rating.overall_score),
      student_achievement: rating.student_achievement_rating ?? null,
      student_achievement_score: numOrNull(rating.student_achievement_score),
      school_progress: rating.school_progress_rating ?? null,
      school_progress_score: numOrNull(rating.school_progress_score),
      academic_growth: rating.academic_growth_rating ?? null,
      academic_growth_score: numOrNull(rating.academic_growth_score),
      relative_performance: rating.relative_performance_rating ?? null,
      relative_performance_score: numOrNull(rating.relative_performance_score),
      closing_the_gaps: rating.closing_the_gaps_rating ?? null,
      closing_the_gaps_score: numOrNull(rating.closing_the_gaps_score),
      year: "2022-2023",
    },
    school_address: ted?.school_street_address ?? null,
    school_city: ted?.school_city ?? null,
    school_state: ted?.school_state ?? null,
    school_zip: ted?.school_zip ?? null,
    school_phone: ted?.school_phone ?? null,
    school_website: ted?.school_web_page_address ?? null,
    instruction_type: ted?.instruction_type ?? null,
    magnet_status: ted?.magnet_status ?? null,
    superintendent: ted?.district_superintendent ?? null,
    source_url: RATINGS_URL,
    sources: {
      ratings: RATINGS_URL,
      directory: ASKTED_URL,
    },
  };
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function pctOrNull(v) {
  const n = numOrNull(v);
  if (n === null) return null;
  return Math.round(n * 1000) / 10; // 0.497 -> 49.7
}

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}

function formatResults(args, results) {
  const filterParts = [];
  if (args.campus) filterParts.push(`campus="${args.campus}"`);
  if (args.district) filterParts.push(`district="${args.district}"`);
  if (args.county) filterParts.push(`county="${args.county}"`);
  if (args.city) filterParts.push(`city="${args.city}"`);
  if (args.rating) filterParts.push(`rating=${args.rating}`);
  if (args.school_type) filterParts.push(`type=${args.school_type}`);

  const lines = [
    `# TEA Schools: ${filterParts.join(", ")} -- ${results.length} campus${results.length === 1 ? "" : "es"}`,
    "",
  ];

  // Rating distribution
  const byRating = {};
  for (const r of results) {
    const g = r.rating?.overall ?? "?";
    byRating[g] = (byRating[g] ?? 0) + 1;
  }
  const dist = ["A", "B", "C", "D", "F", "?"]
    .filter((g) => byRating[g])
    .map((g) => `${g}: ${byRating[g]}`)
    .join("  |  ");
  if (dist) {
    lines.push(`**2022-2023 rating distribution:** ${dist}`);
    lines.push("");
  }

  for (const r of results.slice(0, 25)) {
    lines.push(`## ${r.campus ?? "(unknown)"} (${r.rating?.overall ?? "?"})`);
    lines.push(`- **District:** ${r.district ?? "?"} (${r.district_number ?? ""})`);
    if (r.school_type) lines.push(`- **Type:** ${r.school_type}${r.grades_served ? ` (grades ${r.grades_served})` : ""}`);
    if (r.county) lines.push(`- **County:** ${r.county}`);
    if (r.enrollment !== null) lines.push(`- **Enrollment:** ${r.enrollment}`);
    if (r.economically_disadvantaged_pct !== null) {
      lines.push(`- **Econ. disadvantaged:** ${r.economically_disadvantaged_pct}%`);
    }
    if (r.rating) {
      const x = r.rating;
      lines.push(
        `- **2022-23 Ratings:** Overall ${x.overall ?? "?"} (${x.overall_score ?? "?"}) | ` +
          `Achievement ${x.student_achievement ?? "?"} (${x.student_achievement_score ?? "?"}) | ` +
          `Progress ${x.school_progress ?? "?"} (${x.school_progress_score ?? "?"}) | ` +
          `Closing Gaps ${x.closing_the_gaps ?? "?"} (${x.closing_the_gaps_score ?? "?"})`
      );
    }
    if (r.school_address) {
      const addr = [r.school_address, r.school_city, r.school_state, r.school_zip]
        .filter(Boolean)
        .join(", ");
      lines.push(`- **Address:** ${addr}`);
    }
    if (r.school_phone) lines.push(`- **Phone:** ${r.school_phone}`);
    if (r.school_website) lines.push(`- **Website:** ${r.school_website}`);
    lines.push("");
  }
  if (results.length > 25) {
    lines.push(`...and ${results.length - 25} more in the JSON payload below.`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(`Source: TEA Statewide Accountability Ratings 2022-2023 (${RATINGS_URL}) + AskTED Directory (${ASKTED_URL}).`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
