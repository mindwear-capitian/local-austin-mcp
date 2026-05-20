import { test } from "node:test";
import assert from "node:assert/strict";
import { encodeCursor, decodeCursor } from "../../lib/soda.js";

test("encodeCursor + decodeCursor: round trip", () => {
  const c = encodeCursor(50);
  assert.equal(typeof c, "string");
  assert.deepEqual(decodeCursor(c), { offset: 50 });
});

test("decodeCursor: rejects garbage", () => {
  assert.equal(decodeCursor("not_base64_at_all_!@#$%"), null);
  assert.equal(decodeCursor(""), null);
  assert.equal(decodeCursor(null), null);
});

test("decodeCursor: rejects negative or non-integer offset", () => {
  const neg = encodeCursor(-5);
  assert.equal(decodeCursor(neg), null);
  // hand-craft a cursor with a non-integer
  const weird = Buffer.from(JSON.stringify({ offset: "abc" }), "utf8").toString("base64url");
  assert.equal(decodeCursor(weird), null);
});
