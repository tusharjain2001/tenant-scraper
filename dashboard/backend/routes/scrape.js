const { Router } = require("express");
const { spawn }  = require("child_process");
const path       = require("path");
const fs         = require("fs");
const supabase   = require("../supabase");

const router       = Router();
const SCRAPER_ROOT = path.resolve(__dirname, "../../../");
const OUTPUT_DIR   = path.join(SCRAPER_ROOT, "output");
const MODULE2      = path.join(SCRAPER_ROOT, "module2-email-sender");
const MODULE2_ENV  = path.join(MODULE2, ".env");

// On startup, mark any orphaned "running" rows as error (leftover from a previous server session)
supabase.from("scrape_runs")
  .update({ status: "error", error: "Server restarted while scrape was running", finished_at: new Date().toISOString() })
  .eq("status", "running")
  .then(({ error }) => { if (error) console.error("[SCRAPE] Orphan cleanup failed:", error.message); });

const PYTHON = process.platform === "win32"
  ? "C:\\Users\\Intel\\AppData\\Local\\Programs\\Python\\Python312\\python.exe"
  : "python3";

// ── Find the latest CSV in output/ matching a pattern ────────────────────────
function latestCsv(prefix = "all_contacts") {
  if (!fs.existsSync(OUTPUT_DIR)) return null;
  const files = fs.readdirSync(OUTPUT_DIR)
    .filter(f => f.startsWith(prefix) && f.endsWith(".csv"))
    .map(f => ({ f, t: fs.statSync(path.join(OUTPUT_DIR, f)).mtimeMs }))
    .sort((a, b) => b.t - a.t);
  return files.length ? path.join(OUTPUT_DIR, files[0].f) : null;
}

// ── Auto-import a CSV into Supabase via the Node importer ────────────────────
function autoImport(csvPath, runId) {
  return new Promise(resolve => {
    if (!csvPath || !fs.existsSync(csvPath)) {
      console.log(`[SCRAPE ${runId}] No CSV found to import`);
      return resolve(0);
    }

    console.log(`[SCRAPE ${runId}] Auto-importing ${csvPath} → Supabase`);

    const child = spawn(
      "node",
      ["--env-file", MODULE2_ENV, "run.js", "import", csvPath],
      { cwd: MODULE2 }
    );

    let imported = 0;
    child.stdout.on("data", chunk => {
      const line = chunk.toString();
      process.stdout.write(`[IMPORT ${runId}] ${line}`);
      const m = line.match(/Imported:\s*(\d+)/);
      if (m) imported = parseInt(m[1]);
    });
    child.stderr.on("data", chunk => process.stderr.write(chunk.toString()));
    child.on("close", () => resolve(imported));
  });
}

// ── POST /api/scrape/run ─────────────────────────────────────────────────────
router.post("/run", async (req, res) => {
  const { market = "us", lead_type = "agency", csv_path } = req.body;

  const source = lead_type === "owner"
    ? (csv_path ? "csv_import" : "apify")
    : "google_maps";

  const { data: run, error: runErr } = await supabase
    .from("scrape_runs")
    .insert({ market, lead_type, source, status: "running" })
    .select()
    .single();

  if (runErr) return res.status(500).json({ ok: false, error: runErr.message });

  // Return immediately so the UI doesn't hang
  res.json({
    ok: true,
    job_id: run.id,
    message: `Scrape started — ${market} / ${lead_type}. Results auto-import into Supabase when done.`,
  });

  // ── Build Python args ──────────────────────────────────────────────────────
  const args = ["main.py", "--market", market, "--lead-type", lead_type, "--output", "output"];
  if (csv_path) args.push("--csv", csv_path);

  // Pass all credentials to Python process
  const childEnv = {
    ...process.env,
    GOOGLE_MAPS_API_KEY: process.env.GOOGLE_MAPS_API_KEY,
    APIFY_TOKEN:         process.env.APIFY_TOKEN,
    PYTHONIOENCODING:    "utf-8",
  };

  const child = spawn(PYTHON, args, { cwd: SCRAPER_ROOT, env: childEnv });

  let stderr = "";
  let stdout = "";

  child.stdout.on("data", chunk => {
    const line = chunk.toString();
    stdout += line;
    process.stdout.write(`[SCRAPE ${run.id}] ${line}`);
  });

  child.stderr.on("data", chunk => {
    stderr += chunk.toString();
    process.stderr.write(chunk.toString());
  });

  child.on("close", async code => {
    if (code !== 0) {
      console.error(`[SCRAPE ${run.id}] Python exited ${code}`);
      await supabase.from("scrape_runs").update({
        status: "error",
        finished_at: new Date().toISOString(),
        error: stderr.slice(0, 1000),
      }).eq("id", run.id);
      return;
    }

    // Find the CSV that was just generated and import it
    const csvFile = latestCsv("all_contacts");
    const imported = await autoImport(csvFile, run.id);

    // Parse total from stdout for leads_found
    const m = stdout.match(/(\d+)\s+agencies|(\d+)\s+owner/i);
    const leadsFound = imported || (m ? parseInt(m[1] || m[2]) : 0);

    await supabase.from("scrape_runs").update({
      status:      "done",
      finished_at: new Date().toISOString(),
      leads_found: leadsFound,
    }).eq("id", run.id);

    console.log(`[SCRAPE ${run.id}] Done — ${leadsFound} leads imported into Supabase`);
  });
});

// ── GET /api/scrape/runs ──────────────────────────────────────────────────────
router.get("/runs", async (req, res) => {
  const { data, error } = await supabase
    .from("scrape_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(20);

  if (error) return res.status(500).json({ ok: false, error: error.message });
  res.json({ ok: true, runs: data });
});

module.exports = router;
