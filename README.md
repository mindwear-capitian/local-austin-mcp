# Local Austin MCP

> **Everything Austin.** A Model Context Protocol (MCP) server that gives Claude plain-English access to every official Austin and Travis County dataset.

**Status:** Closed-source. Private repository. Not for redistribution.
**Owner:** Ed Neuhaus / Neuhaus Realty Group LLC, Austin, Texas.
**Product:** Hosted at `austin-mcp.com` (coming soon). Source code is not published.
**Internal license files** ([LICENSE](LICENSE), [ATTRIBUTION.md](ATTRIBUTION.md), [TRADEMARK.md](TRADEMARK.md)) are kept for future-proofing only. They have no effect while the repository is private.

## Credits

> Built by Ed Neuhaus / Neuhaus Realty Group LLC -- https://neuhausre.com

---

## What This Is

One MCP server. One install. Ask Claude any question about Austin or Travis County and get the answer pulled live from the authoritative source.

Built to serve:

- **Residents** -- "When is my trash pickup? Who is my city council rep?"
- **Visitors** -- "What's open today? Where are the closest food trucks? What's the weather and lake level at Barton Springs?"
- **Homebuyers + Investors** -- "Tell me everything about 1234 Main St -- value, taxes, deeds, permits, flood zone, schools, crime, code violations."
- **Real estate agents** -- "Pull TCAD on this listing. Check for any open code cases. What permits ran in the last 10 years?"
- **Local journalists / civic tech** -- "What did Council vote on this week? How many 311 calls about potholes in District 9 this month?"

---

## Why This Exists

Austin and Travis County publish dozens of authoritative datasets across half a dozen portals (`data.austintexas.gov`, `traviscentralad.org`, `tax-office.traviscountytx.gov`, `tccsearch.org`, FEMA, TEA, Cap Metro, and more). Most people never use them because each one has its own format, query language, and quirks.

This MCP wraps all of them behind a single Claude tool surface. You ask in English. Claude figures out which dataset to hit, queries it live, and gives you the answer with a `source_url` so you can verify.

---

## Source Of Truth

Every tool returns data from an **official, authoritative source**. No scraping of third-party aggregators. No AI-generated summaries presented as fact. Every response includes a `source_url` field so you can verify the underlying record.

Confirmed source families:

| Domain | Source |
|--------|--------|
| Property records | Travis CAD (via True Prodigy API) |
| Deeds + liens | Travis County Clerk (tccsearch.org) |
| Tax records | Travis County Tax Office |
| Special districts | Texas Comptroller Special Purpose Districts |
| Permits + zoning + 311 + crime + code violations + budget | data.austintexas.gov (Socrata SODA API) |
| Flood zones | FEMA NFHL + Austin floodplain GIS |
| Schools | Texas Education Agency + AISD |
| Transit | Cap Metro real-time + GTFS |
| Lake levels + water quality | LCRA + City of Austin |
| Weather + air quality | NWS + EPA AQS |

---

## Planned Categories

> Build is staged. Property + civic core first, then daily-life datasets, then visitor-facing.

### Property + Real Estate (Phase 1)
- Travis CAD lookup
- Travis County Clerk deeds + liens
- Travis County Tax Office (current bill, exemptions, delinquencies, MUD/PID)
- MUD / PID special-district overlay
- Austin AB+C permits (full history per address)
- Austin zoning, lot dimensions, plat
- FEMA + Austin floodplain
- AISD + TEA school assignment
- TREC license verification
- `austin_property_360` -- composed tool, one address -> all of the above

### Civic + Public (Phase 2)
- 311 service requests
- Code violations
- Council meeting agendas, minutes, votes
- Boards + commissions
- City budget
- District lookup (council, school, MUD, fire)

### Public Safety (Phase 2)
- APD crime reports
- AFD incidents
- Traffic incidents + closures

### Daily Life (Phase 3)
- Garbage / recycling pickup by address
- Library branches + hours + events
- Park hours, dog parks, swimming holes, hiking trails
- Restaurant inspection scores
- Food truck permits
- Farmers markets

### Transit + Getting Around (Phase 3)
- Cap Metro real-time arrivals
- Bus + rail schedules
- B-cycle station availability
- Parking meters + zones
- Construction + road closures

### Visitor / Tourism (Phase 4)
- Public art map
- Free events this week
- SXSW / ACL / F1 / Trail of Lights dates + traffic impact
- Lake Travis level + boat ramp access
- Town Lake water quality + Barton Springs status
- Live music venues

### Environment + Real-time (Phase 4)
- Weather alerts (NWS)
- Air quality (EPA AQS)
- Wildfire risk
- Tree inventory
- Watersheds

---

## Architecture

- Node.js (ES modules), MCP SDK
- Closed-source, hosted-only product. Users connect to `austin-mcp.com` from Claude Desktop via OAuth 2.1 + PKCE.
- All upstream API calls server-side; users never see source code or API keys
- Per-tool rate limiting + caching where upstream allows
- Deployed on NeuhausRE VPS, same pattern as `mls.neuhausre.com`

---

## Status

**Phase 0: Repo + License + Plan** ✅
**Phase 1: Property core** -- in progress (7/10 tools live)
**Phase 2: Civic + Public** -- 2/N live
**Phase 3: Daily Life + Transit** -- planned
**Phase 4: Visitor + Environment** -- planned

### Deferred

- **`travis_county_clerk_deeds`** -- requires browser automation against a JavaScript-rendered ASP.NET portal (tccsearch.org). Will integrate via the existing `/srv/playwright-scraper` service on NeuhausRE VPS in a later phase rather than spawning a browser per MCP call.
- **`mud_pid_lookup`** -- planned for Phase 1 once a stable Comptroller API path is confirmed.
- **`fema_flood`** -- planned for Phase 1 (FEMA NFHL ArcGIS).

---

## Contact

For partnership, licensing, sponsorship, or press inquiries:

**Ed Neuhaus**
Neuhaus Realty Group LLC
Austin, Texas
Ed@NeuhausRE.com
