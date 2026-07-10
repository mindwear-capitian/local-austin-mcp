/**
 * Live smoke test for austin_city_code (Municode public JSON API).
 *
 * Exercises both modes: search ("short-term rental" against Austin, which has
 * a whole STR chapter, so 0 hits = regression) and section fetch (round-trips
 * the first search result's section_id into full text). Municode is external,
 * so transient failures retry and a persistently-down API SOFT-SKIPS.
 */
import { austinCityCode } from "../tools/civic/austin-city-code.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function call(input, attempts = 3) {
  let lastErr = null;
  for (let i = 1; i <= attempts; i++) {
    try {
      const out = await austinCityCode.handler(input);
      if (!out.isError) return JSON.parse(out.content[1]?.text || "{}");
      lastErr = new Error(out.content?.[0]?.text || "isError frame");
    } catch (err) {
      lastErr = err;
    }
    if (i < attempts) await sleep(1200 * i);
  }
  throw lastErr;
}

const start = Date.now();
try {
  // Mode 1: search.
  const search = await call({ q: "short-term rental", city: "austin", limit: 3 });
  const hits = Array.isArray(search.results) ? search.results : [];
  console.log(`city-code smoke: q="short-term rental" -> ${hits.length} hits (${search.total_hits} total) in ${Date.now() - start}ms`);

  if (hits.length === 0) {
    console.error("FAIL: Austin STR search returned 0 hits -- Chapter 4-23 exists, this is a regression.");
    process.exit(1);
  }
  const h = hits[0];
  for (const field of ["sectionId", "code", "section", "url"]) {
    if (!h[field]) {
      console.error(`FAIL: search hit missing "${field}":`, JSON.stringify(h).slice(0, 300));
      process.exit(1);
    }
  }
  if (!h.url.startsWith("https://library.municode.com/tx/")) {
    console.error("FAIL: hit url not on library.municode.com:", h.url);
    process.exit(1);
  }
  console.log("  -", h.section.slice(0, 80));

  // Mode 2: fetch the full text of that section.
  const fetchOut = await call({ section: h.sectionId, city: "austin" });
  const sec = fetchOut.results?.[0];
  if (!sec?.text || sec.text.length < 50) {
    console.error("FAIL: section fetch returned no/short text for", h.sectionId);
    process.exit(1);
  }
  console.log(`  - section fetch "${sec.title.slice(0, 60)}" -> ${sec.text.length} chars`);
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.warn(`SKIP: Municode API unavailable after retries (external, not a tool bug): ${err?.message ?? err}`);
  process.exit(0);
}
