/**
 * Live smoke test for Travis tax office. 9501 San Lucas Dr is a confirmed
 * residential property whose detail page returns ownership + tax balances.
 */

import { searchAccounts, getAccountDetail } from "../lib/travis-tax.js";

const SENTINEL_ADDRESS = "9501 SAN LUCAS";

const start = Date.now();
try {
  const matches = await searchAccounts(SENTINEL_ADDRESS, { limit: 5 });
  console.log(`Tax search: "${SENTINEL_ADDRESS}" -> ${matches.length} accounts`);
  if (matches.length === 0) {
    console.error("FAIL: zero accounts for sentinel");
    process.exit(1);
  }
  for (const m of matches.slice(0, 3)) {
    console.log(`  - ${m.account_id}  ${m.address ?? "(no addr)"}`);
  }

  const target = matches.find((m) => /SAN LUCAS/i.test(m.address ?? "")) ?? matches[0];
  const detail = await getAccountDetail(target.account_id);
  const ms = Date.now() - start;

  console.log(`Tax detail: account ${detail.account_id} (${ms}ms total)`);
  console.log(`  owner: ${detail.owner}`);
  console.log(`  mailing: ${detail.mailing_address}`);
  console.log(`  current tax year: ${detail.current_tax_year}`);
  console.log(`  current due: $${detail.current_year_due?.total_due ?? 0}`);
  console.log(`  prior delinquent: $${detail.prior_years_due?.total_due ?? 0}`);
  console.log(`  total due: $${detail.total_due}`);
  console.log(`  delinquent: ${detail.is_delinquent}`);

  if (!detail.owner || !detail.account_id) {
    console.error("FAIL: missing required detail fields");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
