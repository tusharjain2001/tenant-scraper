const { ImapFlow } = require("imapflow");

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

(async () => {
  await client.connect();
  const folders = await client.list();
  console.log("\nAvailable IMAP folders:");
  folders.forEach(f => console.log(" -", f.path));
  await client.logout();
})().catch(console.error);
