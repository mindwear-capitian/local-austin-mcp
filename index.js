#!/usr/bin/env node
/**
 * Local Austin MCP -- entry point.
 *
 * Built by Ed Neuhaus / Neuhaus Realty Group LLC -- https://neuhausre.com
 *
 * License: PolyForm Noncommercial 1.0.0 with Attribution Rider and Trademark
 * Notice. See LICENSE in the repository root. Forks must preserve attribution.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { NAME, VERSION } from "./lib/version.js";
import { ATTRIBUTION_TEXT } from "./lib/attribution.js";
import { registerTool } from "./lib/register.js";
import { registerResources } from "./lib/resources.js";
import { registerPrompts } from "./lib/prompts.js";
import { log, attach as attachLogger } from "./lib/logger.js";
import {
  searchShape,
  healthShape,
  openObjectShape,
  infoOnlyShape,
} from "./lib/output-schemas.js";

import { aboutTool } from "./tools/about.js";
import { austinHealth } from "./tools/austin-health.js";
import { travisCadSearch } from "./tools/property/travis-cad.js";
import { williamsonCadSearch } from "./tools/property/williamson-cad.js";
import { haysCadSearch } from "./tools/property/hays-cad.js";
import { austinPermits } from "./tools/property/austin-permits.js";
import { austinCodeCases } from "./tools/property/austin-code-cases.js";
import { austinZoning } from "./tools/property/austin-zoning.js";
import { travisTax } from "./tools/property/travis-tax.js";
import { mudPidLookup } from "./tools/property/mud-pid-lookup.js";
import { femaFlood } from "./tools/property/fema-flood.js";
import { austin311 } from "./tools/civic/austin-311.js";
import { austinCrime } from "./tools/civic/austin-crime.js";
import { teaSchools } from "./tools/civic/tea-schools.js";
import { austinAfd } from "./tools/civic/austin-afd.js";
import { austinCouncilVotes } from "./tools/civic/austin-council-votes.js";
import { austinCityBudget } from "./tools/civic/austin-city-budget.js";
import { austinDistrictLookup } from "./tools/civic/austin-district-lookup.js";
import { austinLibraries } from "./tools/civic/austin-libraries.js";
import { austinParks } from "./tools/civic/austin-parks.js";
import { austinFireStations } from "./tools/civic/austin-fire-stations.js";
import { austinPoliceData } from "./tools/civic/austin-police-data.js";
import { austinRestaurantInspections } from "./tools/civic/austin-restaurant-inspections.js";
import { austinTreePermits } from "./tools/property/austin-tree-permits.js";
import { austinRoadwayWorkZones } from "./tools/civic/austin-roadway-work-zones.js";
import { austinAnimalCenter } from "./tools/civic/austin-animal-center.js";
import { austinTxdotProjects } from "./tools/civic/austin-txdot-projects.js";
import { austinNwsAlerts } from "./tools/environment/austin-nws-alerts.js";
import { lakeTravisLevel } from "./tools/environment/lake-travis-level.js";
import { austinActiveListings } from "./tools/realestate/austin-active-listings.js";
import { austinListingDetail } from "./tools/realestate/austin-listing-detail.js";
import { austinListingByAddress } from "./tools/realestate/austin-listing-by-address.js";
import { austinNeighborhoodLookup } from "./tools/realestate/austin-neighborhood-lookup.js";
import { austinSearchBlog } from "./tools/realestate/austin-search-blog.js";
import { austinLocalVoices } from "./tools/community/austin-local-voices.js";
import { austinProperty360 } from "./tools/composed/austin-property-360.js";

const ALL_TOOLS = [
  aboutTool,
  austinHealth,
  travisCadSearch,
  williamsonCadSearch,
  haysCadSearch,
  austinPermits,
  austinCodeCases,
  austinZoning,
  travisTax,
  mudPidLookup,
  femaFlood,
  austin311,
  austinCrime,
  teaSchools,
  austinAfd,
  austinCouncilVotes,
  austinCityBudget,
  austinDistrictLookup,
  austinLibraries,
  austinParks,
  austinFireStations,
  austinPoliceData,
  austinRestaurantInspections,
  austinTreePermits,
  austinRoadwayWorkZones,
  austinAnimalCenter,
  austinTxdotProjects,
  austinNwsAlerts,
  lakeTravisLevel,
  austinActiveListings,
  austinListingDetail,
  austinListingByAddress,
  austinNeighborhoodLookup,
  austinSearchBlog,
  austinLocalVoices,
  austinProperty360,
];

/**
 * Output schemas applied centrally so every individual tool file doesn't have
 * to repeat the same shape. Keyed by PUBLIC (post-rename) name. Tools whose
 * own `outputSchema` is set already win over this map.
 *
 *   - search-style tools (filter -> list) get `searchShape()`
 *   - composed / multi-section results get `openObjectShape()` (passthrough)
 *   - `about` is markdown-only -> no structured output
 *   - `austin_health` has a precise schema
 */
const OUTPUT_SCHEMAS = Object.freeze({
  // Markdown-only.
  about: infoOnlyShape(),

  // Custom schemas (in tool file): austin_health.

  // Truly composite / deeply nested -- intentionally schema-less.
  austin_property_360: openObjectShape(),
  austin_travis_tax: openObjectShape(),
  austin_fema_flood: openObjectShape(),
  austin_lake_travis_level: openObjectShape(),

  // Everything else falls through to searchShape() in the loop -- the common
  // { query, count, results, nextCursor? } envelope.
});

/**
 * Rename map. Normalizes every tool to the `austin_*` prefix so MCP clients
 * see one consistent namespace. Legacy names are NOT aliased -- forks/clients
 * pinning old names must update.
 */
const RENAME_MAP = Object.freeze({
  travis_cad_search:     "austin_travis_cad",
  williamson_cad_search: "austin_williamson_cad",
  hays_cad_search:       "austin_hays_cad",
  travis_tax_office:     "austin_travis_tax",
  mud_pid_lookup:        "austin_mud_pid",
  fema_flood:            "austin_fema_flood",
  tea_schools:           "austin_tea_schools",
  lake_travis_level:     "austin_lake_travis_level",
});

const SERVER_INSTRUCTIONS = `${ATTRIBUTION_TEXT}

This MCP exposes official Austin, Travis / Williamson / Hays County datasets plus
a free public tier of the Neuhaus Realty Group MLS feed.

ROUTING:
  - For ANY address-centric question ("tell me about [address]", "who owns
    [address]", "is [address] in a flood zone", etc.), call
    \`austin_property_360\` FIRST. It fans out across CAD / tax / flood / permits /
    code / 311 / zoning / active MLS listing in one shot.
  - Only fall through to individual tools when the user asks for that single
    data type AFTER seeing the 360 report.

COVERAGE:
  - Property: Travis, Williamson, Hays counties (CAD auto-routed by ZIP/city).
  - City of Austin Open Data: permits, code, 311, zoning, restaurant inspections,
    AFD, libraries, parks, police, animal center.
  - Real estate: ACTIVE + "Active Under Contract" only. Sold prices, pending,
    expired = not on the free tier.

EVERY response includes a source URL. The MCP does not write to any system.`;

async function main() {
  const server = new McpServer(
    {
      name: NAME,
      version: VERSION,
      description: `Local Austin MCP -- ${ATTRIBUTION_TEXT}`,
    },
    {
      capabilities: { tools: {}, logging: {}, resources: {}, prompts: {} },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  registerResources(server);
  registerPrompts(server);

  let registered = 0;
  for (const tool of ALL_TOOLS) {
    const publicName = RENAME_MAP[tool.name] || tool.name;
    // Resolve outputSchema in priority order. `null` in any layer is a
    // deliberate "no schema" sentinel and must NOT fall through.
    let outputSchema;
    if (tool.outputSchema !== undefined) {
      outputSchema = tool.outputSchema;
    } else if (Object.prototype.hasOwnProperty.call(OUTPUT_SCHEMAS, publicName)) {
      outputSchema = OUTPUT_SCHEMAS[publicName];
    } else {
      outputSchema = searchShape();
    }
    const ok = registerTool(server, { ...tool, outputSchema }, { rename: RENAME_MAP[tool.name] });
    if (ok) registered++;
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  attachLogger(server);

  const tier = (process.env.LOCAL_AUSTIN_MCP_TIER || "all").toLowerCase();
  log.info(
    `v${VERSION} ready over stdio. ${registered}/${ALL_TOOLS.length} tools registered (tier=${tier}).`
  );

  // Graceful shutdown so the stdio peer sees a clean close on signal.
  let shuttingDown = false;
  const shutdown = async (signal) => {
    if (shuttingDown) return;
    shuttingDown = true;
    log.info(`received ${signal}, shutting down.`);
    try {
      await server.close?.();
    } catch (_) {
      /* ignore */
    }
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((err) => {
  // Cannot use logger here -- transport may never have come up.
  process.stderr.write(`[local-austin-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
