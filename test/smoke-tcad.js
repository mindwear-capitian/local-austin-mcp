/**
 * Smoke test against live TCAD. Pings True Prodigy with a known-good Austin
 * address and prints the normalized result. Run with `node test/smoke-tcad.js`.
 *
 * Sentinel address: Texas Capitol building. Public, well-known, will always
 * exist in TCAD. If this test fails, TCAD or True Prodigy changed.
 */

import { searchByAddress } from "../lib/tcad.js";

const SENTINEL = "1100 Congress Ave"; // Texas State Capitol

const start = Date.now();
try {
  const results = await searchByAddress(SENTINEL, { limit: 3 });
  const ms = Date.now() - start;

  console.log(`TCAD smoke test: "${SENTINEL}" -> ${results.length} results in ${ms}ms`);

  if (results.length === 0) {
    console.error("FAIL: zero results for sentinel address");
    process.exit(1);
  }

  for (const r of results) {
    console.log(
      `  - ${r.site_address ?? "(no addr)"}  owner=${r.owner ?? "?"}  pid=${r.property_id ?? "?"}`
    );
  }

  // Required field check on first result
  const first = results[0];
  const required = ["site_address", "owner", "property_id"];
  const missing = required.filter((k) => first[k] === null || first[k] === undefined);
  if (missing.length > 0) {
    console.error(`FAIL: first result missing required fields: ${missing.join(", ")}`);
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
