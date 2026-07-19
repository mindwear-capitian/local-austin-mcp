/**
 * Commute composer smoke test. Downtown to a southwest-Austin address should
 * return a plausible drive time + distance via a live router (not the
 * straight-line fallback, under normal conditions).
 */

import { austinCommute } from "../tools/composed/austin-commute.js";

const ORIGIN = "301 Congress Ave, Austin TX 78701";
const DESTINATION = "9501 San Lucas Dr, Austin TX 78733";

const start = Date.now();
try {
  const res = await austinCommute.handler({ origin: ORIGIN, destination: DESTINATION });
  const ms = Date.now() - start;

  const json = JSON.parse(res.content[1].text);
  console.log(`Commute smoke: ${json.origin.matched_address} -> ${json.destination.matched_address} (${ms}ms)`);
  console.log(`  duration_minutes: ${json.duration_minutes}`);
  console.log(`  distance_miles: ${json.distance_miles}`);
  console.log(`  source: ${json.source}`);
  console.log(`  estimated: ${json.estimated}`);

  if (res.isError) {
    console.error("FAIL: handler returned isError");
    process.exit(1);
  }
  if (typeof json.duration_minutes !== "number" || json.duration_minutes <= 0) {
    console.error("FAIL: duration_minutes missing/invalid");
    process.exit(1);
  }
  if (typeof json.distance_miles !== "number" || json.distance_miles <= 0) {
    console.error("FAIL: distance_miles missing/invalid");
    process.exit(1);
  }
  // Downtown to SW Austin is ~13-15 road miles -- sanity bound, not exact.
  if (json.distance_miles > 40) {
    console.error(`FAIL: distance_miles implausibly large: ${json.distance_miles}`);
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
