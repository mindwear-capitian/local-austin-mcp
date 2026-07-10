# Local Austin MCP

[![License: Apache 2.0](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io/)
[![Austin Metro](https://img.shields.io/badge/coverage-Austin%20MSA-orange)](#tools-37-live)
[![CI](https://github.com/mindwear-capitian/local-austin-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/mindwear-capitian/local-austin-mcp/actions/workflows/ci.yml)

> **Your AI's local guide to Austin.** A Model Context Protocol (MCP) server that lets Claude (and any MCP client) answer the real questions people ask when they research a property, buy in, or move to the Austin area — *"who turns on my water at this address?"*, *"what are the schools and special-district taxes?"*, *"is it in a flood zone?"*, *"what's for sale in this neighborhood?"* — by pulling straight from the authoritative City of Austin / Travis-Williamson-Hays County sources, plus active real estate listings and local writers, all provided by Neuhaus Realty Group. No API keys, no logins.

**License:** Open source under **[Apache License 2.0](LICENSE)** — free to use, modify, and build on, including commercially. Please keep the [NOTICE](NOTICE) attribution when you redistribute. The Apache license grants no trademark rights: "Neuhaus Realty Group" and the Neuhaus marks stay ours (see [TRADEMARK.md](TRADEMARK.md)).
**Owner:** Ed Neuhaus / Neuhaus Realty Group LLC, Austin, Texas.
**Source:** https://github.com/mindwear-capitian/local-austin-mcp
**Powered by:** Neuhaus Realty Group — https://neuhausre.com (active real estate listings, neighborhood pages, and blog content surfaced by this MCP come from neuhausre.com).

> 🚧 **This is an early project and I'd love help making it better.** I'm a broker who built this to give an AI a real, plain-English handle on Austin. It works, but there's a lot more Austin data worth wiring in and a couple of hard problems I haven't cracked. If you build with MCPs or know Austin/Texas civic data, pull requests and ideas are genuinely welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) and the [good first issues](https://github.com/mindwear-capitian/local-austin-mcp/labels/good%20first%20issue).

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

Restart Claude Desktop. That's the whole setup. No API keys required for any tool.

### Claude Code

```bash
claude mcp add local-austin npx -y github:mindwear-capitian/local-austin-mcp
```

### Configuration

Optional environment variables:

| Var | Default | Purpose |
|---|---|---|
| `AUSTIN_SODA_APP_TOKEN` | unset | Socrata app token. Raises rate limit on `data.austintexas.gov` + `datahub.austintexas.gov`. [Free signup](https://data.austintexas.gov/profile/edit/developer_settings). |
| `LOCAL_AUSTIN_MCP_TIER` | `all` | Set to `core` to register only the 14 most-used tools (saves ~20 tool slots if your client has a soft cap). |
| `VOW_PUBLIC_BASE` | `https://vow-api.re-workflow.com/public` | Override the Neuhaus VOW base URL. Used for testing / staging. |
| `AUSTIN_CACHE_DISABLED` | unset | Set to `1` to bypass the in-memory geocoder / FEMA cache. |
| `AUSTIN_LIMIT_<SOURCE>` | varies | Override per-source concurrency cap. Sources: `SODA`, `ARCGIS`, `FEMA`, `CENSUS`, `TRAVIS_TAX`, `VOW_PUBLIC`, `NWS`, `RSS`. Example: `AUSTIN_LIMIT_SODA=8`. |

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

## Tools (39 live)

All tools are read-only, idempotent, and hit external providers (`readOnlyHint: true`, `idempotentHint: true`, `openWorldHint: true` in MCP annotations). The composed `austin_property_360` is the preferred entry point for any address-centric question.

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
| `austin_travis_cad` | Travis CAD property lookup (owner, value, deeds) via True Prodigy API. |
| `austin_williamson_cad` | Williamson CAD lookup via ArcGIS. |
| `austin_hays_cad` | Hays CAD lookup via ArcGIS. |
| `austin_travis_tax` | Travis County Tax Office — current bill, exemptions, delinquencies. |
| `austin_mud_pid` | MUD / PID special-district overlay (Texas Comptroller). |
| `austin_utility_providers` | Who provides **water + sewer** at a Travis County address (CCN holder), with how-to-start guidance. The "who turns on my water" question for newcomers. Source: PUC CCN boundaries via Travis County GIS. |
| `austin_fema_flood` | FEMA NFHL flood zone lookup. |
| `austin_permits` | Full permit history for any City of Austin address. |
| `austin_code_cases` | Active and historical code-compliance cases. |
| `austin_zoning` | Austin zoning + lot dimensions + plat lookup. |
| `austin_city_code` | Full-text search + section fetch of the municipal code TEXT — Austin Code of Ordinances, Land Development Code, criteria manuals (plus Leander, Round Rock, Dripping Springs) via Municode. |
| `austin_tree_permits` | City of Austin issued tree permits — removal / heritage / root-zone work. Useful for pre-listing prep and buyer due-diligence. |
| `austin_property_360` | Composed: one address → CAD + tax + flood + permits + code + 311 + zoning in one shot. |
| `austin_relocation` | Composed **new-resident report**: one address → water + sewer provider, special-district taxes, school district / voter precinct / jurisdiction, and the Texas move-in checklist (license, registration, voter reg, homestead exemption). The "I'm moving here, what do I set up?" entry point. |

### Civic + Public Safety

| Tool | What it does |
|------|--------------|
| `austin_311` | City of Austin 311 service requests. |
| `austin_crime` | APD crime reports. |
| `austin_afd_incidents` | Real-time Austin Fire Department dispatches. |
| `austin_council_votes` | City Council voting records — search by topic, member, district, or date. |
| `austin_city_budget` | City of Austin Open Budget — expense data by department, fund, fiscal year. |
| `austin_district_lookup` | Given an address: returns council district, school district, ESD, voter precinct, neighborhood plan. |
| `austin_tea_schools` | TEA school + AISD attendance assignment. |
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
| `austin_lake_travis_level` | Lake Travis (and other Highland Lakes) reservoir level + 30-day trend. |

### Community

| Tool | What it does |
|------|--------------|
| `austin_local_voices` | Search recent posts across a curated set of independent Austin writers and community newsletters (Eric Webb, Jason Stanford, ATX Writing Club, 365 Things Austin, Camille Styles, Scott Francis, Austin Is Burning). Filter by keyword, source, and recency. |

### Meta

| Tool | What it does |
|------|--------------|
| `about` | Version + capability summary. |
| `austin_health` | Pings every upstream provider in parallel and reports per-source `{status, http, latency_ms, last_error}`. Use when many tools are erroring and you need to know which provider is down vs which tool is broken. |

---

## MCP Resources

In addition to tools, the server publishes static reference documents via the MCP `resources/*` API:

| URI | What it is |
|---|---|
| `austin://datasets/index` | Every upstream provider, coverage notes, update cadence, authoritative URLs. |
| `austin://coverage/map` | Which counties / cities each tool covers. |
| `austin://faq` | Common gotchas (WCAD redacted values, free vs gated MLS data, etc.). |

## MCP Prompts

Server-published templates that chain tools. Clients surface them as slash commands or one-click flows:

| Name | Arguments | What it does |
|---|---|---|
| `investigate_property` | `address` | Runs `austin_property_360` and writes a buyer-facing brief with risks + bottom line. |
| `compare_addresses` | `address_a, address_b` | Parallel `austin_property_360` on two addresses, side-by-side table. |
| `neighborhood_brief` | `zip` | Active inventory + neighborhood metadata for a ZIP. |
| `school_lookup` | `campus_name, district?` | TEA accountability rating + 1-line summary. |
| `health_check` | (none) | Wraps `austin_health` with narration. |

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
- Tool handlers are stateless per call; each hits the authoritative source live. An optional in-memory LRU+TTL cache fronts a few stable lookups (geocoder, FEMA NFHL by lat/lng) for 24h to avoid duplicate calls within a session
- Real-estate tools call a free public endpoint hosted by Neuhaus Realty Group (rate-limited per IP, active + under-contract only)
- No databases, no auth servers, no shared keys baked into the binary
- All upstream API calls are client-side direct HTTPS (Socrata, ArcGIS, NWS, etc.) or a thin pass-through to the public Neuhaus endpoint
- Per-source concurrency caps (`lib/semaphore.js`) prevent the composed `austin_property_360` fan-out from saturating any single provider
- `AsyncLocalStorage` carries the MCP request's `AbortSignal` into every upstream `fetch` so client-side cancellation cancels in-flight calls

### Resilience (v0.6.0+)

Every upstream call goes through `lib/retry.js`, which:

- Adds a per-attempt `AbortController` timeout (8-25s depending on profile)
- Retries transient failures (5xx, 429, timeout, network) with jittered exponential backoff
- Returns 4xx as-is (those are real query problems, not transient)
- Throws a structured `UpstreamError` on final failure, naming the source, kind, status, attempts, and last error

When a tool surfaces an `UpstreamError` to Claude, the message clearly states **the MCP is working correctly**, names which third-party data provider is having a problem, and suggests what to do next (retry in N seconds, try an alternate tool). Users + LLMs never see a raw stack trace or a confusing "tool errored" message.

Six retry profiles tuned to upstream behavior: `fast` (NWS, Census), `soda` (data.austintexas.gov), `arcgis` (ArcGIS REST, FEMA, county CADs), `tcad` (Travis CAD via True Prodigy — also has bespoke concurrency cap), `rss` (per-source graceful degradation across local voices), `scraper` (Travis Tax HTML).

### v0.10.0 additions

- **`structuredContent` + per-tool `outputSchema`** — 23 of 36 tools publish a Zod-based output schema (search-style envelopes) so MCP clients can validate, render, and generate typed SDK code; the remaining composite / single-entity tools return open structured content.
- **AbortSignal plumbing** — MCP request cancellation propagates via `AsyncLocalStorage` into every upstream `fetch`.
- **Per-source concurrency caps** (`lib/semaphore.js`) — named buckets prevent the composed `austin_property_360` fan-out from hammering any single provider.
- **LRU + TTL cache** (`lib/cache.js`) — 24h cache on the Census geocoder + FEMA NFHL point lookups.
- **MCP Resources + Prompts** — see sections above.
- **GitHub Actions CI** — Node 20 + 22 matrix, runs unit tests + MCP handshake on every push.

See [CHANGELOG.md](CHANGELOG.md) for the full v0.10.0 release notes, including the BREAKING tool-name rename to the `austin_*` prefix.

---

## Contact

For partnership, licensing, sponsorship, or press inquiries:

**Neuhaus Realty Group LLC**
Austin, Texas
https://neuhausre.com
