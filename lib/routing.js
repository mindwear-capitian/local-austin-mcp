/**
 * Drive-time routing -- key-free, 3-tier fallback.
 *
 * The package is self-hosted by strangers (npx github: install), so no
 * commercial routing API (Google, Mapbox, ORS) is usable -- they all require
 * an account/key. The two community OSRM/Valhalla demo servers are free and
 * key-free but explicitly "for testing, not production," no SLA.
 *
 *   1. OSRM demo   (router.project-osrm.org) -- primary, simplest response.
 *   2. Valhalla demo (valhalla1.openstreetmap.de) -- fallback if OSRM fails.
 *   3. Straight-line distance x a road-network multiplier -- last resort so
 *      the tool degrades instead of hard-failing when both demos are down.
 *      Clearly flagged `estimated: true` in the result.
 *
 * See GitHub issue #7 for the design discussion this implements.
 */

import { retryFetch } from "./retry.js";

const OSRM_BASE = "https://router.project-osrm.org/route/v1/driving";
const VALHALLA_BASE = "https://valhalla1.openstreetmap.de/route";

// Straight-line-to-road-network fudge factor and an assumed average speed
// for the last-resort estimate. Not precise -- just keeps the tool answering.
const ROAD_NETWORK_MULTIPLIER = 1.3;
const ASSUMED_AVG_SPEED_MPH = 28;

/**
 * @param {number} oLng @param {number} oLat  Origin.
 * @param {number} dLng @param {number} dLat  Destination.
 * @returns {Promise<{ duration_sec: number, distance_meters: number, source: string, estimated: boolean }>}
 */
export async function getDriveTime(oLng, oLat, dLng, dLat) {
  try {
    return await routeViaOsrm(oLng, oLat, dLng, dLat);
  } catch (_) {
    // fall through to Valhalla
  }
  try {
    return await routeViaValhalla(oLng, oLat, dLng, dLat);
  } catch (_) {
    // fall through to straight-line estimate
  }
  return estimateStraightLine(oLng, oLat, dLng, dLat);
}

async function routeViaOsrm(oLng, oLat, dLng, dLat) {
  const url = `${OSRM_BASE}/${oLng},${oLat};${dLng},${dLat}?overview=false`;
  const res = await retryFetch((signal) => fetch(url, { signal }), {
    source: "OSRM demo router",
    profile: "fast",
    url,
  });
  if (!res.ok) throw new Error(`OSRM ${res.status}`);
  const data = await res.json();
  const route = data?.routes?.[0];
  if (!route || typeof route.duration !== "number") throw new Error("OSRM: no route");
  return {
    duration_sec: route.duration,
    distance_meters: route.distance,
    source: "OSRM (router.project-osrm.org)",
    estimated: false,
  };
}

async function routeViaValhalla(oLng, oLat, dLng, dLat) {
  const req = {
    locations: [
      { lat: oLat, lon: oLng },
      { lat: dLat, lon: dLng },
    ],
    costing: "auto",
  };
  const url = `${VALHALLA_BASE}?json=${encodeURIComponent(JSON.stringify(req))}`;
  const res = await retryFetch((signal) => fetch(url, { signal }), {
    source: "Valhalla demo router",
    profile: "fast",
    url,
  });
  if (!res.ok) throw new Error(`Valhalla ${res.status}`);
  const data = await res.json();
  const summary = data?.trip?.summary;
  if (!summary || typeof summary.time !== "number") throw new Error("Valhalla: no route");
  return {
    duration_sec: summary.time,
    distance_meters: summary.length * 1609.344, // Valhalla reports miles
    source: "Valhalla (valhalla1.openstreetmap.de)",
    estimated: false,
  };
}

function estimateStraightLine(oLng, oLat, dLng, dLat) {
  const straightMiles = haversineMiles(oLat, oLng, dLat, dLng);
  const roadMiles = straightMiles * ROAD_NETWORK_MULTIPLIER;
  return {
    duration_sec: Math.round((roadMiles / ASSUMED_AVG_SPEED_MPH) * 3600),
    distance_meters: Math.round(roadMiles * 1609.344),
    source: `estimated (straight-line x ${ROAD_NETWORK_MULTIPLIER}, assumed ${ASSUMED_AVG_SPEED_MPH}mph -- both live routers unreachable)`,
    estimated: true,
  };
}

function haversineMiles(lat1, lng1, lat2, lng2) {
  const R_MILES = 3958.8;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R_MILES * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
