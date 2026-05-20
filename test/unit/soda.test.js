import { test } from "node:test";
import assert from "node:assert/strict";
import { sodaAddressLike, sodaTextLike, sodaTextEq } from "../../lib/soda.js";

test("sodaAddressLike: uppercases + escapes quotes", () => {
  assert.equal(
    sodaAddressLike("original_address1", "9501 San Lucas"),
    "upper(original_address1) like '%9501 SAN LUCAS%'"
  );
});

test("sodaAddressLike: escapes single quote", () => {
  const out = sodaAddressLike("addr", "O'Hara");
  assert.match(out, /'%O''HARA%'/);
});

test("sodaAddressLike: throws on missing args", () => {
  assert.throws(() => sodaAddressLike("", "x"));
  assert.throws(() => sodaAddressLike("f", ""));
});

test("sodaTextLike: contains match", () => {
  assert.equal(sodaTextLike("sr_type_desc", "pothole"), "upper(sr_type_desc) like '%POTHOLE%'");
});

test("sodaTextLike: escapes quotes", () => {
  const out = sodaTextLike("field", "it's broken");
  assert.match(out, /'%IT''S BROKEN%'/);
});

test("sodaTextEq: numeric coerce + quote", () => {
  assert.equal(sodaTextEq("council_district", 3), "council_district = '3'");
  assert.equal(sodaTextEq("fy", "2025"), "fy = '2025'");
});

test("sodaTextEq: escapes single quote", () => {
  assert.equal(sodaTextEq("name", "O'Hara"), "name = 'O''Hara'");
});

test("sodaTextEq: throws on missing args", () => {
  assert.throws(() => sodaTextEq("", "x"));
  assert.throws(() => sodaTextEq("f", ""));
  assert.throws(() => sodaTextEq("f", null));
});
