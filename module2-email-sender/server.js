/**
 * Tracking server — handles open pixel + unsubscribe links
 * Run: node run.js server
 * Expose publicly with: ngrok http 3456
 */
const express = require("express");
const db = require("./db");
const config = require("./config");

const app = express();
const PORT = 3456;

// 1×1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// ── Open tracking pixel ───────────────────────────────────────────────────────
app.get("/open/:contactId/:step", (req, res) => {
  const { contactId, step } = req.params;
  try {
    db.markOpened(parseInt(contactId), parseInt(step));
    console.log(`[OPEN] contact=${contactId} step=${step}`);
  } catch (err) {
    // non-fatal
  }
  res.set({
    "Content-Type":  "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma":        "no-cache",
    "Expires":       "0",
  });
  res.send(PIXEL);
});

// ── Unsubscribe ───────────────────────────────────────────────────────────────
app.get("/unsubscribe/:contactId", (req, res) => {
  const { contactId } = req.params;
  try {
    db.markUnsubscribed(parseInt(contactId));
    console.log(`[UNSUB] contact=${contactId}`);
  } catch (err) {
    // non-fatal
  }
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>You've been unsubscribed.</h2>
      <p>You won't receive any more emails from us.</p>
    </body></html>
  `);
});

// ── Stats API (optional) ──────────────────────────────────────────────────────
app.get("/stats", (req, res) => {
  res.json(db.getStats());
});

app.get("/contacts", (req, res) => {
  const limit  = parseInt(req.query.limit  || "50");
  const offset = parseInt(req.query.offset || "0");
  res.json(db.getAllContacts(limit, offset));
});

// ── Start ─────────────────────────────────────────────────────────────────────
function start() {
  app.listen(PORT, () => {
    console.log(`\nTracking server running at http://localhost:${PORT}`);
    console.log(`  Open pixel:   ${config.TRACKING_BASE_URL}/open/:id/:step`);
    console.log(`  Unsubscribe:  ${config.TRACKING_BASE_URL}/unsubscribe/:id`);
    console.log(`  Stats:        ${config.TRACKING_BASE_URL}/stats`);
    console.log(`\nTo expose publicly: npx ngrok http ${PORT}`);
  });
}

module.exports = { start };
