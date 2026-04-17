const { Router } = require("express");
const supabase   = require("../supabase");

const router = Router();

router.get("/", async (req, res) => {
  try {
    const count = async (table, filters = {}) => {
      let q = supabase.from(table).select("*", { count: "exact", head: true });
      for (const [k, v] of Object.entries(filters)) q = q.eq(k, v);
      const { count: n } = await q;
      return n || 0;
    };

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [total, pending, active, done, replied, bounced,
           totalDubai, totalUk, totalUs,
           emailsToday, callsQueued] = await Promise.all([
      count("leads"),
      count("leads", { lead_status: "pending" }),
      count("leads", { lead_status: "active" }),
      count("leads", { lead_status: "done" }),
      count("leads", { lead_status: "replied" }),
      count("leads", { lead_status: "bounced" }),
      count("leads", { market: "dubai" }),
      count("leads", { market: "uk" }),
      count("leads", { market: "us" }),
      (async () => {
        const { count: n } = await supabase
          .from("email_sequences")
          .select("*", { count: "exact", head: true })
          .gte("sent_at", today.toISOString());
        return n || 0;
      })(),
      count("call_batches", { status: "queued" }),
    ]);

    res.json({
      ok: true,
      summary: {
        leads: { total, pending, active, done, replied, bounced },
        by_market: { dubai: totalDubai, uk: totalUk, us: totalUs },
        emails_today: emailsToday,
        calls_queued: callsQueued,
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
