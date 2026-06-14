/**
 * Live smoke test for Lake Travis (and Highland Lakes) level.
 *
 * The upstream (Texas Water Development Board / waterdatafortexas.org) is a
 * public CDN CSV that is occasionally slow or briefly incomplete. That is an
 * EXTERNAL condition, not a regression in this tool, so the test:
 *   - retries a few times on a graceful upstream failure / empty reading,
 *   - HARD-FAILS only on implausible DATA (a real correctness regression),
 *   - SOFT-SKIPS (exit 0 with a warning) if the feed stays unreachable.
 */
import { lakeTravisLevel } from "../tools/environment/lake-travis-level.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Call the tool, retrying transient upstream failures. Returns parsed payload or null. */
async function read(args, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    try {
      const r = await lakeTravisLevel.handler(args);
      if (r.isError) {
        if (i < attempts) {
          await sleep(1500 * i);
          continue;
        }
        return null; // upstream unavailable after retries
      }
      const json = JSON.parse(r.content[1]?.text ?? "{}");
      if (json.latest && typeof json.latest.water_level === "number") return json;
      if (i < attempts) await sleep(1500 * i);
    } catch (err) {
      if (i < attempts) {
        await sleep(1500 * i);
        continue;
      }
      throw err;
    }
  }
  return null;
}

try {
  const start = Date.now();
  const json = await read({});
  if (!json) {
    console.warn("SKIP: TWDB upstream unavailable for Lake Travis after retries (external, not a tool bug).");
    process.exit(0);
  }
  const l = json.latest;
  console.log(`lake smoke: travis -> ${l.date}  ${l.water_level} ft  ${l.percent_full}% in ${Date.now() - start}ms`);

  // Correctness assertions (these DO hard-fail -- real regressions).
  if (!l.date || typeof l.water_level !== "number" || typeof l.percent_full !== "number") {
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

  // Cross-reservoir test (Buchanan) -- upstream slowness here is tolerated.
  const j2 = await read({ reservoir: "buchanan" });
  if (!j2) {
    console.warn("SKIP: Buchanan upstream unavailable after retries (external).");
    console.log("OK (travis verified; buchanan skipped)");
    process.exit(0);
  }
  console.log(`  reservoir=buchanan -> ${j2.latest?.water_level} ft  ${j2.latest?.percent_full}%`);
  if (typeof j2.latest?.water_level !== "number") {
    console.error("FAIL: Buchanan returned no numeric level");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
