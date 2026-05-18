/**
 * Live smoke for austin_listing_detail. Picks a known-active MLS ID at
 * runtime by first searching, then fetching detail for the first result.
 */
import { austinActiveListings } from "../tools/realestate/austin-active-listings.js";
import { austinListingDetail } from "../tools/realestate/austin-listing-detail.js";

const start = Date.now();
try {
  // Step 1: find a live mls_id via search.
  const searchOut = await austinActiveListings.handler({
    city: "Austin",
    bedrooms_min: 3,
    max_price: 700000,
  });
  if (searchOut.isError) {
    console.error("FAIL: search step errored. body:", searchOut.content[0]?.text?.slice(0, 200));
    process.exit(1);
  }
  const searchBody = JSON.parse(searchOut.content[1].text);
  const candidate = (searchBody.data || [])[0];
  if (!candidate?.mls_id) {
    console.error("FAIL: search returned no candidate listing");
    process.exit(1);
  }

  // Step 2: detail lookup.
  const out = await austinListingDetail.handler({ mls_id: candidate.mls_id });
  const ms = Date.now() - start;

  if (out.isError) {
    console.error("FAIL: detail returned isError. body:", out.content[0]?.text?.slice(0, 200));
    process.exit(1);
  }

  const body = JSON.parse(out.content[1].text);
  const r = body?.data ?? {};
  console.log(`listing-detail smoke: mls=${candidate.mls_id} -> $${r.price?.toLocaleString()}  ${r.address} in ${ms}ms`);

  if (!r.mls_id || !r.address || !r.permalink_url) {
    console.error("FAIL: detail missing required fields");
    process.exit(1);
  }
  if (r.standard_status !== "Active" && r.standard_status !== "Active Under Contract") {
    console.error("FAIL: detail returned non-active listing:", r.standard_status);
    process.exit(1);
  }
  if (Object.keys(r).some((k) => k.toLowerCase().includes("agent_email"))) {
    console.error("FAIL: agent email present");
    process.exit(1);
  }
  console.log("OK");
  process.exit(0);
} catch (err) {
  if (err?.code === "rate_limited") {
    console.log("listing-detail smoke: SKIPPED (rate-limited)");
    process.exit(0);
  }
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
