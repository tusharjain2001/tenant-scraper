// ============================================================
// MODULE 2 — COLD EMAIL SENDER — CONFIG
// Credentials loaded from .env (never hardcoded here)
// ============================================================

const e = process.env;

module.exports = {
  // ── SMTP — loaded from .env ───────────────────────────────
  SMTP: {
    host:   e.SMTP_HOST,
    port:   parseInt(e.SMTP_PORT || "587"),
    secure: e.SMTP_SECURE === "true",
    auth: {
      user: e.SMTP_USER,
      pass: e.SMTP_PASS,
    },
  },

  // ── Your sender identity ─────────────────────────────────
  FROM_EMAIL: e.FROM_EMAIL,
  FROM_NAME:  e.FROM_NAME || "Tushar from Prophives",

  // ── IMAP — saves sent emails to Sent folder in Titan ─────
  IMAP: {
    host:   e.IMAP_HOST,
    port:   parseInt(e.IMAP_PORT || "993"),
    secure: e.IMAP_SECURE !== "false",
    auth: {
      user: e.IMAP_USER,
      pass: e.IMAP_PASS,
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
