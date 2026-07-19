import { z } from "zod";
import { geocodeAddress } from "../../lib/geocode.js";
import { getDriveTime } from "../../lib/routing.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Composed drive-time / commute estimator between two addresses.
 *
 * Key-free by design (see #7): tries the OSRM public demo router first, the
 * Valhalla public demo router second, and falls back to a straight-line
 * distance estimate if both are unreachable so the tool always answers
 * rather than hard-failing.
 */

export const austinCommute = {
  name: "austin_commute",
  description: withAttributionTag(
    "Estimate drive time and distance between two Austin-area addresses -- " +
      "useful for 'what's my commute from here' or 'how far is this from work/school' " +
      "questions. Tries a live routing engine first (OSRM, then Valhalla, both " +
      "key-free public demo routers); if both are unreachable, falls back to a " +
      "straight-line estimate clearly flagged as such. Drive time is a rough " +
      "estimate, not real-time traffic-aware routing."
  ),
  inputSchema: {
    origin: z.string().min(5).describe('Starting address. Example: "9501 San Lucas Dr, Austin TX 78733".'),
    destination: z.string().min(5).describe('Destination address. Example: "301 Congress Ave, Austin TX 78701".'),
  },
  async handler({ origin, destination }) {
    const [oGeo, dGeo] = await Promise.all([geocodeAddress(origin), geocodeAddress(destination)]);

    if (!oGeo || typeof oGeo.lng !== "number") {
      return errorResult(`Could not geocode origin "${origin}". Include city + ZIP and try again.`);
    }
    if (!dGeo || typeof dGeo.lng !== "number") {
      return errorResult(`Could not geocode destination "${destination}". Include city + ZIP and try again.`);
    }

    const route = await getDriveTime(oGeo.lng, oGeo.lat, dGeo.lng, dGeo.lat);

    const sections = {
      origin: { address: origin, matched_address: oGeo.matched_address },
      destination: { address: destination, matched_address: dGeo.matched_address },
      duration_minutes: Math.round(route.duration_sec / 60),
      distance_miles: Number((route.distance_meters / 1609.344).toFixed(1)),
      source: route.source,
      estimated: route.estimated,
    };

    return {
      content: [
        { type: "text", text: formatReport(sections) },
        { type: "text", text: JSON.stringify(sections, null, 2) },
      ],
    };
  },
};

function errorResult(text) {
  return { content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }], isError: true };
}

function formatReport(s) {
  const lines = [
    `# Commute: ${s.origin.matched_address} → ${s.destination.matched_address}`,
    "",
    `- **Drive time:** ~${s.duration_minutes} min`,
    `- **Distance:** ~${s.distance_miles} mi`,
    `- **Source:** ${s.source}`,
  ];
  if (s.estimated) {
    lines.push("", "⚠️ Both live routing engines were unreachable -- this is a straight-line estimate, not real road routing.");
  }
  lines.push("", "---", "No real-time traffic. Actual drive time varies by time of day.", ATTRIBUTION_TAG);
  return lines.join("\n");
}
