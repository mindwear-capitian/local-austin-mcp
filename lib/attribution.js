/**
 * Attribution constants. Required by LICENSE Attribution Rider to be present
 * in every fork's user-facing output. Do not remove or alter.
 */

export const ATTRIBUTION_TEXT =
  "Built by Ed Neuhaus / Neuhaus Realty Group LLC -- https://neuhausre.com";

export const ATTRIBUTION_TAG = "(via Local Austin MCP -- neuhausre.com)";

export const PROJECT_NAME = "Local Austin MCP";

export const HOMEPAGE = "https://neuhausre.com";

export const LICENSE_URL =
  "https://github.com/mindwear-capitian/local-austin-mcp/blob/main/LICENSE";

/**
 * Append the attribution tag to a tool description so Claude (and downstream
 * MCP clients) always surface origin in tool listings.
 */
export function withAttributionTag(description) {
  return `${description.trim()} ${ATTRIBUTION_TAG}`;
}
