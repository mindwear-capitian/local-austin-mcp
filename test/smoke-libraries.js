import { austinLibraries } from "../tools/civic/austin-libraries.js";

const start = Date.now();
try {
  const out = await austinLibraries.handler({ limit: 5 });
  const ms = Date.now() - start;
  const body = JSON.parse(out.content[1].text);
  console.log(`libraries smoke: -> ${body.count} branches in ${ms}ms`);
  if ((body.count ?? 0) < 1) {
    console.error("FAIL: zero library branches returned");
    process.exit(1);
  }
  const r = body.results[0];
  if (!r.name || !r.address) {
    console.error("FAIL: missing required fields", r);
    process.exit(1);
  }
  console.log("  -", r.name, "|", r.address);
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
