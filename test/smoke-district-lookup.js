/**
 * Live smoke test for Austin / Travis County district lookup.
 * Hits a known-good address inside Travis County.
 */
import { austinDistrictLookup } from "../tools/civic/austin-district-lookup.js";

const SENTINEL = "1100 Congress Ave Austin TX 78701"; // Texas Capitol -- inside city

const start = Date.now();
try {
  const r = await austinDistrictLookup.handler({ address: SENTINEL });
  const ms = Date.now() - start;
  const json = JSON.parse(r.content[1]?.text ?? "{}");

  console.log(`district smoke: "${SENTINEL}" in ${ms}ms`);
  console.log(`  geocode: ${json.geocode?.matched_address} (${json.geocode?.lat},${json.geocode?.lng})`);

  if (!json.geocode?.lat || !json.geocode?.lng) {
    console.error("FAIL: geocode missing coordinates");
    process.exit(1);
  }

  const results = json.results ?? {};
  for (const key of ["council", "school_district", "esd", "travis_voter_precinct"]) {
    const v = results[key]?.value;
    console.log(`  ${key}: ${v ?? "(null)"}`);
    if (v === null || v === undefined) {
      console.error(`FAIL: ${key} returned null for downtown Austin sentinel`);
      process.exit(1);
    }
  }

  // School district should be Austin ISD downtown.
  if (!String(results.school_district.value).toUpperCase().includes("AUSTIN")) {
    console.error(`FAIL: downtown school_district = "${results.school_district.value}", expected Austin ISD`);
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
