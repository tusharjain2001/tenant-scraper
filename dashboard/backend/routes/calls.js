const { Router } = require("express");
const supabase = require("../supabase");
const {
  TOKEN_TTL_SECONDS,
  buildCallSummary,
  buildPublicUrl,
  createOutboundTwiml,
  createVoiceToken,
  createAdminClient,
  getTwilioConfig,
  getTwilioMissingVars,
  isUsableBackendUrl,
  isTwilioConfigured,
  mapCallOutcome,
  maskPhoneNumber,
  sanitizeClientIdentity,
  sanitizeOutboundNumber,
  validateTwilioWebhook,
} = require("../lib/twilio");

const router = Router();

const LEGACY_QUEUE_ENABLED = !!(process.env.ELEVENLABS_API_KEY && process.env.N8N_WEBHOOK_URL);

async function upsertCallAttempt(payload) {
  const { error } = await supabase
    .from("call_attempts")
    .upsert(payload, { onConflict: "twilio_call_sid" });

  if (error) throw error;
}

// GET /api/calls/status
router.get("/status", async (_req, res) => {
  const config = getTwilioConfig();
  const missing = getTwilioMissingVars();
  const errors = missing.map(name => `Missing ${name} in dashboard/backend/.env.`);

  if (config.backendUrl && !isUsableBackendUrl(config.backendUrl)) {
    errors.push("BACKEND_URL must be a public http(s) URL reachable by Twilio. Do not leave it as localhost or replace-me.example.com.");
  }

  if (config.accountSid && config.authToken && config.twimlAppSid) {
    try {
      const client = createAdminClient();
      const app = await client.applications(config.twimlAppSid).fetch();
      const expectedVoiceUrl = buildPublicUrl("/api/calls/twiml/outbound");
      const actualVoiceUrl = (app.voiceUrl || "").trim().replace(/\/+$/, "");

      if (!actualVoiceUrl) {
        errors.push("The configured TwiML App does not have a Voice URL.");
      } else if (actualVoiceUrl !== expectedVoiceUrl) {
        errors.push(`Twilio TwiML App Voice URL mismatch. Expected ${expectedVoiceUrl} but found ${actualVoiceUrl}.`);
      }
    } catch (err) {
      errors.push(`Unable to verify the TwiML App configuration: ${err.message}`);
    }
  }

  res.json({
    ok: true,
    configured: errors.length === 0,
    caller_id: config.callerId || null,
    backend_url: config.backendUrl || null,
    token_ttl_seconds: TOKEN_TTL_SECONDS,
    errors,
    legacy_queue_configured: LEGACY_QUEUE_ENABLED,
  });
});

// POST /api/calls/token
router.post("/token", async (req, res) => {
  const missing = getTwilioMissingVars();
  if (missing.length > 0) {
    return res.status(503).json({
      ok: false,
      configured: false,
      error: `Twilio calling is not configured. Missing: ${missing.join(", ")}`,
    });
  }

  try {
    const identity = sanitizeClientIdentity(req.body?.identity);
    const token = createVoiceToken(identity);

    res.set("Cache-Control", "no-store");
    res.json({
      ok: true,
      configured: true,
      identity,
      token,
      expires_in: TOKEN_TTL_SECONDS,
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/calls/twiml/outbound
router.post("/twiml/outbound", async (req, res) => {
  if (!isTwilioConfigured()) {
    return res.status(503).type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>Calling is not configured.</Say><Hangup/></Response>");
  }

  if (!validateTwilioWebhook(req)) {
    return res.status(403).json({ ok: false, error: "Invalid Twilio signature." });
  }

  const toInput = req.body?.To || req.body?.to || "";
  const leadId = req.body?.leadId || "";
  const agentIdentity = sanitizeClientIdentity(req.body?.agentIdentity);
  const normalized = sanitizeOutboundNumber(toInput);

  if (!normalized.ok) {
    return res.status(400).type("text/xml").send("<?xml version=\"1.0\" encoding=\"UTF-8\"?><Response><Say>The dialed number is invalid.</Say><Hangup/></Response>");
  }

  console.log(`[CALLS] Outbound browser call requested for ${maskPhoneNumber(normalized.e164)} by ${agentIdentity}`);

  res.set("Content-Type", "text/xml");
  res.set("Cache-Control", "no-store");
  res.send(createOutboundTwiml({
    to: normalized.e164,
    leadId,
    agentIdentity,
  }));
});

// POST /api/calls/status-callback
router.post("/status-callback", async (req, res) => {
  if (!isTwilioConfigured()) {
    return res.status(503).json({ ok: false, error: "Twilio calling is not configured." });
  }

  if (!validateTwilioWebhook(req)) {
    return res.status(403).json({ ok: false, error: "Invalid Twilio signature." });
  }

  try {
    const leadId = req.query.leadId || req.body?.leadId || null;
    const agentIdentity = sanitizeClientIdentity(req.query.agentIdentity || req.body?.agentIdentity);
    const callSid = req.body?.CallSid;
    const parentCallSid = req.body?.ParentCallSid || null;
    const callStatus = req.body?.CallStatus || null;
    const answeredBy = req.body?.AnsweredBy || null;
    const durationSeconds = Number.parseInt(req.body?.CallDuration || req.body?.Duration || "0", 10) || 0;
    const to = req.body?.To || null;
    const from = req.body?.From || null;
    const errorCode = req.body?.ErrorCode || null;
    const errorMessage = req.body?.ErrorMessage || null;
    const outcome = mapCallOutcome({ callStatus, answeredBy });
    const summary = buildCallSummary({
      to,
      outcome,
      durationSeconds,
      callStatus,
      answeredBy,
      errorMessage,
    });

    await upsertCallAttempt({
      lead_id: leadId || null,
      phone_e164: to,
      outcome,
      summary,
      called_at: new Date().toISOString(),
      twilio_call_sid: callSid,
      twilio_parent_call_sid: parentCallSid,
      status: callStatus,
      duration_seconds: durationSeconds || null,
      from_number: from,
      agent_identity: agentIdentity,
      error_code: errorCode,
      error_message: errorMessage,
      answered_by: answeredBy,
      direction: "outbound_browser",
    });

    if (leadId && outcome) {
      await supabase
        .from("leads")
        .update({
          last_call_outcome: outcome,
          last_call_summary: summary,
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
    }

    console.log(`[CALLS] Callback ${callStatus || "unknown"} for ${maskPhoneNumber(to)} (${callSid || "no-sid"})`);
    res.json({ ok: true });
  } catch (err) {
    console.error("[CALLS] Twilio status callback error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/calls/history
router.get("/history", async (req, res) => {
  try {
    const limit = Number.parseInt(req.query.limit || "15", 10) || 15;
    let query = supabase
      .from("call_attempts")
      .select(`
        id,
        lead_id,
        phone_e164,
        outcome,
        summary,
        called_at,
        twilio_call_sid,
        status,
        duration_seconds,
        from_number,
        agent_identity,
        leads (
          id,
          agency_name,
          owner_name,
          city,
          market
        )
      `)
      .order("called_at", { ascending: false })
      .limit(limit);

    if (req.query.lead_id) {
      query = query.eq("lead_id", req.query.lead_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ ok: true, items: data || [] });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// POST /api/calls/queue
// Legacy batch queue path kept as a secondary option.
router.post("/queue", async (req, res) => {
  if (!LEGACY_QUEUE_ENABLED) {
    return res.status(503).json({
      ok: false,
      error: "Legacy queue calling not configured. Set ELEVENLABS_API_KEY and N8N_WEBHOOK_URL to enable it.",
      configured: false,
    });
  }

  try {
    const { market = "us", limit = 20 } = req.body;

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

    const n8nPayload = {
      leads: leads.map(lead => ({
        id: lead.id,
        name: lead.agency_name || lead.owner_name || "there",
        phone: lead.phone_e164 || lead.phone_raw,
        city: lead.city,
      })),
      market,
      callback_url: `${process.env.BACKEND_URL || "http://localhost:4000"}/api/webhooks/elevenlabs/post-call`,
    };

    const { data: batch } = await supabase
      .from("call_batches")
      .insert({ market, n8n_payload: n8nPayload, status: "queued" })
      .select()
      .single();

    const fetch = (await import("node-fetch")).default;
    await fetch(process.env.N8N_WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ batch_id: batch.id, ...n8nPayload }),
    });

    await supabase.from("call_batches").update({ status: "sent" }).eq("id", batch.id);

    res.json({ ok: true, batch_id: batch.id, queued: leads.length });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
