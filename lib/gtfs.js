/**
 * CapMetro GTFS data access -- shared plumbing for both the static schedule
 * (routes/stops) and the live GTFS-realtime feeds (vehicle positions, trip
 * updates), all republished as Socrata "file" assets on data.texas.gov.
 *
 * Why this file exists: these Socrata "file" (blobby) assets don't have a
 * stable download URL. Each dataset's `blobId` ROTATES every time the file
 * is refreshed (confirmed live: re-queried the vehicle-positions dataset's
 * metadata twice, ~3s apart, got two different blobIds for the same
 * dataset). So every fetch is two requests: metadata (to resolve the
 * current blobId) then the blob itself. There is no way to skip the
 * metadata call and hardcode a blob URL -- it will 404 within hours.
 */

import { retryFetch } from "./retry.js";

const BASE = "https://data.texas.gov";

/**
 * Resolve and fetch the current blob for a Socrata file-type dataset.
 * @param {string} datasetId  4x4 Socrata dataset id (e.g. "cuc7-ywmd").
 * @returns {Promise<Response>} The raw blob response (caller decides .json()/.arrayBuffer()).
 */
export async function fetchGtfsBlob(datasetId) {
  const metaRes = await retryFetch(
    (signal) => fetch(`${BASE}/api/views/${datasetId}.json`, { signal }),
    { source: "data.texas.gov (CapMetro GTFS metadata)", profile: "fast", url: `${BASE}/api/views/${datasetId}.json` }
  );
  if (!metaRes.ok) {
    throw new Error(`CapMetro GTFS metadata fetch failed for ${datasetId}: ${metaRes.status}`);
  }
  const meta = await metaRes.json();
  const { blobId, blobFilename } = meta;
  if (!blobId) {
    throw new Error(`Dataset ${datasetId} has no blob (blobId missing) -- metadata shape may have changed`);
  }

  const blobUrl = `${BASE}/api/views/${datasetId}/files/${blobId}?download=true&filename=${encodeURIComponent(blobFilename ?? "data")}`;
  return retryFetch(
    (signal) => fetch(blobUrl, { signal }),
    {
      source: "data.texas.gov (CapMetro GTFS blob)",
      custom: { retries: 1, delays: [1000], timeoutMs: 45000 }, // the static GTFS zip is ~15MB
      url: blobUrl,
    }
  );
}

/** Fetch + parse a GTFS-realtime JSON feed (vehicle positions, trip updates, service alerts). */
export async function fetchGtfsRealtimeJson(datasetId) {
  const res = await fetchGtfsBlob(datasetId);
  if (!res.ok) {
    throw new Error(`CapMetro GTFS-realtime blob fetch failed for ${datasetId}: ${res.status}`);
  }
  return res.json();
}
