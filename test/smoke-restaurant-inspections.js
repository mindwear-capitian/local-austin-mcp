import { austinRestaurantInspections } from "../tools/civic/austin-restaurant-inspections.js";

try {
  const out = await austinRestaurantInspections.handler({ limit: 3 });
  const body = JSON.parse(out.content[1].text);
  console.log(`restaurant-inspections smoke: -> ${body.count} records`);
  if ((body.count ?? 0) < 1) { console.error("FAIL: zero records"); process.exit(1); }
  const r = body.results[0];
  if (!r.restaurant_name || r.score === null) { console.error("FAIL: missing fields"); process.exit(1); }
  console.log(`  - ${r.score}  ·  ${r.restaurant_name}  (${r.inspection_date})`);
  console.log("OK"); process.exit(0);
} catch (e) { console.error("FAIL:", e?.message ?? e); process.exit(1); }
