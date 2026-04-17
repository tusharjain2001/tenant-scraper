const { Router } = require("express");
const supabase   = require("../supabase");

const router = Router();

// POST /api/webhooks/elevenlabs/post-call
// Sent by n8n after ElevenLabs completes a call
router.post("/elevenlabs/post-call", async (req, res) => {
  try {
    const {
      lead_id,
      batch_id,
      phone_e164,
      outcome,        // answered | voicemail | no_answer | failed
      summary,
      transcript_json,
    } = req.body;

    if (!lead_id) return res.status(400).json({ ok: false, error: "lead_id required" });

    // Store call attempt
    await supabase.from("call_attempts").insert({
      lead_id,
      batch_id:       batch_id || null,
      phone_e164,
      outcome,
      summary,
      transcript_json: transcript_json || null,
    });

    // Update lead with latest outcome
    await supabase
      .from("leads")
      .update({
        last_call_outcome:    outcome,
        last_call_summary:    summary,
        last_transcript_json: transcript_json || null,
        updated_at:           new Date().toISOString(),
      })
      .eq("id", lead_id);

    res.json({ ok: true });
  } catch (err) {
    console.error("[WEBHOOK] ElevenLabs post-call error:", err.message);
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
