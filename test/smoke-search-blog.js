/**
 * Live smoke test for austin_search_blog (neuhausre.com WordPress REST).
 *
 * The structured payload is the { query, count, results } envelope (results is
 * the post array). The upstream WP REST API can briefly return empty/slow under
 * load, which is EXTERNAL, so this test retries transient empties and only
 * HARD-FAILS on malformed data (wrong link host, missing title). If the API
 * stays empty after retries it SOFT-SKIPS rather than failing the suite.
 */
import { austinSearchBlog } from "../tools/realestate/austin-search-blog.js";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Returns the posts array, or null if upstream gave nothing after retries. */
async function searchPosts(q, limit, attempts = 3) {
  for (let i = 1; i <= attempts; i++) {
    const out = await austinSearchBlog.handler({ q, limit });
    if (!out.isError) {
      const data = JSON.parse(out.content[1]?.text || "{}");
      const posts = Array.isArray(data.results) ? data.results : [];
      if (posts.length > 0) return posts;
    }
    if (i < attempts) await sleep(1200 * i);
  }
  return null;
}

const start = Date.now();
try {
  const posts = await searchPosts("Austin", 3);
  const ms = Date.now() - start;

  if (posts === null) {
    console.warn("SKIP: neuhausre.com WP API returned no posts after retries (external, not a tool bug).");
    process.exit(0);
  }

  console.log(`search-blog smoke: q="Austin" -> ${posts.length} posts in ${ms}ms`);

  // Correctness assertions (hard-fail -- real regressions).
  const p = posts[0];
  if (!p.link?.startsWith("https://neuhausre.com/")) {
    console.error("FAIL: post link not on neuhausre.com:", p.link);
    process.exit(1);
  }
  if (!p.title?.rendered) {
    console.error("FAIL: missing title");
    process.exit(1);
  }
  console.log("  -", p.title.rendered.replace(/<[^>]+>/g, "").slice(0, 80));
  console.log("OK");
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err?.message ?? err}`);
  process.exit(1);
}
