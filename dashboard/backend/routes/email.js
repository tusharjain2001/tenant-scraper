const { Router } = require("express");
const { spawn }  = require("child_process");
const path       = require("path");

const router     = Router();
const MODULE2    = path.resolve(__dirname, "../../../module2-email-sender");
const ENV_FILE   = path.join(MODULE2, ".env");

// POST /api/email/start  — runs one send cycle (all steps, daily limit)
router.post("/start", async (req, res) => {
  const { step } = req.body; // optional: send only step 1, 2, or 3

  const args = ["--env-file", ENV_FILE, "run.js", "send"];
  if (step) args.push(String(step));

  res.json({ ok: true, message: `Email send started${step ? ` (step ${step})` : ""}. Check terminal for progress.` });

  const child = spawn("node", args, { cwd: MODULE2 });

  child.stdout.on("data", chunk => process.stdout.write(`[EMAIL] ${chunk}`));
  child.stderr.on("data", chunk => process.stderr.write(`[EMAIL ERR] ${chunk}`));
  child.on("close", code => console.log(`[EMAIL] Process exited with code ${code}`));
});

// GET /api/email/status
router.get("/status", async (req, res) => {
  // Quick status from Supabase
  const supabase = require("../supabase");
  const today    = new Date(); today.setHours(0, 0, 0, 0);

  const { count: sentToday } = await supabase
    .from("email_sequences")
    .select("*", { count: "exact", head: true })
    .gte("sent_at", today.toISOString());

  const stats = {};
  for (const step of [1, 2, 3]) {
    const { count } = await supabase
      .from("email_sequences")
      .select("*", { count: "exact", head: true })
      .eq("sequence_step", step);
    stats[`step${step}`] = count || 0;
  }

  res.json({ ok: true, sent_today: sentToday || 0, ...stats });
});

module.exports = router;
