/**
 * Mailer — sends via Nodemailer (SMTP) + appends to IMAP Sent folder via ImapFlow
 * Data layer: Supabase (via supabase.js)
 */
const nodemailer   = require("nodemailer");
const { ImapFlow } = require("imapflow");
const MailComposer = require("nodemailer/lib/mail-composer");
const config  = require("./config");
const supa    = require("./supabase");

const TEMPLATES = [
  null,
  require("./templates/email1"),
  require("./templates/email2"),
  require("./templates/email3"),
];

const transporter = nodemailer.createTransport({
  host:   config.SMTP.host,
  port:   config.SMTP.port,
  secure: config.SMTP.secure,
  auth:   config.SMTP.auth,
});

function personalise(text, contact, extras = {}) {
  const vars = {
    first_name:      contact.first_name || contact.agency_name?.split(" ")[0] || "there",
    last_name:       contact.last_name  || "",
    agency_name:     contact.agency_name || "your agency",
    city:            contact.city || contact.location || "your city",
    phone:           contact.phone_raw || contact.phone || "",
    email:           contact.email || "",
    unsubscribe_url: `${config.TRACKING_BASE_URL}/unsubscribe/${contact.id}`,
    ...extras,
  };
  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

function trackingPixel(contactId, step) {
  return `<img src="${config.TRACKING_BASE_URL}/open/${contactId}/${step}" width="1" height="1" alt="" style="display:none" />`;
}

async function buildRaw(mailOptions) {
  return new Promise((resolve, reject) => {
    const mc = new MailComposer(mailOptions);
    mc.compile().build((err, buf) => err ? reject(err) : resolve(buf));
  });
}

async function appendToSent(rawBuffer) {
  const client = new ImapFlow({
    host:   config.IMAP.host,
    port:   config.IMAP.port,
    secure: config.IMAP.secure,
    auth:   config.IMAP.auth,
    logger: false,
  });
  try {
    await client.connect();
    await client.append(config.IMAP_SENT_FOLDER, rawBuffer, ["\\Seen"]);
  } finally {
    await client.logout().catch(() => {});
  }
}

async function sendSequenceEmail(contact, step) {
  const tpl = TEMPLATES[step];
  if (!tpl) throw new Error(`No template for step ${step}`);

  const subject  = personalise(tpl.subject(contact), contact);
  const htmlBody = personalise(tpl.html(contact), contact) + "\n" + trackingPixel(contact.id, step);
  const textBody = personalise(tpl.text(contact), contact);

  const mailOptions = {
    from:    `"${config.FROM_NAME}" <${config.FROM_EMAIL}>`,
    to:      contact.email,
    ...(config.BCC_SELF ? { bcc: config.BCC_SELF } : {}),
    subject,
    html:    htmlBody,
    text:    textBody,
  };

  try {
    const info      = await transporter.sendMail(mailOptions);
    const messageId = info.messageId || null;

    try {
      const raw = await buildRaw(mailOptions);
      await appendToSent(raw);
    } catch (imapErr) {
      console.warn(`  [IMAP] Could not append to Sent: ${imapErr.message}`);
    }

    await supa.markEmailSent(contact.id, step, subject, messageId);
    return { ok: true, messageId };
  } catch (err) {
    const code = err?.responseCode;
    if (code === 550 || err?.message?.includes("bounce")) {
      await supa.markBounced(contact.email);
    }
    return { ok: false, error: err.message, code };
  }
}

async function runStep(step, limit = config.MAX_EMAILS_PER_DAY) {
  const contacts = await supa.getContactsDueForStep(step);
  const batch    = contacts.slice(0, limit);

  console.log(`\nStep ${step}: ${batch.length} contacts due (${contacts.length} total eligible)`);

  let sent = 0, failed = 0;

  for (const contact of batch) {
    if (!contact.email || !contact.email.includes("@")) continue;

    const result = await sendSequenceEmail(contact, step);

    if (result.ok) {
      sent++;
      console.log(`  [${step}] SENT → ${contact.email} (${contact.agency_name})`);
    } else {
      failed++;
      console.log(`  [${step}] FAIL → ${contact.email}: ${result.error}`);
    }

    if (sent + failed < batch.length) await sleep(config.DELAY_BETWEEN_EMAILS_MS);
  }

  console.log(`  Done: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

async function runAllSteps() {
  let remaining = config.MAX_EMAILS_PER_DAY;
  const results = {};

  for (const step of [1, 2, 3]) {
    if (remaining <= 0) { console.log(`Daily limit reached, skipping step ${step}`); break; }
    const r = await runStep(step, remaining);
    results[`step${step}`] = r;
    remaining -= (r.sent + r.failed);
  }

  return results;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

module.exports = { sendSequenceEmail, runStep, runAllSteps, personalise };
