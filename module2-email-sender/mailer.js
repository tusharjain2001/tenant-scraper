/**
 * Mailer — sends via SendGrid, handles personalisation + tracking pixel
 */
const sgMail = require("@sendgrid/mail");
const config = require("./config");
const db = require("./db");

const TEMPLATES = [
  null,                           // index 0 unused
  require("./templates/email1"),  // step 1
  require("./templates/email2"),  // step 2
  require("./templates/email3"),  // step 3
];

sgMail.setApiKey(config.SENDGRID_API_KEY);

/**
 * Replace all {{token}} placeholders in a string
 */
function personalise(text, contact, extras = {}) {
  const vars = {
    first_name:    contact.first_name || contact.agency_name?.split(" ")[0] || "there",
    last_name:     contact.last_name  || "",
    agency_name:   contact.agency_name || "your agency",
    city:          contact.city || contact.location || "your city",
    phone:         contact.phone || "",
    email:         contact.email || "",
    unsubscribe_url: `${config.TRACKING_BASE_URL}/unsubscribe/${contact.id}`,
    ...extras,
  };

  return text.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

/**
 * Build the tracking pixel HTML snippet
 */
function trackingPixel(contactId, step) {
  const url = `${config.TRACKING_BASE_URL}/open/${contactId}/${step}`;
  return `<img src="${url}" width="1" height="1" alt="" style="display:none" />`;
}

/**
 * Send one email in the sequence to one contact
 */
async function sendSequenceEmail(contact, step) {
  const tpl = TEMPLATES[step];
  if (!tpl) throw new Error(`No template for step ${step}`);

  const subject = personalise(tpl.subject(contact), contact);
  const htmlBody = personalise(tpl.html(contact), contact)
    + "\n"
    + trackingPixel(contact.id, step);
  const textBody = personalise(tpl.text(contact), contact);

  const msg = {
    to:      contact.email,
    from:    { email: config.FROM_EMAIL, name: config.FROM_NAME },
    subject,
    html:    htmlBody,
    text:    textBody,
    trackingSettings: {
      clickTracking:      { enable: false },
      openTracking:       { enable: false }, // we do our own pixel
      subscriptionTracking: { enable: false },
    },
  };

  try {
    const [response] = await sgMail.send(msg);
    const messageId = response?.headers?.["x-message-id"] || null;
    db.markEmailSent(contact.id, step, subject, messageId);
    return { ok: true, messageId };
  } catch (err) {
    const code = err?.response?.status;
    const body = err?.response?.body;
    if (code === 550 || (body?.errors || []).some(e => e.message?.includes("bounce"))) {
      db.markBounced(contact.email);
    }
    return { ok: false, error: err.message, code };
  }
}

/**
 * Send today's batch for a given step
 */
async function runStep(step, limit = config.MAX_EMAILS_PER_DAY) {
  const contacts = db.getContactsDueForStep(step);
  const batch = contacts.slice(0, limit);

  console.log(`\nStep ${step}: ${batch.length} contacts due (${contacts.length} total eligible)`);

  let sent = 0, failed = 0;

  for (const contact of batch) {
    // Skip contacts without email
    if (!contact.email || !contact.email.includes("@")) {
      continue;
    }

    const result = await sendSequenceEmail(contact, step);

    if (result.ok) {
      sent++;
      console.log(`  [${step}] SENT → ${contact.email} (${contact.agency_name})`);
    } else {
      failed++;
      console.log(`  [${step}] FAIL → ${contact.email}: ${result.error}`);
    }

    // Delay between sends
    if (sent + failed < batch.length) {
      await sleep(config.DELAY_BETWEEN_EMAILS_MS);
    }
  }

  console.log(`  Done: ${sent} sent, ${failed} failed`);
  return { sent, failed };
}

/**
 * Run all 3 steps, respecting daily limit across all steps
 */
async function runAllSteps() {
  const dailyLimit = config.MAX_EMAILS_PER_DAY;
  let remaining = dailyLimit;
  const results = {};

  for (const step of [1, 2, 3]) {
    if (remaining <= 0) {
      console.log(`Daily limit (${dailyLimit}) reached, skipping step ${step}`);
      break;
    }
    const r = await runStep(step, remaining);
    results[`step${step}`] = r;
    remaining -= (r.sent + r.failed);
  }

  return results;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = { sendSequenceEmail, runStep, runAllSteps, personalise };
