// ============================================================
// MODULE 2 — COLD EMAIL SENDER — CONFIG
// ============================================================

module.exports = {
  // ── SendGrid ─────────────────────────────────────────────
  SENDGRID_API_KEY: "YOUR_SENDGRID_API_KEY",  // get free at sendgrid.com (100 emails/day free)

  // ── Your sender identity ─────────────────────────────────
  FROM_EMAIL: "you@yourdomain.com",           // must be verified in SendGrid
  FROM_NAME:  "Tushar from Prophives",

  // ── Sending limits ───────────────────────────────────────
  MAX_EMAILS_PER_DAY: 50,       // stay under spam radar (SendGrid free = 100/day)
  DELAY_BETWEEN_EMAILS_MS: 8000, // 8 seconds between each send (looks human)

  // ── Sequence timing ──────────────────────────────────────
  // Day 0 = imported, Email 1 sent immediately on first run
  // Email 2 sent 3 days after email 1
  // Email 3 sent 3 days after email 2 (day 6 total)
  SEQUENCE_DELAYS_DAYS: [0, 3, 3],  // day gaps between each email

  // ── Open tracking ────────────────────────────────────────
  // Run "npm run server" to start the tracking server
  // Set this to your public URL (use ngrok for local testing)
  TRACKING_BASE_URL: "http://localhost:3456",

  // ── Cron schedule ────────────────────────────────────────
  // When to auto-send emails each day (24h format)
  // "0 9 * * 1-5" = 9:00 AM Monday-Friday
  SEND_CRON: "0 9 * * 1-5",

  // ── CSV input ────────────────────────────────────────────
  // Path to the CSV from Module 1 (relative to this folder)
  DEFAULT_CSV_PATH: "../output/all_contacts_20260413_014728.csv",
};
