import { austinLocalVoices } from "../tools/community/austin-local-voices.js";

const start = Date.now();
try {
  // No-filter sanity run: pulls from all sources, last 90 days.
  const out = await austinLocalVoices.handler({ limit: 5 });
  const ms = Date.now() - start;
  const body = JSON.parse(out.content[1].text);

  console.log(`local-voices smoke: -> ${body.returned} posts (total matches ${body.total_matches}) in ${ms}ms`);

  if (body.source_errors?.length) {
    console.log("  source errors:", body.source_errors.map((e) => `${e.source}=${e.error}`).join(", "));
  }

  if (body.returned < 1) {
    console.error("FAIL: zero posts returned across 8 sources in last 90 days");
    process.exit(1);
  }

  const first = body.data[0];
  if (!first?.title || !first?.link || !first?.source_name) {
    console.error("FAIL: first post missing required fields");
    process.exit(1);
  }
  if (!first.link.startsWith("https://") && !first.link.startsWith("http://")) {
    console.error("FAIL: link not http(s):", first.link);
    process.exit(1);
  }
  console.log(`  - "${first.title.slice(0, 60)}" — ${first.source_name} (${first.pub_date?.slice(0, 10)})`);

  // Per-source sanity: at least 6 of 8 sources should have produced something live.
  const distinctSources = new Set((body.data || []).map((p) => p.source_slug));
  console.log(`  distinct sources in this batch: ${distinctSources.size}`);

  // Keyword filter sanity. Use a very common word likely to match somewhere.
  const filtered = await austinLocalVoices.handler({ q: "Austin", limit: 3, since_days: 180 });
  const fbody = JSON.parse(filtered.content[1].text);
  console.log(`  q="Austin" since=180d -> ${fbody.returned} posts`);
  if (fbody.returned < 1) {
    console.error("FAIL: zero posts for q=Austin in 180d");
    process.exit(1);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
