/**
 * Live smoke test for Lake Travis (and Highland Lakes) level.
 */
import { lakeTravisLevel } from "../tools/environment/lake-travis-level.js";

const start = Date.now();
try {
  const r = await lakeTravisLevel.handler({});
  const ms = Date.now() - start;
  const json = JSON.parse(r.content[1]?.text ?? "{}");
  console.log(`lake smoke: travis -> ${json.latest?.date}  ${json.latest?.water_level} ft  ${json.latest?.percent_full}% in ${ms}ms`);

  const l = json.latest;
  if (!l?.date || typeof l.water_level !== "number" || typeof l.percent_full !== "number") {
    console.error("FAIL: latest reading missing required fields");
    process.exit(1);
  }
  if (l.water_level < 600 || l.water_level > 720) {
    console.error(`FAIL: implausible Lake Travis level ${l.water_level} ft`);
    process.exit(1);
  }
  if (l.percent_full < 0 || l.percent_full > 110) {
    console.error(`FAIL: implausible percent_full ${l.percent_full}`);
    process.exit(1);
  }
  if (!Array.isArray(json.history_30d) || json.history_30d.length < 20) {
    console.error(`FAIL: history_30d short (${json.history_30d?.length})`);
    process.exit(1);
  }

  // Cross-reservoir test (Buchanan).
  const r2 = await lakeTravisLevel.handler({ reservoir: "buchanan" });
  const j2 = JSON.parse(r2.content[1]?.text ?? "{}");
  console.log(`  reservoir=buchanan -> ${j2.latest?.water_level} ft  ${j2.latest?.percent_full}%`);
  if (!j2.latest?.water_level) {
    console.error("FAIL: Buchanan returned no level");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
