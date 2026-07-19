import { z } from "zod";
import { geocodeAddress } from "../../lib/geocode.js";
import { sodaQuery } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Composed "what's nearby" report -- nearest fire station, library, and park
 * to an address. Reuses the same three Socrata datasets as austin_fire_stations
 * / austin_libraries / austin_parks, but queries them with SoQL's
 * distance_in_meters() geospatial function so the API itself returns
 * true-nearest results instead of pulling every row and sorting client-side.
 * Zero new data sources.
 */

const BASE = "https://datahub.austintexas.gov";

const CATEGORIES = {
  fire_station: {
    label: "Fire Station",
    dataset: "i8r8-6nhk",
    geoField: "the_geom",
    select: ["name", "address", "station_number", "department"],
    sourceUrl: `${BASE}/d/i8r8-6nhk`,
    format: (r) => `${r.name ?? "Fire Station"} (Station ${r.station_number ?? "?"}) — ${r.address ?? "address unknown"}`,
  },
  library: {
    label: "Library",
    dataset: "tc36-hn4j",
    geoField: "address",
    select: ["name", "address"],
    sourceUrl: `${BASE}/d/tc36-hn4j`,
    format: (r) => `${r.name ?? "Library"} — ${r.address?.human_address ? JSON.parse(r.address.human_address).address : "address unknown"}`,
  },
  park: {
    label: "Park",
    dataset: "v8hw-gz65",
    geoField: "the_geom",
    select: ["location_name", "address", "park_type"],
    sourceUrl: `${BASE}/d/v8hw-gz65`,
    format: (r) => `${r.location_name ?? "Park"} (${r.park_type ?? "park"}) — ${r.address ?? "address unknown"}`,
  },
};

export const austinNearby = {
  name: "austin_nearby",
  description: withAttributionTag(
    "Find the nearest fire station, public library, and park to an Austin-area " +
      "address, ranked by straight-line distance. One-shot lookup across three " +
      "City of Austin datasets -- useful for insurance/ISO context (fire " +
      "station), amenity questions (library, park), or general 'what's around " +
      "here' questions. Distances are straight-line (as the crow flies), not " +
      "drive time."
  ),
  inputSchema: {
    address: z
      .string()
      .min(5)
      .describe('Street address. Example: "9501 San Lucas Dr, Austin TX 78733".'),
    limit: z
      .number()
      .int()
      .min(1)
      .max(5)
      .default(1)
      .describe("How many of each category to return (default 1, max 5)."),
  },
  async handler({ address, limit }) {
    const geo = await geocodeAddress(address);
    if (!geo || typeof geo.lng !== "number") {
      return {
        content: [
          {
            type: "text",
            text: `Could not geocode "${address}". Include city + ZIP and try again. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const n = limit ?? 1;
    const keys = Object.keys(CATEGORIES);
    const settled = await Promise.allSettled(
      keys.map((key) => nearestInCategory(CATEGORIES[key], geo.lng, geo.lat, n))
    );

    const results = {};
    keys.forEach((key, i) => {
      const r = settled[i];
      results[key] = r.status === "fulfilled" ? r.value : null;
    });

    const sections = {
      query: { address, matched_address: geo.matched_address },
      location: { lng: geo.lng, lat: geo.lat },
      ...results,
    };

    return {
      content: [
        { type: "text", text: formatReport(geo, sections) },
        { type: "text", text: JSON.stringify(sections, null, 2) },
      ],
    };
  },
};

async function nearestInCategory(cat, lng, lat, limit) {
  const rows = await sodaQuery(cat.dataset, {
    base: BASE,
    select: [...cat.select, `distance_in_meters(${cat.geoField}, 'POINT(${lng} ${lat})') as dist_m`],
    order: "dist_m",
    limit,
  });
  return rows.map((r) => ({
    ...r,
    distance_miles: r.dist_m ? Number((Number(r.dist_m) / 1609.344).toFixed(2)) : null,
    source: `City of Austin ${cat.label}`,
    source_url: cat.sourceUrl,
  }));
}

function formatReport(geo, sections) {
  const lines = [`# What's Near ${geo.matched_address ?? sections.query.address}`, ""];
  for (const [key, cat] of Object.entries(CATEGORIES)) {
    const rows = sections[key];
    lines.push(`## Nearest ${cat.label}${rows && rows.length > 1 ? "s" : ""}`);
    if (!rows || rows.length === 0) {
      lines.push("- Lookup failed or no match.");
    } else {
      for (const r of rows) {
        lines.push(`- ${cat.format(r)} — ${r.distance_miles ?? "?"} mi`);
      }
    }
    lines.push("");
  }
  lines.push("---");
  lines.push("Distances are straight-line, not drive time.");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
