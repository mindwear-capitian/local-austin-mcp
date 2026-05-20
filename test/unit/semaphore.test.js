import { test } from "node:test";
import assert from "node:assert/strict";
import { withLimit, getSnapshot } from "../../lib/semaphore.js";

test("withLimit: caps concurrency at provider's bucket max", async () => {
  // Pick an obscure bucket name so we don't clash with real defaults.
  process.env.AUSTIN_LIMIT_TEST_BUCKET = "2";

  let inflight = 0;
  let peak = 0;
  const work = async () => {
    inflight++;
    peak = Math.max(peak, inflight);
    await new Promise((r) => setTimeout(r, 30));
    inflight--;
  };

  await Promise.all(
    Array.from({ length: 6 }, () => withLimit("test_bucket", work))
  );

  assert.equal(peak, 2, `peak should be 2, got ${peak}`);
  const snap = getSnapshot();
  assert.equal(snap.test_bucket.inflight, 0);
  assert.equal(snap.test_bucket.queued, 0);
});

test("withLimit: releases slot even when fn throws", async () => {
  process.env.AUSTIN_LIMIT_ERR_BUCKET = "1";
  await assert.rejects(
    withLimit("err_bucket", async () => { throw new Error("boom"); }),
    /boom/
  );
  // Now bucket should be empty -- next call must proceed immediately.
  const t0 = Date.now();
  await withLimit("err_bucket", async () => { /* noop */ });
  assert.ok(Date.now() - t0 < 50, "second call should not have waited");
});

test("withLimit: FIFO ordering of queued callers", async () => {
  process.env.AUSTIN_LIMIT_FIFO_BUCKET = "1";
  const order = [];
  const tasks = [1, 2, 3, 4].map((id) =>
    withLimit("fifo_bucket", async () => {
      order.push(id);
      await new Promise((r) => setTimeout(r, 5));
    })
  );
  await Promise.all(tasks);
  assert.deepEqual(order, [1, 2, 3, 4]);
});
