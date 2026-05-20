/**
 * MCP Resources for Local Austin MCP.
 *
 * Resources are read-only knowledge artifacts the server publishes to MCP
 * clients via the resources/* methods. They are NOT tools (no actions, no
 * side effects). Use for: dataset catalog, coverage map, FAQ.
 *
 * Conventions:
 *  - URI scheme: `austin://...`
 *  - Static text/markdown loaded from disk under `resources/`.
 *  - mimeType=text/markdown for narrative docs.
 *
 * Uses the high-level McpServer.registerResource API (SDK >= 1.x).
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const RESOURCES_DIR = resolve(__dirname, "..", "resources");

const RESOURCES = [
  {
    uri: "austin://datasets/index",
    name: "Dataset catalog",
    title: "Local Austin MCP — Dataset Catalog",
    description:
      "Every upstream provider this MCP talks to, with coverage notes, " +
      "update cadence, and authoritative URLs.",
    mimeType: "text/markdown",
    file: "datasets-index.md",
  },
  {
    uri: "austin://coverage/map",
    name: "Geographic coverage",
    title: "Local Austin MCP — Geographic Coverage",
    description:
      "Which counties / cities each tool covers. Use to decide whether a " +
      "given address can be looked up before you call.",
    mimeType: "text/markdown",
    file: "coverage.md",
  },
  {
    uri: "austin://faq",
    name: "Frequently asked questions",
    title: "Local Austin MCP — FAQ",
    description:
      "Common gotchas: WCAD redacted values, free tier vs gated MLS data, " +
      "City-of-Austin jurisdiction tools, freshness, etc.",
    mimeType: "text/markdown",
    file: "faq.md",
  },
];

function readResourceFile(file) {
  return readFileSync(resolve(RESOURCES_DIR, file), "utf-8");
}

/**
 * Register every static resource on a McpServer instance.
 *
 * @param {import("@modelcontextprotocol/sdk/server/mcp.js").McpServer} server
 */
export function registerResources(server) {
  for (const r of RESOURCES) {
    server.registerResource(
      r.name,
      r.uri,
      {
        title: r.title,
        description: r.description,
        mimeType: r.mimeType,
      },
      async (uri) => ({
        contents: [
          {
            uri: uri.href || r.uri,
            mimeType: r.mimeType,
            text: readResourceFile(r.file),
          },
        ],
      })
    );
  }
}

export { RESOURCES };
