import { austinTreePermits } from "../tools/property/austin-tree-permits.js";

try {
  const out = await austinTreePermits.handler({ limit: 3 });
  const body = JSON.parse(out.content[1].text);
  console.log(`tree-permits smoke: -> ${body.count} records`);
  if ((body.count ?? 0) < 1) { console.error("FAIL: zero records"); process.exit(1); }
  const r = body.results[0];
  if (!r.permit_number) { console.error("FAIL: missing permit_number"); process.exit(1); }
  console.log(`  - ${r.permit_number}  ${r.permit_class}  ${r.issued_date}`);
  console.log("OK"); process.exit(0);
} catch (e) { console.error("FAIL:", e?.message ?? e); process.exit(1); }
