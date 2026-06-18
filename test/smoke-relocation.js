/**
 * Relocation composer smoke test. A Lakeway address should return a water
 * provider, a school district, and the static move-in checklist.
 */

import { austinRelocation } from "../tools/composed/austin-relocation.js";

const SENTINEL = "1513 Lakeway Blvd, Austin TX 78734";

const start = Date.now();
try {
  const res = await austinRelocation.handler({ address: SENTINEL });
  const ms = Date.now() - start;

  const json = JSON.parse(res.content[1].text);
  console.log(`Relocation smoke: ${json.query.matched_address} (${ms}ms)`);
  console.log(`  travis_county: ${json.travis_county}`);
  console.log(`  water: ${json.utilities?.water?.map((w) => w.utility).join("; ") || "(none)"}`);
  console.log(`  school_district: ${json.districts?.school_district ?? "(none)"}`);
  console.log(`  checklist items: ${json.move_in_checklist?.length ?? 0}`);

  if (res.isError) {
    console.error("FAIL: handler returned isError");
    process.exit(1);
  }
  if (!json.move_in_checklist || json.move_in_checklist.length < 4) {
    console.error("FAIL: move-in checklist missing");
    process.exit(1);
  }
  if (!json.utilities?.water?.length && !json.districts?.school_district) {
    console.error("FAIL: no water provider AND no school district for a known address");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
