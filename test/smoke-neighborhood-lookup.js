import { austinNeighborhoodLookup } from "../tools/realestate/austin-neighborhood-lookup.js";

const start = Date.now();
try {
  // Search mode -- "westlake" should match Westlake Hills etc.
  const out = await austinNeighborhoodLookup.handler({ q: "westlake" });
  const ms = Date.now() - start;
  if (out.isError) {
    console.error("FAIL: tool errored. body:", out.content[0]?.text?.slice(0, 200));
    process.exit(1);
  }
  const body = JSON.parse(out.content[1]?.text || "{}");
  console.log(`neighborhood-lookup smoke: q="westlake" -> ${body.count ?? 0} matches in ${ms}ms`);
  // The endpoint may legitimately return 0 if the subdivision-families table
  // doesn't have a "westlake" string match. Still test shape.
  if (!Array.isArray(body.data)) {
    console.error("FAIL: data not array");
    process.exit(1);
  }
  if ((body.data || []).length) {
    const r = body.data[0];
    if (!r.permalink_url?.startsWith("https://neuhausre.com/")) {
      console.error("FAIL: permalink_url not on neuhausre.com:", r.permalink_url);
      process.exit(1);
    }
    console.log(`  - ${r.name}  (${r.city ?? "?"})  ${r.permalink_url}`);
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  if (err?.code === "rate_limited") {
    console.log("neighborhood-lookup smoke: SKIPPED (rate-limited)");
    process.exit(0);
  }
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
