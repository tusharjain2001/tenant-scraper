#!/usr/bin/env node
/**
 * Module 2 — Cold Email Sender
 *
 * Commands:
 *   node run.js import [csv-path]   Import contacts from Module 1 CSV
 *   node run.js send                Send today's batch (all 3 steps)
 *   node run.js send 1              Send only step 1
 *   node run.js send 2              Send only step 2
 *   node run.js send 3              Send only step 3
 *   node run.js status              Show stats summary
 *   node run.js server              Start open-tracking server
 *   node run.js schedule            Start cron scheduler (runs daily)
 */

const config = require("./config");

const [, , command, arg] = process.argv;

async function main() {
  switch (command) {

    // ── Import CSV ───────────────────────────────────────────
    case "import": {
      const { importCsv } = require("./importer");
      const csvPath = arg || config.DEFAULT_CSV_PATH;
      importCsv(csvPath);
      break;
    }

    // ── Send emails ──────────────────────────────────────────
    case "send": {
      if (!config.SMTP?.auth?.user || !config.SMTP?.auth?.pass) {
        console.error("\nERROR: SMTP credentials missing in config.js\n");
        process.exit(1);
      }
      const { runAllSteps, runStep } = require("./mailer");
      if (arg) {
        const step = parseInt(arg);
        if (![1, 2, 3].includes(step)) {
          console.error("Step must be 1, 2, or 3");
          process.exit(1);
        }
        await runStep(step);
      } else {
        await runAllSteps();
      }
      printStats();
      break;
    }

    // ── Status ───────────────────────────────────────────────
    case "status": {
      printStats();
      break;
    }

    // ── Tracking server ──────────────────────────────────────
    case "server": {
      const { start } = require("./server");
      start();
      break;
    }

    // ── Cron scheduler ───────────────────────────────────────
    case "schedule": {
      if (config.SMTP.auth.user === "your@gmail.com") {
        console.error("\nERROR: Set your SMTP credentials in config.js first.\n");
        process.exit(1);
      }
      const cron = require("node-cron");
      const { runAllSteps } = require("./mailer");

      console.log(`\nScheduler started. Will send at: ${config.SEND_CRON}`);
      console.log("Press Ctrl+C to stop.\n");

      // Also start tracking server in same process
      const { start } = require("./server");
      start();

      cron.schedule(config.SEND_CRON, async () => {
        console.log(`\n[${new Date().toISOString()}] Running scheduled send...`);
        await runAllSteps();
        printStats();
      });

      // Run immediately once on startup
      console.log("Running initial send...");
      await runAllSteps();
      printStats();
      break;
    }

    // ── Help ─────────────────────────────────────────────────
    default: {
      console.log(`
Module 2 — Cold Email Sender

Commands:
  node run.js import [csv-path]   Import contacts from CSV
  node run.js send                Send today's batch (all steps)
  node run.js send 1              Send step 1 only
  node run.js send 2              Send step 2 only
  node run.js send 3              Send step 3 only
  node run.js status              Show stats
  node run.js server              Start tracking server
  node run.js schedule            Run on cron + tracking server

Setup:
  1. Edit config.js — add SENDGRID_API_KEY and FROM_EMAIL
  2. Run: node run.js import
  3. Run: node run.js send
      `);
    }
  }
}

function printStats() {
  const db = require("./db");
  const s = db.getStats();
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

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
