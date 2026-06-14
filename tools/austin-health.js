/**
 * austin_health -- one-shot diagnostic of every upstream data source.
 *
 * Pings each provider in parallel with a short timeout and reports
 * { source, status, latency_ms, last_error } per row. Cheap signal for the
 * LLM (and humans) when something is broken upstream so the client can
 * route around it.
 *
 * Does NOT call any tool. Hits provider home / token / metadata endpoints
 * directly to avoid skewing health by tool-specific query bugs.
 */

import { z } from "zod";
import { ATTRIBUTION_TAG } from "../lib/attribution.js";

const TIMEOUT_MS = 3500;

const CHECKS = [
  {
    source: "TCAD (True Prodigy)",
    url: "https://prod-container.trueprodigyapi.com/trueprodigy/cadpublic/auth/token",
    init: { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ office: "Travis" }) },
  },
  {
    source: "SODA data.austintexas.gov",
    url: "https://data.austintexas.gov/resource/3syk-w9eu.json?$limit=1",
  },
  {
    source: "SODA datahub.austintexas.gov",
    url: "https://datahub.austintexas.gov/resource/xwdj-i9he.json?$limit=1",
  },
  {
    source: "ArcGIS FEMA NFHL",
    url: "https://hazards.fema.gov/arcgis/rest/services/public/NFHL/MapServer?f=json",
  },
  {
    source: "ArcGIS WCAD",
    url: "https://maps.wcad.org/arcgis/rest/services/WCAD/PublicSearch/FeatureServer/0?f=json",
  },
  {
    source: "ArcGIS Hays CAD",
    url: "https://maps.hayscad.com/arcgis/rest/services/Public/MapServer?f=json",
  },
  {
    source: "U.S. Census geocoder",
    url: "https://geocoding.geo.census.gov/geocoder/locations/onelineaddress?address=Texas&benchmark=Public_AR_Current&format=json",
  },
  {
    source: "NWS api.weather.gov",
    url: "https://api.weather.gov/alerts/active?area=TX&limit=1",
  },
  {
    source: "Travis County Tax (go2gov)",
    url: "https://travis.go2gov.net/cart/responsive/search.do",
    init: { method: "GET", headers: { Accept: "text/html" } },
  },
  {
    source: "Neuhaus VOW public",
    url: (process.env.VOW_PUBLIC_BASE || "https://vow-api.re-workflow.com/public") + "/listings?city=Austin",
  },
];

async function probe(check) {
  const started = Date.now();
  const ac = new AbortController();
  const tid = setTimeout(() => ac.abort(new Error("timeout")), TIMEOUT_MS);
  try {
    const res = await fetch(check.url, { ...(check.init || {}), signal: ac.signal });
    const latency_ms = Date.now() - started;
    if (res.ok) return { source: check.source, status: "ok", http: res.status, latency_ms, last_error: null };
    if (res.status === 400 || res.status === 401 || res.status === 403) {
      // Endpoint reachable but rejected our probe — provider is UP.
      return { source: check.source, status: "ok", http: res.status, latency_ms, last_error: null };
    }
    return { source: check.source, status: res.status >= 500 ? "down" : "degraded", http: res.status, latency_ms, last_error: `${res.status} ${res.statusText}` };
  } catch (err) {
    const latency_ms = Date.now() - started;
    const msg = String(err?.message || err);
    const kind = msg.includes("timeout") || msg.includes("aborted") ? "timeout" : "network";
    return { source: check.source, status: kind === "timeout" ? "degraded" : "down", http: null, latency_ms, last_error: msg.slice(0, 160) };
  } finally {
    clearTimeout(tid);
  }
}

export const austinHealth = {
  name: "austin_health",
  description:
    "Diagnostic. Pings every upstream data provider this MCP depends on " +
    "(TCAD, WCAD, HCAD, SODA, FEMA, Census, NWS, Travis Tax Office, Neuhaus VOW) " +
    "in parallel with a 3.5s timeout and reports per-source status, HTTP code, " +
    "and latency. Use when many tools are returning errors and you want to know " +
    "which provider is down vs which tool is broken.",
  inputSchema: {},
  tier: "core",
  outputSchema: {
    summary: z.object({
      ok: z.number(),
      degraded: z.number(),
      down: z.number(),
      checked_at: z.string(),
    }),
    checks: z.array(
      z.object({
        source: z.string(),
        status: z.enum(["ok", "degraded", "down"]),
        http: z.number().int().nullable(),
        latency_ms: z.number().int(),
        last_error: z.string().nullable(),
      })
    ),
  },
  annotations: { title: "Upstream Health Check" },
  async handler() {
    const checks = await Promise.all(CHECKS.map(probe));
    const summary = {
      ok: checks.filter((c) => c.status === "ok").length,
      degraded: checks.filter((c) => c.status === "degraded").length,
      down: checks.filter((c) => c.status === "down").length,
      checked_at: new Date().toISOString(),
    };

    const lines = [
      `# Upstream Health -- ${summary.checked_at}`,
      ``,
      `**${summary.ok} OK** / ${summary.degraded} degraded / ${summary.down} down`,
      ``,
      `| Source | Status | HTTP | Latency | Error |`,
      `|---|---|---|---|---|`,
    ];
    for (const c of checks) {
      const badge = c.status === "ok" ? "OK" : c.status === "degraded" ? "DEGRADED" : "DOWN";
      lines.push(
        `| ${c.source} | ${badge} | ${c.http ?? "—"} | ${c.latency_ms}ms | ${c.last_error ?? "—"} |`
      );
    }

    lines.push("", ATTRIBUTION_TAG);

    return {
      content: [{ type: "text", text: lines.join("\n") }],
      structuredContent: { summary, checks },
    };
  },
};
