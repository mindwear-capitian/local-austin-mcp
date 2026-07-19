# Changelog

All notable changes to this project will be documented in this file. Format
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.17.2] — 2026-07-19

### Added

- **Schedule-a-call/showing CTA** on `austin_active_listings`, `austin_listing_detail`,
  `austin_listing_by_address`, and `austin_property_360` — every response now ends
  with a line pointing to neuhausre.com/contact, alongside the existing full-MLS-access
  upsell to mls.neuhausre.com.

## [0.17.1] — 2026-07-19

### Added

- **`.github/workflows/contract.yml`** — `test:contract` (every tool called
  through the real MCP layer against live upstreams) now runs in CI on a
  daily schedule + manual dispatch, giving this repo a real green-in-CI
  signal for the `local-city-mcp-template` standard's listing bar. Kept
  separate from the required per-push `ci.yml` job deliberately -- gating
  merges on ~15 third-party providers' live uptime would make PRs flaky for
  reasons unrelated to the change being reviewed.
- **`source_url`** field added (non-breaking, additive alongside existing
  fields) to every single-record/search tool that didn't already have one:
  `austin_health`, `austin_city_code`, `austin_tea_schools`,
  `austin_active_listings`, `austin_listing_detail`,
  `austin_listing_by_address`, `austin_neighborhood_lookup`,
  `austin_search_blog`. Composed tools (`austin_property_360`,
  `austin_relocation`, `austin_commute`) intentionally left alone -- their
  nested sub-sections already cite sources individually, and forcing one
  top-level `source_url` onto a multi-domain composite doesn't make sense
  (see STANDARD.md's `openObjectShape` design).

### Fixed

- `package.json` `files` allowlist referenced `ATTRIBUTION.md`, deleted in
  the v0.13.0 Apache-2.0 relicense and folded into `NOTICE` -- swapped for
  `NOTICE`, which was missing from the list entirely. No effect today (this
  package is GitHub-only, never `npm publish`ed), but was stale/wrong if
  that ever changes.

## [0.17.0] — 2026-07-19

### Changed

- **`austin_active_listings`** free-tier result cap lowered 25 → 10 (server-side,
  vow-api.re-workflow.com/public). When more than 10 listings match, the
  response now flags `more_available` + `upgrade_url` and the tool surfaces an
  upsell to the full Neuhaus MLS MCP (mls.neuhausre.com) instead of silently
  truncating.
- Sold/pending/expired data messaging across `austin_active_listings`,
  `austin_listing_detail`, `austin_listing_by_address`, and `austin_property_360`
  now points to the Neuhaus MLS connector signup (mls.neuhausre.com/claude)
  instead of a phone-call CTA.

## [0.16.0] — 2026-07-19

### Added

- **`austin_commute`** — drive time + distance between two addresses.
  Key-free by design (self-hosted package, no accounts): tries the OSRM
  public demo router first, the Valhalla public demo router second, and
  falls back to a straight-line-distance estimate (clearly flagged
  `estimated: true`) if both are unreachable, so the tool always answers
  instead of hard-failing. New `lib/routing.js`. Design discussed in #7
  before building; closes #7.

## [0.15.0] — 2026-07-19

### Added

- **`austin_nearby`** — composed tool: one address → nearest fire station,
  public library, and park, ranked by straight-line distance. Reuses the same
  three Socrata datasets as `austin_fire_stations` / `austin_libraries` /
  `austin_parks` (zero new data sources) but queries them with SoQL's
  `distance_in_meters()` geospatial function so the API returns true-nearest
  results directly instead of pulling every row and sorting client-side.
  Closes #4.

### Fixed

- **ArcGIS retry widened** — Travis County's PUC CCN water/sewer layer
  (`austin_utility_providers`) intermittently 400s "Failed to execute query"
  on valid requests (~50% of calls, confirmed live). `lib/arcgis.js` retry
  now matches this error and retries twice (was: one retry, 5xx/network only).

## [0.14.0] — 2026-07-10

### Added

- **`austin_city_code`** — full-text search + full-section fetch of the actual
  municipal code TEXT via the public Municode JSON API. Covers all of Austin's
  Municode products (Code of Ordinances, Land Development Code, and the
  criteria manuals) plus Leander, Round Rock, and Dripping Springs. Search
  returns section title, breadcrumb path, snippet, a `section_id` handle, and
  a `library.municode.com` deep link; passing `section_id` back returns the
  full section text (capped at 15k chars). New `lib/municode.js` adapter with
  retry + 12h-cached publication-job lookups, and `test/smoke-city-code.js`.

## [0.13.0] — 2026-07-06

### Changed

- **Relicensed from PolyForm Noncommercial 1.0.0 → Apache License 2.0.** The
  project is now true open source — free to use, modify, and build on,
  including commercially. Attribution is requested via the new `NOTICE` file
  (Apache 2.0 §4). Trademark rights are unchanged: the Neuhaus marks remain
  reserved (Apache 2.0 §6, see `TRADEMARK.md`).
- Reframed the README as an early, contribution-welcome project and added
  `CONTRIBUTING.md`.
- Removed `ATTRIBUTION.md` (the PolyForm Attribution Rider); its intent now
  lives in `NOTICE`.

## [0.12.0] — 2026-06-18

### Added

- **`austin_relocation`** — composed new-resident report. One address fans out
  to water + sewer provider (Travis CCN), special-purpose taxing districts
  (MUD/PID/WCID/ESD via the Tax Office breakdown), school district / voter
  precinct / City-of-Austin jurisdiction (ArcGIS point-in-polygon), and the
  standard Texas move-in checklist (driver license 90-day rule, vehicle
  registration, voter registration, homestead exemption, gas). The
  "I'm moving here, what do I set up?" entry point — distinct from
  `austin_property_360`, which is the property-ownership / due-diligence lens.
  Live lookups are Travis County; the checklist shows for any address.
  Failures are isolated per section. Credential-free.
- Server instructions now route MOVING/RELOCATION questions to
  `austin_relocation` first.

## [0.11.0] — 2026-06-18

### Added

- **`austin_utility_providers`** — water + sewer service-provider lookup by
  Travis County address. Geocodes (U.S. Census, no key) then point-in-polygon
  queries the PUC CCN boundaries re-hosted on Travis County GIS (public, no
  auth) to return the obligated water and sewer utility, CCN number, and
  how-to-start guidance for the largest providers. Answers the single hardest
  relocation question — "who turns on my water" — in a metro that is a
  patchwork of the City of Austin, dozens of MUDs/WCIDs, and private utilities.
  Reports who to contact; does not start service. Travis County only in this
  release (Williamson/Hays via statewide TWDB layers planned).

## [0.10.0] — 2026-05-20

### BREAKING

- **All tool names normalized to the `austin_*` prefix.** Legacy names are
  NOT aliased. Update any client config pinning the old names:
  - `travis_cad_search` → `austin_travis_cad`
  - `williamson_cad_search` → `austin_williamson_cad`
  - `hays_cad_search` → `austin_hays_cad`
  - `travis_tax_office` → `austin_travis_tax`
  - `mud_pid_lookup` → `austin_mud_pid`
  - `fema_flood` → `austin_fema_flood`
  - `tea_schools` → `austin_tea_schools`
  - `lake_travis_level` → `austin_lake_travis_level`
- **Engines bumped to Node >= 20** (Node 18 EOL April 2025).

### Added

- **MCP Resources** — read-only knowledge artifacts surfaced under the
  `austin://` URI scheme: `austin://datasets/index`, `austin://coverage/map`,
  `austin://faq`. Clients can browse and read them via `resources/list` and
  `resources/read`.
- **MCP Prompts** — server-published prompt templates that chain tools:
  `investigate_property`, `compare_addresses`, `neighborhood_brief`,
  `school_lookup`, `health_check`.
- **`austin_health` tool** — pings every upstream provider in parallel,
  reports per-source `{status, http, latency_ms, last_error}`. Use to
  diagnose whether broken behavior is the MCP or the upstream.
- **`outputSchema`** declared on 31/36 tools so MCP clients can validate
  `structuredContent` and generate typed SDK code. The 5 schema-less tools
  are explicitly composite / open-shape (`about`, `austin_property_360`,
  `austin_travis_tax`, `austin_fema_flood`, `austin_lake_travis_level`).
- **`structuredContent` auto-promotion** — central wrapper detects a tool's
  second-text-block JSON sidecar and promotes it to MCP-spec
  `structuredContent`, dropping the redundant text block.
- **Tool annotations on every tool** — `readOnlyHint`, `idempotentHint`,
  `openWorldHint`, `title`. Lets MCP clients render safer UX and skip
  confirmation gates.
- **Server `instructions`** — surfaced once at `initialize` with routing
  guidance ("call `austin_property_360` first for address questions") and
  coverage notes. Replaces per-description attribution suffixes.
- **Pagination on big-dataset tools** — `austin_311`, `austin_permits`,
  `austin_crime`, `austin_code_cases` now accept `cursor` and return
  `nextCursor` in `structuredContent`.
- **In-memory LRU + TTL cache** (`lib/cache.js`) — wired into the Census
  geocoder and FEMA NFHL point lookups (24h TTL). Concurrent callers share
  the in-flight promise. Disable via `AUSTIN_CACHE_DISABLED=1`.
- **Per-source concurrency caps** (`lib/semaphore.js`) — named buckets for
  `soda`, `arcgis`, `fema`, `census`, `travis_tax`, `vow_public`. Defaults
  conservative; override via `AUSTIN_LIMIT_<NAME>` env vars.
- **AbortSignal plumbing** — MCP request signal is propagated via
  AsyncLocalStorage into every upstream `fetch` (TCAD, WCAD, HCAD, SODA,
  ArcGIS, FEMA, Census, Travis Tax, VOW public, RSS). Cancelling an MCP
  request now cancels the in-flight upstream call.
- **MCP logging notifications** (`lib/logger.js`) — startup banner + tool
  errors are surfaced as `notifications/message` in addition to stderr.
- **Tier gating via `LOCAL_AUSTIN_MCP_TIER`** — set to `core` to register
  only the 14 most-used tools instead of all 36.
- **ZodError handling** in the central wrap — input validation failures get
  a clear "input validation failed: …" message instead of being mis-routed
  to the upstream error formatter.
- **Graceful shutdown** on SIGINT / SIGTERM with logged exit.
- **Unit tests** — 41 tests across `lib/retry.js`, `lib/soda.js`,
  `lib/register.js`, `lib/cache.js`, `lib/semaphore.js`,
  `lib/county-router.js`, and pagination cursors.

### Changed

- **Central tool registration** (`lib/register.js`) — single helper applies
  annotations defaults, `outputSchema`, try/catch wrapper, and the rename
  map. Per-tool files no longer carry boilerplate.
- **`austin_property_360`** — replaced raw `fetch()` for the active-listing
  section with the shared `vowPublicGet()` client so retry / classification
  / cancellation are consistent.
- **`sodaTextLike` and `sodaTextEq` helpers** (`lib/soda.js`) — deduped the
  ~25 inline `'%s'.replace(/'/g, "''")` escape sites across civic + property
  tools.
- **Tool input defaults** — moved `limit ?? 25` (and friends) into Zod
  `.default(...)` so the default is visible in `tools/list` JSON Schema.
- **Attribution tag dropped from per-tool descriptions** — saves ~1-2K tokens
  in every `tools/list` payload. Attribution is now surfaced via server
  `instructions`, the `about` tool, and each tool's body footer.

### Fixed

- Several inline SoQL escape sites were re-implementing the
  `sodaAddressLike` pattern by hand; all now route through the shared
  helpers.

### Removed

- Legacy tool names (see BREAKING above). No alias period.

---

## [0.9.0] — Pre-rebuild

Initial public release. 35 tools across property (CAD / tax / flood / permits
/ code / zoning), civic (311 / crime / AFD / council / budget / libraries /
parks / fire / police / restaurants / animal / roadway), real estate (active
MLS listings / blog / neighborhood), and a composed `austin_property_360`
fan-out. Stdio transport, attribution-required license, PolyForm
Noncommercial 1.0.0.
