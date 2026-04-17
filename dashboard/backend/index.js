/**
 * Lead Ops Dashboard — Backend API
 * Port: 4000
 *
 * Start: node --env-file=.env index.js
 */
const express  = require("express");
const cors     = require("cors");

const app = express();

app.use(cors({ origin: ["http://localhost:5173", "http://localhost:5174"] }));
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/dashboard/summary", require("./routes/summary"));
app.use("/api/leads",             require("./routes/leads"));
app.use("/api/scrape",            require("./routes/scrape"));
app.use("/api/email",             require("./routes/email"));
app.use("/api/calls",             require("./routes/calls"));
app.use("/api/content",          require("./routes/content"));
app.use("/api/webhooks",          require("./routes/webhooks"));

// ── Health ────────────────────────────────────────────────────────────────────
app.get("/api/health", (_req, res) => res.json({ ok: true, ts: new Date().toISOString() }));

// ── Start ─────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`\nLead Ops Backend running → http://localhost:${PORT}`);
  console.log(`  Supabase:  ${process.env.SUPABASE_URL}`);
  console.log(`  OpenAI:    ${process.env.OPENAI_API_KEY ? "configured" : "NOT SET"}`);
  console.log(`  Twilio:    ${process.env.TWILIO_ACCOUNT_SID ? "configured" : "NOT SET"}`);
  console.log(`  Legacy queue: ${process.env.ELEVENLABS_API_KEY ? "enabled" : "disabled"}`);
  console.log(`\nEndpoints:`);
  console.log(`  GET  /api/dashboard/summary`);
  console.log(`  GET  /api/leads`);
  console.log(`  GET  /api/leads/export/csv`);
  console.log(`  POST /api/scrape/run`);
  console.log(`  POST /api/email/start`);
  console.log(`  POST /api/calls/token`);
  console.log(`  POST /api/calls/twiml/outbound`);
  console.log(`  POST /api/calls/status-callback`);
  console.log(`  GET  /api/calls/history`);
  console.log(`  POST /api/calls/queue`);
  console.log(`  POST /api/content/generate-today`);
  console.log(`  POST /api/webhooks/elevenlabs/post-call\n`);
});
