import { austinListingByAddress } from "../tools/realestate/austin-listing-by-address.js";

const start = Date.now();
try {
  // Sentinel address pattern -- common short street name in Austin that
  // typically has multiple active matches.
  const out = await austinListingByAddress.handler({ address: "Bee Cave" });
  const ms = Date.now() - start;
  if (out.isError) {
    console.error("FAIL: tool errored. body:", out.content[0]?.text?.slice(0, 200));
    process.exit(1);
  }
  const body = JSON.parse(out.content[1]?.text || "{}");
  console.log(`listing-by-address smoke: addr="Bee Cave" -> ${body.count ?? 0} matches in ${ms}ms`);

  // Either 0 matches (no active homes on a "Bee Cave" street) or 1+ -- both
  // are valid. Verify shape only when we have results.
  if ((body.count ?? 0) > 0) {
    const r = body.data[0];
    if (!r.permalink_url?.startsWith("https://neuhausre.com/")) {
      console.error("FAIL: permalink_url not on neuhausre.com:", r.permalink_url);
      process.exit(1);
    }
    console.log(`  - ${r.address}  $${r.price?.toLocaleString()}`);
  } else {
    // No results is OK -- just verify no crash and well-formed response.
    if (!Array.isArray(body.data)) {
      console.error("FAIL: expected data array even when empty");
      process.exit(1);
    }
  }

  console.log("OK");
  process.exit(0);
} catch (err) {
  if (err?.code === "rate_limited") {
    console.log("listing-by-address smoke: SKIPPED (rate-limited)");
    process.exit(0);
  }
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
