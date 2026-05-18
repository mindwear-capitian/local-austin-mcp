/**
 * Live smoke for austin_active_listings against the public VOW endpoint.
 */
import { austinActiveListings } from "../tools/realestate/austin-active-listings.js";

const start = Date.now();
try {
  // Sentinel: Austin + 3 bd + max $700k -- always returns active inventory.
  const out = await austinActiveListings.handler({
    city: "Austin",
    bedrooms_min: 3,
    max_price: 700000,
  });
  const ms = Date.now() - start;

  if (out.isError) {
    console.error("FAIL: tool returned isError. Body:", out.content[0]?.text?.slice(0, 200));
    process.exit(1);
  }

  const body = JSON.parse(out.content[1].text);
  console.log(`active-listings smoke: city=Austin beds>=3 maxprice<=700k -> ${body.count} results in ${ms}ms`);

  if (!body.count || body.count < 1) {
    console.error("FAIL: zero results for sentinel query");
    process.exit(1);
  }

  const first = (body.data || [])[0];
  if (!first?.address || !first?.price || !first?.permalink_url) {
    console.error("FAIL: first result missing address/price/permalink_url");
    process.exit(1);
  }
  if (!first.permalink_url.startsWith("https://neuhausre.com/")) {
    console.error("FAIL: permalink_url not on neuhausre.com:", first.permalink_url);
    process.exit(1);
  }
  if (Object.keys(first).some((k) => k.toLowerCase().includes("agent") || k.toLowerCase().includes("office"))) {
    console.error("FAIL: agent/office PII present in response");
    process.exit(1);
  }
  console.log(`  - $${first.price.toLocaleString()}  ${first.address}  (${first.bedrooms} bd)`);

  // Negative test: too-broad query should be rejected by the server.
  const broad = await austinActiveListings.handler({ city: "Austin" });
  if (!broad.isError) {
    console.error("FAIL: too-broad query was not rejected as error");
    process.exit(1);
  }
  const broadText = broad.content?.[0]?.text || "";
  if (!/query_too_broad/i.test(broadText)) {
    console.error("FAIL: rejection message did not say query_too_broad:", broadText.slice(0, 200));
    process.exit(1);
  }
  console.log("  broad-query rejected as expected (query_too_broad)");

  console.log("OK");
  process.exit(0);
} catch (err) {
  if (err?.code === "rate_limited") {
    // Don't fail the suite if our IP just exhausted its window -- the rate
    // limit itself is the protection we built.
    console.log("active-listings smoke: SKIPPED (rate-limited, expected during burst tests)");
    process.exit(0);
  }
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
