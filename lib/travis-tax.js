/**
 * Travis County Tax Office client (go2gov.net backend).
 *
 * Two-step flow:
 *   1) POST /cart/responsive/quickSearch.do with the address -> HTML w/ accounts
 *   2) GET  /showPropertyInfo.do?account=NNNN -> HTML w/ ownership + tax due
 *
 * No public JSON API exists. Cookie session is required (the search form
 * sets JSESSIONID on first GET). HTML structure has been stable for years
 * but if it changes, the regexes below need updating.
 */

const BASE = "https://travis.go2gov.net";
const SEARCH_FORM = `${BASE}/cart/responsive/search.do`;
const SEARCH_POST = `${BASE}/cart/responsive/quickSearch.do`;
const DETAIL = `${BASE}/showPropertyInfo.do`;
const ENTITY_DETAIL = `${BASE}/showPropertyEntityDetail.do`;

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 " +
  "(KHTML, like Gecko) Chrome/124.0 Safari/537.36 LocalAustinMCP/0.1";

/**
 * Establish a session and return a cookie string we can reuse on subsequent
 * requests within this call. Travis go2gov requires a session before search.
 */
async function newSession() {
  const res = await fetch(SEARCH_FORM, {
    method: "GET",
    headers: { "User-Agent": UA, Accept: "text/html" },
    redirect: "follow",
  });
  // We only need set-cookie for JSESSIONID
  const setCookies = res.headers.getSetCookie?.() ?? [];
  const fromHeader = res.headers.get("set-cookie");
  const cookieParts = [];
  for (const c of setCookies) cookieParts.push(c.split(";")[0]);
  if (fromHeader && cookieParts.length === 0) {
    cookieParts.push(fromHeader.split(";")[0]);
  }
  if (cookieParts.length === 0) {
    throw new Error("Travis tax: no session cookie issued");
  }
  return cookieParts.join("; ");
}

/**
 * Search accounts by free-text address. Returns up to `limit` matches.
 *
 * @param {string} address - Street + number works best. Avoid city/zip.
 * @param {object} [opts]
 * @param {number} [opts.limit=10]
 * @returns {Promise<Array<{account_id: string, address: string, detail_url: string}>>}
 */
export async function searchAccounts(address, opts = {}) {
  const { limit = 10 } = opts;
  if (!address || address.trim().length < 3) {
    throw new Error("Travis tax: address must be at least 3 characters");
  }

  const cookie = await newSession();

  // Heuristic search returns fuzzy matches across street names. To improve
  // precision, when the address parses as "<number> <street>" we also pass
  // criteria.streetNumber and criteria.streetName for a tighter match.
  const params = {
    displayForm: "criteria",
    formViewMode: "advanced",
    "criteria.searchStatus": "A",
    "pager.pageSize": String(Math.min(Math.max(limit, 1), 50)),
    "pager.pageNumber": "0",
    "criteria.heuristicSearch": address.trim().toUpperCase(),
  };
  const numberStreet = /^\s*(\d+)\s+(.+?)\s*$/.exec(address.trim());
  if (numberStreet) {
    params["criteria.streetNumber"] = numberStreet[1];
    // Strip common suffixes for a looser street-name match
    const street = numberStreet[2]
      .toUpperCase()
      .replace(/\s+(DR|DRIVE|ST|STREET|RD|ROAD|AVE|AVENUE|BLVD|BOULEVARD|LN|LANE|CT|COURT|PASS|HOLW|TRL|TRAIL|WAY|PL|PLACE|PKWY|HWY|CIR|CIRCLE|TER)\s*\.?$/i, "");
    params["criteria.streetName"] = street.split(/\s+/)[0];
  }
  const body = new URLSearchParams(params);

  const res = await fetch(SEARCH_POST, {
    method: "POST",
    headers: {
      "User-Agent": UA,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "text/html",
      Cookie: cookie,
    },
    body,
  });

  if (!res.ok) {
    throw new Error(`Travis tax search failed: ${res.status} ${res.statusText}`);
  }

  const html = await res.text();
  return parseSearchResults(html);
}

/**
 * Get full property tax detail for an account ID (from searchAccounts).
 *
 * @param {string} accountId - 14-digit account, e.g. "04125304130000"
 * @returns {Promise<object>} normalized detail
 */
export async function getAccountDetail(accountId) {
  if (!/^\d{10,16}$/.test(accountId)) {
    throw new Error(`Travis tax: invalid account id "${accountId}"`);
  }
  const cookie = await newSession();

  const res = await fetch(`${DETAIL}?account=${encodeURIComponent(accountId)}`, {
    method: "GET",
    headers: {
      "User-Agent": UA,
      Accept: "text/html",
      Cookie: cookie,
    },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `Travis tax detail failed: ${res.status} ${res.statusText} for account ${accountId}`
    );
  }

  const html = await res.text();
  return parseAccountDetail(html, accountId);
}

/**
 * Get the per-entity tax breakdown for an account in a given year. Returns
 * one row per taxing unit (ISD, County, City, MUD, PID, ESD, hospital
 * district, community college, etc.) -- this is the canonical list of
 * special-purpose districts that apply to a property.
 *
 * @param {string} accountId
 * @param {number} [year=current_year]
 */
export async function getEntityDetail(accountId, year) {
  if (!/^\d{10,16}$/.test(accountId)) {
    throw new Error(`Travis tax: invalid account id "${accountId}"`);
  }
  // Travis Tax only certifies the prior year's bill in October. If we ask for
  // the current year before October, the entity page is blank. Default to
  // the most-recently-certified year (current year if Oct+ else current-1).
  const now = new Date();
  const fallbackYear = now.getMonth() >= 9 ? now.getFullYear() : now.getFullYear() - 1;
  const taxYear = year ?? fallbackYear;
  const cookie = await newSession();

  const url = `${ENTITY_DETAIL}?account=${encodeURIComponent(accountId)}&year=${taxYear}`;
  const res = await fetch(url, {
    method: "GET",
    headers: { "User-Agent": UA, Accept: "text/html", Cookie: cookie },
    redirect: "follow",
  });

  if (!res.ok) {
    throw new Error(
      `Travis tax entity detail failed: ${res.status} ${res.statusText}`
    );
  }

  const html = await res.text();
  return parseEntityDetail(html, accountId, taxYear);
}

function parseEntityDetail(html, accountId, year) {
  // Same table-anchored approach as parseAccountDetail. The entity table is
  // the only one with header "Taxing Unit".
  const tableMatch = /<table[\s\S]*?<thead[\s\S]*?Taxing Unit[\s\S]*?<\/table>/i.exec(html);
  if (!tableMatch) {
    return {
      account_id: accountId,
      tax_year: year,
      entities: [],
      total_due: 0,
      detail_url: `${ENTITY_DETAIL}?account=${accountId}&year=${year}`,
      source: "Travis County Tax Office (go2gov.net) -- Property Entity Detail",
      source_url: "https://tax-office.traviscountytx.gov",
    };
  }
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableMatch[0]);
  if (!tbodyMatch) {
    return { account_id: accountId, tax_year: year, entities: [], total_due: 0 };
  }
  const rowMatches = [...tbodyMatch[1].matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/gi)];
  const entities = [];
  for (const rm of rowMatches) {
    const cells = [...rm[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
      m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
    );
    if (cells.length < 7) continue;
    entities.push({
      name: cells[0],
      type: classifyEntity(cells[0]),
      assessed_value: parseMoney(cells[1]),
      net_taxable_value: parseMoney(cells[2]),
      base_due: parseMoney(cells[3]),
      penalty_interest: parseMoney(cells[4]),
      attorney_other_fees: parseMoney(cells[5]),
      total_due: parseMoney(cells[6]),
    });
  }
  const total_due = round2(entities.reduce((s, e) => s + (e.total_due ?? 0), 0));
  return {
    account_id: accountId,
    tax_year: year,
    entity_count: entities.length,
    entities,
    has_mud: entities.some((e) => e.type === "MUD"),
    has_pid: entities.some((e) => e.type === "PID"),
    total_due,
    detail_url: `${ENTITY_DETAIL}?account=${accountId}&year=${year}`,
    source: "Travis County Tax Office (go2gov.net) -- Property Entity Detail",
    source_url: "https://tax-office.traviscountytx.gov",
  };
}

function classifyEntity(name) {
  const u = (name || "").toUpperCase();
  if (/MUNICIPAL UTILITY DISTRICT|\bMUD\b/.test(u)) return "MUD";
  if (/PUBLIC IMPROVEMENT DISTRICT|\bPID\b/.test(u)) return "PID";
  if (/EMERGENCY SERVICES|\bESD\b/.test(u)) return "ESD";
  if (/MANAGEMENT DISTRICT|\bMMD\b/.test(u)) return "MMD";
  if (/WATER CONTROL|\bWCID\b/.test(u)) return "WCID";
  if (/\bISD\b|SCHOOL/.test(u)) return "ISD";
  if (/^CITY OF|\bCITY\b/.test(u)) return "City";
  if (/^TRAVIS COUNTY( |$)/.test(u) && !/CENTRAL|HEALTH|ESD/.test(u)) return "County";
  if (/CENTRAL HEALTH|HOSPITAL DISTRICT/.test(u)) return "Hospital";
  if (/COMMUNITY COLLEGE|\bACC\b/.test(u)) return "Community College";
  return "Other";
}

// ---------------------------------------------------------------------------
// HTML parsing helpers
//
// Targeted, label-anchored regex against the go2gov rendered template.
// HTML changes rarely but if it does, fix here.
// ---------------------------------------------------------------------------

function parseSearchResults(html) {
  const results = [];
  // Each search row contains a `showPropertyInfo.do?account=NNNN` link plus a
  // `situsStreetNumber` and `situsStreetName` hidden input pair scoped to
  // `item[N]`.
  const rowRe =
    /href="\/showPropertyInfo\.do\?account=(\d{10,16})"[^]*?name="item\[\d+\]\.situsStreetNumber"\s+value="([^"]*?)"[^]*?name="item\[\d+\]\.situsStreetName"\s+value="([^"]*?)"/g;
  let m;
  while ((m = rowRe.exec(html)) !== null) {
    const account = m[1];
    const num = (m[2] ?? "").trim();
    const street = (m[3] ?? "").trim();
    const addr = `${num} ${street}`.trim();
    results.push({
      account_id: account,
      address: addr || null,
      detail_url: `${DETAIL}?account=${account}`,
    });
  }
  return results;
}

function parseAccountDetail(html, accountId) {
  const ownerName = labeledFieldThree(html, "Owner Name");
  const mailing = labeledFieldThree(html, "Mailing Address")
    ?.replace(/<br\s*\/?>/gi, ", ")
    .replace(/\s+/g, " ")
    .trim();
  const legal = labeledFieldThree(html, "Legal Description")
    ?.replace(/<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim();

  const currentYearTable = sectionTable(html, /(\d{4}) Tax Year Taxes Due/, "current");
  const priorYearTable = sectionTable(html, /Previous Tax Year Taxes Due/, "prior");

  const currentDue = parseDueRow(currentYearTable.tableHtml);
  const priorDue = parseDueRow(priorYearTable.tableHtml);

  const totalDue =
    (currentDue?.total_due ?? 0) + (priorDue?.total_due ?? 0);

  const isDelinquent = (priorDue?.total_due ?? 0) > 0;

  return {
    account_id: accountId,
    owner: ownerName,
    mailing_address: mailing,
    legal_description: legal,
    current_tax_year: currentYearTable.year ?? null,
    current_year_due: currentDue,
    prior_years_due: priorDue,
    total_due: round2(totalDue),
    is_delinquent: isDelinquent,
    detail_url: `${DETAIL}?account=${accountId}`,
    source: "Travis County Tax Office (go2gov.net)",
    source_url: "https://tax-office.traviscountytx.gov",
  };
}

function labeledFieldThree(html, labelText) {
  const re = new RegExp(
    `<div class="three columns">\\s*<label>${escapeRe(labelText)}<\\/label>\\s*([\\s\\S]*?)<\\/div>`,
    "i"
  );
  const m = re.exec(html);
  if (!m) return null;
  let val = m[1];
  // Strip <a> wrapper if present (Account# label has one)
  val = val.replace(/<a\s+[^>]*>([^<]*)<\/a>/gi, "$1");
  return val.replace(/\s+/g, " ").trim();
}

function sectionTable(html, headerRe, kind) {
  const headerMatch = headerRe.exec(html);
  if (!headerMatch) return { tableHtml: null, year: null };
  const startIdx = headerMatch.index + headerMatch[0].length;
  const tableMatch = /<table[\s\S]*?<\/table>/.exec(html.slice(startIdx));
  if (!tableMatch) return { tableHtml: null, year: null };
  const year = headerMatch[1] ?? null;
  return { tableHtml: tableMatch[0], year };
}

function parseDueRow(tableHtml) {
  if (!tableHtml) return null;
  // Pull the first <tr> in <tbody>
  const tbodyMatch = /<tbody[^>]*>([\s\S]*?)<\/tbody>/i.exec(tableHtml);
  if (!tbodyMatch) return null;
  const trMatch = /<tr[^>]*>([\s\S]*?)<\/tr>/i.exec(tbodyMatch[1]);
  if (!trMatch) return null;
  const cells = [...trMatch[1].matchAll(/<td[^>]*>([\s\S]*?)<\/td>/gi)].map((m) =>
    m[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim()
  );
  if (cells.length < 5) return null;
  return {
    label: cells[0],
    base_due: parseMoney(cells[1]),
    penalty_interest: parseMoney(cells[2]),
    attorney_other_fees: parseMoney(cells[3]),
    total_due: parseMoney(cells[4]),
  };
}

function parseMoney(s) {
  if (!s) return 0;
  const cleaned = s.replace(/[$,]/g, "").trim();
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
