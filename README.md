# Local Austin MCP

[![License: PolyForm Noncommercial 1.0.0](https://img.shields.io/badge/License-PolyForm%20NC%201.0.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![MCP](https://img.shields.io/badge/MCP-stdio-purple)](https://modelcontextprotocol.io/)
[![Austin Metro](https://img.shields.io/badge/coverage-Austin%20MSA-orange)](#tools-25-live)

> **Everything Austin.** A Model Context Protocol (MCP) server that gives Claude (and any MCP client) plain-English access to every official Austin and Travis County dataset — plus live MLS listings via the Neuhaus Realty Group VOW feed.

**License:** Free for personal and non-commercial use. You may install, run, and modify this MCP for your own use. You **may not** sell it, rebrand it, or include it in a commercial product. See [LICENSE](LICENSE) (PolyForm Noncommercial 1.0.0 + Attribution Rider) and [ATTRIBUTION.md](ATTRIBUTION.md).
**Owner:** Ed Neuhaus / Neuhaus Realty Group LLC, Austin, Texas.
**Source:** https://github.com/mindwear-capitian/local-austin-mcp
**Powered by:** Neuhaus Realty Group — https://neuhausre.com (the live MLS data, neighborhood pages, and blog content surfaced by this MCP are served from Ed's Austin VOW feed).

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

Claude figures out which tool to call, queries the authoritative source live, and returns a `source_url` so you can verify.

---

## Tools (25 live)

### Real Estate (Neuhaus Realty Group VOW feed — free, no login)

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

### Environment

| Tool | What it does |
|------|--------------|
| `austin_nws_alerts` | Active National Weather Service alerts for an Austin location. |
| `lake_travis_level` | Lake Travis (and other Highland Lakes) reservoir level + 30-day trend. |

### Meta

| Tool | What it does |
|------|--------------|
| `about` | Version + capability summary. |

---

## Sources of Truth

Every tool returns data from an **official, authoritative source**. No third-party aggregators. No AI-generated summaries presented as fact. Every response includes a `source_url` field so you can verify the underlying record.

| Domain | Source |
|--------|--------|
| Active MLS listings + neighborhoods | Neuhaus Realty Group VOW feed (active + AUC only, no sold comps, no login) |
| Property records | Travis CAD (True Prodigy API), Williamson + Hays CAD (ArcGIS REST) |
| Tax records | Travis County Tax Office |
| Special districts | Texas Comptroller Special Purpose Districts |
| Permits + zoning + 311 + crime + code violations + budget + council votes + AFD | data.austintexas.gov (Socrata SODA API) |
| Flood zones | FEMA NFHL + Austin floodplain GIS |
| District boundaries | City of Austin + Travis County ArcGIS open-data services |
| Schools | Texas Education Agency + AISD |
| Lake levels | Texas Water Development Board (Water Data for Texas) |
| Weather | National Weather Service (api.weather.gov) |
| Blog content | neuhausre.com WordPress REST API |
| Geocoding | U.S. Census geocoder |

---

## What's Not Here

By design — protecting Ed's MLS access agreement + keeping the install free:

- **Sold prices / closed comps** — VOW data, requires signed buyer-rep with Ed.
- **Pending / withdrawn / expired listings** — same as above.
- **Travis County Clerk deeds** — tccsearch.org is browser-only; integrated via Ed's [deed-lookup skill](https://neuhausre.com/) instead.
- **TREC license verification** — low value, deferred.
- **EPA AirNow AQI** — requires free API key signup; deferred.
- **Cap Metro real-time** — deferred.

For anything in the first two rows, contact Ed Neuhaus at **(512) 827-8830** or **Ed@NeuhausRE.com** — sign a short buyer-rep agreement and get full MLS access via the [Neuhaus MLS MCP](https://mls.neuhausre.com/).

---

## Architecture

- Node.js (ES modules), `@modelcontextprotocol/sdk` over stdio
- Stateless tool handlers; each call hits the authoritative source live
- Per-tool retry + caching where upstream allows
- Real-estate tools call the public `/public/*` namespace at `vow-api.re-workflow.com` (rate-limited per IP, active + AUC only, server-side tier-gated)
- No databases, no auth servers, no shared keys baked into the binary
- All upstream API calls are server-side (vow-api) or client-side direct HTTPS (Socrata, ArcGIS, NWS, etc.)

---

## Anti-Abuse Design

Real-estate tools rely on a public Neuhaus VOW endpoint. To keep the free tier sustainable:

- **Specificity score** — listings search requires ≥1 location filter PLUS additional filters totalling ≥4 points. A bare "homes in Austin" query is rejected. Forces useful queries; defeats programmatic enumeration.
- **No pagination** — every search returns up to 25 best-match listings. Period. No `offset`, no `page`. Scrapers can't walk the database.
- **Hard rate limit** — 10 requests / minute per IP, 500 / day per IP.
- **PII strip** — listing agent name / email / office / buyer agent never returned on the free tier.
- **Status pin** — server-side SQL hard filter on `Active` + `Active Under Contract` only.

---

## Contact

For partnership, licensing, sponsorship, or press inquiries:

**Ed Neuhaus**
Neuhaus Realty Group LLC
Austin, Texas
Ed@NeuhausRE.com
