/**
 * Multi-county smoke test for austin_property_360. Runs the tool against
 * one address per supported county and verifies routing chose the right
 * CAD + that county-specific tools were skipped where appropriate.
 */

import { austinProperty360 } from "../tools/composed/austin-property-360.js";

const CASES = [
  {
    label: "Travis (Austin)",
    address: "9501 San Lucas Dr, Austin, TX 78737",
    expect_county: "travis",
    expect_tax_run: true,
    expect_austin_run: true,
  },
  {
    label: "Travis (Lakeway -- not Austin city)",
    address: "1801 Lohmans Crossing Rd, Lakeway, TX 78734",
    expect_county: "travis",
    expect_tax_run: true,
    expect_austin_run: false,
  },
  {
    label: "Williamson (Cedar Park)",
    address: "1401 Sam Bass Rd, Round Rock, TX 78681",
    expect_county: "williamson",
    expect_tax_run: false,
    expect_austin_run: false,
  },
  {
    label: "Hays (Dripping Springs)",
    address: "1921 Spring Valley Dr, Dripping Springs, TX 78620",
    expect_county: "hays",
    expect_tax_run: false,
    expect_austin_run: false,
  },
];

let pass = 0;
let fail = 0;
const start = Date.now();

for (const c of CASES) {
  console.log(`\n--- ${c.label}: "${c.address}" ---`);
  const t0 = Date.now();
  try {
    const out = await austinProperty360.handler({ address: c.address });
    const ms = Date.now() - t0;
    const json = out.content?.[1]?.text ?? "";
    const data = JSON.parse(json);

    const detected = data.county_detected;
    const cadCounty = data.sections?.cad?.value?.county;
    const cadFound = data.sections?.cad?.value?.found;
    const taxValue = data.sections?.tax?.value;
    const austinValue = data.sections?.permits?.value;

    console.log(`  detected=${detected} cad_county=${cadCounty} cad_found=${cadFound} (${ms}ms)`);
    console.log(`  tax: ${taxValue?.skipped ? "SKIPPED" : (taxValue?.found ? "found" : "no match")}`);
    console.log(`  austin permits: ${austinValue?.skipped ? "SKIPPED" : (austinValue?.found ? `found ${austinValue.count}` : "no match")}`);

    let ok = true;
    if (detected !== c.expect_county) {
      console.error(`  FAIL: expected county ${c.expect_county}, got ${detected}`);
      ok = false;
    }
    if (!cadFound) {
      console.error(`  FAIL: CAD section returned no match`);
      ok = false;
    }
    if (cadCounty !== c.expect_county) {
      console.error(`  FAIL: CAD matched in ${cadCounty}, expected ${c.expect_county}`);
      ok = false;
    }
    const taxRan = !taxValue?.skipped;
    if (taxRan !== c.expect_tax_run) {
      console.error(`  FAIL: tax-run=${taxRan}, expected ${c.expect_tax_run}`);
      ok = false;
    }
    const austinRan = !austinValue?.skipped;
    if (austinRan !== c.expect_austin_run) {
      console.error(`  FAIL: austin-run=${austinRan}, expected ${c.expect_austin_run}`);
      ok = false;
    }

    if (ok) {
      console.log(`  OK`);
      pass++;
    } else {
      fail++;
    }
  } catch (err) {
    console.error(`  FAIL: ${err?.message ?? err}`);
    fail++;
  }
}

const totalMs = Date.now() - start;
console.log(`\n=== ${pass} pass, ${fail} fail in ${totalMs}ms ===`);
process.exit(fail > 0 ? 1 : 0);
