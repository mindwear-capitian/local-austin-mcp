import { z } from "zod";
import { searchByAddress as tcadSearch } from "../../lib/tcad.js";
import { searchByAddress as wcadSearch } from "../../lib/wcad.js";
import { searchByAddress as hcadSearch } from "../../lib/hayscad.js";
import { sodaQuery, sodaAddressLike } from "../../lib/soda.js";
import { searchAccounts, getAccountDetail, getEntityDetail } from "../../lib/travis-tax.js";
import { geocodeAddress, floodZoneAtPoint } from "../../lib/fema-flood.js";
import { detectCounty, looksLikeCityOfAustin } from "../../lib/county-router.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Composed property report. Fans out to every property-relevant tool in
 * parallel. Each section returns its own status so a single broken upstream
 * doesn't kill the whole report.
 *
 * Cross-county routing:
 *  - CAD: detected by ZIP/city -> TCAD (Travis), WCAD (Williamson), or
 *    HCAD (Hays). Falls back to a parallel fan-out across all three when
 *    detection is ambiguous.
 *  - Travis Tax Office + entity breakdown: only fires for Travis County
 *    addresses (other counties don't yet have tax-office tools).
 *  - City of Austin SODA datasets (permits, code, zoning, 311): only
 *    fires for addresses inside the City of Austin proper (skipped for
 *    Lakeway, Bee Cave, Round Rock, etc.).
 */

export const austinProperty360 = {
  name: "austin_property_360",
  description: withAttributionTag(
    "ONE-SHOT property report for any address in the Austin metro -- " +
      "Travis, Williamson, or Hays County. Auto-detects county and " +
      "routes to the right CAD (TCAD / WCAD / HCAD). For Travis-County " +
      "addresses, also pulls the tax bill (delinquency check) and " +
      "taxing-entity breakdown (MUD / PID / ESD / ISD). For City of " +
      "Austin addresses, also pulls permits, code-compliance cases, " +
      "311 requests, and zoning. FEMA flood zone runs for everything. " +
      "Returns one markdown report. Use for due diligence, listing " +
      "prep, investor screening, or buyer briefings. ~10-15s."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address. Example: "9501 San Lucas Dr, Austin, TX 78737". ' +
          'Include city + zip when possible -- helps route to the right CAD.'
      ),
    county: z
      .enum(["auto", "travis", "williamson", "hays"])
      .optional()
      .describe(
        "Force a specific CAD. Default 'auto' detects from zip/city and falls back to fan-out search."
      ),
    permit_since_year: z
      .number()
      .int()
      .min(1980)
      .max(2100)
      .optional()
      .describe("Limit permits to those issued on or after this year. Default = unlimited."),
    sr_since_year: z
      .number()
      .int()
      .min(2010)
      .max(2100)
      .optional()
      .describe("Limit 311 requests to those created on or after this year. Default = last 2 years."),
  },
  async handler({ address, county, permit_since_year, sr_since_year }) {
    const requested = county && county !== "auto" ? county : null;
    const detected = requested ?? detectCounty(address);

    const cadPromise = section(() => fetchCad(address, detected));
    // Travis-only: tax office + entity detail
    const taxPromise =
      detected === "travis" || detected === null
        ? section(() => fetchTax(address))
        : Promise.resolve(skipped(`Tax office tool only covers Travis County (detected: ${detected}).`));
    const entitiesPromise =
      detected === "travis" || detected === null
        ? section(() => fetchEntities(address))
        : Promise.resolve(skipped(`Taxing-entity breakdown only covers Travis County (detected: ${detected}).`));

    const floodPromise = section(() => fetchFlood(address));

    // City of Austin SODA tools: only run for Austin proper.
    const inAustin = looksLikeCityOfAustin(address) || detected === null;
    const permitsPromise = inAustin
      ? section(() => fetchPermits(address, permit_since_year))
      : Promise.resolve(skipped(`City of Austin permits skipped (address not in Austin city limits).`));
    const codeCasesPromise = inAustin
      ? section(() => fetchCodeCases(address))
      : Promise.resolve(skipped(`Austin code cases skipped (not in Austin city limits).`));
    const sr311Promise = inAustin
      ? section(() => fetchSr311(address, sr_since_year))
      : Promise.resolve(skipped(`Austin 311 skipped (not in Austin city limits).`));
    const zoningPromise = inAustin
      ? section(() => fetchZoning(address))
      : Promise.resolve(skipped(`Austin zoning skipped (not in Austin city limits).`));

    const [cad, tax, entities, flood, permits, code_cases, sr_311, zoning] =
      await Promise.all([
        cadPromise,
        taxPromise,
        entitiesPromise,
        floodPromise,
        permitsPromise,
        codeCasesPromise,
        sr311Promise,
        zoningPromise,
      ]);

    const sections = { cad, tax, entities, flood, permits, code_cases, sr_311, zoning };
    const text = formatReport(address, sections, { detected, requested });
    return {
      content: [
        { type: "text", text },
        {
          type: "text",
          text: JSON.stringify(
            { address, county_detected: detected, county_requested: requested, sections },
            null,
            2
          ),
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Section fetchers
// ---------------------------------------------------------------------------

async function fetchCad(address, detectedCounty) {
  // Force a single CAD if county is known.
  if (detectedCounty === "travis") return shapeCad(await tcadSearch(address, { limit: 1 }), "travis");
  if (detectedCounty === "williamson") return shapeCad(await wcadSearch(address, { limit: 1 }), "williamson");
  if (detectedCounty === "hays") return shapeCad(await hcadSearch(address, { limit: 1 }), "hays");

  // Unknown county: fan out across all three in parallel and pick the
  // first non-empty result. If multiple match, prefer Travis (largest
  // pop), then Williamson, then Hays.
  const [t, w, h] = await Promise.all([
    safeArr(tcadSearch(address, { limit: 1 })),
    safeArr(wcadSearch(address, { limit: 1 })),
    safeArr(hcadSearch(address, { limit: 1 })),
  ]);
  if (t.length) return shapeCad(t, "travis");
  if (w.length) return shapeCad(w, "williamson");
  if (h.length) return shapeCad(h, "hays");
  return { found: false, county: "unknown" };
}

function shapeCad(rows, county) {
  if (!rows.length) return { found: false, county };
  const r = rows[0];
  return {
    found: true,
    county,
    owner: r.owner ?? null,
    site_address: r.site_address ?? null,
    market_value: r.market_value ?? null,
    appraised_value: r.appraised_value ?? null,
    land_value: r.land_value ?? null,
    improvement_value: r.improvement_value ?? null,
    legal_acreage: r.legal_acreage ?? null,
    zoning: r.zoning ?? null,
    legal_description: r.legal_description ?? null,
    property_id: r.property_id ?? null,
    geo_id: r.geo_id ?? null,
    detail_url: r.detail_url ?? null,
    year_built: r.year_built ?? null,
    building_area_sqft: r.building_area_sqft ?? null,
    school_district: r.school_district ?? null,
    subdivision: r.subdivision ?? null,
    yoy_change: r.yoy_change ?? null,
    yoy_change_pct: r.yoy_change_pct ?? null,
    source: r.source ?? null,
  };
}

async function safeArr(p) {
  try {
    const r = await p;
    return Array.isArray(r) ? r : [];
  } catch {
    return [];
  }
}

async function fetchTax(address) {
  const matches = await searchAccounts(address, { limit: 5 });
  if (!matches.length) return { found: false };
  const ranked = rankByAddress(matches, address);
  const detail = await getAccountDetail(ranked[0].account_id);
  return { found: true, ...detail };
}

async function fetchEntities(address) {
  const matches = await searchAccounts(address, { limit: 5 });
  if (!matches.length) return { found: false };
  const ranked = rankByAddress(matches, address);
  const detail = await getEntityDetail(ranked[0].account_id);
  return { found: true, ...detail };
}

async function fetchFlood(address) {
  const geo = await geocodeAddress(address);
  if (!geo) return { found: false, reason: "geocode_failed" };
  const zone = await floodZoneAtPoint(geo.longitude, geo.latitude);
  if (!zone) return { found: false, reason: "no_nfhl_feature", geocoded: geo };
  return { found: true, geocoded: geo, ...zone };
}

async function fetchPermits(address, since_year) {
  const where = [sodaAddressLike("original_address1", address)];
  if (since_year) where.push(`issue_date >= '${since_year}-01-01T00:00:00.000'`);
  const rows = await sodaQuery("3syk-w9eu", {
    where: where.join(" AND "),
    order: "issue_date DESC",
    limit: 25,
  });
  return { found: rows.length > 0, count: rows.length, rows };
}

async function fetchCodeCases(address) {
  const rows = await sodaQuery("6wtj-zbtb", {
    base: "https://datahub.austintexas.gov",
    where: sodaAddressLike("address", address),
    order: "opened_date DESC",
    limit: 25,
  });
  return { found: rows.length > 0, count: rows.length, rows };
}

async function fetchSr311(address, since_year) {
  const effectiveSince = since_year ?? new Date().getFullYear() - 2;
  const where =
    sodaAddressLike("sr_location", address) +
    ` AND sr_created_date >= '${effectiveSince}-01-01T00:00:00.000'`;
  const rows = await sodaQuery("xwdj-i9he", {
    base: "https://datahub.austintexas.gov",
    where,
    order: "sr_created_date DESC",
    limit: 15,
  });
  return { found: rows.length > 0, count: rows.length, since_year: effectiveSince, rows };
}

async function fetchZoning(address) {
  const rows = await sodaQuery("nbzi-qabm", {
    base: "https://datahub.austintexas.gov",
    where: sodaAddressLike("full_street_name", address),
    limit: 5,
  });
  return { found: rows.length > 0, count: rows.length, rows };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function rankByAddress(matches, query) {
  const tokens = (query ?? "")
    .toUpperCase()
    .split(/\s+/)
    .filter((t) => t.length >= 2);
  const score = (m) => {
    if (!m.address) return 0;
    const upper = m.address.toUpperCase();
    let s = 0;
    for (const t of tokens) if (upper.includes(t)) s += 2;
    const longest = tokens.slice().sort((a, b) => b.length - a.length)[0];
    if (longest && upper.includes(longest)) s += longest.length;
    return s;
  };
  return [...matches].sort((a, b) => score(b) - score(a));
}

async function section(fn) {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (err) {
    return { ok: false, error: err?.message ?? String(err) };
  }
}

function skipped(reason) {
  return { ok: true, value: { skipped: true, reason } };
}

function fmtMoney(v) {
  if (v === null || v === undefined) return "(unknown)";
  return `$${Number(v).toLocaleString("en-US")}`;
}

function fmtMoney2(v) {
  if (v === null || v === undefined) return "(unknown)";
  return `$${Number(v).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// ---------------------------------------------------------------------------
// Markdown report formatter
// ---------------------------------------------------------------------------

function formatReport(address, sections, meta) {
  const lines = [];
  lines.push(`# Austin Metro Property 360: ${address}`);
  lines.push("");
  const countyLabel = formatCountyLabel(sections.cad, meta);
  lines.push(`*${countyLabel} -- multi-source property report.*`);
  lines.push("");

  lines.push(...summaryBlock(sections));
  lines.push("");

  lines.push(`## 1. County Appraisal District (${cadName(sections.cad)})`);
  lines.push(...sectionCad(sections.cad));
  lines.push("");

  lines.push(`## 2. Travis County Tax Office`);
  lines.push(...sectionTax(sections.tax));
  lines.push("");

  lines.push(`## 3. Taxing Entities (MUD / PID / ESD / ISD)`);
  lines.push(...sectionEntities(sections.entities));
  lines.push("");

  lines.push(`## 4. FEMA Flood Zone`);
  lines.push(...sectionFlood(sections.flood));
  lines.push("");

  lines.push(`## 5. Austin Zoning`);
  lines.push(...sectionZoning(sections.zoning));
  lines.push("");

  lines.push(`## 6. Austin Permits`);
  lines.push(...sectionPermits(sections.permits));
  lines.push("");

  lines.push(`## 7. Austin Code Compliance Cases`);
  lines.push(...sectionCodeCases(sections.code_cases));
  lines.push("");

  lines.push(`## 8. Austin 311 Service Requests`);
  lines.push(...sectionSr(sections.sr_311));
  lines.push("");

  lines.push(`---`);
  lines.push(
    `Sources: TCAD (True Prodigy) · WCAD (ArcGIS) · HCAD (ArcGIS) · Travis County Tax Office · FEMA NFHL · U.S. Census Geocoder · City of Austin Open Data Portal · Austin Code Department · Austin Planning Department.`
  );
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function formatCountyLabel(cadSec, meta) {
  const detected = meta?.detected;
  const requested = meta?.requested;
  const found = cadSec?.value?.county;
  const parts = [];
  if (requested) parts.push(`Forced county: ${cap(requested)}`);
  else if (detected) parts.push(`Detected county: ${cap(detected)}`);
  else parts.push(`County not auto-detected -- ran fan-out search`);
  if (found && found !== detected) parts.push(`(matched in ${cap(found)})`);
  return parts.join(" ");
}

function cap(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function cadName(cadSec) {
  const c = cadSec?.value?.county;
  if (c === "travis") return "TCAD";
  if (c === "williamson") return "WCAD";
  if (c === "hays") return "HCAD";
  return "no match";
}

function summaryBlock(s) {
  const lines = [`## Summary`];
  const cad = s.cad?.value;
  if (s.cad?.ok && cad?.found) {
    const valueStr = cad.market_value
      ? `${fmtMoney(cad.market_value)} (${cap(cad.county)} CAD)`
      : `(values not published in ${cap(cad.county)} GIS feed)`;
    lines.push(
      `- **Owner:** ${cad.owner ?? "?"}  |  **Value:** ${valueStr}  |  **Acreage:** ${cad.legal_acreage ?? "?"}`
    );
    if (cad.year_built) lines.push(`- **Year built:** ${cad.year_built}  |  **Sqft:** ${cad.building_area_sqft?.toLocaleString() ?? "?"}`);
    if (cad.school_district) lines.push(`- **School District:** ${cad.school_district}`);
  } else if (s.cad?.ok) {
    lines.push(`- **CAD:** No match in any of TCAD / WCAD / HCAD.`);
  }
  const tax = s.tax?.value;
  if (s.tax?.ok && tax?.found) {
    const flag = tax.is_delinquent ? " 🔴 DELINQUENT" : "";
    lines.push(
      `- **Total tax due:** ${fmtMoney2(tax.total_due)}${flag}  (current ${fmtMoney2(tax.current_year_due?.total_due ?? 0)} + prior ${fmtMoney2(tax.prior_years_due?.total_due ?? 0)})`
    );
  } else if (tax?.skipped) {
    lines.push(`- **Tax bill:** *${tax.reason}*`);
  }
  const ent = s.entities?.value;
  if (s.entities?.ok && ent?.found) {
    const flags = [];
    if (ent.has_mud) flags.push("MUD");
    if (ent.has_pid) flags.push("PID");
    lines.push(
      `- **Taxing entities:** ${ent.entity_count ?? 0}${flags.length ? `  (${flags.join(", ")} present)` : ""}`
    );
  }
  const fld = s.flood?.value;
  if (s.flood?.ok && fld?.found) {
    lines.push(`- **FEMA flood zone:** ${fld.flood_zone}${fld.in_sfha ? " (in SFHA)" : ""}`);
  }
  const zone = s.zoning?.value;
  if (s.zoning?.ok && zone?.found && !zone.skipped) {
    const z = zone.rows[0];
    lines.push(`- **Zoning:** ${z.zoning_ztype ?? "?"}  (${z.base_zone_category ?? ""})`);
  }
  const permits = s.permits?.value;
  if (s.permits?.ok && !permits.skipped) lines.push(`- **Permits on file:** ${permits.count ?? 0}`);
  const code = s.code_cases?.value;
  if (s.code_cases?.ok && !code.skipped) lines.push(`- **Code cases (all-time):** ${code.count ?? 0}`);
  const sr = s.sr_311?.value;
  if (s.sr_311?.ok && !sr.skipped) lines.push(`- **311 requests (since ${sr.since_year}):** ${sr.count ?? 0}`);
  return lines;
}

function sectionCad(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (!v.found) return [`*No CAD record matched in any of TCAD / WCAD / HCAD.*`];
  const lines = [
    `- **Owner:** ${v.owner ?? "?"}`,
    `- **Site address:** ${v.site_address ?? "?"}`,
  ];
  if (v.market_value !== null) lines.push(`- **Market value:** ${fmtMoney(v.market_value)}`);
  if (v.appraised_value !== null && v.appraised_value !== v.market_value) {
    lines.push(`- **Appraised value:** ${fmtMoney(v.appraised_value)}`);
  }
  if (v.land_value !== null || v.improvement_value !== null) {
    lines.push(`- **Land / Improvements:** ${fmtMoney(v.land_value)} / ${fmtMoney(v.improvement_value)}`);
  }
  if (v.yoy_change !== null) {
    const pct = v.yoy_change_pct !== null ? ` (${v.yoy_change_pct}%)` : "";
    lines.push(`- **YoY change:** ${fmtMoney(v.yoy_change)}${pct}`);
  }
  if (v.legal_acreage !== null) lines.push(`- **Acreage:** ${v.legal_acreage}`);
  if (v.year_built) lines.push(`- **Year built:** ${v.year_built}`);
  if (v.building_area_sqft) lines.push(`- **Building area:** ${v.building_area_sqft.toLocaleString()} sqft`);
  if (v.subdivision) lines.push(`- **Subdivision:** ${v.subdivision}`);
  if (v.school_district) lines.push(`- **School district:** ${v.school_district}`);
  if (v.zoning) lines.push(`- **Zoning (per CAD):** ${v.zoning}`);
  if (v.legal_description) lines.push(`- **Legal:** ${v.legal_description}`);
  if (v.property_id) lines.push(`- **Property ID:** ${v.property_id}${v.geo_id && v.geo_id !== v.property_id ? `  |  **Geo ID:** ${v.geo_id}` : ""}`);
  if (v.detail_url) lines.push(`- **CAD detail page:** ${v.detail_url}`);
  if (v.source) lines.push(`- **Source:** ${v.source}`);
  if (v.market_value === null && v.county === "williamson") {
    lines.push(``);
    lines.push(`> *Note: WCAD redacts dollar values from its public GIS feed. Use the CAD detail page above for current assessed values.*`);
  }
  return lines;
}

function sectionTax(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (v.skipped) return [`*${v.reason}*`];
  if (!v.found) return [`*No Travis County tax account matched.*`];
  const lines = [
    `- **Account:** ${v.account_id}`,
    `- **Owner:** ${v.owner ?? "?"}`,
    `- **Mailing:** ${v.mailing_address ?? "?"}`,
    `- **${v.current_tax_year} current year:** ${fmtMoney2(v.current_year_due?.total_due ?? 0)}`,
  ];
  if ((v.prior_years_due?.total_due ?? 0) > 0) {
    lines.push(`- **Prior years delinquent:** ${fmtMoney2(v.prior_years_due.total_due)}  🔴`);
  }
  lines.push(`- **TOTAL DUE:** ${fmtMoney2(v.total_due)}`);
  lines.push(`- **Delinquent:** ${v.is_delinquent ? "**YES**" : "No"}`);
  return lines;
}

function sectionEntities(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (v.skipped) return [`*${v.reason}*`];
  if (!v.found || !v.entities?.length) return [`*No taxing entity detail returned.*`];
  const lines = [];
  if (v.has_mud) lines.push(`**MUD detected:** YES`);
  if (v.has_pid) lines.push(`**PID detected:** YES`);
  if (!v.has_mud && !v.has_pid) lines.push(`No MUD or PID on this property.`);
  lines.push("");
  lines.push(`| Entity | Type | Total |`);
  lines.push(`|---|---|---|`);
  for (const e of v.entities) {
    lines.push(`| ${e.name.trim()} | ${e.type} | ${fmtMoney2(e.total_due)} |`);
  }
  lines.push(`| **Total (${v.tax_year})** | | **${fmtMoney2(v.total_due)}** |`);
  return lines;
}

function sectionFlood(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (!v.found) {
    return [
      `*No FEMA NFHL feature returned.${v.reason === "geocode_failed" ? " (Could not geocode the address.)" : v.reason === "no_nfhl_feature" ? " (Outside NFHL coverage.)" : ""}*`,
    ];
  }
  const lines = [
    `- **Zone:** ${v.flood_zone}${v.in_sfha ? " (in SFHA)" : ""}`,
    `- **Subtype:** ${v.zone_subtype ?? "?"}`,
    `- **In SFHA:** ${v.in_sfha ? "YES" : "No"}`,
  ];
  if (v.dfirm_id) lines.push(`- **FIRM panel:** ${v.dfirm_id}`);
  lines.push(`- ${v.interpretation}`);
  return lines;
}

function sectionZoning(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (v.skipped) return [`*${v.reason}*`];
  if (!v.found || !v.rows?.length) return [`*No zoning record (City of Austin jurisdiction only).*`];
  const lines = [];
  for (const z of v.rows) {
    lines.push(`- **${z.full_street_name}:** ${z.zoning_ztype} (${z.base_zone_category ?? ""})`);
  }
  return lines;
}

function sectionPermits(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (v.skipped) return [`*${v.reason}*`];
  if (!v.found) return [`*No permits on file.*`];
  const byType = {};
  for (const r of v.rows) {
    const t = r.permit_type_desc ?? r.permittype ?? "Unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const top = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .map(([t, n]) => `${t} (${n})`)
    .join(", ");
  const lines = [`**${v.count} permit${v.count === 1 ? "" : "s"} on file.**  By type: ${top}`, ""];
  for (const r of v.rows.slice(0, 8)) {
    const date = (r.issue_date ?? "").slice(0, 10);
    lines.push(`- ${date}  ${r.permit_type_desc ?? r.permittype}  --  ${r.work_class ?? ""}  --  ${r.description ?? ""}  (#${r.permit_number}, ${r.status_current})`);
  }
  if (v.rows.length > 8) lines.push(`- ...and ${v.rows.length - 8} more.`);
  return lines;
}

function sectionCodeCases(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (v.skipped) return [`*${v.reason}*`];
  if (!v.found) return [`*No code-compliance cases on file. ✅*`];
  const lines = [`**${v.count} case${v.count === 1 ? "" : "s"} on file.**`, ""];
  for (const r of v.rows.slice(0, 8)) {
    const date = (r.opened_date ?? "").slice(0, 10);
    lines.push(`- ${date}  ${r.status}  --  ${r.description ?? r.case_type}  (#${r.case_id})`);
  }
  if (v.rows.length > 8) lines.push(`- ...and ${v.rows.length - 8} more.`);
  return lines;
}

function sectionSr(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (v.skipped) return [`*${v.reason}*`];
  if (!v.found) return [`*No 311 service requests at this address since ${v.since_year}.*`];
  const byType = {};
  for (const r of v.rows) {
    const t = r.sr_type_desc ?? "Unknown";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  const top = Object.entries(byType)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([t, n]) => `${t} (${n})`)
    .join(", ");
  const lines = [`**${v.count} 311 request${v.count === 1 ? "" : "s"} since ${v.since_year}.**  Top types: ${top}`, ""];
  for (const r of v.rows.slice(0, 6)) {
    const date = (r.sr_created_date ?? "").slice(0, 10);
    lines.push(`- ${date}  ${r.sr_status_desc}  --  ${r.sr_type_desc}`);
  }
  if (v.rows.length > 6) lines.push(`- ...and ${v.rows.length - 6} more.`);
  return lines;
}
