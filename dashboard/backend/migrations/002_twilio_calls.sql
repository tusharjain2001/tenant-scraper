-- ============================================================
-- Twilio browser calling support
-- Run this after 001_init.sql in the Supabase SQL Editor
-- ============================================================

ALTER TABLE call_attempts
  ADD COLUMN IF NOT EXISTS twilio_call_sid text,
  ADD COLUMN IF NOT EXISTS twilio_parent_call_sid text,
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS duration_seconds integer,
  ADD COLUMN IF NOT EXISTS from_number text,
  ADD COLUMN IF NOT EXISTS agent_identity text,
  ADD COLUMN IF NOT EXISTS error_code text,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS answered_by text,
  ADD COLUMN IF NOT EXISTS direction text DEFAULT 'legacy_queue';

CREATE UNIQUE INDEX IF NOT EXISTS idx_call_attempts_twilio_call_sid
  ON call_attempts(twilio_call_sid)
  WHERE twilio_call_sid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_call_attempts_called_at
  ON call_attempts(called_at DESC);

CREATE INDEX IF NOT EXISTS idx_call_attempts_status
  ON call_attempts(status);
