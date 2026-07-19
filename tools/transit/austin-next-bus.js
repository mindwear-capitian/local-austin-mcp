import { z } from "zod";
import { getGtfsStatic } from "../../lib/gtfs-static.js";
import { fetchGtfsRealtimeJson } from "../../lib/gtfs.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * CapMetro (Austin's transit authority) real-time bus/rail lookup. Three
 * modes in one tool, since they share the same static route/stop lookup:
 *
 *   - stop_search: find a stop_id by name (e.g. "Congress & 6th")
 *   - stop_id:     live upcoming arrivals at that stop (from Trip Updates)
 *   - route:       live vehicle locations for that route (from Vehicle Positions)
 *
 * Data: CapMetro GTFS-realtime, republished as JSON by the Texas DOT open
 * data portal (data.texas.gov), updated every 15 seconds. Verified live.
 * Static route/stop names come from CapMetro's GTFS schedule zip (see
 * lib/gtfs-static.js) -- cached 24h, not re-downloaded per call.
 */
const VEHICLE_POSITIONS_DATASET = "cuc7-ywmd";
const TRIP_UPDATES_DATASET = "mqtr-wwpy";
const DATASET_PAGE_URL = "https://data.texas.gov/browse?q=capmetro";

export const austinNextBus = {
  name: "austin_next_bus",
  description: withAttributionTag(
    "Real-time CapMetro (Austin transit) bus/rail lookup. Three modes: " +
      "pass `stop_search` to find a stop's ID by name (e.g. \"Congress & 6th\"); " +
      "pass `stop_id` to get live upcoming arrivals at that stop; pass `route` " +
      "(a route number, e.g. \"801\" for MetroRapid or \"20\") to see where " +
      "buses on that route are right now. Data updates every 15 seconds. " +
      "Authoritative source: CapMetro GTFS-realtime via data.texas.gov."
  ),
  inputSchema: {
    stop_search: z
      .string()
      .min(2)
      .optional()
      .describe('Find a stop by name/cross-street, fuzzy contains. Example: "Congress" or "Guadalupe & 24th".'),
    stop_id: z
      .string()
      .optional()
      .describe("CapMetro stop ID (from stop_search, or already known) for live upcoming arrivals."),
    route: z
      .string()
      .optional()
      .describe('Route number for live vehicle positions, e.g. "801", "20", "10".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .default(10)
      .describe("Max results (default 10)."),
  },
  async handler({ stop_search, stop_id, route, limit }) {
    if (!stop_search && !stop_id && !route) {
      return errorContent(
        "austin_next_bus requires one of: stop_search (find a stop by name), " +
          "stop_id (live arrivals at a stop), or route (live vehicle positions for a route)."
      );
    }

    const { stopsById, routesById } = await getGtfsStatic();

    if (stop_search) {
      return handleStopSearch(stop_search, stopsById, limit ?? 10);
    }
    if (stop_id) {
      return handleStopArrivals(stop_id, stopsById, routesById, limit ?? 10);
    }
    return handleRouteVehicles(route, routesById, limit ?? 10);
  },
};

function handleStopSearch(query, stopsById, limit) {
  const upper = query.toUpperCase();
  const matches = [];
  for (const stop of stopsById.values()) {
    const haystack = `${stop.stop_name ?? ""} ${stop.stop_desc ?? ""} ${stop.on_street ?? ""} ${stop.at_street ?? ""}`.toUpperCase();
    if (haystack.includes(upper)) {
      matches.push({
        stop_id: stop.stop_id,
        stop_name: stop.stop_name || null,
        on_street: stop.on_street || null,
        at_street: stop.at_street || null,
        lat: numOrNull(stop.stop_lat),
        lng: numOrNull(stop.stop_lon),
        source_url: DATASET_PAGE_URL,
      });
    }
    if (matches.length >= limit) break;
  }

  const lines = [
    `# CapMetro stop search: "${query}" -- ${matches.length} match${matches.length === 1 ? "" : "es"}`,
    "",
  ];
  if (matches.length === 0) {
    lines.push("No stops matched. Try a cross-street or a shorter fragment of the name.");
  } else {
    for (const m of matches) {
      lines.push(`## ${m.stop_name ?? "(unnamed stop)"}  (stop_id: ${m.stop_id})`);
      if (m.on_street) lines.push(`- **On:** ${m.on_street}${m.at_street ? ` at ${m.at_street}` : ""}`);
      lines.push("");
    }
    lines.push("_Pass one of these stop_id values back as `stop_id` for live upcoming arrivals._");
  }
  lines.push("", "---", `Source: CapMetro GTFS static schedule (${DATASET_PAGE_URL}).`, ATTRIBUTION_TAG);

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify({ query, count: matches.length, results: matches }, null, 2) },
    ],
  };
}

async function handleStopArrivals(stopId, stopsById, routesById, limit) {
  const stop = stopsById.get(String(stopId));
  const feed = await fetchGtfsRealtimeJson(TRIP_UPDATES_DATASET);
  const entities = Array.isArray(feed?.entity) ? feed.entity : [];

  const arrivals = [];
  for (const e of entities) {
    const tu = e.tripUpdate;
    if (!tu) continue;
    const stopTimes = Array.isArray(tu.stopTimeUpdate) ? tu.stopTimeUpdate : [];
    for (const st of stopTimes) {
      if (String(st.stopId) !== String(stopId)) continue;
      const arrivalEpoch = Number(st.arrival?.time ?? st.departure?.time);
      if (!Number.isFinite(arrivalEpoch)) continue;
      const route = routesById.get(String(tu.trip?.routeId));
      arrivals.push({
        route_id: tu.trip?.routeId ?? null,
        route_short_name: route?.route_short_name ?? null,
        route_long_name: route?.route_long_name ?? null,
        scheduled_relationship: tu.trip?.scheduleRelationship ?? null,
        arrival_time: new Date(arrivalEpoch * 1000).toISOString(),
        minutes_away: Math.round((arrivalEpoch * 1000 - Date.now()) / 60000),
        vehicle_id: tu.vehicle?.id ?? null,
      });
    }
  }
  arrivals.sort((a, b) => a.minutes_away - b.minutes_away);
  const results = arrivals.slice(0, limit);

  const stopLabel = stop?.stop_name ? `${stop.stop_name} (stop_id ${stopId})` : `stop_id ${stopId}`;
  const lines = [`# CapMetro live arrivals: ${stopLabel}`, ""];
  if (results.length === 0) {
    lines.push(
      "No upcoming arrivals found for this stop in the current feed. This can mean no service is " +
        "scheduled soon, the stop_id doesn't exist, or (rarely) a feed gap. Double-check the stop_id via stop_search."
    );
  } else {
    for (const a of results) {
      const routeLabel = a.route_short_name ? `Route ${a.route_short_name}${a.route_long_name ? ` (${a.route_long_name})` : ""}` : `Route ${a.route_id ?? "?"}`;
      const when = a.minutes_away <= 0 ? "due now" : `in ${a.minutes_away} min`;
      lines.push(`- **${routeLabel}** -- ${when} (${a.arrival_time})${a.scheduled_relationship === "CANCELED" ? " -- **CANCELED**" : ""}`);
    }
  }
  lines.push("", "---", `Live feed updates every 15s. Source: CapMetro GTFS-realtime Trip Updates (${DATASET_PAGE_URL}).`, ATTRIBUTION_TAG);

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify({ query: { stop_id: stopId }, count: results.length, results }, null, 2) },
    ],
  };
}

async function handleRouteVehicles(routeQuery, routesById, limit) {
  // Resolve the query against route_short_name (what riders actually type, e.g. "801").
  const matchedRoute = [...routesById.values()].find(
    (r) => String(r.route_short_name).toUpperCase() === String(routeQuery).toUpperCase()
  );
  const routeId = matchedRoute?.route_id ?? routeQuery;

  const feed = await fetchGtfsRealtimeJson(VEHICLE_POSITIONS_DATASET);
  const entities = Array.isArray(feed?.entity) ? feed.entity : [];

  const vehicles = entities
    .map((e) => e.vehicle)
    .filter((v) => v && String(v.trip?.routeId) === String(routeId))
    .map((v) => ({
      vehicle_id: v.vehicle?.id ?? null,
      lat: v.position?.latitude ?? null,
      lng: v.position?.longitude ?? null,
      speed_mps: v.position?.speed ?? null,
      current_status: v.currentStatus ?? null,
      current_stop_id: v.stopId ?? null,
      trip_id: v.trip?.tripId ?? null,
      direction_id: v.trip?.directionId ?? null,
      updated_at: Number.isFinite(Number(v.timestamp)) ? new Date(Number(v.timestamp) * 1000).toISOString() : null,
      source_url: DATASET_PAGE_URL,
    }))
    .slice(0, limit);

  const routeLabel = matchedRoute
    ? `Route ${matchedRoute.route_short_name}${matchedRoute.route_long_name ? ` (${matchedRoute.route_long_name})` : ""}`
    : `Route ${routeQuery}`;
  const lines = [`# CapMetro live vehicles: ${routeLabel} -- ${vehicles.length} active`, ""];
  if (vehicles.length === 0) {
    lines.push("No active vehicles found for this route right now -- it may not be in service currently, or the route number/ID didn't match.");
  } else {
    for (const v of vehicles) {
      lines.push(`- Vehicle ${v.vehicle_id ?? "?"} -- ${v.current_status ?? "?"}${v.current_stop_id ? ` near stop ${v.current_stop_id}` : ""} (${v.lat}, ${v.lng})`);
    }
  }
  lines.push("", "---", `Live feed updates every 15s. Source: CapMetro GTFS-realtime Vehicle Positions (${DATASET_PAGE_URL}).`, ATTRIBUTION_TAG);

  return {
    content: [
      { type: "text", text: lines.join("\n") },
      { type: "text", text: JSON.stringify({ query: { route: routeQuery }, count: vehicles.length, results: vehicles }, null, 2) },
    ],
  };
}

function numOrNull(v) {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}
