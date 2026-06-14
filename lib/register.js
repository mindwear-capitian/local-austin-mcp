/**
 * Central tool registration helper.
 *
 * One place to apply all cross-cutting concerns to every tool:
 *   - Default MCP tool annotations (read-only, idempotent, open-world)
 *   - try/catch wrapper that turns thrown errors into friendly MCP error frames
 *   - Auto-promotion of a second `text` content block (raw JSON) into
 *     `structuredContent` per MCP 2025+ best practice
 *   - Tier gating (LOCAL_AUSTIN_MCP_TIER=core|all, default all)
 *   - Optional `outputSchema` registration
 *   - Optional name remap (the rename map in index.js)
 *
 * Tool authors export plain objects:
 *
 *   export const myTool = {
 *     name: "austin_foo",
 *     description: "...",
 *     inputSchema: { ... zod shape ... },
 *     outputSchema: { ... optional zod shape ... },
 *     annotations: { ... optional per-tool overrides ... },
 *     tier: "core" | "advanced",      // default "advanced"
 *     async handler(input, ctx) { ... }
 *   };
 *
 * Handler return shape stays the existing pattern:
 *   { content: [{type:"text", text: human}, {type:"text", text: jsonStr}], isError? }
 *
 * The wrapper will, when content[1] is parseable JSON, promote it to
 * `structuredContent` and drop the second text block from `content`.
 */

import { ZodError } from "zod";
import { upstreamErrorText } from "./retry.js";
import { CORE_TOOL_NAMES, tierFromEnv } from "./tiers.js";
import { runWithContext } from "./request-context.js";
import { log } from "./logger.js";
import { ATTRIBUTION_TAG } from "./attribution.js";

/**
 * Tools default to read-only, idempotent, open-world (external data). Per-tool
 * `annotations` override merges on top.
 */
const DEFAULT_ANNOTATIONS = Object.freeze({
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
});

/**
 * @param {object} tool         Tool def (see top of file).
 * @param {string} name         Public name to register under (may be remapped).
 * @returns {Function}          Handler suitable for server.registerTool.
 */
export function wrapHandler(tool, name) {
  return async (input, ctx) => {
    // Open a per-request AsyncLocalStorage scope so downstream fetch clients
    // (sodaQuery, vowPublicGet, retryFetch, ...) can honor the MCP-provided
    // AbortSignal without every helper accepting a `signal` arg explicitly.
    const requestCtx = {
      signal: ctx?.signal,
      requestId: ctx?.requestId,
      sessionId: ctx?.sessionId,
      sendNotification: ctx?.sendNotification,
    };
    return runWithContext(requestCtx, async () => {
      try {
        const raw = await tool.handler(input, ctx);
        return normalizeResult(raw);
      } catch (err) {
        if (err instanceof ZodError) {
          const issues = err.issues
            .map((i) => `- ${i.path.join(".") || "(root)"}: ${i.message}`)
            .join("\n");
          const text =
            `# ${name}: input validation failed\n\nThe arguments you passed did not match the tool's input schema.\n\n${issues}\n\nFix the arguments and call again.\n\n${ATTRIBUTION_TAG}`;
          log.warn(`tool ${name} validation failed`, err.issues);
          return {
            content: [{ type: "text", text }],
            isError: true,
            structuredContent: { error: "validation_failed", issues: err.issues },
          };
        }
        log.warn(`tool ${name} failed`, err?.upstream?.kind || err?.message || err);
        const text = `${upstreamErrorText(err, { toolName: name })}\n\n${ATTRIBUTION_TAG}`;
        return {
          content: [{ type: "text", text }],
          isError: true,
        };
      }
    });
  };
}

/**
 * If the tool returned two text content blocks and the second parses as JSON,
 * promote it to `structuredContent` and keep only the human-readable first
 * block in `content`. Otherwise return the result unchanged.
 *
 * This preserves the current tool implementations while moving them to the
 * modern MCP shape.
 */
export function normalizeResult(result) {
  if (!result || !Array.isArray(result.content)) return result;

  // Already structured -- nothing to do.
  if (result.structuredContent !== undefined) return result;

  // Look for [text(human), text(jsonString)] pattern.
  if (
    result.content.length === 2 &&
    result.content[0]?.type === "text" &&
    result.content[1]?.type === "text" &&
    typeof result.content[1].text === "string"
  ) {
    const maybeJson = result.content[1].text.trim();
    if (maybeJson.startsWith("{") || maybeJson.startsWith("[")) {
      try {
        const parsed = JSON.parse(maybeJson);
        return {
          ...result,
          content: [result.content[0]],
          structuredContent: parsed,
        };
      } catch (_) {
        // Not JSON after all -- leave content as-is.
      }
    }
  }
  return result;
}

/**
 * Decide whether a tool should be registered given the active tier and the
 * tool's final public name.
 *
 *   LOCAL_AUSTIN_MCP_TIER=core  -> register only names in CORE_TOOL_NAMES
 *   LOCAL_AUSTIN_MCP_TIER=all   -> register everything (default)
 */
export function shouldRegister(publicName) {
  const tier = tierFromEnv();
  if (tier !== "core") return true;
  return CORE_TOOL_NAMES.has(publicName);
}

/**
 * Register one tool against an McpServer instance, applying all cross-cutting
 * concerns. `rename` lets the caller publish a different public name.
 */
export function registerTool(server, tool, { rename } = {}) {
  const publicName = rename || tool.name;
  if (!shouldRegister(publicName)) return false;

  const options = {
    description: tool.description,
    inputSchema: tool.inputSchema,
    annotations: {
      ...DEFAULT_ANNOTATIONS,
      title: tool.annotations?.title || humanizeName(publicName),
      ...(tool.annotations || {}),
    },
  };

  // `null` is a deliberate "skip outputSchema" sentinel (see lib/output-schemas.js).
  if (tool.outputSchema) {
    options.outputSchema = tool.outputSchema;
  }

  server.registerTool(publicName, options, wrapHandler(tool, publicName));
  return true;
}

function humanizeName(name) {
  return name
    .split("_")
    .map((s) => (s.length <= 3 ? s.toUpperCase() : s[0].toUpperCase() + s.slice(1)))
    .join(" ");
}
