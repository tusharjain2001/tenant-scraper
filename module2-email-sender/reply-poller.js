/**
 * IMAP Reply Poller — checks INBOX every 15 min for replies from leads
 * Marks matched leads as replied → stops future sequence emails
 */
const { ImapFlow } = require("imapflow");
const supa = require("./supabase");

const POLL_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

async function pollReplies() {
  const client = new ImapFlow({
    host:   process.env.IMAP_HOST,
    port:   parseInt(process.env.IMAP_PORT || "993"),
    secure: process.env.IMAP_SECURE !== "false",
    auth: {
      user: process.env.IMAP_USER,
      pass: process.env.IMAP_PASS,
    },
    logger: false,
  });

  try {
    await client.connect();
    await client.mailboxOpen("INBOX");

    // Fetch unseen messages from the last 30 days
    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const messages = client.fetch(
      { since },
      { envelope: true }
    );

    let checked = 0, found = 0;

    for await (const msg of messages) {
      const fromAddr = msg.envelope?.from?.[0]?.address?.toLowerCase();
      if (!fromAddr) continue;
      checked++;

      // Skip our own sent emails (avoid marking self as replied)
      if (fromAddr === process.env.FROM_EMAIL?.toLowerCase()) continue;

      // Check if this address is a known lead
      const { data } = await require("@supabase/supabase-js")
        .createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)
        .from("leads")
        .select("id, lead_status")
        .eq("email", fromAddr)
        .maybeSingle();

      if (data && data.lead_status === "active") {
        await supa.markReplied(fromAddr);
        console.log(`[REPLY-POLLER] Marked replied: ${fromAddr}`);
        found++;
      }
    }

    console.log(`[REPLY-POLLER] Checked ${checked} messages, found ${found} replies`);
    await client.logout();
  } catch (err) {
    console.warn(`[REPLY-POLLER] Error: ${err.message}`);
  }
}

function startPoller() {
  console.log("[REPLY-POLLER] Starting — polling every 15 min");
  pollReplies(); // run immediately
  setInterval(pollReplies, POLL_INTERVAL_MS);
}

module.exports = { startPoller, pollReplies };
