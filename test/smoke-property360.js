/**
 * austin_property_360 composed smoke test. Imports the tool directly and
 * runs its handler. Verifies all 8 sections returned and total time
 * stays reasonable.
 */

import { austinProperty360 } from "../tools/composed/austin-property-360.js";

const SENTINEL = "9501 San Lucas Dr Austin TX";

const start = Date.now();
try {
  const out = await austinProperty360.handler({ address: SENTINEL });
  const ms = Date.now() - start;

  const md = out.content?.[0]?.text ?? "";
  const json = out.content?.[1]?.text ?? "";
  const data = JSON.parse(json);

  console.log(`Property 360 smoke (${ms}ms total):`);
  for (const [k, v] of Object.entries(data.sections)) {
    const status = v.ok ? "OK" : `ERR (${v.error?.slice(0, 60)})`;
    console.log(`  ${k.padEnd(12)} ${status}`);
  }

  // Print first 60 lines of markdown for eyeball check
  console.log("\n--- Report (first 60 lines) ---");
  console.log(md.split("\n").slice(0, 60).join("\n"));
  console.log("--- end ---\n");

  // Hard-fail assertions
  const required = ["cad", "tax", "entities", "flood", "permits", "code_cases", "sr_311", "zoning"];
  for (const r of required) {
    if (!(r in data.sections)) {
      console.error(`FAIL: missing section ${r}`);
      process.exit(1);
    }
  }
  if (!data.sections.cad?.ok || !data.sections.tax?.ok || !data.sections.flood?.ok) {
    console.error("FAIL: critical sections (cad/tax/flood) errored");
    process.exit(1);
  }
  if (!md.includes("neuhausre.com")) {
    console.error("FAIL: attribution missing");
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
