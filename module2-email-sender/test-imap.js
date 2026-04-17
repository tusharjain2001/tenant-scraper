const { ImapFlow } = require("imapflow");
const MailComposer = require("nodemailer/lib/mail-composer");

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

async function buildRaw(opts) {
  return new Promise((resolve, reject) => {
    const mc = new MailComposer(opts);
    mc.compile().build((err, buf) => err ? reject(err) : resolve(buf));
  });
}

(async () => {
  console.log("Connecting to IMAP...");
  await client.connect();
  console.log("Connected.");

  const raw = await buildRaw({
    from: `"${process.env.FROM_NAME}" <${process.env.FROM_EMAIL}>`,
    to: process.env.FROM_EMAIL,
    subject: "IMAP Append Test",
    text: "If you see this in Titan Sent folder, IMAP append is working.",
  });

  console.log("Appending test email to Sent folder...");
  await client.append("Sent", raw, ["\\Seen"]);
  console.log("Success! Check Titan — you should see 'IMAP Append Test' in Sent.");

  await client.logout();
})().catch(err => {
  console.error("FAILED:", err.message);
  process.exit(1);
});
