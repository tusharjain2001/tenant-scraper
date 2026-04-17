const { Router } = require("express");
const supabase   = require("../supabase");

const router = Router();

// GET /api/leads
router.get("/", async (req, res) => {
  try {
    const {
      market, lead_type, lead_status, sequence_status, source,
      page = "1", page_size = "50", search,
    } = req.query;

    let q = supabase
      .from("leads")
      .select(`
        id, market, lead_type, source, agency_name, owner_name, email,
        phone_raw, phone_e164, website, listing_url, city, property_address,
        lead_status, sequence_status, mail_sent_at,
        last_call_outcome, last_call_summary, created_at, updated_at,
        email_sequences (sequence_step, sent_at, open_count, status)
      `, { count: "exact" })
      .order("created_at", { ascending: false });

    if (market)          q = q.eq("market", market);
    if (lead_type)       q = q.eq("lead_type", lead_type);
    if (lead_status)     q = q.eq("lead_status", lead_status);
    if (sequence_status) q = q.eq("sequence_status", sequence_status);
    if (source)          q = q.eq("source", source);
    if (search) {
      q = q.or(`agency_name.ilike.%${search}%,owner_name.ilike.%${search}%,email.ilike.%${search}%,city.ilike.%${search}%`);
    }

    const p    = parseInt(page);
    const size = parseInt(page_size);
    q = q.range((p - 1) * size, p * size - 1);

    const { data, count, error } = await q;
    if (error) throw error;

    res.json({
      ok: true,
      items: data,
      pagination: {
        page: p,
        page_size: size,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / size),
      },
    });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/leads/:id
router.get("/:id", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("leads")
      .select(`
        *,
        email_sequences (*),
        email_events (*),
        call_attempts (*)
      `)
      .eq("id", req.params.id)
      .single();

    if (error) throw error;
    res.json({ ok: true, lead: data });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

// GET /api/leads/export.csv
router.get("/export/csv", async (req, res) => {
  try {
    const { market, lead_type, lead_status } = req.query;
    let q = supabase
      .from("leads")
      .select("id,market,lead_type,source,agency_name,owner_name,email,phone_raw,phone_e164,city,property_address,lead_status,sequence_status,mail_sent_at,last_call_outcome,created_at")
      .order("created_at", { ascending: false });

    if (market)      q = q.eq("market", market);
    if (lead_type)   q = q.eq("lead_type", lead_type);
    if (lead_status) q = q.eq("lead_status", lead_status);

    const { data, error } = await q;
    if (error) throw error;

    const cols = Object.keys(data[0] || {});
    const csv  = [
      cols.join(","),
      ...(data || []).map(row =>
        cols.map(c => JSON.stringify(row[c] ?? "")).join(",")
      ),
    ].join("\n");

    res.set({
      "Content-Type":        "text/csv",
      "Content-Disposition": `attachment; filename="leads_${Date.now()}.csv"`,
    });
    res.send(csv);
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

module.exports = router;
