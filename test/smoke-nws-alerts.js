/**
 * Live smoke test for NWS alerts.
 * The endpoint may return 0 active alerts depending on weather. We only
 * verify the API call succeeded and the response shape is correct.
 */
import { austinNwsAlerts } from "../tools/environment/austin-nws-alerts.js";

const start = Date.now();
try {
  // Default location (downtown Austin).
  const r = await austinNwsAlerts.handler({});
  const ms = Date.now() - start;
  const json = JSON.parse(r.content[1]?.text ?? "{}");
  console.log(`nws smoke: default location -> ${json.count ?? 0} active alerts in ${ms}ms`);

  if (typeof json.count !== "number") {
    console.error("FAIL: count missing or not numeric");
    process.exit(1);
  }
  if (!json.query?.matched_address) {
    console.error("FAIL: matched_address missing");
    process.exit(1);
  }

  // Address-driven path (geocode -> NWS).
  const r2 = await austinNwsAlerts.handler({ address: "1100 Congress Ave Austin TX" });
  const j2 = JSON.parse(r2.content[1]?.text ?? "{}");
  console.log(`  geocode path: ${j2.query?.matched_address} -> ${j2.count} alerts`);
  if (!j2.query?.matched_address?.includes("CONGRESS")) {
    console.error("FAIL: geocode did not return expected address");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
