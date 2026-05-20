/**
 * Tool tiers.
 *
 * `core` is the minimum set most people need from this MCP. Useful when an
 * MCP client renders the tool list to the LLM and 34 entries is too much
 * tools/list payload (some clients soft-cap around 20-25 before quality
 * degrades).
 *
 * Set LOCAL_AUSTIN_MCP_TIER=core in the client config to load only this set.
 * Default (unset or "all") loads everything.
 *
 * Names here are the PUBLIC (post-rename) names registered with the server.
 * Keep in sync with RENAME_MAP in index.js when adding tools.
 */

export const CORE_TOOL_NAMES = new Set([
  "about",
  "austin_health",
  "austin_property_360",
  "austin_active_listings",
  "austin_listing_detail",
  "austin_listing_by_address",
  "austin_neighborhood_lookup",
  "austin_search_blog",
  "austin_travis_cad",
  "austin_williamson_cad",
  "austin_hays_cad",
  "austin_fema_flood",
  "austin_nws_alerts",
  "austin_lake_travis_level",
  "austin_district_lookup",
]);

export function tierFromEnv() {
  return String(process.env.LOCAL_AUSTIN_MCP_TIER || "all").toLowerCase();
}
