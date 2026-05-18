import { austinSearchBlog } from "../tools/realestate/austin-search-blog.js";

const start = Date.now();
try {
  const out = await austinSearchBlog.handler({ q: "Austin", limit: 3 });
  const ms = Date.now() - start;
  if (out.isError) {
    console.error("FAIL: tool errored. body:", out.content[0]?.text?.slice(0, 200));
    process.exit(1);
  }
  const posts = JSON.parse(out.content[1]?.text || "[]");
  console.log(`search-blog smoke: q="Austin" -> ${posts.length} posts in ${ms}ms`);
  if (!Array.isArray(posts) || posts.length === 0) {
    console.error("FAIL: zero blog posts for sentinel query");
    process.exit(1);
  }
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
