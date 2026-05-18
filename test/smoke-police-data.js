import { austinPoliceData } from "../tools/civic/austin-police-data.js";

const start = Date.now();
try {
  // Arrests (default dataset, plenty of recent rows).
  const out = await austinPoliceData.handler({ type: "arrests", limit: 3 });
  const ms = Date.now() - start;
  const body = JSON.parse(out.content[1].text);
  console.log(`police smoke: type=arrests -> ${body.count} records (${body.label}) in ${ms}ms`);
  if ((body.count ?? 0) < 1) {
    console.error("FAIL: zero arrests returned");
    process.exit(1);
  }
  const r = body.results[0];
  if (!r.date) {
    console.error("FAIL: missing date");
    process.exit(1);
  }
  console.log("  -", r.date, "|", r.arrest_type, "|", String(r.charges || "").slice(0, 80));

  // Dispatch round-trip.
  const r2 = await austinPoliceData.handler({ type: "dispatch", limit: 2 });
  const b2 = JSON.parse(r2.content[1].text);
  console.log(`  dispatch -> ${b2.count} records`);
  if ((b2.count ?? 0) < 1) {
    console.error("FAIL: zero dispatch records");
    process.exit(1);
  }

  // Use of force round-trip.
  const r3 = await austinPoliceData.handler({ type: "use_of_force", limit: 2 });
  const b3 = JSON.parse(r3.content[1].text);
  console.log(`  use_of_force -> ${b3.count} records`);
  if ((b3.count ?? 0) < 1) {
    console.error("FAIL: zero use_of_force records");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
