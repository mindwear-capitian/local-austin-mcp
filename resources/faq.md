# Local Austin MCP -- FAQ

### Why are some addresses returning "no record" from CAD when I see them on Zillow?
CAD records cover legal parcels. Subdivided / aggregated / re-platted parcels can change parcel ID between CAD and consumer real-estate sites. Try `austin_property_360` -- it fans out across all three county CADs and surfaces the parcel ID you can verify on the county's own viewer.

### Why does Williamson CAD not return dollar values?
WCAD redacts dollar values from the public GIS feed. The CAD detail page (linked in every result) does carry current assessed values; pull that URL to verify.

### What's in the free MLS tier vs the gated tier?
Free public tier (this MCP):
- ACTIVE listings
- Active Under Contract listings
- Max 25 results per call
- Specificity score >= 4 (>=1 location filter)
- Every result links back to `neuhausre.com`

NOT in the free tier:
- Sold prices
- Pending deals
- Expired / withdrawn listings
- Historical comps
- Unrestricted (broker-only) listings
- Full property history

For any of the above, contact Ed Neuhaus directly -- (512) 827-8830 -- and sign a buyer-representation agreement.

### Why do permit / 311 / code lookups return nothing for Lakeway / Bee Cave / Westlake?
These are non-City-of-Austin municipalities. Their permits and code cases live in their own systems, not the City of Austin Open Data Portal. Try the city's website directly.

### What's `austin_property_360` vs the individual tools?
`austin_property_360` is the recommended entry point for any address-centric question. It fans out across CAD (auto-routed), tax (Travis only), entities (MUD/PID), flood, permits, code, 311, zoning, and active MLS listing in ONE call (~10-15s). Use the individual tools only when you want JUST one data type.

### Why does TCAD sometimes take a long time?
True Prodigy's backend has variable latency. Long delinquent-tax histories take 11s+. The client uses escalating per-attempt timeouts (8s / 14s / 20s). If you keep seeing timeouts, call `austin_health` to confirm it's a TCAD-side issue, not the MCP.

### Can I rely on this for legal or official decisions?
No. Every result includes a `source_url` link to the authoritative provider. Verify there before relying on a value for closing, taxes, insurance underwriting, or legal filings.

### How fresh is the data?
- TCAD: daily refresh; certified Oct each year.
- City of Austin Open Data: most datasets nightly; 311 and dispatch near-real-time.
- VOW MLS: real-time (ACTRIS feeds VOW every 15 min).
- FEMA NFHL: FIRM revisions, usually annual.
- NWS: real-time.

### Where do I file a bug?
GitHub: https://github.com/mindwear-capitian/local-austin-mcp
