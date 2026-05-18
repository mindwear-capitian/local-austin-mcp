/**
 * Live smoke test for Austin AFD incidents.
 */
import { austinAfd } from "../tools/civic/austin-afd.js";

const start = Date.now();
try {
  // Default = last 24h.
  const r = await austinAfd.handler({ limit: 5 });
  const ms = Date.now() - start;

  if (!r?.content || r.content.length < 1) {
    console.error("FAIL: empty content");
    process.exit(1);
  }

  const json = JSON.parse(r.content[1]?.text ?? "{}");
  console.log(`afd smoke: last 24h -> ${json.count ?? 0} incidents in ${ms}ms`);

  if ((json.count ?? 0) === 0) {
    console.error("FAIL: zero AFD incidents in last 24h (suspicious)");
    process.exit(1);
  }

  const first = json.results[0];
  if (!first.issue || !first.published_date) {
    console.error("FAIL: missing required fields");
    process.exit(1);
  }
  console.log(`  - ${first.published_date.slice(0, 16)}  ${first.issue}  ${first.address ?? ""}`);

  // Filter test: type=alarm should return rows.
  const r2 = await austinAfd.handler({ issue_type: "alarm", limit: 3 });
  const j2 = JSON.parse(r2.content[1]?.text ?? "{}");
  console.log(`  filter type=alarm -> ${j2.count ?? 0}`);
  if ((j2.count ?? 0) === 0) {
    console.error("FAIL: zero alarm-type incidents");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
