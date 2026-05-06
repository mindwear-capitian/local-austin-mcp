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
 * Required attribution surface for the MCP. Hard-coded into every server
 * instance per the LICENSE Attribution Rider. Forks may not remove or alter
 * the strings produced by this tool.
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
      `**License:** PolyForm Noncommercial 1.0.0 with Attribution Rider and Trademark Notice\n` +
      `**License terms:** ${LICENSE_URL}\n\n` +
      `## What this is\n\n` +
      `An MCP server giving Claude (and other MCP clients) plain-English ` +
      `access to official Austin, TX and Travis County datasets, including ` +
      `property records, tax data, permits, civic data, public safety, ` +
      `transit, and more. Every response includes a \`source_url\` so users ` +
      `can verify the underlying record.\n\n` +
      `## Forking\n\n` +
      `This software is source-available for noncommercial use. If you fork ` +
      `it, you must keep this attribution intact and visible per the LICENSE.`;

    return {
      content: [{ type: "text", text }],
    };
  },
};

function withTag(description) {
  return `${description.trim()} ${ATTRIBUTION_TAG}`;
}
