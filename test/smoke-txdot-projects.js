import { austinTxdotProjects } from "../tools/civic/austin-txdot-projects.js";

try {
  const out = await austinTxdotProjects.handler({ limit: 3 });
  const body = JSON.parse(out.content[1].text);
  console.log(`txdot-projects smoke: Austin district -> ${body.count}`);
  if ((body.count ?? 0) < 1) { console.error("FAIL: zero TxDOT projects in Austin district"); process.exit(1); }
  const r = body.results[0];
  if (!r.csj) { console.error("FAIL: missing CSJ"); process.exit(1); }
  console.log(`  - hwy=${r.highway}  ${r.work_type?.slice(0,40)}  county=${r.county}`);
  console.log("OK"); process.exit(0);
} catch (e) { console.error("FAIL:", e?.message ?? e); process.exit(1); }
