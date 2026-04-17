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
