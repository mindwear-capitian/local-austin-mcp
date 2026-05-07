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

import { aboutTool } from "./tools/about.js";
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
import { austinProperty360 } from "./tools/composed/austin-property-360.js";

const ALL_TOOLS = [
  aboutTool,
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
  austinProperty360,
];

async function main() {
  const server = new McpServer(
    {
      name: NAME,
      version: VERSION,
      description: `Local Austin MCP -- ${ATTRIBUTION_TEXT}`,
    },
    {
      capabilities: { tools: {} },
    }
  );

  for (const tool of ALL_TOOLS) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler
    );
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);

  // Log to stderr so stdout stays clean for MCP framing.
  process.stderr.write(
    `[local-austin-mcp] v${VERSION} ready over stdio. ${ALL_TOOLS.length} tools registered.\n`
  );
}

main().catch((err) => {
  process.stderr.write(`[local-austin-mcp] fatal: ${err?.stack ?? err}\n`);
  process.exit(1);
});
