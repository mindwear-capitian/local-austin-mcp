/**
 * Live smoke test for Austin zoning. 5201 Airport Blvd is a confirmed
 * commercial property with CS-V-CO-NP zoning.
 */

import { sodaQuery, sodaAddressLike } from "../lib/soda.js";

const SENTINEL = "5201 AIRPORT";

const start = Date.now();
try {
  const rows = await sodaQuery("nbzi-qabm", {
    base: "https://datahub.austintexas.gov",
    where: sodaAddressLike("full_street_name", SENTINEL),
    limit: 5,
  });
  const ms = Date.now() - start;

  console.log(`Zoning smoke: "${SENTINEL}" -> ${rows.length} records in ${ms}ms`);

  if (rows.length === 0) {
    console.error("FAIL: zero zoning for sentinel");
    process.exit(1);
  }

  for (const r of rows.slice(0, 3)) {
    console.log(
      `  - ${r.full_street_name}  zone=${r.zoning_ztype}  base=${r.base_zone}  cat=${r.base_zone_category}`
    );
  }

  const first = rows[0];
  if (!first.zoning_ztype || !first.full_street_name) {
    console.error("FAIL: missing required fields");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
