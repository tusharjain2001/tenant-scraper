-- ============================================================
-- Prophives Lead Ops — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- ── leads ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leads (
  id                  uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  market              text        NOT NULL,          -- 'dubai' | 'uk' | 'us'
  lead_type           text        NOT NULL,          -- 'agency' | 'owner'
  source              text,                          -- 'google_maps' | 'apify' | 'csv_import'
  agency_name         text,
  owner_name          text,
  email               text        UNIQUE,
  phone_raw           text,
  phone_e164          text,
  website             text,
  listing_url         text,
  city                text,
  property_address    text,
  owner_record_status text,
  lead_status         text        DEFAULT 'pending', -- pending | active | done | replied | bounced | unsubscribed
  sequence_status     text        DEFAULT 'not_started',
  mail_sent_at        timestamptz,
  last_call_outcome   text,
  last_call_summary   text,
  last_transcript_json jsonb,
  created_at          timestamptz DEFAULT now(),
  updated_at          timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_leads_email        ON leads(email);
CREATE INDEX IF NOT EXISTS idx_leads_market       ON leads(market);
CREATE INDEX IF NOT EXISTS idx_leads_lead_status  ON leads(lead_status);
CREATE INDEX IF NOT EXISTS idx_leads_lead_type    ON leads(lead_type);

-- ── scrape_runs ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS scrape_runs (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  market      text        NOT NULL,
  lead_type   text        NOT NULL,
  source      text,
  status      text        DEFAULT 'running',         -- running | done | error
  started_at  timestamptz DEFAULT now(),
  finished_at timestamptz,
  leads_found integer     DEFAULT 0,
  error       text
);

-- ── email_sequences ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_sequences (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id       uuid        REFERENCES leads(id) ON DELETE CASCADE,
  sequence_step integer     NOT NULL,                -- 1 | 2 | 3
  subject       text        NOT NULL,
  sent_at       timestamptz DEFAULT now(),
  opened_at     timestamptz,
  open_count    integer     DEFAULT 0,
  message_id    text,
  status        text        DEFAULT 'sent'           -- sent | opened
);

CREATE INDEX IF NOT EXISTS idx_email_seq_lead_id ON email_sequences(lead_id);
CREATE INDEX IF NOT EXISTS idx_email_seq_step    ON email_sequences(sequence_step);
CREATE INDEX IF NOT EXISTS idx_email_seq_sent_at ON email_sequences(sent_at);

-- ── email_events ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS email_events (
  id          uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id     uuid        REFERENCES leads(id) ON DELETE CASCADE,
  event_type  text        NOT NULL,                  -- open | unsubscribe | reply
  occurred_at timestamptz DEFAULT now()
);

-- ── call_batches ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_batches (
  id           uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  market       text        NOT NULL,
  queued_at    timestamptz DEFAULT now(),
  n8n_payload  jsonb,
  status       text        DEFAULT 'queued'          -- queued | sent | done
);

-- ── call_attempts ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS call_attempts (
  id              uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  lead_id         uuid        REFERENCES leads(id) ON DELETE CASCADE,
  batch_id        uuid        REFERENCES call_batches(id),
  phone_e164      text,
  outcome         text,                              -- answered | voicemail | no_answer | failed
  summary         text,
  transcript_json jsonb,
  called_at       timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_call_attempts_lead_id ON call_attempts(lead_id);

-- ── content_briefs ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS content_briefs (
  id            uuid        DEFAULT gen_random_uuid() PRIMARY KEY,
  market        text        NOT NULL,
  theme         text,
  caption       text,
  image_prompt  text,
  cta           text,
  hashtags      text[],
  generated_at  timestamptz DEFAULT now(),
  openai_model  text
);

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS leads_updated_at ON leads;
CREATE TRIGGER leads_updated_at
  BEFORE UPDATE ON leads
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
