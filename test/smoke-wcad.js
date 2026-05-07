/**
 * Smoke test against live WCAD ArcGIS REST. Sentinel = Williamson County
 * Courthouse in Georgetown. Public landmark, always present.
 */

import { searchByAddress } from "../lib/wcad.js";

const SENTINEL = "405 Martin Luther King";

const start = Date.now();
try {
  const results = await searchByAddress(SENTINEL, { limit: 3 });
  const ms = Date.now() - start;

  console.log(`WCAD smoke test: "${SENTINEL}" -> ${results.length} results in ${ms}ms`);

  if (results.length === 0) {
    console.error("FAIL: zero results for sentinel address");
    process.exit(1);
  }

  for (const r of results) {
    console.log(
      `  - ${r.site_address ?? "(no addr)"}  owner=${r.owner ?? "?"}  pid=${r.property_id ?? "?"}  val=${r.market_value ?? "?"}`
    );
  }

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
