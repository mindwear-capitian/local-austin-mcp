/**
 * CapMetro static GTFS (routes.txt, stops.txt) -- resolves route/stop IDs
 * from the live GTFS-realtime feeds into human-readable names.
 *
 * The static GTFS is published as a single ~15MB zip (dataset r4v4-vz24).
 * We only need two small member files out of it (stops.txt ~400KB,
 * routes.txt ~7KB) out of eleven total (stop_times.txt alone is 62MB), so
 * this hand-rolls a minimal ZIP central-directory reader rather than
 * pulling in a zip dependency for two files. Node's built-in zlib handles
 * the actual DEFLATE decompression; only the ZIP container format
 * (central directory + local file headers) is hand-parsed here. Verified
 * against the real live file: extracted byte lengths for both members
 * matched `unzip -l` exactly before this was wired into a tool.
 *
 * Parsed result is cached in memory for the process lifetime (capped at
 * 24h) -- the schedule changes at most a few times a year, re-downloading
 * 15MB on every tool call would be wasteful and slow.
 */

import { inflateRawSync } from "node:zlib";
import { fetchGtfsBlob } from "./gtfs.js";

const STATIC_DATASET_ID = "r4v4-vz24";
const CACHE_TTL_MS = 24 * 60 * 60 * 1000;

let cache = null; // { stopsById: Map, routesById: Map, fetchedAt: number }
let inFlight = null; // dedupe concurrent cold-cache calls

function findEndOfCentralDirectory(buf) {
  const sig = 0x06054b50;
  const start = Math.max(0, buf.length - 22 - 65536);
  for (let i = buf.length - 22; i >= start; i--) {
    if (buf.readUInt32LE(i) === sig) return i;
  }
  throw new Error("CapMetro GTFS zip: End Of Central Directory record not found");
}

/** Extract named member files from a ZIP buffer. Supports stored + DEFLATE entries. */
function extractZipMembers(buf, wantedNames) {
  const eocd = findEndOfCentralDirectory(buf);
  const centralDirOffset = buf.readUInt32LE(eocd + 16);
  const entryCount = buf.readUInt16LE(eocd + 10);

  const found = {};
  let off = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(off) !== 0x02014b50) {
      throw new Error(`CapMetro GTFS zip: bad central directory signature at entry ${i}`);
    }
    const compMethod = buf.readUInt16LE(off + 10);
    const compSize = buf.readUInt32LE(off + 20);
    const uncompSize = buf.readUInt32LE(off + 24);
    const nameLen = buf.readUInt16LE(off + 28);
    const extraLen = buf.readUInt16LE(off + 30);
    const commentLen = buf.readUInt16LE(off + 32);
    const localHeaderOffset = buf.readUInt32LE(off + 42);
    const name = buf.toString("utf8", off + 46, off + 46 + nameLen);

    if (wantedNames.includes(name)) {
      const lfhNameLen = buf.readUInt16LE(localHeaderOffset + 26);
      const lfhExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + lfhNameLen + lfhExtraLen;
      const compData = buf.subarray(dataStart, dataStart + compSize);
      let data;
      if (compMethod === 0) data = compData;
      else if (compMethod === 8) data = inflateRawSync(compData);
      else throw new Error(`CapMetro GTFS zip: unsupported compression method ${compMethod} for ${name}`);
      if (data.length !== uncompSize) {
        throw new Error(`CapMetro GTFS zip: size mismatch for ${name} (got ${data.length}, expected ${uncompSize})`);
      }
      found[name] = data.toString("utf8");
    }

    off += 46 + nameLen + extraLen + commentLen;
  }
  return found;
}

/** Minimal RFC 4180 CSV line parser -- handles quoted fields with embedded commas/quotes. */
function parseCsvLine(line) {
  const fields = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else inQuotes = false;
      } else {
        cur += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      fields.push(cur);
      cur = "";
    } else {
      cur += c;
    }
  }
  fields.push(cur);
  return fields;
}

function parseCsvToMapById(csvText, idField) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  if (lines.length === 0) return new Map();
  const header = parseCsvLine(lines[0]);
  const idIdx = header.indexOf(idField);
  if (idIdx === -1) throw new Error(`CapMetro GTFS: expected column "${idField}" not found in header: ${header.join(",")}`);

  const map = new Map();
  for (let i = 1; i < lines.length; i++) {
    const fields = parseCsvLine(lines[i]);
    const row = {};
    for (let c = 0; c < header.length; c++) row[header[c]] = fields[c] ?? "";
    map.set(row[idField], row);
  }
  return map;
}

async function loadFresh() {
  const res = await fetchGtfsBlob(STATIC_DATASET_ID);
  if (!res.ok) {
    throw new Error(`CapMetro static GTFS fetch failed: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  const files = extractZipMembers(buf, ["stops.txt", "routes.txt"]);
  if (!files["stops.txt"] || !files["routes.txt"]) {
    throw new Error("CapMetro static GTFS: stops.txt or routes.txt missing from zip");
  }
  return {
    stopsById: parseCsvToMapById(files["stops.txt"], "stop_id"),
    routesById: parseCsvToMapById(files["routes.txt"], "route_id"),
    fetchedAt: Date.now(),
  };
}

/** Get the cached (or freshly-fetched) static GTFS stops + routes lookup maps. */
export async function getGtfsStatic() {
  if (cache && Date.now() - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (!inFlight) {
    inFlight = loadFresh()
      .then((result) => { cache = result; return result; })
      .finally(() => { inFlight = null; });
  }
  return inFlight;
}
