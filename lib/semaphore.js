/**
 * Named semaphores -- per-upstream-source concurrency caps.
 *
 * Why this exists
 * ---------------
 * austin_property_360 fans out ~9 calls in parallel. If the MCP client
 * issues several /360 calls in a row, we can hammer an upstream API harder
 * than it likes (especially Socrata, ArcGIS, and the Census geocoder).
 *
 * Each named bucket here owns its own MAX_INFLIGHT and a FIFO wait queue.
 * Helpers wrap their fetch in `withLimit("source-key", fn)` and naturally
 * back off without retry stampedes.
 *
 * Defaults are conservative -- enough for normal use, low enough that a
 * burst from a single /360 cycle never exceeds the provider's rate cap.
 *
 * Override via env var if you have an app token or a private deal:
 *   AUSTIN_LIMIT_SODA=8 AUSTIN_LIMIT_ARCGIS=6 ...
 */

const DEFAULTS = {
  soda:        4,
  arcgis:      4,
  fema:        2,
  census:      2,
  travis_tax:  2,
  vow_public:  3,
  nws:         4,
  rss:         8,
};

const BUCKETS = new Map();

function getBucket(key) {
  let b = BUCKETS.get(key);
  if (!b) {
    const envCap = Number(process.env[`AUSTIN_LIMIT_${key.toUpperCase()}`]);
    const max = Number.isFinite(envCap) && envCap > 0 ? envCap : (DEFAULTS[key] ?? 4);
    b = { max, inflight: 0, queue: [] };
    BUCKETS.set(key, b);
  }
  return b;
}

function acquire(b) {
  if (b.inflight < b.max) {
    b.inflight++;
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    // Resolver pre-counts the slot, so release() needs no special case.
    b.queue.push(() => {
      b.inflight++;
      resolve();
    });
  });
}

function release(b) {
  b.inflight = Math.max(0, b.inflight - 1);
  const next = b.queue.shift();
  if (next) next();
}

/**
 * Run `fn` while holding a slot in the named bucket. Slot is always released
 * even if `fn` throws.
 */
export async function withLimit(key, fn) {
  const b = getBucket(key);
  await acquire(b);
  try {
    return await fn();
  } finally {
    release(b);
  }
}

export function getSnapshot() {
  const out = {};
  for (const [k, b] of BUCKETS) out[k] = { max: b.max, inflight: b.inflight, queued: b.queue.length };
  return out;
}
