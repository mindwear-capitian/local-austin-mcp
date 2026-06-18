/**
 * Utility providers smoke test. A Lakeway address should resolve to a water
 * district (LAKEWAY MUD verified live via the PUC CCN layer).
 */

import { geocodeAddress } from "../lib/geocode.js";
import { lookupUtilityProviders } from "../lib/utility-ccn.js";

const SENTINEL = "1513 Lakeway Blvd, Austin TX 78734";

const start = Date.now();
try {
  const geo = await geocodeAddress(SENTINEL);
  if (!geo || typeof geo.lng !== "number") {
    console.error("FAIL: geocode returned no coordinates");
    process.exit(1);
  }

  const { water, sewer } = await lookupUtilityProviders(geo.lng, geo.lat);
  const ms = Date.now() - start;

  console.log(`Utility providers smoke: ${geo.matched_address} (${ms}ms)`);
  console.log(`  point: ${geo.lng}, ${geo.lat}`);
  console.log(`  water: ${water.map((w) => `${w.utility} (CCN ${w.ccn_no})`).join("; ") || "(none)"}`);
  console.log(`  sewer: ${sewer.map((s) => `${s.utility} (CCN ${s.ccn_no})`).join("; ") || "(none)"}`);

  if (water.length === 0 && sewer.length === 0) {
    console.error("FAIL: no water or sewer provider returned for a known Lakeway address");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
