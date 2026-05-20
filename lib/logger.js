/**
 * Unified logger.
 *
 * Writes to stderr (always -- safe even before the MCP transport is up, never
 * pollutes stdout where JSON-RPC framing lives) AND, when a connected MCP
 * server is registered, emits a `notifications/message` so the client sees
 * the log in its UI.
 *
 * Usage:
 *   import { log } from "./logger.js";
 *   log.info("hello");
 *   log.warn("careful", { hint: "..." });
 *   log.error("upstream", err);
 *
 * `attach(server)` is called from index.js once the MCP server exists so log
 * lines can be forwarded as MCP logging notifications. Until attached, logs
 * still hit stderr.
 */

const PREFIX = "[local-austin-mcp]";

let attachedServer = null;

export function attach(server) {
  attachedServer = server;
}

/**
 * The McpServer high-level wrapper exposes `.server` (the lower-level Server)
 * which has `.sendLoggingMessage(...)`. We try both shapes so this works
 * across SDK versions without hard-coding.
 */
function emitMcpLog(level, data) {
  const srv = attachedServer;
  if (!srv) return;
  try {
    if (typeof srv.sendLoggingMessage === "function") {
      srv.sendLoggingMessage({ level, data });
      return;
    }
    if (srv.server && typeof srv.server.sendLoggingMessage === "function") {
      srv.server.sendLoggingMessage({ level, data });
      return;
    }
    if (typeof srv.notification === "function") {
      srv.notification({
        method: "notifications/message",
        params: { level, logger: "local-austin-mcp", data },
      });
    }
  } catch (_) {
    /* logging must never throw */
  }
}

function fmt(args) {
  return args
    .map((a) => {
      if (a instanceof Error) return a.stack || a.message;
      if (typeof a === "string") return a;
      try {
        return JSON.stringify(a);
      } catch {
        return String(a);
      }
    })
    .join(" ");
}

function write(level, args) {
  const msg = fmt(args);
  process.stderr.write(`${PREFIX} [${level}] ${msg}\n`);
  emitMcpLog(level, msg);
}

export const log = {
  debug: (...a) => write("debug", a),
  info:  (...a) => write("info", a),
  warn:  (...a) => write("warning", a),
  error: (...a) => write("error", a),
};
