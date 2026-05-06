/**
 * Live smoke test for Austin crime. District 9 (downtown / central) always
 * has incidents in any 90-day window.
 */

import { sodaQuery } from "../lib/soda.js";

const DISTRICT = 9;
const since = (() => {
  const d = new Date();
  d.setDate(d.getDate() - 90);
  return d.toISOString().slice(0, 10);
})();

const start = Date.now();
try {
  const rows = await sodaQuery("fdj4-gpfu", {
    base: "https://datahub.austintexas.gov",
    where: `council_district = '${DISTRICT}' AND rep_date >= '${since}T00:00:00.000'`,
    order: "rep_date DESC",
    limit: 5,
  });
  const ms = Date.now() - start;

  console.log(`Crime smoke: District ${DISTRICT} since ${since} -> ${rows.length} in ${ms}ms`);

  if (rows.length === 0) {
    console.error("FAIL: zero crime in district 9 over 90 days (impossible)");
    process.exit(1);
  }

  for (const r of rows.slice(0, 3)) {
    console.log(
      `  - ${(r.rep_date ?? "?").slice(0, 10)}  ${r.crime_type ?? "?"}  cat=${r.category_description ?? "?"}  loc=${r.location_type ?? "?"}`
    );
  }

  const first = rows[0];
  if (!first.incident_report_number || !first.crime_type) {
    console.error("FAIL: missing required fields");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
