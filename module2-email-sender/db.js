/**
 * SQLite database — tracks every contact and every email sent
 */
const Database = require("better-sqlite3");
const path = require("path");

const DB_PATH = path.join(__dirname, "contacts.db");

let _db = null;

function getDb() {
  if (_db) return _db;
  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  initSchema(_db);
  return _db;
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS contacts (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      email         TEXT    NOT NULL UNIQUE,
      first_name    TEXT    DEFAULT '',
      last_name     TEXT    DEFAULT '',
      agency_name   TEXT    DEFAULT '',
      phone         TEXT    DEFAULT '',
      city          TEXT    DEFAULT '',
      location      TEXT    DEFAULT '',
      source        TEXT    DEFAULT '',
      website       TEXT    DEFAULT '',
      status        TEXT    DEFAULT 'pending',
      -- pending | active | replied | unsubscribed | bounced | done
      emails_sent   INTEGER DEFAULT 0,
      imported_at   DATETIME DEFAULT (datetime('now')),
      replied_at    DATETIME,
      unsubscribed_at DATETIME
    );

    CREATE TABLE IF NOT EXISTS emails_log (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      contact_id    INTEGER NOT NULL REFERENCES contacts(id),
      sequence_step INTEGER NOT NULL,  -- 1, 2, or 3
      subject       TEXT    NOT NULL,
      sent_at       DATETIME DEFAULT (datetime('now')),
      opened_at     DATETIME,
      open_count    INTEGER DEFAULT 0,
      message_id    TEXT,
      status        TEXT    DEFAULT 'sent'  -- sent | opened | bounced | failed
    );

    CREATE INDEX IF NOT EXISTS idx_contacts_email  ON contacts(email);
    CREATE INDEX IF NOT EXISTS idx_contacts_status ON contacts(status);
    CREATE INDEX IF NOT EXISTS idx_emails_contact  ON emails_log(contact_id);
  `);
}

// ── Contact queries ───────────────────────────────────────────────────────────

function upsertContact(c) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO contacts (email, first_name, last_name, agency_name, phone, city, location, source, website)
    VALUES (@email, @first_name, @last_name, @agency_name, @phone, @city, @location, @source, @website)
    ON CONFLICT(email) DO NOTHING
  `);
  return stmt.run(c);
}

function getContactsDueForStep(step) {
  const db = getDb();
  // Step 1: contacts with 0 emails sent, status = pending
  // Step 2: contacts with 1 email sent, last sent >= 3 days ago
  // Step 3: contacts with 2 emails sent, last sent >= 3 days ago
  const dayGap = step === 1 ? 0 : 3;

  if (step === 1) {
    return db.prepare(`
      SELECT c.* FROM contacts c
      WHERE c.status = 'pending'
        AND c.emails_sent = 0
      LIMIT 200
    `).all();
  }

  return db.prepare(`
    SELECT c.* FROM contacts c
    WHERE c.status = 'active'
      AND c.emails_sent = ?
      AND EXISTS (
        SELECT 1 FROM emails_log el
        WHERE el.contact_id = c.id
          AND el.sequence_step = ?
          AND el.sent_at <= datetime('now', '-${dayGap} days')
      )
    LIMIT 200
  `).all(step - 1, step - 1);
}

function markEmailSent(contactId, step, subject, messageId) {
  const db = getDb();

  db.prepare(`
    INSERT INTO emails_log (contact_id, sequence_step, subject, message_id)
    VALUES (?, ?, ?, ?)
  `).run(contactId, step, subject, messageId || null);

  const newStatus = step === 1 ? "active" : step === 3 ? "done" : "active";
  db.prepare(`
    UPDATE contacts SET emails_sent = emails_sent + 1, status = ? WHERE id = ?
  `).run(newStatus, contactId);
}

function markOpened(contactId, step) {
  const db = getDb();
  db.prepare(`
    UPDATE emails_log
    SET opened_at = COALESCE(opened_at, datetime('now')),
        open_count = open_count + 1,
        status = 'opened'
    WHERE contact_id = ? AND sequence_step = ?
  `).run(contactId, step);
}

function markReplied(email) {
  const db = getDb();
  db.prepare(`
    UPDATE contacts SET status = 'replied', replied_at = datetime('now')
    WHERE email = ? AND status = 'active'
  `).run(email);
}

function markBounced(email) {
  const db = getDb();
  db.prepare(`UPDATE contacts SET status = 'bounced' WHERE email = ?`).run(email);
}

function markUnsubscribed(contactId) {
  const db = getDb();
  db.prepare(`
    UPDATE contacts SET status = 'unsubscribed', unsubscribed_at = datetime('now')
    WHERE id = ?
  `).run(contactId);
}

function getStats() {
  const db = getDb();
  return {
    total:         db.prepare(`SELECT COUNT(*) as n FROM contacts`).get().n,
    pending:       db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE status = 'pending'`).get().n,
    active:        db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE status = 'active'`).get().n,
    done:          db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE status = 'done'`).get().n,
    replied:       db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE status = 'replied'`).get().n,
    bounced:       db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE status = 'bounced'`).get().n,
    unsubscribed:  db.prepare(`SELECT COUNT(*) as n FROM contacts WHERE status = 'unsubscribed'`).get().n,
    emails_sent:   db.prepare(`SELECT COUNT(*) as n FROM emails_log`).get().n,
    emails_opened: db.prepare(`SELECT COUNT(*) as n FROM emails_log WHERE open_count > 0`).get().n,
    step1_sent:    db.prepare(`SELECT COUNT(*) as n FROM emails_log WHERE sequence_step = 1`).get().n,
    step2_sent:    db.prepare(`SELECT COUNT(*) as n FROM emails_log WHERE sequence_step = 2`).get().n,
    step3_sent:    db.prepare(`SELECT COUNT(*) as n FROM emails_log WHERE sequence_step = 3`).get().n,
  };
}

function getAllContacts(limit = 100, offset = 0) {
  return getDb().prepare(`
    SELECT c.*,
      (SELECT sent_at FROM emails_log WHERE contact_id = c.id AND sequence_step = 1) as step1_sent,
      (SELECT sent_at FROM emails_log WHERE contact_id = c.id AND sequence_step = 2) as step2_sent,
      (SELECT sent_at FROM emails_log WHERE contact_id = c.id AND sequence_step = 3) as step3_sent,
      (SELECT open_count FROM emails_log WHERE contact_id = c.id ORDER BY sequence_step DESC LIMIT 1) as opens
    FROM contacts c
    ORDER BY c.imported_at DESC
    LIMIT ? OFFSET ?
  `).all(limit, offset);
}

module.exports = {
  getDb,
  upsertContact,
  getContactsDueForStep,
  markEmailSent,
  markOpened,
  markReplied,
  markBounced,
  markUnsubscribed,
  getStats,
  getAllContacts,
};
