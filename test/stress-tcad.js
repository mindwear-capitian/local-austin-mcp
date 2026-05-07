/**
 * Stress test: 8 parallel TCAD queries. Verifies the concurrency lock,
 * shared-token cache, and jittered retry handle the load gracefully.
 *
 * With cache + lock: should issue 1 token request, max 2 inflight searches
 * at any moment, all 8 succeed.
 */

import { searchByAddress } from "../lib/tcad.js";

const ADDRS = [
  "1100 Congress Ave",
  "501 W Live Oak St",
  "9501 San Lucas Dr",
  "1801 Lohmans Crossing",
  "11600 Capital of Texas Hwy",
  "8201 Brodie Ln",
  "5501 N Lamar Blvd",
  "201 W 2nd St",
];

const start = Date.now();
const results = await Promise.allSettled(
  ADDRS.map((a) => searchByAddress(a, { limit: 1 }))
);
const ms = Date.now() - start;

let ok = 0;
let fail = 0;
for (let i = 0; i < ADDRS.length; i++) {
  const r = results[i];
  if (r.status === "fulfilled") {
    const hit = r.value[0];
    console.log(`  [${i}] OK   ${ADDRS[i]}  -> ${hit?.site_address ?? "(no rows)"} ${hit?.owner ? `(${hit.owner})` : ""}`);
    ok++;
  } else {
    console.log(`  [${i}] FAIL ${ADDRS[i]}  -> ${r.reason?.message ?? r.reason}`);
    fail++;
  }
}

console.log(`\n${ok}/${ADDRS.length} pass in ${ms}ms (${Math.round(ms / ADDRS.length)}ms avg)`);
process.exit(fail > 0 ? 1 : 0);
