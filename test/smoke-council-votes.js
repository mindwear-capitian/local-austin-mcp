/**
 * Live smoke test for Austin City Council votes.
 */
import { austinCouncilVotes } from "../tools/civic/austin-council-votes.js";

const start = Date.now();
try {
  // Full-text search likely to have hits across history.
  const r = await austinCouncilVotes.handler({ search: "short-term rental", limit: 10 });
  const ms = Date.now() - start;
  const json = JSON.parse(r.content[1]?.text ?? "{}");
  console.log(`council smoke: search="short-term rental" -> ${json.count ?? 0} votes in ${ms}ms`);

  if ((json.count ?? 0) === 0) {
    console.error("FAIL: zero votes for sentinel search");
    process.exit(1);
  }

  const first = json.results[0];
  for (const field of ["meeting_date", "voter_name", "vote_cast", "item_description"]) {
    if (!first[field]) {
      console.error(`FAIL: missing field ${field}`);
      process.exit(1);
    }
  }
  console.log(`  - ${first.meeting_date}  ${first.voter_name} (D${first.voter_district}): ${first.vote_cast}`);

  // District filter test.
  const r2 = await austinCouncilVotes.handler({ district: 0, limit: 5 }); // Mayor
  const j2 = JSON.parse(r2.content[1]?.text ?? "{}");
  console.log(`  filter district=0 (Mayor) -> ${j2.count ?? 0}`);
  if ((j2.count ?? 0) === 0) {
    console.error("FAIL: zero votes from Mayor (district=0)");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
