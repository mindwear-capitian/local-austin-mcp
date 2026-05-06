/**
 * Live smoke test for Austin 311. Hits a known-good address with confirmed
 * 311 history.
 */

import { sodaQuery, sodaAddressLike } from "../lib/soda.js";

const SENTINEL = "4507 KNAP"; // confirmed in dataset (2014+)
const SINCE_YEAR = new Date().getFullYear() - 2;

const start = Date.now();
try {
  const rows = await sodaQuery("xwdj-i9he", {
    base: "https://datahub.austintexas.gov",
    where:
      sodaAddressLike("sr_location", SENTINEL) +
      ` AND sr_created_date >= '${SINCE_YEAR}-01-01T00:00:00.000'`,
    order: "sr_created_date DESC",
    limit: 5,
  });
  const ms = Date.now() - start;

  console.log(`311 smoke: "${SENTINEL}" -> ${rows.length} requests in ${ms}ms`);

  if (rows.length === 0) {
    console.error("FAIL: zero requests for sentinel");
    process.exit(1);
  }

  for (const r of rows.slice(0, 3)) {
    console.log(
      `  - ${(r.sr_created_date ?? "?").slice(0, 10)}  ${r.sr_status_desc ?? "?"}  ${r.sr_type_desc ?? ""}  #${r.sr_number}`
    );
  }

  const first = rows[0];
  if (!first.sr_number || !first.sr_type_desc) {
    console.error("FAIL: missing required fields");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
