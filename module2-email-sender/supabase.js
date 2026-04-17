/**
 * Supabase DB layer — replaces db.js (SQLite)
 * Same public interface so mailer.js / importer.js / server.js / run.js
 * require zero interface changes (just swap the require path).
 *
 * Uses service-role key so RLS doesn't block server-side writes.
 */
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Upsert a contact (lead) ───────────────────────────────────────────────────
// Returns true if newly inserted, false if duplicate skipped.
async function upsertContact(c) {
  const email    = c.email || null;
  const phoneRaw = c.phone || "";

  // If no email, dedup on phone_raw to avoid inserting the same number twice
  if (!email && phoneRaw) {
    const { data: existing } = await supabase
      .from("leads")
      .select("id")
      .eq("phone_raw", phoneRaw)
      .maybeSingle();
    if (existing) return false; // already in DB
  }

  const row = {
    owner_name:      c.owner_name || "",
    agency_name:     c.agency_name || "",
    phone_raw:       phoneRaw,
    city:            c.city        || "",
    listing_url:     c.website     || "",
    source:          c.source      || "google_maps",
    market:          c.market      || "dubai",
    lead_type:       c.lead_type   || "agency",
    lead_status:     "pending",
    sequence_status: "not_started",
  };
  if (email) row.email = email; // only set if present (allows multiple NULLs via PG unique)

  const { error } = await supabase.from("leads").insert(row).select();

  if (error) {
    if (error.code === "23505") return false; // duplicate email
    console.error("[supabase] upsertContact error:", error.message);
    return false;
  }
  return true;
}

// ── Contacts due for a sequence step ──────────────────────────────────────────
async function getContactsDueForStep(step) {
  if (step === 1) {
    // Never emailed — pending with no email_sequences rows
    const { data, error } = await supabase
      .from("leads")
      .select("*")
      .eq("lead_status", "pending")
      .is("mail_sent_at", null)
      .limit(200);

    if (error) { console.error("[supabase] getContactsDueForStep(1):", error.message); return []; }
    return data || [];
  }

  // Steps 2 & 3: active leads whose previous step was sent ≥ 3 days ago
  // and haven't received the current step yet.
  const prevStep = step - 1;
  const cutoff   = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();

  const { data: prevSent, error: e1 } = await supabase
    .from("email_sequences")
    .select("lead_id")
    .eq("sequence_step", prevStep)
    .lte("sent_at", cutoff);

  if (e1) { console.error("[supabase] getContactsDueForStep prev:", e1.message); return []; }
  if (!prevSent?.length) return [];

  const prevIds = prevSent.map(r => r.lead_id);

  // Leads that already received this step
  const { data: alreadySent } = await supabase
    .from("email_sequences")
    .select("lead_id")
    .eq("sequence_step", step)
    .in("lead_id", prevIds);

  const alreadyIds = new Set((alreadySent || []).map(r => r.lead_id));
  const eligible   = prevIds.filter(id => !alreadyIds.has(id));
  if (!eligible.length) return [];

  const { data, error: e2 } = await supabase
    .from("leads")
    .select("*")
    .eq("lead_status", "active")
    .in("id", eligible)
    .limit(200);

  if (e2) { console.error("[supabase] getContactsDueForStep leads:", e2.message); return []; }
  return data || [];
}

// ── Mark email sent ───────────────────────────────────────────────────────────
async function markEmailSent(leadId, step, subject, messageId) {
  await supabase.from("email_sequences").insert({
    lead_id:       leadId,
    sequence_step: step,
    subject,
    message_id:    messageId || null,
    status:        "sent",
  });

  const update = {
    lead_status:     step >= 3 ? "done" : "active",
    sequence_status: step >= 3 ? "completed" : "active",
  };
  if (step === 1) update.mail_sent_at = new Date().toISOString();

  await supabase.from("leads").update(update).eq("id", leadId);
}

// ── Mark opened ───────────────────────────────────────────────────────────────
async function markOpened(leadId, step) {
  const { data } = await supabase
    .from("email_sequences")
    .select("id, open_count")
    .eq("lead_id", leadId)
    .eq("sequence_step", step)
    .maybeSingle();

  if (!data) return;

  await supabase
    .from("email_sequences")
    .update({
      opened_at:  data.opened_at || new Date().toISOString(),
      open_count: (data.open_count || 0) + 1,
      status:     "opened",
    })
    .eq("id", data.id);

  await supabase.from("email_events").insert({
    lead_id:    leadId,
    event_type: "open",
  });
}

// ── Mark replied ──────────────────────────────────────────────────────────────
async function markReplied(email) {
  const { data } = await supabase
    .from("leads")
    .select("id")
    .eq("email", email.toLowerCase())
    .eq("lead_status", "active")
    .maybeSingle();

  if (!data) return;

  await supabase
    .from("leads")
    .update({ lead_status: "replied", sequence_status: "stopped" })
    .eq("id", data.id);

  await supabase.from("email_events").insert({
    lead_id:    data.id,
    event_type: "reply",
  });
}

// ── Mark bounced ──────────────────────────────────────────────────────────────
async function markBounced(email) {
  await supabase
    .from("leads")
    .update({ lead_status: "bounced" })
    .eq("email", email.toLowerCase());
}

// ── Mark unsubscribed ─────────────────────────────────────────────────────────
async function markUnsubscribed(leadId) {
  await supabase
    .from("leads")
    .update({ lead_status: "unsubscribed", sequence_status: "stopped" })
    .eq("id", leadId);

  await supabase.from("email_events").insert({
    lead_id:    leadId,
    event_type: "unsubscribe",
  });
}

// ── Stats ─────────────────────────────────────────────────────────────────────
async function getStats() {
  const count = async (filters = {}) => {
    let q = supabase.from("leads").select("*", { count: "exact", head: true });
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    const { count: n } = await q;
    return n || 0;
  };

  const emailCount = async (filters = {}) => {
    let q = supabase.from("email_sequences").select("*", { count: "exact", head: true });
    for (const [col, val] of Object.entries(filters)) q = q.eq(col, val);
    const { count: n } = await q;
    return n || 0;
  };

  const [total, pending, active, done, replied, bounced, unsubscribed,
         emails_sent, step1, step2, step3] = await Promise.all([
    count(),
    count({ lead_status: "pending" }),
    count({ lead_status: "active" }),
    count({ lead_status: "done" }),
    count({ lead_status: "replied" }),
    count({ lead_status: "bounced" }),
    count({ lead_status: "unsubscribed" }),
    emailCount(),
    emailCount({ sequence_step: 1 }),
    emailCount({ sequence_step: 2 }),
    emailCount({ sequence_step: 3 }),
  ]);

  const { count: opens } = await supabase
    .from("email_sequences")
    .select("*", { count: "exact", head: true })
    .gt("open_count", 0);

  return {
    total, pending, active, done, replied, bounced, unsubscribed,
    emails_sent, emails_opened: opens || 0,
    step1_sent: step1, step2_sent: step2, step3_sent: step3,
  };
}

// ── All contacts (paginated) ──────────────────────────────────────────────────
async function getAllContacts(limit = 100, offset = 0) {
  const { data } = await supabase
    .from("leads")
    .select(`
      *,
      email_sequences (sequence_step, sent_at, open_count)
    `)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  return (data || []).map(lead => ({
    ...lead,
    step1_sent: lead.email_sequences?.find(e => e.sequence_step === 1)?.sent_at || null,
    step2_sent: lead.email_sequences?.find(e => e.sequence_step === 2)?.sent_at || null,
    step3_sent: lead.email_sequences?.find(e => e.sequence_step === 3)?.sent_at || null,
    opens:      lead.email_sequences?.reduce((s, e) => s + (e.open_count || 0), 0) || 0,
  }));
}

module.exports = {
  upsertContact, getContactsDueForStep, markEmailSent,
  markOpened, markReplied, markBounced, markUnsubscribed,
  getStats, getAllContacts,
};
