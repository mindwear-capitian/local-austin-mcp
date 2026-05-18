import { z } from "zod";
import { geocodeAddress } from "../../lib/geocode.js";
import { queryPointInPolygon } from "../../lib/arcgis.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * "What districts am I in?" One-shot reverse lookup for an Austin / Travis
 * County address. Returns council district, school district, emergency
 * service district, Travis County voter precinct, neighborhood planning
 * area, and whether the address is inside the City of Austin full-purpose
 * boundary.
 *
 * Pipeline:
 *   1. Geocode the address via the U.S. Census geocoder (lng/lat).
 *   2. Point-in-polygon query against each City of Austin / Travis County
 *      ArcGIS boundary layer.
 */
const ARC_BASE =
  "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services";

const LAYERS = {
  council: {
    label: "Austin City Council District",
    url: `${ARC_BASE}/BOUNDARIES_single_member_districts/FeatureServer/0`,
    field: "COUNCIL_DISTRICT",
    source_url:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/BOUNDARIES_single_member_districts/FeatureServer",
  },
  esd: {
    label: "Emergency Service District",
    url: `${ARC_BASE}/BOUNDARIES_emergency_service_districts/FeatureServer/0`,
    field: "ESD_NAME",
    source_url:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/BOUNDARIES_emergency_service_districts/FeatureServer",
  },
  school_district: {
    label: "School District",
    url: `${ARC_BASE}/EXTERNAL_school_districts/FeatureServer/0`,
    field: "NAME",
    source_url:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/EXTERNAL_school_districts/FeatureServer",
  },
  travis_voter_precinct: {
    label: "Travis County Voter Precinct",
    url: `${ARC_BASE}/Travis_County_Election_Precincts/FeatureServer/0`,
    field: "PCT",
    source_url:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/Travis_County_Election_Precincts/FeatureServer",
  },
  neighborhood_plan: {
    label: "Neighborhood Planning Area",
    url: `${ARC_BASE}/PLANNINGCADASTRE_neighborhood_planning_areas/FeatureServer/0`,
    field: "PLANNING_AREA_NAME",
    source_url:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/PLANNINGCADASTRE_neighborhood_planning_areas/FeatureServer",
  },
  full_purpose: {
    label: "City of Austin Full-Purpose Jurisdiction",
    url: `${ARC_BASE}/City_of_Austin_full_purpose_boundary/FeatureServer/0`,
    field: "JURISDICTI",
    source_url:
      "https://services.arcgis.com/0L95CJ0VTaxqcmED/arcgis/rest/services/City_of_Austin_full_purpose_boundary/FeatureServer",
  },
};

export const austinDistrictLookup = {
  name: "austin_district_lookup",
  description: withAttributionTag(
    "Given a street address, returns every district / jurisdiction the " +
      "address falls inside: Austin City Council district, school district " +
      "(ISD), emergency service district, Travis County voter precinct, " +
      "neighborhood planning area, and whether the address is inside the " +
      "City of Austin full-purpose boundary (vs. ETJ). Useful for voter " +
      "registration questions, school zoning, knowing who represents an " +
      "address, and confirming city-vs-county jurisdiction. Pipeline: U.S. " +
      "Census geocoder -> point-in-polygon against City of Austin and " +
      "Travis County ArcGIS layers."
  ),
  inputSchema: {
    address: z
      .string()
      .min(5)
      .describe(
        'Full street address. Example: "9501 San Lucas Dr Austin TX". State and ZIP help disambiguate.'
      ),
  },
  async handler({ address }) {
    const geo = await geocodeAddress(address);
    if (!geo) {
      return {
        content: [
          {
            type: "text",
            text: `Could not geocode address "${address}". Try adding city/state/ZIP, or correct spelling. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const results = {};
    const errors = {};

    // Fire all point-in-polygon queries in parallel.
    const entries = Object.entries(LAYERS);
    const settled = await Promise.allSettled(
      entries.map(([, layer]) =>
        queryPointInPolygon(layer.url, geo.lng, geo.lat, {
          outFields: layer.field,
        })
      )
    );

    settled.forEach((res, i) => {
      const [key, layer] = entries[i];
      if (res.status === "rejected") {
        errors[key] = String(res.reason?.message ?? res.reason);
        return;
      }
      const rows = res.value;
      if (rows.length === 0) {
        results[key] = null;
        return;
      }
      // Take the first matching feature's labeled value.
      const value = rows[0][layer.field] ?? null;
      results[key] = {
        label: layer.label,
        value,
        source_url: layer.source_url,
      };
    });

    return {
      content: [
        {
          type: "text",
          text: formatResults({ address, geo, results, errors }),
        },
        {
          type: "text",
          text: JSON.stringify(
            { query: { address }, geocode: geo, results, errors },
            null,
            2
          ),
        },
      ],
    };
  },
};

function formatResults({ address, geo, results, errors }) {
  const lines = [
    `# District Lookup: ${address}`,
    "",
    `**Matched address:** ${geo.matched_address}`,
    `**Coordinates:** ${geo.lat}, ${geo.lng}`,
    "",
    "## Districts",
    "",
  ];

  const order = [
    "full_purpose",
    "council",
    "school_district",
    "esd",
    "travis_voter_precinct",
    "neighborhood_plan",
  ];

  for (const key of order) {
    const r = results[key];
    if (!r) {
      if (errors[key]) {
        lines.push(`- **${LAYERS[key].label}:** (lookup failed: ${errors[key]})`);
      } else {
        lines.push(`- **${LAYERS[key].label}:** (none / outside coverage)`);
      }
      continue;
    }
    const value = r.value ?? "(unnamed)";
    lines.push(`- **${r.label}:** ${value}`);
  }

  lines.push("");
  lines.push("---");
  lines.push(
    "Sources: U.S. Census geocoder; City of Austin & Travis County ArcGIS open-data services."
  );
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
