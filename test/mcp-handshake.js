/**
 * Spawn the MCP server, send JSON-RPC initialize + tools/list + tools/call,
 * and print the responses. Used as an end-to-end smoke test.
 */

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const serverPath = resolve(__dirname, "..", "index.js");

const server = spawn("node", [serverPath], {
  stdio: ["pipe", "pipe", "pipe"],
});

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
        responses.push({ raw: line });
      }
    }
  }
});

server.stderr.on("data", (c) => process.stderr.write(c));

function send(msg) {
  server.stdin.write(JSON.stringify(msg) + "\n");
}

async function expect(id, label, timeoutMs = 8000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const found = responses.find((r) => r.id === id);
    if (found) return found;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error(`Timeout waiting for ${label}`);
}

try {
  send({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2024-11-05",
      capabilities: {},
      clientInfo: { name: "smoke-test", version: "0.0.0" },
    },
  });
  const init = await expect(1, "initialize");
  console.log("initialize OK -- server:", init.result?.serverInfo);

  send({ jsonrpc: "2.0", method: "notifications/initialized", params: {} });

  send({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} });
  const list = await expect(2, "tools/list");
  console.log(`tools/list OK -- ${list.result?.tools?.length} tools:`);
  for (const t of list.result?.tools ?? []) {
    console.log(`  - ${t.name}`);
  }

  // Call about
  send({
    jsonrpc: "2.0",
    id: 3,
    method: "tools/call",
    params: { name: "about", arguments: {} },
  });
  const aboutRes = await expect(3, "about");
  const aboutText = aboutRes.result?.content?.[0]?.text ?? "";
  console.log("\nabout/0 first 200:");
  console.log(aboutText.slice(0, 200));
  if (!aboutText.includes("neuhausre.com")) {
    throw new Error("Attribution missing from about output");
  }

  // Call travis_cad_search
  send({
    jsonrpc: "2.0",
    id: 4,
    method: "tools/call",
    params: { name: "travis_cad_search", arguments: { address: "9501 san lucas", limit: 1 } },
  });
  const cadRes = await expect(4, "travis_cad_search", 15000);
  const cadText = cadRes.result?.content?.[0]?.text ?? "";
  console.log("\ntravis_cad_search/9501 san lucas first 300:");
  console.log(cadText.slice(0, 300));
  if (!cadText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from travis_cad_search output");
  }

  // Call austin_permits
  send({
    jsonrpc: "2.0",
    id: 5,
    method: "tools/call",
    params: { name: "austin_permits", arguments: { address: "2512 tremolo pass", limit: 5 } },
  });
  const permitRes = await expect(5, "austin_permits", 15000);
  const permitText = permitRes.result?.content?.[0]?.text ?? "";
  console.log("\naustin_permits/2512 tremolo pass first 300:");
  console.log(permitText.slice(0, 300));
  if (!permitText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from austin_permits output");
  }

  // Call austin_code_cases
  send({
    jsonrpc: "2.0",
    id: 6,
    method: "tools/call",
    params: { name: "austin_code_cases", arguments: { address: "1100 blair way", limit: 5 } },
  });
  const codeRes = await expect(6, "austin_code_cases", 15000);
  const codeText = codeRes.result?.content?.[0]?.text ?? "";
  console.log("\naustin_code_cases/1100 blair way first 300:");
  console.log(codeText.slice(0, 300));
  if (!codeText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from austin_code_cases output");
  }

  // Call austin_311 (use request_type filter -- queries are fast that way)
  send({
    jsonrpc: "2.0",
    id: 7,
    method: "tools/call",
    params: { name: "austin_311", arguments: { request_type: "pothole", limit: 3 } },
  });
  const r311 = await expect(7, "austin_311", 45000);
  const r311Text = r311.result?.content?.[0]?.text ?? "";
  console.log("\naustin_311/pothole first 300:");
  console.log(r311Text.slice(0, 300));
  if (!r311Text.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from austin_311 output");
  }

  // Call austin_crime
  send({
    jsonrpc: "2.0",
    id: 8,
    method: "tools/call",
    params: { name: "austin_crime", arguments: { council_district: 9, limit: 3 } },
  });
  const crimeRes = await expect(8, "austin_crime", 15000);
  const crimeText = crimeRes.result?.content?.[0]?.text ?? "";
  console.log("\naustin_crime/District 9 first 300:");
  console.log(crimeText.slice(0, 300));
  if (!crimeText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from austin_crime output");
  }

  // Call austin_zoning
  send({
    jsonrpc: "2.0",
    id: 9,
    method: "tools/call",
    params: { name: "austin_zoning", arguments: { address: "5201 Airport" } },
  });
  const zoneRes = await expect(9, "austin_zoning", 15000);
  const zoneText = zoneRes.result?.content?.[0]?.text ?? "";
  console.log("\naustin_zoning/5201 Airport first 300:");
  console.log(zoneText.slice(0, 300));
  if (!zoneText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from austin_zoning output");
  }

  // Call travis_tax_office
  send({
    jsonrpc: "2.0",
    id: 10,
    method: "tools/call",
    params: { name: "travis_tax_office", arguments: { address: "9501 san lucas" } },
  });
  const taxRes = await expect(10, "travis_tax_office", 30000);
  const taxText = taxRes.result?.content?.[0]?.text ?? "";
  console.log("\ntravis_tax_office/9501 san lucas first 400:");
  console.log(taxText.slice(0, 400));
  if (!taxText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from travis_tax_office output");
  }

  // Call mud_pid_lookup
  send({
    jsonrpc: "2.0",
    id: 11,
    method: "tools/call",
    params: { name: "mud_pid_lookup", arguments: { address: "9501 san lucas" } },
  });
  const mudRes = await expect(11, "mud_pid_lookup", 30000);
  const mudText = mudRes.result?.content?.[0]?.text ?? "";
  console.log("\nmud_pid_lookup/9501 san lucas first 400:");
  console.log(mudText.slice(0, 400));
  if (!mudText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from mud_pid_lookup output");
  }

  // Call fema_flood
  send({
    jsonrpc: "2.0",
    id: 12,
    method: "tools/call",
    params: { name: "fema_flood", arguments: { address: "9501 San Lucas Dr Austin TX" } },
  });
  const floodRes = await expect(12, "fema_flood", 20000);
  const floodText = floodRes.result?.content?.[0]?.text ?? "";
  console.log("\nfema_flood/9501 san lucas first 400:");
  console.log(floodText.slice(0, 400));
  if (!floodText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from fema_flood output");
  }

  // Call tea_schools
  send({
    jsonrpc: "2.0",
    id: 13,
    method: "tools/call",
    params: { name: "tea_schools", arguments: { district: "Eanes", limit: 5 } },
  });
  const teaRes = await expect(13, "tea_schools", 20000);
  const teaText = teaRes.result?.content?.[0]?.text ?? "";
  console.log("\ntea_schools/Eanes first 400:");
  console.log(teaText.slice(0, 400));
  if (!teaText.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from tea_schools output");
  }

  // Call austin_property_360 (slow -- 8 parallel upstream calls)
  send({
    jsonrpc: "2.0",
    id: 14,
    method: "tools/call",
    params: { name: "austin_property_360", arguments: { address: "9501 San Lucas Dr Austin TX" } },
  });
  const p360Res = await expect(14, "austin_property_360", 60000);
  const p360Text = p360Res.result?.content?.[0]?.text ?? "";
  console.log("\naustin_property_360/9501 san lucas first 600:");
  console.log(p360Text.slice(0, 600));
  if (!p360Text.includes("neuhausre.com")) {
    throw new Error("Attribution tag missing from austin_property_360 output");
  }
  if (!p360Text.includes("## 1.") || !p360Text.includes("## 8.")) {
    throw new Error("austin_property_360 missing required sections");
  }

  console.log("\nALL OK");
  server.kill();
  process.exit(0);
} catch (err) {
  console.error(`FAIL: ${err.message}`);
  server.kill();
  process.exit(1);
}
