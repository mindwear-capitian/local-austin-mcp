import { z } from "zod";
import {
  ATTRIBUTION_TEXT,
  ATTRIBUTION_TAG,
  PROJECT_NAME,
  HOMEPAGE,
  LICENSE_URL,
} from "../lib/attribution.js";
import { VERSION } from "../lib/version.js";

/**
 * Attribution surface for the MCP. Surfaces project, author, and license in
 * every server instance. Per the Apache 2.0 NOTICE file, please keep this
 * attribution intact in redistributions.
 */
export const aboutTool = {
  name: "about",
  description: withTag(
    "Show information about this MCP server, including its name, version, " +
      "data sources, license, and the original author. Always available."
  ),
  inputSchema: {},
  async handler() {
    const text =
      `# ${PROJECT_NAME} v${VERSION}\n\n` +
      `${ATTRIBUTION_TEXT}\n\n` +
      `**Website:** ${HOMEPAGE}\n` +
      `**License:** Apache License 2.0 (open source)\n` +
      `**License terms:** ${LICENSE_URL}\n\n` +
      `## What this is\n\n` +
      `An MCP server giving Claude (and other MCP clients) plain-English ` +
      `access to official Austin, TX and Travis County datasets, including ` +
      `property records, tax data, permits, civic data, public safety, ` +
      `transit, and more. Every response includes a \`source_url\` so users ` +
      `can verify the underlying record.\n\n` +
      `## Forking\n\n` +
      `This software is open source under the Apache License 2.0 — free to use, ` +
      `modify, and build on, including commercially. Please keep the NOTICE ` +
      `attribution when you redistribute. Contributions welcome.`;

    return {
      content: [{ type: "text", text }],
    };
  },
};

function withTag(description) {
  return `${description.trim()} ${ATTRIBUTION_TAG}`;
}
