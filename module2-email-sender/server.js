/**
 * Tracking server — open pixel + unsubscribe links
 * Data layer: Supabase
 */
const express = require("express");
const supa    = require("./supabase");
const config  = require("./config");

const app  = express();
const PORT = 3456;

const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// ── Open pixel ────────────────────────────────────────────────────────────────
app.get("/open/:leadId/:step", async (req, res) => {
  const { leadId, step } = req.params;
  try {
    await supa.markOpened(leadId, parseInt(step));
    console.log(`[OPEN] lead=${leadId} step=${step}`);
  } catch (_) {}
  res.set({
    "Content-Type":  "image/gif",
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma":        "no-cache",
    "Expires":       "0",
  });
  res.send(PIXEL);
});

// ── Unsubscribe ───────────────────────────────────────────────────────────────
app.get("/unsubscribe/:leadId", async (req, res) => {
  const { leadId } = req.params;
  try {
    await supa.markUnsubscribed(leadId);
    console.log(`[UNSUB] lead=${leadId}`);
  } catch (_) {}
  res.send(`
    <html><body style="font-family:sans-serif;text-align:center;padding:60px">
      <h2>You've been unsubscribed.</h2>
      <p>You won't receive any more emails from us.</p>
    </body></html>
  `);
});

// ── Stats ─────────────────────────────────────────────────────────────────────
app.get("/stats", async (req, res) => {
  res.json(await supa.getStats());
});

app.get("/contacts", async (req, res) => {
  const limit  = parseInt(req.query.limit  || "50");
  const offset = parseInt(req.query.offset || "0");
  res.json(await supa.getAllContacts(limit, offset));
});

function start() {
  app.listen(PORT, () => {
    console.log(`\nTracking server → http://localhost:${PORT}`);
    console.log(`  Open pixel:  ${config.TRACKING_BASE_URL}/open/:id/:step`);
    console.log(`  Unsubscribe: ${config.TRACKING_BASE_URL}/unsubscribe/:id`);
    console.log(`\nTo expose publicly: npx ngrok http ${PORT}`);
  });
}

module.exports = { start };
