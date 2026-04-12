// ============================================================
// MODULE 2 — COLD EMAIL SENDER — CONFIG
// ============================================================

module.exports = {
  // ── SMTP settings — from tenant-backend .env ─────────────
  SMTP: {
    host:   "smtpout.secureserver.net",
    port:   587,
    secure: false,
    auth: {
      user: "support@prophives.com",
      pass: "Fiveloops@12345",
    },
  },

  // ── Your sender identity ─────────────────────────────────
  FROM_EMAIL: "support@prophives.com",
  FROM_NAME:  "Tushar from Prophives",

  // ── IMAP — saves sent emails to Sent folder in Titan ────────
  IMAP: {
    host:   "imap.secureserver.net",
    port:   993,
    secure: true,
    auth: {
      user: "support@prophives.com",
      pass: "Fiveloops@12345",
    },
  },
  IMAP_SENT_FOLDER: "Sent",

  BCC_SELF: "",

  // ── Sending limits ───────────────────────────────────────
  MAX_EMAILS_PER_DAY:      50,
  DELAY_BETWEEN_EMAILS_MS: 8000,

  // ── Sequence timing ──────────────────────────────────────
  SEQUENCE_DELAYS_DAYS: [0, 3, 3],

  // ── Open tracking ────────────────────────────────────────
  TRACKING_BASE_URL: "http://localhost:3456",

  // ── Cron schedule ────────────────────────────────────────
  SEND_CRON: "0 9 * * 1-5",

  // ── CSV input ────────────────────────────────────────────
  DEFAULT_CSV_PATH: "../output/all_contacts_20260413_014728.csv",
};
