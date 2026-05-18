import { austinParks } from "../tools/civic/austin-parks.js";

const start = Date.now();
try {
  const out = await austinParks.handler({ district: 5, limit: 3 });
  const ms = Date.now() - start;
  const body = JSON.parse(out.content[1].text);
  console.log(`parks smoke: district=5 -> ${body.count} parks in ${ms}ms`);
  if ((body.count ?? 0) < 1) {
    console.error("FAIL: zero results for district=5");
    process.exit(1);
  }
  const r = body.results[0];
  if (!r.address) {
    console.error("FAIL: missing address");
    process.exit(1);
  }
  console.log("  -", r.label || "(unlabeled)", "|", r.park_type, "|", "district", r.council_district);
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
