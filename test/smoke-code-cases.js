/**
 * Live smoke test for Austin code cases. Hits a known address that has
 * confirmed code complaint history.
 */

import { sodaQuery, sodaAddressLike } from "../lib/soda.js";

const SENTINEL = "1100 BLAIR WAY"; // confirmed in dataset, 2025 case

const start = Date.now();
try {
  const rows = await sodaQuery("6wtj-zbtb", {
    base: "https://datahub.austintexas.gov",
    where: sodaAddressLike("address", SENTINEL),
    order: "opened_date DESC",
    limit: 5,
  });
  const ms = Date.now() - start;

  console.log(`Code cases smoke: "${SENTINEL}" -> ${rows.length} cases in ${ms}ms`);

  if (rows.length === 0) {
    console.error("FAIL: zero cases for sentinel address");
    process.exit(1);
  }

  for (const c of rows.slice(0, 3)) {
    console.log(
      `  - ${(c.opened_date ?? "?").slice(0, 10)}  ${c.status}  ${c.case_type ?? ""}  ${c.description ?? ""}  #${c.case_id}`
    );
  }

  const first = rows[0];
  if (!first.case_id || !first.address) {
    console.error("FAIL: missing required fields on first result");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
