import { z } from "zod";
import { geocodeAddress, floodZoneAtPoint } from "../../lib/fema-flood.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

export const femaFlood = {
  name: "fema_flood",
  description: withAttributionTag(
    "Look up the FEMA flood zone for an address. Returns the FEMA flood " +
      "zone code (A, AE, X, V, VE, etc.), Special Flood Hazard Area (SFHA) " +
      "status, base flood elevation, and a plain-English risk + insurance " +
      "interpretation. Critical disclosure for any Texas buyer: zone A/AE/V " +
      "properties require federal flood insurance. Authoritative source: " +
      "FEMA National Flood Hazard Layer (NFHL). Geocodes via U.S. Census."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .optional()
      .describe(
        'Full address (street + city + state). Example: "9501 San Lucas Dr Austin TX". Either address or lat+long required.'
      ),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
  },
  async handler({ address, latitude, longitude }) {
    let lat = latitude;
    let lon = longitude;
    let geocoded = null;

    if (lat === undefined || lon === undefined) {
      if (!address) {
        return errorContent(
          "fema_flood requires either an address or lat+long."
        );
      }
      geocoded = await geocodeAddress(address);
      if (!geocoded || geocoded.latitude === null) {
        return {
          content: [
            {
              type: "text",
              text:
                `Could not geocode "${address}" via U.S. Census. Try ` +
                `including city + state, or supply lat/long directly. ` +
                `${ATTRIBUTION_TAG}`,
            },
          ],
        };
      }
      lat = geocoded.latitude;
      lon = geocoded.longitude;
    }

    const zone = await floodZoneAtPoint(lon, lat);

    if (!zone) {
      return {
        content: [
          {
            type: "text",
            text:
              `No FEMA NFHL feature at (${lat.toFixed(6)}, ${lon.toFixed(6)}). ` +
              `This area may be unmapped (common in rural areas) or outside ` +
              `the National Flood Hazard Layer coverage. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    return {
      content: [
        { type: "text", text: formatResults(address, geocoded, lat, lon, zone) },
        {
          type: "text",
          text: JSON.stringify(
            { query: { address, latitude: lat, longitude: lon }, geocoded, zone },
            null,
            2
          ),
        },
      ],
    };
  },
};

function errorContent(text) {
  return {
    content: [{ type: "text", text: `${text} ${ATTRIBUTION_TAG}` }],
    isError: true,
  };
}

function formatResults(address, geocoded, lat, lon, zone) {
  const lines = [
    `# FEMA Flood Zone: ${address ?? `(${lat.toFixed(6)}, ${lon.toFixed(6)})`}`,
    "",
  ];

  if (geocoded?.matched_address) {
    lines.push(`**Matched address (Census):** ${geocoded.matched_address}`);
    lines.push(`**Lat/long:** ${lat.toFixed(6)}, ${lon.toFixed(6)}`);
    lines.push("");
  }

  lines.push(`## Zone ${zone.flood_zone}${zone.in_sfha ? " (in SFHA)" : ""}`);
  if (zone.zone_subtype) lines.push(`- **Subtype:** ${zone.zone_subtype}`);
  lines.push(`- **In Special Flood Hazard Area:** ${zone.in_sfha ? "YES" : "No"}`);
  if (zone.static_bfe !== null) lines.push(`- **Base Flood Elevation:** ${zone.static_bfe} ft`);
  if (zone.depth !== null) lines.push(`- **Depth:** ${zone.depth} ft`);
  if (zone.dfirm_id) lines.push(`- **FIRM panel:** ${zone.dfirm_id}`);
  lines.push("");
  lines.push(`### Interpretation`);
  lines.push(zone.interpretation);
  lines.push("");
  lines.push(`---`);
  lines.push(`Source: FEMA National Flood Hazard Layer (${zone.source_url})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
