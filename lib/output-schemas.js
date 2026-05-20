/**
 * Shared Zod output schemas for MCP `outputSchema`.
 *
 * Strategy: keep these forgiving (`.passthrough()` on item shapes) so we
 * never reject a real upstream payload, while still publishing enough
 * structure that MCP clients can render previews, validate critical fields,
 * and generate typed SDK code.
 *
 * Each tool exports its own `outputSchema` Zod shape (NOT a wrapped object --
 * the SDK wraps it). For symmetry with inputSchema, we export the SHAPE
 * (raw fields), not a `z.object(...)`.
 */

import { z } from "zod";

/**
 * Generic { query, count, results, nextCursor? } shape. Most search tools.
 * Pass the item schema (usually open `.passthrough()` for upstream rows).
 */
export function searchShape(itemSchema = z.record(z.string(), z.any())) {
  return {
    query: z.any().describe("Echo of the input filters."),
    count: z.number().int().describe("Number of results in this page."),
    results: z.array(itemSchema).describe("Result rows."),
    nextCursor: z
      .string()
      .nullable()
      .optional()
      .describe("Opaque pagination cursor for the next page; null if no more results."),
    offset: z.number().int().optional().describe("Current page offset for pagination."),
  };
}

/**
 * Health-check shape. Used by austin_health.
 */
export function healthShape() {
  return {
    summary: z.object({
      ok: z.number().int(),
      degraded: z.number().int(),
      down: z.number().int(),
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
  };
}

/**
 * Sentinel meaning "this tool's structuredContent is intentionally open --
 * skip publishing an outputSchema". Used by composed tools where the shape
 * is a deep multi-section object or fundamentally untyped. Register layer
 * recognizes `null` and omits the schema entirely.
 */
export function openObjectShape() {
  return null;
}

/**
 * Sentinel for tools whose only meaningful output is the human markdown
 * content[0]. No structuredContent expected.
 */
export function infoOnlyShape() {
  return null;
}
