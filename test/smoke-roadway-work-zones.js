import { austinRoadwayWorkZones } from "../tools/civic/austin-roadway-work-zones.js";

try {
  // Drop active-only since it sometimes returns zero off-hours.
  const out = await austinRoadwayWorkZones.handler({ active_only: false, limit: 3 });
  const body = JSON.parse(out.content[1].text);
  console.log(`roadway-work-zones smoke: -> ${body.count} records`);
  if ((body.count ?? 0) < 1) { console.error("FAIL: zero records"); process.exit(1); }
  const r = body.results[0];
  if (!r.road_names && !r.description) { console.error("FAIL: missing road/desc"); process.exit(1); }
  console.log(`  - ${r.event_type}  ${r.road_names ?? r.description?.slice(0,40)}`);
  console.log("OK"); process.exit(0);
} catch (e) { console.error("FAIL:", e?.message ?? e); process.exit(1); }
