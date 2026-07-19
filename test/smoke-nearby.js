/**
 * Nearby composer smoke test. A downtown-adjacent address should return a
 * fire station, library, and park, each within a few miles.
 */

import { austinNearby } from "../tools/composed/austin-nearby.js";

const SENTINEL = "9501 San Lucas Dr, Austin TX";

const start = Date.now();
try {
  const res = await austinNearby.handler({ address: SENTINEL, limit: 1 });
  const ms = Date.now() - start;

  const json = JSON.parse(res.content[1].text);
  console.log(`Nearby smoke: ${json.query.matched_address} (${ms}ms)`);
  console.log(`  fire_station: ${json.fire_station?.[0]?.name ?? "(none)"} — ${json.fire_station?.[0]?.distance_miles ?? "?"} mi`);
  console.log(`  library: ${json.library?.[0]?.name ?? "(none)"} — ${json.library?.[0]?.distance_miles ?? "?"} mi`);
  console.log(`  park: ${json.park?.[0]?.location_name ?? "(none)"} — ${json.park?.[0]?.distance_miles ?? "?"} mi`);

  if (res.isError) {
    console.error("FAIL: handler returned isError");
    process.exit(1);
  }
  if (!json.fire_station?.length || !json.library?.length || !json.park?.length) {
    console.error("FAIL: missing at least one category for a known Austin address");
    process.exit(1);
  }
  for (const key of ["fire_station", "library", "park"]) {
    const dist = json[key][0].distance_miles;
    if (typeof dist !== "number" || dist < 0 || dist > 15) {
      console.error(`FAIL: ${key} distance_miles out of sane range: ${dist}`);
      process.exit(1);
    }
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
