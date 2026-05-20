import { test } from "node:test";
import assert from "node:assert/strict";
import { detectCounty, looksLikeCityOfAustin } from "../../lib/county-router.js";

test("detectCounty: Travis ZIP", () => {
  assert.equal(detectCounty("9501 San Lucas Dr, Austin, TX 78737"), "travis");
  assert.equal(detectCounty("123 Main, Austin, TX 78704"), "travis");
});

test("detectCounty: Williamson ZIP", () => {
  assert.equal(detectCounty("100 Anywhere Pkwy, Cedar Park, TX 78613"), "williamson");
  assert.equal(detectCounty("Round Rock 78664"), "williamson");
});

test("detectCounty: Hays ZIP", () => {
  assert.equal(detectCounty("200 Smile St, Buda, TX 78610"), "hays");
  assert.equal(detectCounty("San Marcos 78666"), "hays");
});

test("detectCounty: City-name fallback", () => {
  assert.equal(detectCounty("Some Address, Dripping Springs, TX"), "hays");
  assert.equal(detectCounty("Address in Lakeway TX"), "travis");
  assert.equal(detectCounty("Cedar Park lot"), "williamson");
});

test("detectCounty: returns null for unknown", () => {
  assert.equal(detectCounty(""), null);
  assert.equal(detectCounty(null), null);
  assert.equal(detectCounty("Random place in Houston"), null);
});

test("detectCounty: AUSTIN AVE inside Round Rock does NOT trigger travis", () => {
  // Word-boundary safeguard.
  assert.equal(detectCounty("100 AUSTIN AVE, ROUND ROCK, TX 78664"), "williamson");
});

test("looksLikeCityOfAustin: true for core Austin", () => {
  assert.equal(looksLikeCityOfAustin("123 W 6th St, Austin TX 78701"), true);
});

test("looksLikeCityOfAustin: false for Lakeway / Bee Cave / Westlake", () => {
  assert.equal(looksLikeCityOfAustin("123 Lakeway Blvd, Lakeway TX 78734"), false);
  assert.equal(looksLikeCityOfAustin("123 Bee Cave Rd"), false);
  assert.equal(looksLikeCityOfAustin("9 West Lake Hills, TX"), false);
});

test("looksLikeCityOfAustin: false for non-Travis", () => {
  assert.equal(looksLikeCityOfAustin("Buda TX 78610"), false);
  assert.equal(looksLikeCityOfAustin("Cedar Park 78613"), false);
});
