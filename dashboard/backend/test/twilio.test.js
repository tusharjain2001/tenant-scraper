const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildCallSummary,
  mapCallOutcome,
  sanitizeClientIdentity,
} = require("../lib/twilio");

test("sanitizeClientIdentity keeps safe identity values", () => {
  assert.equal(sanitizeClientIdentity("dashboard_123"), "dashboard_123");
  assert.equal(sanitizeClientIdentity("bad value"), "dashboard-user");
});

test("mapCallOutcome maps voicemail and no-answer states", () => {
  assert.equal(mapCallOutcome({ callStatus: "completed", answeredBy: "machine_start" }), "voicemail");
  assert.equal(mapCallOutcome({ callStatus: "no-answer", answeredBy: null }), "no_answer");
});

test("buildCallSummary produces an admin-facing summary", () => {
  const summary = buildCallSummary({
    to: "+14155550123",
    outcome: "answered",
    durationSeconds: 42,
    callStatus: "completed",
    answeredBy: null,
    errorMessage: null,
  });

  assert.match(summary, /connected/i);
  assert.match(summary, /42s/i);
});
