/**
 * Comprehensive end-to-end contract test.
 *
 * Spawns the MCP server over stdio, enumerates EVERY tool via tools/list, and
 * calls each one through the real MCP layer with representative arguments.
 *
 * Why this exists: the older `mcp-handshake.js` only exercised ~14 tools and
 * never explicitly checked for the JSON-RPC error frame that an `outputSchema`
 * violation produces (-32602 "Output validation error"). A tool whose handler
 * omitted a required `structuredContent` field (e.g. `count`) would fail for
 * real MCP clients (Claude Desktop validates structured output) while every
 * `smoke-*.js` test -- which call the lib/handler directly, bypassing the MCP
 * layer -- stayed green. This test closes that blind spot.
 *
 * Pass/fail rules per tool:
 *   - HARD FAIL  : response carries a top-level JSON-RPC `error`. That is a
 *                  protocol- or output-schema violation -- the class of bug
 *                  this test is here to catch.
 *   - OK         : `result` returned. `result.isError` is acceptable (the tool
 *                  handled bad upstream/empty input gracefully -- the contract
 *                  still held). Attribution presence is recorded.
 *
 * Exit non-zero if any tool hard-fails.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "..", "index.js");

// Representative args per PUBLIC tool name. Anything omitted is called with {}.
// Where an arg map is "wrong", the wrapper returns a friendly isError frame
// (NOT a JSON-RPC error), so the test still correctly isolates schema bugs.
const ARGS = {
  about: {},
  austin_health: {},
  austin_travis_cad: { address: "9501 san lucas", limit: 1 },
  austin_williamson_cad: { address: "1000 louis henna blvd round rock", limit: 1 },
  austin_hays_cad: { address: "100 n lbj dr san marcos", limit: 1 },
  austin_permits: { address: "2512 tremolo pass", limit: 3 },
  austin_code_cases: { address: "1100 blair way", limit: 3 },
  austin_zoning: { address: "5201 Airport" },
  austin_travis_tax: { address: "9501 san lucas" },
  austin_mud_pid: { address: "9501 san lucas" },
  austin_fema_flood: { address: "9501 San Lucas Dr Austin TX" },
  austin_311: { request_type: "pothole", limit: 3 },
  austin_crime: { council_district: 9, limit: 3 },
  austin_tea_schools: { district: "Eanes", limit: 3 },
  austin_afd: { limit: 3 },
  austin_council_votes: { limit: 3 },
  austin_city_budget: { limit: 3 },
  austin_district_lookup: { address: "1100 Congress Ave Austin TX 78701" },
  austin_libraries: { limit: 5 },
  austin_parks: { district: 5, limit: 3 },
  austin_fire_stations: { limit: 5 },
  austin_police_data: { type: "arrests", limit: 3 },
  austin_restaurant_inspections: { limit: 3 },
  austin_tree_permits: { limit: 3 },
  austin_roadway_work_zones: { active_only: false, limit: 3 },
  austin_animal_center: { type: "intakes", limit: 3 },
  austin_txdot_projects: { county: "Travis", limit: 3 },
  austin_nws_alerts: {},
  austin_lake_travis_level: {},
  austin_active_listings: { zip: "78704", limit: 3 },
  austin_listing_detail: { mls_id: "0000000" }, // likely not found -> graceful isError, fine
  austin_listing_by_address: { address: "1600 barton springs rd austin tx" },
  austin_neighborhood_lookup: { q: "travis heights" },
  austin_search_blog: { q: "austin", limit: 3 },
  austin_local_voices: { limit: 3 },
  austin_property_360: { address: "9501 San Lucas Dr Austin TX" },
};

const PER_CALL_TIMEOUT = 60000;

// Tools that, with the args above, SHOULD return real data (non-isError) so the
// success-path structuredContent is actually schema-validated. A persistent
// isError here is surfaced as WARN (likely transient upstream / rate-limit),
// NOT silently passed -- it means that tool's happy path went unexercised.
// Tools left OUT are legitimately allowed to return isError (e.g. an address
// not in a MUD, a fake MLS id, an empty active-listing filter).
const EXPECT_SUCCESS = new Set([
  "about", "austin_health", "austin_travis_cad", "austin_permits",
  "austin_code_cases", "austin_zoning", "austin_travis_tax", "austin_fema_flood",
  "austin_311", "austin_crime", "austin_tea_schools", "austin_afd_incidents",
  "austin_council_votes", "austin_city_budget", "austin_district_lookup",
  "austin_libraries", "austin_parks", "austin_fire_stations", "austin_police_data",
  "austin_restaurant_inspections", "austin_tree_permits", "austin_roadway_work_zones",
  "austin_animal_center", "austin_txdot_projects", "austin_nws_alerts",
  "austin_neighborhood_lookup", "austin_search_blog", "austin_local_voices",
  "austin_property_360",
]);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const server = spawn("node", [serverPath], { stdio: ["pipe", "pipe", "pipe"] });

let buf = "";
const responses = [];
server.stdout.on("data", (chunk) => {
  buf += chunk.toString();
  let idx;
  while ((idx = buf.indexOf("\n")) !== -1) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (line) {
      try {
        responses.push(JSON.parse(line));
      } catch {
        /* ignore non-JSON log lines on stdout */
      }
    }
  }
});
server.stderr.on("data", (c) => process.stderr.write(c));

function send(msg) {
  server.stdin.write(JSON.stringify(msg) + "\n");
}

async function expect(id, label, timeoutMs = PER_CALL_TIMEOUT) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = responses.find((r) => r.id === id);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

async function main() {
  // Handshake
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "all-tools-test", version: "0.0.0" },
    },
  });
  await expect(1, "initialize");
  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const list = await expect(2, "tools/list");
  const tools = (list.result?.tools ?? []).map((t) => t.name);
  console.log(`Enumerated ${tools.length} tools.\n`);

  // One call -> raw response (or throws on timeout).
  let id = 100;
  async function callTool(name, args) {
    const callId = id++;
    send({ jsonrpc: "2.0", id: callId, method: "tools/call", params: { name, arguments: args } });
    return expect(callId, name);
  }

  const rows = [];
  for (const name of tools) {
    const args = ARGS[name] ?? {};

    let res, status, note;
    try {
      res = await callTool(name, args);
      // Retry once for expected-success tools that came back isError -- usually a
      // transient upstream/rate-limit, and we want the real success path exercised.
      if (
        !res.error &&
        res.result?.isError === true &&
        EXPECT_SUCCESS.has(name)
      ) {
        await sleep(1500);
        res = await callTool(name, args);
      }
    } catch (e) {
      rows.push({ name, status: "TIMEOUT", note: e.message, success: false });
      await sleep(300);
      continue;
    }

    if (res.error) {
      // JSON-RPC error frame == output-schema / protocol violation. THE bug class.
      status = "FAIL";
      note = `JSON-RPC error ${res.error.code}: ${String(res.error.message).slice(0, 80)}`;
    } else {
      const content = res.result?.content?.[0]?.text ?? "";
      const isErr = res.result?.isError === true;
      const hasStructured = res.result?.structuredContent !== undefined;
      const hasAttr = content.includes("neuhausre.com");
      const validatedSuccess = !isErr && hasStructured; // SDK already schema-checked it
      status = "OK";
      note = `${isErr ? "isError" : "ok"}${hasStructured ? "+struct" : ""}${hasAttr ? " +attr" : " -NOATTR"}`;

      // The SDK can surface an outputSchema violation as an isError RESULT
      // frame (not a top-level JSON-RPC error). That is still THE bug class --
      // catch it explicitly so a broken success path can't masquerade as a
      // "graceful isError".
      if (isErr && /Output validation error|-32602/.test(content)) {
        status = "FAIL";
        note = `output-validation error surfaced as isError frame: ${content.slice(0, 80)}`;
        rows.push({ name, status, note, success: false });
        await sleep(250);
        continue;
      }

      // Direct proof of the CAD fix: success path must carry numeric count.
      if (name === "austin_travis_cad" && !isErr) {
        const c = res.result?.structuredContent?.count;
        if (typeof c !== "number") {
          status = "FAIL";
          note = `austin_travis_cad structuredContent.count not numeric (got ${typeof c})`;
        } else {
          note += ` count=${c}`;
        }
      }

      // Expected-success tool still erroring after retry == happy path unexercised.
      if (isErr && EXPECT_SUCCESS.has(name)) {
        status = "WARN";
        note = `expected success, got isError (upstream/rate-limit?): ${content.slice(0, 60)}`;
      }
      rows.push({ name, status, note, success: validatedSuccess });
      await sleep(250); // ease off shared upstreams (esp. Socrata without app token)
      continue;
    }
    rows.push({ name, status, note, success: false });
    await sleep(250);
  }

  // Report
  console.log("TOOL CONTRACT RESULTS");
  console.log("=".repeat(72));
  for (const r of rows) {
    const tag = r.status === "OK" ? "PASS" : r.status.padEnd(4);
    console.log(`${tag}  ${r.name.padEnd(32)} ${r.note}`);
  }
  console.log("=".repeat(72));

  const fails = rows.filter((r) => r.status === "FAIL" || r.status === "TIMEOUT");
  const warns = rows.filter((r) => r.status === "WARN");
  const noattr = rows.filter((r) => r.note?.includes("-NOATTR"));
  const successValidated = rows.filter((r) => r.success);
  const expected = rows.filter((r) => EXPECT_SUCCESS.has(r.name));

  const expectedValidated = successValidated.filter((r) => EXPECT_SUCCESS.has(r.name)).length;
  console.log(
    `\n${rows.length} tools | ${fails.length} FAIL | ${warns.length} WARN | ` +
      `${successValidated.length} tools validated a real structuredContent success path ` +
      `(${expectedValidated}/${expected.length} of the expected-success set)`
  );
  if (warns.length) {
    console.log(`WARN (happy path unexercised): ${warns.map((r) => r.name).join(", ")}`);
  }
  if (noattr.length) {
    console.log(`NOATTR (no neuhausre.com in returned frame): ${noattr.map((r) => r.name).join(", ")}`);
  }

  server.kill();
  if (fails.length) {
    console.log(`\nFAILED: ${fails.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }
  console.log("\nALL TOOLS PASS MCP OUTPUT CONTRACT");
  process.exit(0);
}

main().catch((err) => {
  console.error(`FATAL: ${err.stack ?? err}`);
  server.kill();
  process.exit(1);
});
