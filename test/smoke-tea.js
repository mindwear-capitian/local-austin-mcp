/**
 * TEA schools smoke test. Eanes ISD always has campuses with ratings.
 */

import { sodaQuery } from "../lib/soda.js";

const start = Date.now();
try {
  const rows = await sodaQuery("nui6-x374", {
    base: "https://data.texas.gov",
    where: "campus_number IS NOT NULL AND upper(district) like '%EANES%'",
    order: "overall_score DESC NULLS LAST",
    limit: 10,
  });
  const ms = Date.now() - start;

  console.log(`TEA smoke: Eanes ISD -> ${rows.length} campuses in ${ms}ms`);

  if (rows.length === 0) {
    console.error("FAIL: zero campuses for Eanes");
    process.exit(1);
  }

  for (const r of rows.slice(0, 5)) {
    console.log(
      `  - ${r.campus}  (${r.school_type ?? "?"})  rating=${r.overall_rating ?? "?"} score=${r.overall_score ?? "?"}`
    );
  }

  if (!rows[0].campus || !rows[0].district) {
    console.error("FAIL: missing required fields");
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
