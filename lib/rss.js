/**
 * Tiny RSS 2.0 + Atom parser. Pure regex; no external dependency.
 *
 * Returns: Array<{ title, link, pub_date, description, snippet }>
 *
 * Tradeoffs vs. a real XML parser:
 *   - Cheap, dependency-free, fast.
 *   - Fails gracefully on weird feeds (returns empty array).
 *   - Handles <item> (RSS 2.0) and <entry> (Atom) and CDATA wrapping.
 *
 * The MCP only needs title + link + date + a short snippet, so this is enough.
 */

import { currentSignal, linkAbort } from "./request-context.js";

const UA =
  "local-austin-mcp/1.0 (https://github.com/mindwear-capitian/local-austin-mcp)";

const ITEM_OPEN = /<item\b[^>]*>/i;
const ITEM_BLOCK_RE = /<item\b[^>]*>[\s\S]*?<\/item>/gi;
const ENTRY_BLOCK_RE = /<entry\b[^>]*>[\s\S]*?<\/entry>/gi;

function pickInner(block, tag) {
  // Matches both <tag>text</tag> and <tag ...>text</tag>
  const re = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = block.match(re);
  if (!m) return null;
  return stripCdata(m[1]).trim();
}

function pickAttrLink(block) {
  // Atom: <link href="..."/>  -- pick first href
  const m = block.match(/<link[^>]*href="([^"]+)"/i);
  return m ? m[1] : null;
}

function stripCdata(s) {
  if (!s) return "";
  return String(s)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .trim();
}

function stripHtml(s, max = 280) {
  if (!s) return "";
  let out = String(s)
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#8217;|&#x2019;/g, "'")
    .replace(/&#8220;|&#8221;|&#x201c;|&#x201d;/g, '"')
    .replace(/&#8211;|&#x2013;|&#8212;|&#x2014;/g, " - ")
    .replace(/&hellip;|&#8230;/g, "…")
    .replace(/&#?\w+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (out.length > max) out = out.slice(0, max).trimEnd() + "…";
  return out;
}

function parseDate(s) {
  if (!s) return null;
  const t = new Date(s).getTime();
  return Number.isFinite(t) ? t : null;
}

/**
 * @param {string} xml
 * @param {string} sourceUrl  feed URL (for guessing absolute links)
 * @returns {Array<{title, link, pub_date_iso, pub_date_ts, snippet}>}
 */
export function parseFeed(xml, sourceUrl = "") {
  if (!xml || typeof xml !== "string") return [];

  let blocks = xml.match(ITEM_BLOCK_RE);
  let isAtom = false;
  if (!blocks || blocks.length === 0) {
    blocks = xml.match(ENTRY_BLOCK_RE);
    isAtom = !!blocks;
  }
  if (!blocks) return [];

  return blocks.map((block) => {
    const title = pickInner(block, "title") || "(untitled)";
    let link = pickInner(block, "link");
    if (!link || isAtom) {
      link = pickAttrLink(block) || link;
    }
    const description = pickInner(block, "description")
      || pickInner(block, "content:encoded")
      || pickInner(block, "summary")
      || pickInner(block, "content");
    const pubRaw = pickInner(block, "pubDate")
      || pickInner(block, "updated")
      || pickInner(block, "published")
      || pickInner(block, "dc:date");
    const ts = parseDate(pubRaw);
    return {
      title: stripHtml(title, 200),
      link: link || "",
      pub_date_iso: ts ? new Date(ts).toISOString() : null,
      pub_date_ts: ts,
      snippet: stripHtml(description, 260),
    };
  });
}

/**
 * Fetch a feed URL and parse it. Returns {ok, items, error}.
 *
 * @param {string} url
 * @param {number} timeoutMs
 */
export async function fetchAndParseFeed(url, timeoutMs = 12000) {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), timeoutMs);
  const unlink = linkAbort(ac, currentSignal());
  try {
    const res = await fetch(url, {
      headers: { Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml", "User-Agent": UA },
      signal: ac.signal,
    });
    if (!res.ok) {
      return { ok: false, items: [], error: `HTTP ${res.status}` };
    }
    const xml = await res.text();
    if (!ITEM_OPEN.test(xml) && !/<entry\b/i.test(xml)) {
      return { ok: false, items: [], error: "no_items_in_feed" };
    }
    return { ok: true, items: parseFeed(xml, url) };
  } catch (err) {
    return { ok: false, items: [], error: String(err?.message ?? err).slice(0, 120) };
  } finally {
    clearTimeout(t);
    unlink();
  }
}
