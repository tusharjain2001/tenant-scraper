export interface Lead {
  id: string;
  market: "dubai" | "uk" | "us";
  lead_type: "agency" | "owner";
  source: string;
  agency_name: string;
  owner_name: string;
  email: string;
  phone_raw: string;
  phone_e164: string;
  website: string;
  listing_url: string;
  city: string;
  property_address: string;
  lead_status: "pending" | "active" | "done" | "replied" | "bounced" | "unsubscribed";
  sequence_status: string;
  mail_sent_at: string | null;
  last_call_outcome: string | null;
  last_call_summary: string | null;
  created_at: string;
  email_sequences?: EmailSequence[];
}

export interface EmailSequence {
  id: string;
  lead_id: string;
  sequence_step: number;
  subject: string;
  sent_at: string;
  opened_at: string | null;
  open_count: number;
  status: string;
}

export interface ContentBrief {
  id: string;
  market: string;
  theme: string;
  caption: string;
  image_prompt: string;
  cta: string;
  hashtags: string[];
  generated_at: string;
  openai_model: string;
}

export interface Summary {
  leads: { total: number; pending: number; active: number; done: number; replied: number; bounced: number };
  by_market: { dubai: number; uk: number; us: number };
  emails_today: number;
  calls_queued: number;
}

export type CallUiState =
  | "idle"
  | "requesting access"
  | "ready"
  | "connecting"
  | "ringing"
  | "in-call"
  | "ending"
  | "ended"
  | "failed";

export interface CallHistoryItem {
  id: string;
  lead_id: string | null;
  phone_e164: string | null;
  outcome: string | null;
  summary: string | null;
  called_at: string;
  twilio_call_sid: string | null;
  status: string | null;
  duration_seconds: number | null;
  from_number: string | null;
  agent_identity: string | null;
  leads?: {
    id: string;
    agency_name: string | null;
    owner_name: string | null;
    city: string | null;
    market: string | null;
  } | null;
}

export interface CallStatus {
  configured: boolean;
  caller_id: string | null;
  backend_url: string | null;
  token_ttl_seconds: number;
  errors: string[];
  legacy_queue_configured: boolean;
}
