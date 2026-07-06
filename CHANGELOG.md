# Changelog

All notable changes to this project will be documented in this file. Format
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
