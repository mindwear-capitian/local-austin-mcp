/**
 * Municode (municode.com) adapter -- full-text search + section fetch for
 * municipal codes hosted on library.municode.com.
 *
 * Austin publishes its Code of Ordinances, Land Development Code, and all the
 * criteria manuals through Municode, and the library site is backed by a
 * public, unauthenticated JSON API at api.municode.com. This adapter wraps the
 * three endpoints we need:
 *
 *   GET /search?clientId=..&contentTypeId=CODES&searchText=..   -- full-text search
 *   GET /Jobs/latest/{productId}                                 -- latest publication job
 *   GET /CodesContent?jobId=..&nodeId=..&productId=..            -- section/chapter text
 *
 * The API is undocumented, so every call goes through retryFetch and the
 * per-product job id is cached (12h) to keep request volume polite.
 */

import { retryFetch } from "./retry.js";
import { cached } from "./cache.js";

const API_BASE = "https://api.municode.com";
const LIBRARY_BASE = "https://library.municode.com";
const UA = "local-austin-mcp (https://github.com/mindwear-capitian/local-austin-mcp)";
const JOB_TTL_MS = 12 * 60 * 60 * 1000;

/**
 * Austin-metro cities hosted on Municode. Client ids verified live 2026-07-10.
 * Lakeway / Bee Cave / Cedar Park / Kyle / Pflugerville use other publishers
 * (American Legal / Franklin Legal) and are NOT reachable through this API.
 */
export const MUNICODE_CITIES = Object.freeze({
  austin: { clientId: 1113, name: "Austin", slug: "austin" },
  leander: { clientId: 2988, name: "Leander", slug: "leander" },
  round_rock: { clientId: 4150, name: "Round Rock", slug: "round_rock" },
  dripping_springs: { clientId: 15829, name: "Dripping Springs", slug: "dripping_springs" },
});

async function apiGet(path, { source }) {
  const url = `${API_BASE}${path}`;
  const res = await retryFetch(
    (signal) =>
      fetch(url, {
        headers: { Accept: "application/json", "User-Agent": UA },
        signal,
      }),
    { source, url }
  );
  if (!res.ok) {
    throw new Error(`${source} returned HTTP ${res.status}`);
  }
  return res.json();
}

/** Strip HTML tags + collapse whitespace from Municode HTML/fragment strings. */
export function stripHtml(s) {
  return String(s || "")
    // Block-level tags become newlines-then-collapsed-space via the HTML's own
    // whitespace; inline tags (<em> around search-hit words) must strip to ""
    // or "SHORT-TERM" turns into "SHORT - TERM".
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** library.municode.com deep link for a search hit / section. */
export function libraryUrl(citySlug, productName, nodeId) {
  const productSlug = String(productName || "code_of_ordinances")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  const base = `${LIBRARY_BASE}/tx/${citySlug}/codes/${productSlug}`;
  return nodeId ? `${base}?nodeId=${encodeURIComponent(nodeId)}` : base;
}

/**
 * Full-text search across ALL code products of one city (Code of Ordinances,
 * Land Development Code, criteria manuals, ...).
 *
 * @returns {Promise<{totalHits:number, hits:Array<{sectionId:string, code:string,
 *   section:string, path:string, snippet:string, url:string}>}>}
 */
export async function municodeSearch(cityKey, q, pageSize = 5) {
  const city = MUNICODE_CITIES[cityKey];
  if (!city) throw new Error(`Unknown Municode city: ${cityKey}`);
  const qs = new URLSearchParams({
    clientId: String(city.clientId),
    contentTypeId: "CODES",
    searchText: q,
    pageNum: "1",
    pageSize: String(pageSize),
    sort: "0",
  });
  const data = await apiGet(`/search?${qs}`, { source: "Municode search" });
  const hits = (data?.Hits || []).map((h) => ({
    // Handle the AI passes back to fetch full text: "<productId>/<nodeId>".
    sectionId: `${h?.Product?.Id}/${h?.NodeId}`,
    code: h?.Product?.Name || "Code of Ordinances",
    section: stripHtml(h?.Title),
    path: (h?.Ancestors || [])
      .slice(1) // drop the product-root ancestor, it repeats `code`
      .map((a) => stripHtml(a?.Title))
      .join(" > "),
    snippet: stripHtml(h?.ContentFragment),
    url: libraryUrl(city.slug, h?.Product?.Name, h?.NodeId),
    source_url: libraryUrl(city.slug, h?.Product?.Name, h?.NodeId),
  }));
  return { totalHits: data?.NumberOfHits ?? hits.length, hits };
}

/** productId -> productName map for a city, cached 12h. Used for deep links. */
async function productNames(city) {
  return cached(`municode:products:${city.clientId}`, JOB_TTL_MS, async () => {
    const data = await apiGet(`/ClientContent/${city.clientId}`, { source: "Municode products" });
    const map = {};
    for (const c of data?.codes || []) map[String(c.productId)] = c.productName;
    return map;
  });
}

/** Latest publication job id for a product, cached 12h. */
async function latestJobId(productId) {
  return cached(`municode:job:${productId}`, JOB_TTL_MS, async () => {
    const job = await apiGet(`/Jobs/latest/${productId}`, { source: "Municode jobs" });
    if (!job?.Id) throw new Error(`Municode: no publication job for product ${productId}`);
    return job.Id;
  });
}

/**
 * Fetch the full text of a section/chapter by the "<productId>/<nodeId>"
 * handle returned from municodeSearch.
 *
 * @returns {Promise<{title:string, text:string, truncated:boolean, url:string}>}
 */
export async function municodeSectionText(cityKey, sectionId, maxChars = 15000) {
  const city = MUNICODE_CITIES[cityKey];
  if (!city) throw new Error(`Unknown Municode city: ${cityKey}`);
  const [productId, nodeId] = String(sectionId).split("/", 2);
  if (!/^\d+$/.test(productId || "") || !nodeId) {
    throw new Error(
      `Invalid section id "${sectionId}" -- expected "<productId>/<nodeId>" as returned by a search result's section_id.`
    );
  }
  const [jobId, names] = await Promise.all([latestJobId(productId), productNames(city)]);
  const qs = new URLSearchParams({ jobId: String(jobId), nodeId, productId });
  const data = await apiGet(`/CodesContent?${qs}`, { source: "Municode content" });
  const docs = data?.Docs || [];
  if (docs.length === 0) {
    throw new Error(`Municode: section "${nodeId}" not found in the current publication.`);
  }
  const title = stripHtml(docs[0]?.Title) || nodeId;
  let text = docs
    .map((d) => {
      const t = stripHtml(d?.Title);
      const body = stripHtml(d?.Content);
      return [t, body].filter(Boolean).join("\n");
    })
    .filter(Boolean)
    .join("\n\n");
  let truncated = false;
  if (text.length > maxChars) {
    text = text.slice(0, maxChars);
    truncated = true;
  }
  const url = libraryUrl(city.slug, names[productId], nodeId);
  return { title, text, truncated, url, source_url: url };
}
