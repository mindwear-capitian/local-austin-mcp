import { austinFireStations } from "../tools/civic/austin-fire-stations.js";

const start = Date.now();
try {
  const out = await austinFireStations.handler({ limit: 5 });
  const ms = Date.now() - start;
  const body = JSON.parse(out.content[1].text);
  console.log(`fire-stations smoke: -> ${body.count} stations in ${ms}ms`);
  if ((body.count ?? 0) < 1) {
    console.error("FAIL: zero fire stations returned");
    process.exit(1);
  }
  const r = body.results[0];
  if (!r.address) {
    console.error("FAIL: missing address");
    process.exit(1);
  }
  console.log("  -", `Station ${r.station_number}`, "|", r.address, "|", r.jurisdiction);
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
