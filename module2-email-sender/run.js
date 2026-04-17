#!/usr/bin/env node
/**
 * Module 2 — Cold Email Sender (Supabase-backed)
 *
 * Commands:
 *   node --env-file=.env run.js import [csv-path]
 *   node --env-file=.env run.js send [1|2|3]
 *   node --env-file=.env run.js status
 *   node --env-file=.env run.js server
 *   node --env-file=.env run.js schedule
 */

const config = require("./config");
const [, , command, arg] = process.argv;

async function main() {
  switch (command) {

    case "import": {
      const { importCsv } = require("./importer");
      const csvPath = arg || config.DEFAULT_CSV_PATH;
      await importCsv(csvPath);
      break;
    }

    case "send": {
      if (!config.SMTP?.auth?.user || !config.SMTP?.auth?.pass) {
        console.error("\nERROR: SMTP credentials missing.\n");
        process.exit(1);
      }
      const { runAllSteps, runStep } = require("./mailer");
      if (arg) {
        const step = parseInt(arg);
        if (![1, 2, 3].includes(step)) { console.error("Step must be 1, 2, or 3"); process.exit(1); }
        await runStep(step);
      } else {
        await runAllSteps();
      }
      await printStats();
      break;
    }

    case "status": {
      await printStats();
      break;
    }

    case "server": {
      const { start } = require("./server");
      start();
      break;
    }

    case "schedule": {
      const cron = require("node-cron");
      const { runAllSteps } = require("./mailer");
      const { startPoller }  = require("./reply-poller");
      const { start }        = require("./server");

      console.log(`\nScheduler started — sends at: ${config.SEND_CRON}`);
      console.log("Reply poller runs every 15 min. Press Ctrl+C to stop.\n");

      start();        // tracking server
      startPoller();  // IMAP reply detection

      cron.schedule(config.SEND_CRON, async () => {
        console.log(`\n[${new Date().toISOString()}] Running scheduled send...`);
        await runAllSteps();
        await printStats();
      });

      // Run once on startup
      await runAllSteps();
      await printStats();
      break;
    }

    default: {
      console.log(`
Module 2 — Cold Email Sender

  node --env-file=.env run.js import [csv-path]
  node --env-file=.env run.js send           (all steps)
  node --env-file=.env run.js send 1|2|3     (one step)
  node --env-file=.env run.js status
  node --env-file=.env run.js server
  node --env-file=.env run.js schedule       (cron + tracker + reply-poller)
      `);
    }
  }
}

async function printStats() {
  const supa = require("./supabase");
  const s    = await supa.getStats();
  console.log(`
╔══════════════════════════════════╗
║       EMAIL SEQUENCE STATS       ║
╠══════════════════════════════════╣
║ Total contacts:    ${String(s.total).padStart(10)} ║
║ Pending (unsent):  ${String(s.pending).padStart(10)} ║
║ In sequence:       ${String(s.active).padStart(10)} ║
║ Sequence done:     ${String(s.done).padStart(10)} ║
║ Replied:           ${String(s.replied).padStart(10)} ║
║ Bounced:           ${String(s.bounced).padStart(10)} ║
║ Unsubscribed:      ${String(s.unsubscribed).padStart(10)} ║
╠══════════════════════════════════╣
║ Email 1 sent:      ${String(s.step1_sent).padStart(10)} ║
║ Email 2 sent:      ${String(s.step2_sent).padStart(10)} ║
║ Email 3 sent:      ${String(s.step3_sent).padStart(10)} ║
║ Total sent:        ${String(s.emails_sent).padStart(10)} ║
║ Opens tracked:     ${String(s.emails_opened).padStart(10)} ║
╚══════════════════════════════════╝
  `);
}

main().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
