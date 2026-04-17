const { Router } = require("express");
const supabase   = require("../supabase");

const router = Router();

const CALLING_ENABLED = !!(process.env.ELEVENLABS_API_KEY && process.env.N8N_WEBHOOK_URL);

// POST /api/calls/queue
router.post("/queue", async (req, res) => {
  if (!CALLING_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: "Calling not configured. Set ELEVENLABS_API_KEY and N8N_WEBHOOK_URL in backend .env.",
      configured: false,
    });
  }

  try {
    const { market = "us", limit = 20 } = req.body;

    // Only US leads with a phone number that haven't been called yet
    const { data: leads } = await supabase
      .from("leads")
      .select("id, agency_name, owner_name, email, phone_raw, phone_e164, city, market")
      .eq("market", market)
      .not("phone_raw", "is", null)
      .not("phone_raw", "eq", "")
      .not("last_call_outcome", "in", '("answered","voicemail")')
      .limit(limit);

    if (!leads?.length) {
      return res.json({ ok: true, message: "No eligible leads for calling.", queued: 0 });
    }

    // Create call batch record
    const n8nPayload = {
      leads: leads.map(l => ({
        id:    l.id,
        name:  l.agency_name || l.owner_name || "there",
        phone: l.phone_e164 || l.phone_raw,
        city:  l.city,
      })),
      market,
      callback_url: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/webhooks/elevenlabs/post-call`,
    };

    const { data: batch } = await supabase
      .from("call_batches")
      .insert({ market, n8n_payload: n8nPayload, status: "queued" })
      .select()
      .single();

    // Send to n8n
    const fetch = (await import("node-fetch")).default;
    await fetch(process.env.N8N_WEBHOOK_URL, {
      method:  "POST",
      headers: { "Content-Type": "application/json" },
      body:    JSON.stringify({ batch_id: batch.id, ...n8nPayload }),
    });

    await supabase.from("call_batches").update({ status: "sent" }).eq("id", batch.id);

    res.json({ ok: true, batch_id: batch.id, queued: leads.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/calls/status
router.get("/status", async (_req, res) => {
  res.json({ ok: true, configured: CALLING_ENABLED });
});

module.exports = router;
