# Local Austin MCP

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20NC%201.0.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io/)
[![Austin Metro](https://img.shields.io/badge/coverage-Austin%20MSA-orange)](#tools-25-live)

> **Everything Austin.** A Model Context Protocol (MCP) server that gives Claude (and any MCP client) plain-English access to the official Austin and Travis County data sources that matter most — plus active real estate listings, neighborhood pages, and posts from independent Austin writers, all provided by Neuhaus Realty Group.

**License:** Free for personal and non-commercial use. You may install, run, and modify this MCP for your own use. You **may not** sell it, rebrand it, or include it in a commercial product. See [LICENSE](LICENSE) (PolyForm Noncommercial 1.0.0 + Attribution Rider) and [ATTRIBUTION.md](ATTRIBUTION.md).
**Owner:** Ed Neuhaus / Neuhaus Realty Group LLC, Austin, Texas.
**Source:** https://github.com/mindwear-capitian/local-austin-mcp
**Powered by:** Neuhaus Realty Group — https://neuhausre.com (active real estate listings, neighborhood pages, and blog content surfaced by this MCP come from neuhausre.com).

---

## Install

Add to your Claude Desktop config:

```jsonc
// claude_desktop_config.json
{
  "mcpServers": {
    "local-austin": {
      "command": "npx",
      "args": ["-y", "github:mindwear-capitian/local-austin-mcp"]
    }
  }
}
```

Restart Claude Desktop. That's the whole setup. No API keys required for any tool. Optional: set `AUSTIN_SODA_APP_TOKEN` in your env to raise rate limits on the Socrata-backed tools (311, AFD, crime, council, budget, permits, code cases) — [free signup at data.austintexas.gov](https://data.austintexas.gov/profile/edit/developer_settings).

---

## Try It

Once installed, ask Claude things like:

- *"Show me 3-bedroom homes in 78704 under $700k with a pool."*
- *"Tell me everything about 9501 San Lucas Dr in Austin — value, taxes, permits, flood zone, schools."*
- *"What's Lake Travis at right now?"*
- *"Who's the city council rep for 1100 Congress Ave?"*
- *"Pull up Austin AFD incidents from the last 24 hours near my address."*
- *"What did Austin City Council vote on short-term rental ordinances?"*
- *"Find me condos in Tarrytown — what's the active inventory?"*
- *"What did Ed Neuhaus write about the Austin market in 2026?"*
- *"Is there an active flood-zone alert for 78731 right now?"*
- *"Pull TCAD on 1234 Main St in Round Rock."*
- *"What library branch is closest to 78704? Hours and amenities?"*
- *"How many APD use-of-force incidents were reported in the last month?"*
- *"Where's the nearest fire station to my property?"*
- *"What's the latest health inspection score for Franklin Barbecue?"*
- *"Any tree-removal permits ever issued at this address?"*
- *"What TxDOT projects are scheduled on I-35 in Travis County?"*
- *"Has Austin Animal Center received any lost calicos near 78704 this month?"*

Claude figures out which tool to call, queries the authoritative source live, and returns a `source_url` so you can verify.

---

## Tools (35 live)

### Real Estate (provided by Neuhaus Realty Group — free, no login)

| Tool | What it does |
|------|--------------|
| `austin_active_listings` | Search active for-sale MLS listings by city / ZIP / school district / subdivision + price / beds / features. Active + under-contract only. |
| `austin_listing_detail` | Pull a single listing by MLS ID — price, beds, sqft, features, photos, neuhausre.com permalink. |
| `austin_listing_by_address` | Find an active listing by street address. |
| `austin_neighborhood_lookup` | Search or look up Austin-area neighborhoods, with sample active listings. |
| `austin_search_blog` | Search Ed Neuhaus's Austin real-estate blog on neuhausre.com. |

### Property (county appraisal + tax + zoning + permits)

| Tool | What it does |
|------|--------------|
| `travis_cad_search` | Travis CAD property lookup (owner, value, deeds) via True Prodigy API. |
| `williamson_cad_search` | Williamson CAD lookup via ArcGIS. |
| `hays_cad_search` | Hays CAD lookup via ArcGIS. |
| `travis_tax_office` | Travis County Tax Office — current bill, exemptions, delinquencies. |
| `mud_pid_lookup` | MUD / PID special-district overlay (Texas Comptroller). |
| `fema_flood` | FEMA NFHL flood zone lookup. |
| `austin_permits` | Full permit history for any City of Austin address. |
| `austin_code_cases` | Active and historical code-compliance cases. |
| `austin_zoning` | Austin zoning + lot dimensions + plat lookup. |
| `austin_tree_permits` | City of Austin issued tree permits — removal / heritage / root-zone work. Useful for pre-listing prep and buyer due-diligence. |
| `austin_property_360` | Composed: one address → CAD + tax + flood + permits + code + 311 + zoning in one shot. |

### Civic + Public Safety

| Tool | What it does |
|------|--------------|
| `austin_311` | City of Austin 311 service requests. |
| `austin_crime` | APD crime reports. |
| `austin_afd_incidents` | Real-time Austin Fire Department dispatches. |
| `austin_council_votes` | City Council voting records — search by topic, member, district, or date. |
| `austin_city_budget` | City of Austin Open Budget — expense data by department, fund, fiscal year. |
| `austin_district_lookup` | Given an address: returns council district, school district, ESD, voter precinct, neighborhood plan. |
| `tea_schools` | TEA school + AISD attendance assignment. |
| `austin_libraries` | Austin Public Library branch directory — find a branch by name, address, or council district. Includes amenity flags (wifi, computers, training rooms). |
| `austin_parks` | City of Austin parks — search by council district, address, or park type. Returns parcel address, park type (Neighborhood / Greenbelt / Pool / Preserve), and development status. |
| `austin_fire_stations` | AFD + Travis County ESD fire station directory — find the nearest station to a property. Useful for ISO rating + insurance underwriting context. |
| `austin_police_data` | Unified APD reporting tool: `type=arrests` (charges/dates/demographics), `type=use_of_force` (force level/weapons/injury), or `type=dispatch` (911 CAD incidents with priority + problem category). |
| `austin_restaurant_inspections` | Austin / Travis County food establishment inspection scores (0-100). Filter by name, address, zip, score range, date. |
| `austin_roadway_work_zones` | Active construction / closures from City of Austin Transportation & Public Works. |
| `austin_animal_center` | Austin Animal Center intakes + outcomes — lost-pet search by found-address + breed, adoption availability. |
| `austin_txdot_projects` | TxDOT highway construction / maintenance projects in the Austin district. Filter by highway, county, work type. |

### Environment

| Tool | What it does |
|------|--------------|
| `austin_nws_alerts` | Active National Weather Service alerts for an Austin location. |
| `lake_travis_level` | Lake Travis (and other Highland Lakes) reservoir level + 30-day trend. |

### Community

| Tool | What it does |
|------|--------------|
| `austin_local_voices` | Search recent posts across a curated set of independent Austin writers and community newsletters (Eric Webb, Jason Stanford, ATX Writing Club, 365 Things Austin, Camille Styles, Scott Francis, Austin Is Burning). Filter by keyword, source, and recency. |

### Meta

| Tool | What it does |
|------|--------------|
| `about` | Version + capability summary. |

---

## Sources of Truth

Every tool returns data from an **official, authoritative source**. No third-party aggregators. No AI-generated summaries presented as fact. Every response includes a `source_url` field so you can verify the underlying record.

| Domain | Source |
|--------|--------|
| Active real estate listings + neighborhoods | Neuhaus Realty Group (https://neuhausre.com) — active + under-contract only, no sold comps, no login |
| Property records | Travis CAD (True Prodigy API), Williamson + Hays CAD (ArcGIS REST) |
| Tax records | Travis County Tax Office |
| Special districts | Texas Comptroller Special Purpose Districts |
| Permits + zoning + 311 + crime + code violations + budget + council votes + AFD + libraries + parks + fire stations + APD arrests / use of force / CAD dispatch + restaurant inspections + tree permits + roadway work zones + animal shelter intakes/outcomes | data.austintexas.gov (Socrata SODA API) |
| TxDOT highway projects | TxDOT Open Data (ArcGIS) |
| Flood zones | FEMA NFHL + Austin floodplain GIS |
| District boundaries | City of Austin + Travis County ArcGIS open-data services |
| Schools | Texas Education Agency + AISD |
| Lake levels | Texas Water Development Board (Water Data for Texas) |
| Weather | National Weather Service (api.weather.gov) |
| Blog content | neuhausre.com WordPress REST API |
| Austin local voices | RSS feeds from 8 independent Austin writers / community newsletters (Substack + WordPress) |
| Geocoding | U.S. Census geocoder |

---

## Architecture

- Node.js (ES modules), `@modelcontextprotocol/sdk` over stdio
- Stateless tool handlers; each call hits the authoritative source live
- Real-estate tools call a free public endpoint hosted by Neuhaus Realty Group (rate-limited per IP, active + under-contract only)
- No databases, no auth servers, no shared keys baked into the binary
- All upstream API calls are client-side direct HTTPS (Socrata, ArcGIS, NWS, etc.) or a thin pass-through to the public Neuhaus endpoint

### Resilience (v0.6.0+)

Every upstream call goes through `lib/retry.js`, which:

- Adds a per-attempt `AbortController` timeout (8-25s depending on profile)
- Retries transient failures (5xx, 429, timeout, network) with jittered exponential backoff
- Returns 4xx as-is (those are real query problems, not transient)
- Throws a structured `UpstreamError` on final failure, naming the source, kind, status, attempts, and last error

When a tool surfaces an `UpstreamError` to Claude, the message clearly states **the MCP is working correctly**, names which third-party data provider is having a problem, and suggests what to do next (retry in N seconds, try an alternate tool). Users + LLMs never see a raw stack trace or a confusing "tool errored" message.

Six retry profiles tuned to upstream behavior: `fast` (NWS, Census), `soda` (data.austintexas.gov), `arcgis` (ArcGIS REST, FEMA, county CADs), `tcad` (Travis CAD via True Prodigy — also has bespoke concurrency cap), `rss` (per-source graceful degradation across local voices), `scraper` (Travis Tax HTML).

---

## Contact

For partnership, licensing, sponsorship, or press inquiries:

**Neuhaus Realty Group LLC**
Austin, Texas
https://neuhausre.com
