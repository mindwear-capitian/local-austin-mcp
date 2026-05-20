/**
 * Small LRU + TTL cache.
 *
 * Used for static-ish lookups that don't change minute-to-minute:
 *   - District / library / park / fire-station boundary fetches
 *   - Census geocoder (same address geocoded many times across a session)
 *   - FEMA NFHL polygon hits at the same lat/long
 *   - ArcGIS layer metadata
 *
 * NOT used for time-sensitive data: active listings, 311, permits, weather.
 *
 * Opt-in via `cached(key, ttlMs, loader)`. Loader runs once per cache miss;
 * concurrent callers share the in-flight promise (no thundering herd).
 *
 * Bounded by `MAX_ENTRIES` (LRU eviction). Disable in tests via
 *   AUSTIN_CACHE_DISABLED=1
 */

const MAX_ENTRIES = 512;
const store = new Map(); // key -> { value, expiresAt, promise }

function disabled() {
  return process.env.AUSTIN_CACHE_DISABLED === "1";
}

function bump(key, entry) {
  // LRU: re-insert moves to end of Map iteration order.
  store.delete(key);
  store.set(key, entry);
}

function evictIfNeeded() {
  while (store.size > MAX_ENTRIES) {
    const oldest = store.keys().next().value;
    if (oldest === undefined) break;
    store.delete(oldest);
  }
}

/**
 * Returns cached value or runs loader + caches it.
 *
 * @template T
 * @param {string} key
 * @param {number} ttlMs
 * @param {() => Promise<T>} loader
 * @returns {Promise<T>}
 */
export async function cached(key, ttlMs, loader) {
  if (disabled()) return loader();

  const now = Date.now();
  const hit = store.get(key);
  if (hit) {
    if (hit.value !== undefined && hit.expiresAt > now) {
      bump(key, hit);
      return hit.value;
    }
    if (hit.promise) {
      // Concurrent loader in flight -- piggy-back.
      return hit.promise;
    }
  }

  const promise = (async () => {
    try {
      const value = await loader();
      store.set(key, { value, expiresAt: Date.now() + ttlMs });
      evictIfNeeded();
      return value;
    } catch (err) {
      store.delete(key); // never cache failures
      throw err;
    }
  })();
  store.set(key, { promise, expiresAt: Date.now() + ttlMs });
  return promise;
}

export function invalidate(key) {
  store.delete(key);
}

export function clearAll() {
  store.clear();
}

export function snapshot() {
  return { size: store.size, max: MAX_ENTRIES };
}
