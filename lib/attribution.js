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
 * Used to live as a per-tool description suffix. As of v0.10 attribution is
 * surfaced via the MCP server `instructions` field (loaded once per session),
 * the `about` tool, and the footer of every tool response body -- so we no
 * longer pay the token cost of repeating the tag inside every description on
 * every tools/list call.
 *
 * Kept as an identity function so existing tool files compile without churn.
 * Forks must NOT change this to strip the body-level attribution; the
 * LICENSE Attribution Rider requires it to be visible in user-facing output.
 */
export function withAttributionTag(description) {
  return description;
}
