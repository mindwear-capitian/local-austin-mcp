/**
 * FEMA flood smoke. 9501 San Lucas Dr is in Zone X (minimal hazard).
 */

import { geocodeAddress, floodZoneAtPoint } from "../lib/fema-flood.js";

const SENTINEL = "9501 San Lucas Dr Austin TX";

const start = Date.now();
try {
  const geo = await geocodeAddress(SENTINEL);
  if (!geo) {
    console.error("FAIL: geocoder returned no match");
    process.exit(1);
  }
  console.log(`Geocoded: ${geo.matched_address}`);
  console.log(`  lat=${geo.latitude}  lon=${geo.longitude}`);

  const zone = await floodZoneAtPoint(geo.longitude, geo.latitude);
  const ms = Date.now() - start;
  if (!zone) {
    console.error("FAIL: no NFHL feature at sentinel");
    process.exit(1);
  }
  console.log(`Flood zone (${ms}ms total):`);
  console.log(`  zone: ${zone.flood_zone} (${zone.zone_subtype})`);
  console.log(`  SFHA: ${zone.in_sfha}`);
  console.log(`  panel: ${zone.dfirm_id}`);
  console.log(`  interpretation: ${zone.interpretation}`);

  if (!zone.flood_zone) {
    console.error("FAIL: missing flood zone field");
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
