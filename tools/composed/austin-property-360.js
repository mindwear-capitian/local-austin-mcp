import { z } from "zod";
import { searchByAddress as tcadSearch } from "../../lib/tcad.js";
import { sodaQuery, sodaAddressLike } from "../../lib/soda.js";
import { searchAccounts, getAccountDetail, getEntityDetail } from "../../lib/travis-tax.js";
import { geocodeAddress, floodZoneAtPoint } from "../../lib/fema-flood.js";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";

/**
 * Composed property report. Fans out to every property-relevant tool in
 * parallel. Each section returns its own status so a single broken upstream
 * doesn't kill the whole report.
 */

export const austinProperty360 = {
  name: "austin_property_360",
  description: withAttributionTag(
    "ONE-SHOT property report for any Austin / Travis County address. " +
      "Parallel-fans out to TCAD (owner + value), Travis Tax Office " +
      "(current bill + delinquency), Travis taxing entities (MUD / PID / " +
      "ESD / ISD breakdown), FEMA flood zone, City of Austin permits, " +
      "code-compliance cases, 311 service requests, and zoning. Returns " +
      "a single markdown report. Use this for due diligence, listing prep, " +
      "investor screening, or buyer briefings. Slower than individual tools " +
      "(8 parallel calls including a tax-office scrape) -- expect ~10-15s."
  ),
  inputSchema: {
    address: z
      .string()
      .min(3)
      .describe(
        'Street address. Example: "9501 San Lucas Dr". Single-line, no city/zip ideal but tolerated. Must be in Travis County.'
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
  async handler({ address, permit_since_year, sr_since_year }) {
    const sectionPromises = {
      cad: section(() => fetchCad(address)),
      tax: section(() => fetchTax(address)),
      entities: section(() => fetchEntities(address)),
      flood: section(() => fetchFlood(address)),
      permits: section(() => fetchPermits(address, permit_since_year)),
      code_cases: section(() => fetchCodeCases(address)),
      sr_311: section(() => fetchSr311(address, sr_since_year)),
      zoning: section(() => fetchZoning(address)),
    };

    const sections = {};
    for (const [k, p] of Object.entries(sectionPromises)) {
      sections[k] = await p;
    }

    const text = formatReport(address, sections);
    return {
      content: [
        { type: "text", text },
        {
          type: "text",
          text: JSON.stringify({ address, sections }, null, 2),
        },
      ],
    };
  },
};

// ---------------------------------------------------------------------------
// Section fetchers (each returns a normalized object, throws on failure)
// ---------------------------------------------------------------------------

async function fetchCad(address) {
  const rows = await tcadSearch(address, { limit: 1 });
  if (!rows.length) return { found: false };
  const r = rows[0];
  return {
    found: true,
    owner: r.owner,
    site_address: r.site_address,
    market_value: r.market_value,
    appraised_value: r.appraised_value,
    land_value: r.land_value,
    improvement_value: r.improvement_value,
    legal_acreage: r.legal_acreage,
    zoning: r.zoning,
    legal_description: r.legal_description,
    property_id: r.property_id,
    geo_id: r.geo_id,
    detail_url: r.detail_url,
  };
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

function formatReport(address, sections) {
  const lines = [];
  lines.push(`# Austin Property 360: ${address}`);
  lines.push("");
  lines.push(`*One-shot property report. Eight authoritative sources in parallel.*`);
  lines.push("");

  // Headline summary
  lines.push(...summaryBlock(sections));
  lines.push("");

  // Section: TCAD
  lines.push(`## 1. Travis CAD (TCAD)`);
  lines.push(...sectionTcad(sections.cad));
  lines.push("");

  // Section: Tax
  lines.push(`## 2. Travis County Tax Office`);
  lines.push(...sectionTax(sections.tax));
  lines.push("");

  // Section: Taxing Entities (MUD/PID)
  lines.push(`## 3. Taxing Entities (MUD / PID / ESD / ISD)`);
  lines.push(...sectionEntities(sections.entities));
  lines.push("");

  // Section: FEMA Flood
  lines.push(`## 4. FEMA Flood Zone`);
  lines.push(...sectionFlood(sections.flood));
  lines.push("");

  // Section: Zoning
  lines.push(`## 5. Austin Zoning`);
  lines.push(...sectionZoning(sections.zoning));
  lines.push("");

  // Section: Permits
  lines.push(`## 6. Austin Permits`);
  lines.push(...sectionPermits(sections.permits));
  lines.push("");

  // Section: Code Cases
  lines.push(`## 7. Austin Code Compliance Cases`);
  lines.push(...sectionCodeCases(sections.code_cases));
  lines.push("");

  // Section: 311
  lines.push(`## 8. Austin 311 Service Requests`);
  lines.push(...sectionSr(sections.sr_311));
  lines.push("");

  lines.push(`---`);
  lines.push(`Sources: TCAD (True Prodigy) · Travis County Tax Office · FEMA NFHL · U.S. Census Geocoder · City of Austin Open Data Portal · Austin Code Department · Austin Planning Department.`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function summaryBlock(s) {
  const lines = [`## Summary`];
  const cad = s.cad?.value;
  if (s.cad?.ok && cad?.found) {
    lines.push(
      `- **Owner:** ${cad.owner ?? "?"}  |  **TCAD value:** ${fmtMoney(cad.market_value)}  |  **Acreage:** ${cad.legal_acreage ?? "?"}`
    );
  }
  const tax = s.tax?.value;
  if (s.tax?.ok && tax?.found) {
    const flag = tax.is_delinquent ? " 🔴 DELINQUENT" : "";
    lines.push(
      `- **Total tax due:** ${fmtMoney2(tax.total_due)}${flag}  (current ${fmtMoney2(tax.current_year_due?.total_due ?? 0)} + prior ${fmtMoney2(tax.prior_years_due?.total_due ?? 0)})`
    );
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
    lines.push(
      `- **FEMA flood zone:** ${fld.flood_zone}${fld.in_sfha ? " (in SFHA)" : ""}`
    );
  }
  const zone = s.zoning?.value;
  if (s.zoning?.ok && zone?.found) {
    const z = zone.rows[0];
    lines.push(
      `- **Zoning:** ${z.zoning_ztype ?? "?"}  (${z.base_zone_category ?? ""})`
    );
  }
  const permits = s.permits?.value;
  if (s.permits?.ok) {
    lines.push(`- **Permits on file:** ${permits.count ?? 0}`);
  }
  const code = s.code_cases?.value;
  if (s.code_cases?.ok) {
    lines.push(`- **Code cases (all-time):** ${code.count ?? 0}`);
  }
  const sr = s.sr_311?.value;
  if (s.sr_311?.ok) {
    lines.push(`- **311 requests (since ${sr.since_year}):** ${sr.count ?? 0}`);
  }
  return lines;
}

function sectionTcad(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (!v.found) return [`*No TCAD record matched.*`];
  return [
    `- **Owner:** ${v.owner ?? "?"}`,
    `- **Site address:** ${v.site_address ?? "?"}`,
    `- **Market value:** ${fmtMoney(v.market_value)}`,
    `- **Appraised value:** ${fmtMoney(v.appraised_value)}`,
    `- **Land / Improvements:** ${fmtMoney(v.land_value)} / ${fmtMoney(v.improvement_value)}`,
    `- **Acreage:** ${v.legal_acreage ?? "?"}`,
    `- **Zoning (per TCAD):** ${v.zoning ?? "(none)"}`,
    `- **Legal:** ${v.legal_description ?? "?"}`,
    `- **Property ID:** ${v.property_id}  |  **Geo ID:** ${v.geo_id}`,
    `- **TCAD detail page:** ${v.detail_url}`,
  ];
}

function sectionTax(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
  if (!v.found) return [`*No Travis County tax account matched.*`];
  const lines = [
    `- **Account:** ${v.account_id}`,
    `- **Owner:** ${v.owner ?? "?"}`,
    `- **Mailing:** ${v.mailing_address ?? "?"}`,
    `- **${v.current_tax_year} current year:** ${fmtMoney2(v.current_year_due?.total_due ?? 0)}`,
  ];
  if ((v.prior_years_due?.total_due ?? 0) > 0) {
    lines.push(
      `- **Prior years delinquent:** ${fmtMoney2(v.prior_years_due.total_due)}  🔴`
    );
  }
  lines.push(`- **TOTAL DUE:** ${fmtMoney2(v.total_due)}`);
  lines.push(`- **Delinquent:** ${v.is_delinquent ? "**YES**" : "No"}`);
  return lines;
}

function sectionEntities(sec) {
  if (!sec?.ok) return [`*Error: ${sec?.error}*`];
  const v = sec.value;
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
