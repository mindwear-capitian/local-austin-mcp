/**
 * Live smoke test for Austin permits tool. Hits a known-good City of Austin
 * address and asserts at least one permit comes back.
 */

import { sodaQuery, sodaAddressLike } from "../lib/soda.js";

// Sentinel: 2512 Tremolo Pass — confirmed in dataset (mechanical permit 2026)
const SENTINEL = "2512 TREMOLO PASS";

const start = Date.now();
try {
  const rows = await sodaQuery("3syk-w9eu", {
    where: sodaAddressLike("original_address1", SENTINEL),
    order: "issue_date DESC",
    limit: 5,
  });
  const ms = Date.now() - start;

  console.log(`Permits smoke: "${SENTINEL}" -> ${rows.length} permits in ${ms}ms`);

  if (rows.length === 0) {
    console.error("FAIL: zero permits for sentinel address");
    process.exit(1);
  }

  for (const p of rows.slice(0, 3)) {
    console.log(
      `  - ${(p.issue_date ?? "?").slice(0, 10)}  ${p.permit_type_desc ?? p.permittype}  ` +
        `${p.work_class ?? ""}  #${p.permit_number}  ${p.status_current}`
    );
  }

  // Required fields check
  const first = rows[0];
  const required = ["permit_number", "original_address1"];
  const missing = required.filter((k) => !first[k]);
  if (missing.length > 0) {
    console.error(`FAIL: missing fields: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
