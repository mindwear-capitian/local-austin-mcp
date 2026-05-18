import { austinAnimalCenter } from "../tools/civic/austin-animal-center.js";

try {
  const out = await austinAnimalCenter.handler({ type: "intakes", limit: 3 });
  const body = JSON.parse(out.content[1].text);
  console.log(`animal-center smoke: intakes -> ${body.count}`);
  if ((body.count ?? 0) < 1) { console.error("FAIL: zero intakes"); process.exit(1); }
  const r = body.results[0];
  if (!r.animal_id) { console.error("FAIL: missing animal_id"); process.exit(1); }
  console.log(`  - ${r.date}  ${r.type}  ${r.primary_breed ?? ""}`);
  const r2 = await austinAnimalCenter.handler({ type: "outcomes", limit: 2 });
  const b2 = JSON.parse(r2.content[1].text);
  console.log(`  outcomes -> ${b2.count}`);
  if ((b2.count ?? 0) < 1) { console.error("FAIL: zero outcomes"); process.exit(1); }
  console.log("OK"); process.exit(0);
} catch (e) { console.error("FAIL:", e?.message ?? e); process.exit(1); }
