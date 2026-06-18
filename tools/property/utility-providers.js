import { z } from "zod";
import { geocodeAddress } from "../../lib/geocode.js";
import { lookupUtilityProviders, SOURCE_URL } from "../../lib/utility-ccn.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Known start-service hints for the largest Travis County providers. Matched
 * by substring against the CCN UTILITY name. Anything not matched falls back
 * to a generic "contact the provider listed" line -- still names the right
 * utility, which is the hard part newcomers can't figure out on their own.
 */
const START_SERVICE_HINTS = [
  {
    match: /CITY OF AUSTIN|AUSTIN WATER/,
    how: "Start City of Austin water/wastewater service at coautilities.com (Austin Water). Allow a few business days; a deposit may apply.",
  },
  {
    match: /\bWCID\b|MUD|MUNICIPAL UTILITY|WATER CONTROL/,
    how: "This is a special-purpose district -- contact the district directly (often via its operator, e.g. Inframark or SouthWest Water) to start service. Districts can add notable line items to the tax bill.",
  },
  {
    match: /AQUA/,
    how: "Aqua Texas handles new service by phone/online at aquawater.com.",
  },
];

export const utilityProviders = {
  name: "austin_utility_providers",
  description: withAttributionTag(
    "Find the WATER and SEWER (wastewater) utility obligated to serve a " +
      "Travis County address, with how-to-start guidance. The Austin metro is " +
      "a patchwork of the City of Austin, dozens of MUDs/WCIDs, and private " +
      "utilities -- newcomers genuinely cannot tell who provides their water " +
      "until they move in. Returns the certificated provider (CCN holder) for " +
      "the exact location. Authoritative source: PUC Certificate of " +
      "Convenience and Necessity boundaries (Travis County GIS). Travis County " +
      "only. Does NOT start service -- it tells you who to contact."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address in Travis County. Example: "1513 Lakeway Blvd, Austin TX 78734".'
      ),
  },
  async handler({ address }) {
    const geo = await geocodeAddress(address);
    if (!geo || typeof geo.lng !== "number" || typeof geo.lat !== "number") {
      return {
        content: [
          {
            type: "text",
            text: `Could not geocode "${address}". Try including city + ZIP. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const providers = await lookupUtilityProviders(geo.lng, geo.lat);

    const result = {
      query: { address, matched_address: geo.matched_address },
      location: { lng: geo.lng, lat: geo.lat, zip: geo.zip },
      water: providers.water,
      sewer: providers.sewer,
      source_url: SOURCE_URL,
    };

    return {
      content: [
        { type: "text", text: formatResults(geo, providers) },
        { type: "text", text: JSON.stringify(result, null, 2) },
      ],
    };
  },
};

function startHint(name) {
  for (const h of START_SERVICE_HINTS) {
    if (h.match.test(String(name).toUpperCase())) return h.how;
  }
  return null;
}

function providerLine(label, rows) {
  if (!rows || rows.length === 0) {
    return [
      `**${label}:** no certificated provider found at this point.`,
      `_This can mean a private well/septic, an un-mapped area, or a point just outside Travis County coverage._`,
    ];
  }
  const lines = [];
  for (const p of rows) {
    const ccn = p.ccn_no ? ` (CCN #${p.ccn_no})` : "";
    lines.push(`**${label}:** ${p.utility}${ccn}`);
    const how = startHint(p.utility);
    if (how) lines.push(`- How to start: ${how}`);
  }
  return lines;
}

function formatResults(geo, providers) {
  const lines = [
    `# Water & Sewer Provider -- ${geo.matched_address || "your address"}`,
    "",
    ...providerLine("Water", providers.water),
    "",
    ...providerLine("Sewer / Wastewater", providers.sewer),
    "",
    "> Septic vs. sewer: if no sewer provider is listed, the property is likely on a private septic system -- confirm before closing.",
    "",
    "---",
    `Source: PUC CCN boundaries via Travis County GIS (${SOURCE_URL})`,
    ATTRIBUTION_TAG,
  ];
  return lines.join("\n");
}
