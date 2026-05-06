/**
 * MUD/PID smoke test. 9501 San Lucas Dr known to have ISD + County + ESD +
 * Hospital + ACC entities (no MUD/PID, but a good entity-list test).
 */

import { searchAccounts, getEntityDetail } from "../lib/travis-tax.js";

const SENTINEL = "9501 SAN LUCAS";

const start = Date.now();
try {
  const matches = await searchAccounts(SENTINEL, { limit: 5 });
  if (matches.length === 0) {
    console.error("FAIL: no accounts");
    process.exit(1);
  }
  const target = matches.find((m) => /SAN LUCAS/i.test(m.address ?? "")) ?? matches[0];
  const detail = await getEntityDetail(target.account_id);
  const ms = Date.now() - start;

  console.log(`MUD/PID smoke: account ${detail.account_id} (${ms}ms)`);
  console.log(`  year: ${detail.tax_year}  entities: ${detail.entity_count}`);
  console.log(`  has_mud: ${detail.has_mud}  has_pid: ${detail.has_pid}`);
  for (const e of detail.entities ?? []) {
    console.log(`  - ${e.name.padEnd(35)} ${e.type.padEnd(10)} due=$${e.total_due}`);
  }

  if (!detail.entity_count || detail.entity_count < 1) {
    console.error("FAIL: zero entities");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
