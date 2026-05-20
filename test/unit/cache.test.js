import { test } from "node:test";
import assert from "node:assert/strict";
import { cached, clearAll, snapshot } from "../../lib/cache.js";

test("cached: returns loader value and serves repeat from cache", async () => {
  clearAll();
  let calls = 0;
  const load = async () => { calls++; return { n: 1 }; };
  const a = await cached("k1", 60_000, load);
  const b = await cached("k1", 60_000, load);
  assert.deepEqual(a, { n: 1 });
  assert.strictEqual(a, b); // same reference -- served from cache
  assert.equal(calls, 1);
});

test("cached: re-runs loader after TTL expires", async () => {
  clearAll();
  let calls = 0;
  const load = async () => { calls++; return calls; };
  await cached("k2", 5, load);
  await new Promise((r) => setTimeout(r, 15));
  const v2 = await cached("k2", 5, load);
  assert.equal(calls, 2);
  assert.equal(v2, 2);
});

test("cached: concurrent callers share the in-flight promise", async () => {
  clearAll();
  let calls = 0;
  const load = async () => {
    calls++;
    await new Promise((r) => setTimeout(r, 20));
    return "x";
  };
  const [a, b, c] = await Promise.all([
    cached("k3", 60_000, load),
    cached("k3", 60_000, load),
    cached("k3", 60_000, load),
  ]);
  assert.equal(a, "x");
  assert.equal(b, "x");
  assert.equal(c, "x");
  assert.equal(calls, 1); // herd collapsed
});

test("cached: loader errors are NOT cached", async () => {
  clearAll();
  let calls = 0;
  await assert.rejects(
    cached("k4", 60_000, async () => { calls++; throw new Error("nope"); }),
    /nope/
  );
  const value = await cached("k4", 60_000, async () => { calls++; return "ok"; });
  assert.equal(value, "ok");
  assert.equal(calls, 2);
});

test("cached: respects AUSTIN_CACHE_DISABLED=1", async () => {
  clearAll();
  process.env.AUSTIN_CACHE_DISABLED = "1";
  let calls = 0;
  const load = async () => { calls++; return calls; };
  await cached("k5", 60_000, load);
  await cached("k5", 60_000, load);
  assert.equal(calls, 2);
  delete process.env.AUSTIN_CACHE_DISABLED;
});

test("snapshot: reports size", async () => {
  clearAll();
  await cached("s1", 60_000, async () => 1);
  await cached("s2", 60_000, async () => 2);
  const s = snapshot();
  assert.equal(s.size, 2);
  assert.ok(s.max >= 2);
});
