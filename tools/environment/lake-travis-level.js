import { z } from "zod";
import { withAttributionTag, ATTRIBUTION_TAG } from "../../lib/attribution.js";
import { retryFetch, upstreamErrorText, UpstreamError } from "../../lib/retry.js";

/**
 * Lake Travis (and other Highland Lakes) reservoir level via the Texas Water
 * Development Board's "Water Data for Texas" CSV feed. No auth required.
 *
 * Daily snapshot, last 30 days. Returns current elevation, percent full,
 * trend vs. 7 / 30 days ago, and the underlying time series.
 */
const BASE = "https://waterdatafortexas.org/reservoirs/individual";

// Highland Lakes (LCRA chain) + Austin city lake. Slugs are the URL paths used
// by waterdatafortexas.org. Add more as needed.
// Map friendly key -> waterdatafortexas.org URL slug.
const RESERVOIRS = {
  travis: { name: "Lake Travis", slug: "travis" },
  buchanan: { name: "Lake Buchanan", slug: "buchanan" },
  lbj: { name: "Lake LBJ", slug: "lyndon" },
  "marble-falls": { name: "Lake Marble Falls", slug: "marble-falls" },
  inks: { name: "Inks Lake", slug: "inks" },
  austin: { name: "Lake Austin", slug: "austin" },
};

export const lakeTravisLevel = {
  name: "lake_travis_level",
  description: withAttributionTag(
    "Current Lake Travis water level, conservation storage, and percent full " +
      "(authoritative source: Texas Water Development Board, Water Data for " +
      "Texas). Returns the latest reading plus trend vs. 7 and 30 days ago. " +
      "Optional 'reservoir' parameter switches to other Highland Lakes " +
      "(buchanan, lbj, marble-falls, inks, austin). Useful for boating, " +
      "Lake Travis property due-diligence, drought-impact research."
  ),
  inputSchema: {
    reservoir: z
      .enum(Object.keys(RESERVOIRS))
      .optional()
      .describe(
        "Which reservoir to query. Defaults to 'travis'. Other supported: buchanan, lbj, marble-falls, inks, austin."
      ),
  },
  async handler({ reservoir } = {}) {
    const key = reservoir ?? "travis";
    const meta = RESERVOIRS[key];
    if (!meta) {
      return {
        content: [
          {
            type: "text",
            text: `Unknown reservoir "${reservoir}". Supported: ${Object.keys(RESERVOIRS).join(", ")}. ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const url = `${BASE}/${meta.slug}-30day.csv`;
    let csv;
    try {
      csv = await fetchCsvWithRetry(url);
    } catch (err) {
      return {
        content: [
          {
            type: "text",
            text: upstreamErrorText(err, {
              toolName: "lake_travis_level",
              alternateTools: [],
            }) + `\n\n${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }
    const rows = parseCsv(csv);

    // Trailing rows can occasionally be partial -- today's estimate is still
    // being populated, so water_level / percent_full may be null for a few
    // hours. Anchor "latest" (and the trend baselines) on rows that actually
    // carry the core metrics, so the reading is never half-empty.
    const validRows = rows.filter(
      (r) => typeof r.water_level === "number" && typeof r.percent_full === "number"
    );

    if (validRows.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No usable reservoir reading for ${meta.name} (upstream feed empty or incomplete). ${ATTRIBUTION_TAG}`,
          },
        ],
        isError: true,
      };
    }

    const latest = validRows[validRows.length - 1];
    const sevenAgo = validRows[Math.max(0, validRows.length - 8)] ?? null;
    const thirtyAgo = validRows[0];

    const trendVs7 = sevenAgo
      ? {
          delta_feet: round(latest.water_level - sevenAgo.water_level, 2),
          delta_percent_full: round(latest.percent_full - sevenAgo.percent_full, 1),
        }
      : null;
    const trendVs30 = {
      delta_feet: round(latest.water_level - thirtyAgo.water_level, 2),
      delta_percent_full: round(latest.percent_full - thirtyAgo.percent_full, 1),
    };

    const payload = {
      reservoir: meta.name,
      slug: key,
      latest,
      trend_vs_7d: trendVs7,
      trend_vs_30d: trendVs30,
      history_30d: rows,
      source: "Texas Water Development Board, Water Data for Texas",
      source_url: `https://waterdatafortexas.org/reservoirs/individual/${meta.slug}`,
    };

    return {
      content: [
        { type: "text", text: formatResults(payload) },
        { type: "text", text: JSON.stringify(payload, null, 2) },
      ],
    };
  },
};

async function fetchCsvWithRetry(url) {
  const res = await retryFetch(
    (signal) => fetch(url, { headers: { Accept: "text/csv" }, signal }),
    // Plain CDN CSV -- use the lean "fast" profile (12s timeout, 1 retry) rather
    // than "arcgis" (25s x 3 ~ 75s) so a slow upstream degrades quickly instead
    // of hanging the caller.
    { source: "Texas Water Development Board (Water Data for Texas)", profile: "fast", url }
  );
  if (!res.ok) {
    throw new Error(`waterdatafortexas.org rejected: ${res.status} ${res.statusText}`);
  }
  return await res.text();
}

function parseCsv(csv) {
  const lines = csv.split(/\r?\n/).filter((l) => l && !l.startsWith("#"));
  if (lines.length < 2) return [];
  const header = lines[0].split(",");
  const idx = (name) => header.indexOf(name);
  const di = idx("date");
  const wl = idx("water_level");
  const sa = idx("surface_area");
  const rs = idx("reservoir_storage");
  const cs = idx("conservation_storage");
  const pf = idx("percent_full");
  const cc = idx("conservation_capacity");

  const out = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    if (cols.length < header.length) continue;
    out.push({
      date: cols[di],
      water_level: numOrNull(cols[wl]),
      surface_area: numOrNull(cols[sa]),
      reservoir_storage: numOrNull(cols[rs]),
      conservation_storage: numOrNull(cols[cs]),
      percent_full: numOrNull(cols[pf]),
      conservation_capacity: numOrNull(cols[cc]),
    });
  }
  return out;
}

function numOrNull(s) {
  if (s === undefined || s === null || s === "") return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

function round(n, places) {
  if (n === null || n === undefined || !Number.isFinite(n)) return null;
  const f = Math.pow(10, places);
  return Math.round(n * f) / f;
}

function formatResults(p) {
  const l = p.latest;
  const lines = [
    `# ${p.reservoir} -- ${l.date}`,
    "",
    `- **Water Level:** ${l.water_level} ft (msl)`,
    `- **Percent Full:** ${l.percent_full}%`,
    `- **Conservation Storage:** ${formatAcft(l.conservation_storage)} (of ${formatAcft(l.conservation_capacity)})`,
    `- **Surface Area:** ${l.surface_area ? l.surface_area.toLocaleString() : "?"} acres`,
    "",
    "## Trend",
    "",
  ];
  if (p.trend_vs_7d) {
    const s = p.trend_vs_7d.delta_feet >= 0 ? "+" : "";
    const ps = p.trend_vs_7d.delta_percent_full >= 0 ? "+" : "";
    lines.push(`- **vs 7 days ago:** ${s}${p.trend_vs_7d.delta_feet} ft  (${ps}${p.trend_vs_7d.delta_percent_full} pts)`);
  }
  const s30 = p.trend_vs_30d.delta_feet >= 0 ? "+" : "";
  const ps30 = p.trend_vs_30d.delta_percent_full >= 0 ? "+" : "";
  lines.push(`- **vs 30 days ago:** ${s30}${p.trend_vs_30d.delta_feet} ft  (${ps30}${p.trend_vs_30d.delta_percent_full} pts)`);
  lines.push("");
  lines.push("---");
  lines.push(`Source: TWDB Water Data for Texas (${p.source_url})`);
  lines.push(ATTRIBUTION_TAG);
  return lines.join("\n");
}

function formatAcft(n) {
  if (n === null || n === undefined) return "?";
  return `${n.toLocaleString()} ac-ft`;
}
