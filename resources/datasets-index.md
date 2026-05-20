# Local Austin MCP -- Dataset Catalog

Every tool in this MCP is backed by an official, public dataset. This document lists every source the server talks to, what each one covers, and where to verify it manually.

## Travis County Central Appraisal District (TCAD)

- **Tool:** `austin_travis_cad`
- **Backend:** True Prodigy public REST API
- **Source:** https://www.traviscad.org
- **Coverage:** Property ownership, market and appraised values, land/improvement split, legal description, acreage, zoning, owner mailing addresses for every parcel in Travis County.
- **Update cadence:** Daily. Certified values published in Oct each year.

## Williamson County Central Appraisal District (WCAD)

- **Tool:** `austin_williamson_cad`
- **Backend:** ArcGIS FeatureServer
- **Source:** https://www.wcad.org
- **Coverage:** Same fields as TCAD for Williamson County (Cedar Park, Round Rock, Leander, Georgetown, Hutto, Taylor, etc.). WCAD redacts dollar values from the public GIS feed -- pull the CAD detail page for current assessed value.

## Hays Central Appraisal District (HCAD)

- **Tool:** `austin_hays_cad`
- **Backend:** ArcGIS MapServer
- **Source:** https://www.hayscad.com
- **Coverage:** Hays County (Buda, Kyle, San Marcos, Dripping Springs, Wimberley).

## Travis County Tax Office

- **Tools:** `austin_travis_tax`, `austin_mud_pid`
- **Backend:** go2gov.net HTML scrape (Cookie-session two-step flow)
- **Source:** https://travis.go2gov.net
- **Coverage:** Current and prior-year tax balances, per-entity breakdown (ISD, County, City, MUD, PID, ESD, hospital, community college), payment status.
- **Update cadence:** Real-time payment status; entity bills certified in October of each year.

## City of Austin Open Data Portal (Socrata)

- **Tools (subset):** `austin_permits`, `austin_code_cases`, `austin_zoning`, `austin_311`, `austin_crime`, `austin_afd_incidents`, `austin_council_votes`, `austin_city_budget`, `austin_libraries`, `austin_parks`, `austin_fire_stations`, `austin_police_data`, `austin_restaurant_inspections`, `austin_tree_permits`, `austin_roadway_work_zones`, `austin_animal_center`
- **Backend:** Socrata (data.austintexas.gov + datahub.austintexas.gov)
- **Source:** https://data.austintexas.gov
- **Coverage:** City of Austin jurisdiction only. Construction permits (3syk-w9eu), code compliance cases (6wtj-zbtb), zoning boundaries (nbzi-qabm), 311 service requests (xwdj-i9he), APD crime reports (fdj4-gpfu, anonymized to council-district level), AFD incidents, council votes, budget line items, libraries, parks, fire stations, APD arrests/use-of-force/dispatch (9tem-ywan, pzd6-nzny, 22de-7rzg), restaurant inspections (ecmv-9xxi), tree permits, work zones (qyfh-gwei), animal shelter intakes/outcomes.
- **Update cadence:** Most datasets update nightly; 311 and dispatch are near-real-time.
- **Auth:** Optional `AUSTIN_SODA_APP_TOKEN` env var raises rate limit ceiling.

## FEMA National Flood Hazard Layer (NFHL)

- **Tool:** `austin_fema_flood`
- **Backend:** ArcGIS REST (Layer 28, Flood Hazard Zones)
- **Source:** https://hazards.fema.gov/femaportal/wps/portal/NFHLWMS
- **Coverage:** Federally adopted flood zones (AE, A, X, etc.), SFHA flag, base flood elevation, FIRM panel ID for any geocoded point.
- **Update cadence:** FIRM revisions; usually annual per county.

## U.S. Census Geocoder

- **Backend (internal):** Used by `austin_fema_flood` and `austin_property_360` to convert addresses to lat/long before flood zone lookup.
- **Source:** https://geocoding.geo.census.gov
- **Auth:** None. Free.

## TEA (Texas Education Agency) accountability + school listings

- **Tool:** `austin_tea_schools`
- **Backend:** Socrata datahub
- **Source:** https://tea.texas.gov
- **Coverage:** Campus and district performance ratings, demographics, accountability ratings (A-F), school type.

## National Weather Service (NWS) alerts

- **Tool:** `austin_nws_alerts`
- **Backend:** api.weather.gov
- **Source:** https://api.weather.gov
- **Coverage:** Active weather alerts and watches for Travis / Williamson / Hays.
- **Auth:** None. Sends User-Agent.

## Lower Colorado River Authority (LCRA)

- **Tool:** `austin_lake_travis_level`
- **Backend:** ArcGIS or LCRA public web
- **Source:** https://hydromet.lcra.org
- **Coverage:** Current Lake Travis elevation, change from prior day.

## TxDOT projects

- **Tool:** `austin_txdot_projects`
- **Backend:** ArcGIS FeatureServer
- **Coverage:** Current and recently let TxDOT construction projects in the Austin district.

## Neuhaus Realty Group VOW (free public tier)

- **Tools:** `austin_active_listings`, `austin_listing_detail`, `austin_listing_by_address`, `austin_neighborhood_lookup`, `austin_district_lookup`, `austin_search_blog`
- **Backend:** REST endpoint at https://vow-api.re-workflow.com/public
- **Source:** https://neuhausre.com
- **Coverage:** ACTIVE and "Active Under Contract" listings only. Sold prices, pending deals, and expired listings require a signed buyer-representation agreement -- contact Ed Neuhaus.
- **Rate limit:** 10 req/min + 500/day per IP. Specificity score >= 4 required on search.

## RSS aggregation (austin_local_voices)

- **Tool:** `austin_local_voices`
- **Backend:** Tiny pure-regex RSS / Atom parser (lib/rss.js)
- **Coverage:** Curated Austin-local newsroom RSS feeds defined in config/voices.json.

---

For the full attribution + license terms, call the `about` tool.
