/**
 * SQLite database — uses Node.js 22 built-in node:sqlite
 */
process.env.NODE_NO_WARNINGS = "1";

const { DatabaseSync } = require("node:sqlite");
const path = require("path");

const DB_PATH = path.join(__dirname, "contacts.db");
let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new DatabaseSync(DB_PATH);
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      email           TEXT    NOT NULL UNIQUE,
      first_name      TEXT    DEFAULT '',
      last_name       TEXT    DEFAULT '',
      agency_name     TEXT    DEFAULT '',
      phone           TEXT    DEFAULT '',
      city            TEXT    DEFAULT '',
      location        TEXT    DEFAULT '',
      source          TEXT    DEFAULT '',
      website         TEXT    DEFAULT '',
      status          TEXT    DEFAULT 'pending',
      emails_sent     INTEGER DEFAULT 0,
      imported_at     TEXT    DEFAULT (datetime('now')),
      replied_at      TEXT,
      unsubscribed_at TEXT
    );
    CREATE TABLE IF NOT EXISTS emails_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id    INTEGER NOT NULL,
      sequence_step INTEGER NOT NULL,
      subject       TEXT    NOT NULL,
      sent_at       TEXT    DEFAULT (datetime('now')),
      opened_at     TEXT,
      open_count    INTEGER DEFAULT 0,
      message_id    TEXT,
      status        TEXT    DEFAULT 'sent'
    );
    CREATE INDEX IF NOT EXISTS idx_contacts_email  ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_emails_contact  ON emails_log(contact_id);
  `);
}

function upsertContact(c) {
  return getDb().prepare(`
    INSERT INTO contacts (email, first_name, last_name, agency_name, phone, city, location, source, website)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(email) DO NOTHING
  `).run(c.email, c.first_name, c.last_name, c.agency_name, c.phone, c.city, c.location, c.source, c.website);
}

function getContactsDueForStep(step) {
  const db = getDb();
  if (step === 1) {
    return db.prepare(`SELECT * FROM contacts WHERE status = 'pending' AND emails_sent = 0 LIMIT 200`).all();
  }
  return db.prepare(`
    SELECT c.* FROM contacts c
    WHERE c.status = 'active' AND c.emails_sent = ?
      AND EXISTS (
        SELECT 1 FROM emails_log el
        WHERE el.contact_id = c.id AND el.sequence_step = ?
          AND el.sent_at <= datetime('now', '-3 days')
      )
    LIMIT 200
  `).all(step - 1, step - 1);
}

function markEmailSent(contactId, step, subject, messageId) {
  const db = getDb();
  db.prepare(`INSERT INTO emails_log (contact_id, sequence_step, subject, message_id) VALUES (?, ?, ?, ?)`
  ).run(contactId, step, subject, messageId || null);
  db.prepare(`UPDATE contacts SET emails_sent = emails_sent + 1, status = ? WHERE id = ?`
  ).run(step === 3 ? "done" : "active", contactId);
}

function markOpened(contactId, step) {
  getDb().prepare(`
    UPDATE emails_log SET opened_at = COALESCE(opened_at, datetime('now')), open_count = open_count + 1, status = 'opened'
    WHERE contact_id = ? AND sequence_step = ?
  `).run(contactId, step);
}

function markReplied(email) {
  getDb().prepare(`UPDATE contacts SET status = 'replied', replied_at = datetime('now') WHERE email = ? AND status = 'active'`).run(email);
}

function markBounced(email) {
  getDb().prepare(`UPDATE contacts SET status = 'bounced' WHERE email = ?`).run(email);
}

function markUnsubscribed(contactId) {
  getDb().prepare(`UPDATE contacts SET status = 'unsubscribed', unsubscribed_at = datetime('now') WHERE id = ?`).run(contactId);
}

function getStats() {
  const db = getDb();
  const q = (sql) => db.prepare(sql).get().n;
  return {
    total:         q(`SELECT COUNT(*) as n FROM contacts`),
    pending:       q(`SELECT COUNT(*) as n FROM contacts WHERE status = 'pending'`),
    active:        q(`SELECT COUNT(*) as n FROM contacts WHERE status = 'active'`),
    done:          q(`SELECT COUNT(*) as n FROM contacts WHERE status = 'done'`),
    replied:       q(`SELECT COUNT(*) as n FROM contacts WHERE status = 'replied'`),
    bounced:       q(`SELECT COUNT(*) as n FROM contacts WHERE status = 'bounced'`),
    unsubscribed:  q(`SELECT COUNT(*) as n FROM contacts WHERE status = 'unsubscribed'`),
    emails_sent:   q(`SELECT COUNT(*) as n FROM emails_log`),
    emails_opened: q(`SELECT COUNT(*) as n FROM emails_log WHERE open_count > 0`),
    step1_sent:    q(`SELECT COUNT(*) as n FROM emails_log WHERE sequence_step = 1`),
    step2_sent:    q(`SELECT COUNT(*) as n FROM emails_log WHERE sequence_step = 2`),
    step3_sent:    q(`SELECT COUNT(*) as n FROM emails_log WHERE sequence_step = 3`),
  };
}

function getAllContacts(limit = 100, offset = 0) {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT sent_at FROM emails_log WHERE contact_id = c.id AND sequence_step = 1) as step1_sent,
      (SELECT sent_at FROM emails_log WHERE contact_id = c.id AND sequence_step = 2) as step2_sent,
      (SELECT sent_at FROM emails_log WHERE contact_id = c.id AND sequence_step = 3) as step3_sent,
      (SELECT open_count FROM emails_log WHERE contact_id = c.id ORDER BY sequence_step DESC LIMIT 1) as opens
    FROM contacts c ORDER BY c.imported_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset);
}

module.exports = { getDb, upsertContact, getContactsDueForStep, markEmailSent, markOpened, markReplied, markBounced, markUnsubscribed, getStats, getAllContacts };
