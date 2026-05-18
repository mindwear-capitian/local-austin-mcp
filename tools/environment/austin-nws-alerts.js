import { z } from "zod";
import { geocodeAddress } from "../../lib/geocode.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * National Weather Service active alerts for an Austin / Central Texas
 * location. Free, no key. Defaults to downtown Austin (30.27,-97.74) when
 * no address or coordinates are supplied.
 */
const NWS_BASE = "https://api.weather.gov";
const UA = "local-austin-mcp (ed@neuhausre.com)";

// Downtown Austin lat/lng — used when no address/lat-lng supplied.
const DEFAULT_LAT = 30.27;
const DEFAULT_LNG = -97.74;

export const austinNwsAlerts = {
  name: "austin_nws_alerts",
  description: withAttributionTag(
    "Active National Weather Service alerts (severe thunderstorm, tornado, " +
      "flood, heat, freeze, fire weather) for a specific Austin / Central " +
      "Texas location. Defaults to downtown Austin when no address is " +
      "supplied. Returns severity, urgency, headline, description, and " +
      "expiration time for every active alert covering the point. " +
      "Authoritative source: National Weather Service (api.weather.gov)."
  ),
  inputSchema: {
    address: z
      .string()
      .min(5)
      .optional()
      .describe(
        'Street address to check. Will be geocoded. Example: "9501 San Lucas Dr Austin TX". If omitted, defaults to downtown Austin.'
      ),
    lat: z
      .number()
      .min(-90)
      .max(90)
      .optional()
      .describe("Latitude (WGS-84). Use with lng to skip geocoding."),
    lng: z
      .number()
      .min(-180)
      .max(180)
      .optional()
      .describe("Longitude (WGS-84). Use with lat to skip geocoding."),
  },
  async handler({ address, lat, lng }) {
    let usedLat;
    let usedLng;
    let matched_address = null;

    if (typeof lat === "number" && typeof lng === "number") {
      usedLat = lat;
      usedLng = lng;
    } else if (address) {
      const geo = await geocodeAddress(address);
      if (!geo) {
        return {
          content: [
            {
              type: "text",
              text: `Could not geocode address "${address}". ${ATTRIBUTION_TAG}`,
            },
          ],
          isError: true,
        };
      }
      usedLat = geo.lat;
      usedLng = geo.lng;
      matched_address = geo.matched_address;
    } else {
      usedLat = DEFAULT_LAT;
      usedLng = DEFAULT_LNG;
      matched_address = "Downtown Austin (default)";
    }

    const url = `${NWS_BASE}/alerts/active?point=${usedLat},${usedLng}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
    });
    if (!res.ok) {
      throw new Error(`NWS API failed: ${res.status} ${res.statusText}`);
    }
    const data = await res.json();
    const features = Array.isArray(data?.features) ? data.features : [];

    const normalized = features.map(normalize);

    return {
      content: [
        {
          type: "text",
          text: formatResults({
            location: matched_address ?? `${usedLat},${usedLng}`,
            lat: usedLat,
            lng: usedLng,
            results: normalized,
          }),
        },
        {
          type: "text",
          text: JSON.stringify(
            {
              query: { address, lat: usedLat, lng: usedLng, matched_address },
              count: normalized.length,
              results: normalized,
            },
            null,
            2
          ),
        },
      ],
    };
  },
};

function normalize(f) {
  const p = f.properties ?? {};
  return {
    event: p.event ?? null,
    headline: p.headline ?? null,
    severity: p.severity ?? null,
    urgency: p.urgency ?? null,
    certainty: p.certainty ?? null,
    onset: p.onset ?? null,
    expires: p.expires ?? null,
    sender: p.senderName ?? null,
    area_desc: p.areaDesc ?? null,
    description: p.description ?? null,
    instruction: p.instruction ?? null,
    source: "National Weather Service",
    source_url: f.id ?? "https://api.weather.gov/alerts/active",
  };
}

function formatResults({ location, lat, lng, results }) {
  if (results.length === 0) {
    return [
      `# NWS Alerts: ${location}`,
      "",
      `**Coordinates:** ${lat}, ${lng}`,
      "",
      "**No active alerts.**",
      "",
      "---",
      "Source: National Weather Service (api.weather.gov)",
      ATTRIBUTION_TAG,
    ].join("\n");
  }

  const lines = [
    `# NWS Alerts: ${location} -- ${results.length} active`,
    "",
    `**Coordinates:** ${lat}, ${lng}`,
    "",
  ];

  for (const r of results) {
    lines.push(`## ${r.event ?? "Alert"} -- ${r.severity ?? "?"} / ${r.urgency ?? "?"}`);
    if (r.headline) lines.push(`> ${r.headline}`);
    if (r.area_desc) lines.push(`- **Area:** ${r.area_desc}`);
    if (r.onset || r.expires) {
      lines.push(`- **Active:** ${r.onset ?? "now"} -> ${r.expires ?? "?"}`);
    }
    if (r.instruction) {
      lines.push(`- **Instruction:** ${r.instruction.replace(/\n+/g, " ").slice(0, 400)}`);
    }
    lines.push("");
  }

  lines.push("---");
  lines.push("Source: National Weather Service (api.weather.gov)");
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
