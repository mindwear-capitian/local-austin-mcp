import { z } from "zod";
import { sodaQuery, sodaAddressLike } from "../../lib/soda.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * City of Austin "Zoning By Address" dataset. Pre-joined zoning + address
 * data so we can SODA-query directly on full_street_name -- no spatial /
 * ArcGIS work needed.
 *
 * Hosted on datahub.austintexas.gov.
 */
const DATASET = "nbzi-qabm";
const BASE = "https://datahub.austintexas.gov";
const SOURCE_URL = `${BASE}/d/${DATASET}`;

export const austinZoning = {
  name: "austin_zoning",
  description: withAttributionTag(
    "Look up the City of Austin zoning designation for an address. Returns " +
      "the full zoning code (e.g. SF-3, MF-4, CS-V-CO-NP, GR-MU), the base " +
      "zone, and the base-zone category in plain English (e.g. 'Single " +
      "Family Standard Lot', 'General Commercial Services'). Use to verify " +
      "what is allowed at a property: STR rentals, accessory dwellings, " +
      "commercial use, lot subdivision, or building height. Authoritative " +
      "source: City of Austin Planning Department."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address. Example: "5201 Airport Blvd" or "11507 Jim Thorpe". Match is fuzzy/contains. Single-family lots typically have one zoning record; corner lots / mixed-use can have multiple.'
      ),
    limit: z
      .number()
      .int()
      .min(1)
      .max(50)
      .optional()
      .describe("Max matches (default 10)."),
  },
  async handler({ address, limit }) {
    const where = sodaAddressLike("full_street_name", address);

    const rows = await sodaQuery(DATASET, {
      base: BASE,
      where,
      limit: limit ?? 10,
    });

    if (rows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text:
              `No City of Austin zoning record found for "${address}". This ` +
              `dataset covers City of Austin jurisdiction only -- properties ` +
              `in ETJ, Travis County unincorporated, or other municipalities ` +
              `won't appear. ${ATTRIBUTION_TAG}`,
          },
        ],
      };
    }

    const normalized = rows.map(normalize);

    return {
      content: [
        { type: "text", text: formatResults(address, normalized) },
        {
          type: "text",
          text: JSON.stringify(
            { query: address, count: normalized.length, results: normalized },
            null,
            2
          ),
        },
      ],
    };
  },
};

function normalize(r) {
  return {
    address: r.full_street_name ?? null,
    zoning_code: r.zoning_ztype ?? null,
    base_zone: r.base_zone ?? null,
    base_zone_category: r.base_zone_category ?? null,
    object_id: r.objectid ?? null,
    place_id: r.place_id ?? null,
    parent_place_id: r.parent_place_id ?? null,
    segment_id: r.segment_id ?? null,
    source: "City of Austin Planning Department -- Zoning By Address",
    source_url: SOURCE_URL,
  };
}

function formatResults(query, results) {
  const lines = [
    `# Austin Zoning: "${query}" -- ${results.length} record${results.length === 1 ? "" : "s"}`,
    "",
  ];

  for (const r of results) {
    lines.push(`## ${r.address ?? "(address unknown)"}`);
    lines.push(`- **Zoning code:** ${r.zoning_code ?? "?"}`);
    if (r.base_zone) lines.push(`- **Base zone:** ${r.base_zone}`);
    if (r.base_zone_category) lines.push(`- **Category:** ${r.base_zone_category}`);
    if (r.place_id) lines.push(`- **Place ID:** ${r.place_id}`);
    lines.push("");
  }

  lines.push(`---`);
  lines.push(
    `Source: City of Austin Planning Department, Zoning By Address ` +
      `(${SOURCE_URL}). Codes follow Austin Land Development Code Title 25. ` +
      `Modifiers like -CO (Conditional Overlay), -NP (Neighborhood Plan), ` +
      `-V (Vertical Mixed-Use), -H (Historic) attach extra rules.`
  );
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}
