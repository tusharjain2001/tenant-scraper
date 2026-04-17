const test = require("node:test");
const assert = require("node:assert/strict");

const { maskPhoneNumber, sanitizeOutboundNumber } = require("../lib/phone");

test("sanitizeOutboundNumber normalizes a spaced E.164 number", () => {
  const result = sanitizeOutboundNumber(" +1 (415) 555-0123 ");
  assert.equal(result.ok, true);
  assert.equal(result.e164, "+14155550123");
});

test("sanitizeOutboundNumber rejects a number without a country code", () => {
  const result = sanitizeOutboundNumber("4155550123");
  assert.equal(result.ok, false);
  assert.match(result.error, /country code/i);
});

test("maskPhoneNumber redacts the middle digits", () => {
  assert.equal(maskPhoneNumber("+14155550123"), "+14••••23");
});
