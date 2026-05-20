# Changelog

All notable changes to this project will be documented in this file. Format
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this
project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.10.0] — Unreleased

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
