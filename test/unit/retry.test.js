import { test } from "node:test";
import assert from "node:assert/strict";
import { retryFetch, UpstreamError, PROFILES } from "../../lib/retry.js";

function fakeResponse({ ok = true, status = 200, statusText = "OK", body = "" } = {}) {
  return {
    ok,
    status,
    statusText,
    async text() { return body; },
    async json() { return JSON.parse(body); },
  };
}

test("retryFetch: returns Response on first success", async () => {
  const fn = async () => fakeResponse({ body: "{}" });
  const res = await retryFetch(fn, { source: "x", profile: "fast" });
  assert.equal(res.ok, true);
});

test("retryFetch: retries on 503 then succeeds", async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    if (attempts === 1) return fakeResponse({ ok: false, status: 503, statusText: "Bad" });
    return fakeResponse({ body: "{}" });
  };
  const res = await retryFetch(fn, { source: "x", profile: "fast" });
  assert.equal(res.ok, true);
  assert.equal(attempts, 2);
});

test("retryFetch: returns 4xx (non-429) Response directly without retry", async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    return fakeResponse({ ok: false, status: 404, statusText: "Not Found" });
  };
  const res = await retryFetch(fn, { source: "x", profile: "fast" });
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
  assert.equal(attempts, 1);
});

test("retryFetch: throws UpstreamError after exhausting retries on 500", async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    return fakeResponse({ ok: false, status: 500, statusText: "Boom" });
  };
  await assert.rejects(
    retryFetch(fn, { source: "Test API", profile: "fast" }),
    (err) => {
      assert.equal(err instanceof UpstreamError, true);
      assert.equal(err.upstream.source, "Test API");
      assert.equal(err.upstream.status, 500);
      assert.equal(err.upstream.kind, "server_error");
      return true;
    }
  );
  assert.equal(attempts, PROFILES.fast.retries + 1);
});

test("retryFetch: throws UpstreamError on network error after retries", async () => {
  let attempts = 0;
  const fn = async () => {
    attempts++;
    throw new Error("fetch failed");
  };
  await assert.rejects(
    retryFetch(fn, { source: "Net", profile: "fast" }),
    (err) => {
      assert.equal(err.upstream.kind, "network");
      return true;
    }
  );
  assert.equal(attempts, PROFILES.fast.retries + 1);
});
