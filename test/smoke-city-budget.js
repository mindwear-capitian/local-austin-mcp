/**
 * Live smoke test for Austin city budget.
 */
import { austinCityBudget } from "../tools/civic/austin-city-budget.js";

const start = Date.now();
try {
  const r = await austinCityBudget.handler({ department: "Police", fiscal_year: 2024, limit: 10 });
  const ms = Date.now() - start;
  const json = JSON.parse(r.content[1]?.text ?? "{}");
  console.log(`budget smoke: Police FY2024 -> ${json.count ?? 0} lines, totals.budget=$${json.totals?.budget?.toLocaleString()} in ${ms}ms`);

  if ((json.count ?? 0) === 0) {
    console.error("FAIL: zero budget lines for Police FY2024");
    process.exit(1);
  }
  if (!json.totals?.budget || json.totals.budget < 1_000_000) {
    console.error(`FAIL: implausibly low Police budget total ($${json.totals?.budget})`);
    process.exit(1);
  }

  const first = json.results[0];
  for (const field of ["fy", "department", "description"]) {
    if (!first[field]) {
      console.error(`FAIL: missing field ${field}`);
      process.exit(1);
    }
  }
  console.log(`  - FY${first.fy} ${first.department}: ${first.description}  budget=$${first.budget?.toLocaleString()}`);

  // Full-text search test.
  const r2 = await austinCityBudget.handler({ search: "library", limit: 3 });
  const j2 = JSON.parse(r2.content[1]?.text ?? "{}");
  console.log(`  search="library" -> ${j2.count ?? 0}`);
  if ((j2.count ?? 0) === 0) {
    console.error("FAIL: zero library budget lines");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
