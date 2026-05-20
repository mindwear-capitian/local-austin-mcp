import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeResult, wrapHandler } from "../../lib/register.js";

test("normalizeResult: promotes 2nd JSON text block to structuredContent", () => {
  const input = {
    content: [
      { type: "text", text: "# Human" },
      { type: "text", text: JSON.stringify({ a: 1, b: [2, 3] }) },
    ],
  };
  const out = normalizeResult(input);
  assert.equal(out.content.length, 1);
  assert.equal(out.content[0].text, "# Human");
  assert.deepEqual(out.structuredContent, { a: 1, b: [2, 3] });
});

test("normalizeResult: leaves single-block content alone", () => {
  const input = { content: [{ type: "text", text: "hello" }] };
  const out = normalizeResult(input);
  assert.equal(out.content.length, 1);
  assert.equal(out.structuredContent, undefined);
});

test("normalizeResult: leaves non-JSON 2nd block alone", () => {
  const input = {
    content: [
      { type: "text", text: "human" },
      { type: "text", text: "plain text trailing notes" },
    ],
  };
  const out = normalizeResult(input);
  assert.equal(out.content.length, 2);
  assert.equal(out.structuredContent, undefined);
});

test("normalizeResult: respects pre-set structuredContent", () => {
  const input = {
    content: [{ type: "text", text: "x" }, { type: "text", text: "{\"y\":1}" }],
    structuredContent: { y: 99 },
  };
  const out = normalizeResult(input);
  assert.deepEqual(out.structuredContent, { y: 99 });
  assert.equal(out.content.length, 2); // untouched
});

test("wrapHandler: catches ZodError with validation_failed branch", async () => {
  const { z, ZodError } = await import("zod");
  const tool = {
    name: "z",
    async handler() {
      // Simulate validation throw
      throw new ZodError([
        { code: "too_small", path: ["limit"], message: "Number must be >= 1" },
      ]);
    },
  };
  const handler = wrapHandler(tool, "z");
  const result = await handler({}, {});
  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /input validation failed/);
  assert.match(result.content[0].text, /limit: Number must be >= 1/);
  assert.equal(result.structuredContent.error, "validation_failed");
});

test("wrapHandler: catches thrown error and returns isError frame", async () => {
  const tool = {
    name: "boom",
    async handler() {
      throw new Error("kaboom");
    },
  };
  const handler = wrapHandler(tool, "boom");
  const result = await handler({}, {});
  assert.equal(result.isError, true);
  assert.equal(result.content[0].type, "text");
  assert.match(result.content[0].text, /boom/);
});

test("wrapHandler: passes through happy result + normalizes", async () => {
  const tool = {
    name: "fine",
    async handler() {
      return {
        content: [
          { type: "text", text: "ok" },
          { type: "text", text: JSON.stringify({ v: 1 }) },
        ],
      };
    },
  };
  const handler = wrapHandler(tool, "fine");
  const result = await handler({}, {});
  assert.equal(result.content.length, 1);
  assert.deepEqual(result.structuredContent, { v: 1 });
});
