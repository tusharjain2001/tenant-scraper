# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Lead Ops** — a multi-module system for scraping real estate leads, sending cold email sequences, and managing outreach from a React dashboard. Three loosely coupled modules:

1. **Python scraper** (repo root) — collects agency/owner leads into `output/*.csv`
2. **module2-email-sender** — Node.js CLI that imports CSVs into Supabase and runs a 3-step cold email sequence via SMTP/IMAP
3. **dashboard/** — Express backend (port 4000) + React/Vite/Tailwind frontend (port 5173) for viewing leads and triggering operations

All modules share a single **Supabase** database as the source of truth.

## Development Commands

### Python Scraper (repo root)
```bash
# Run scraper
python main.py --market us --lead-type agency
python main.py --market us --lead-type owner --csv data.csv
python main.py --market all
```
Outputs CSVs to `output/` with timestamp suffixes.

### Module 2 — Email Sender
```bash
cd module2-email-sender
npm install

# Import CSV into Supabase
node --env-file=.env --experimental-sqlite run.js import [csv-path]

# Send emails (all steps or one step)
node --env-file=.env --experimental-sqlite run.js send
node --env-file=.env --experimental-sqlite run.js send 1

# Check status
node --env-file=.env --experimental-sqlite run.js status

# Start tracking server + cron scheduler + IMAP reply poller
node --env-file=.env --experimental-sqlite run.js schedule
```

### Backend
```bash
cd dashboard/backend
npm install
npm run dev      # node --watch index.js on port 4000
npm test         # node --test (runs test/ directory)
```

### Frontend
```bash
cd dashboard/frontend
npm install
npm run dev      # Vite dev server on port 5173
npm run build    # tsc + vite build
```

## Environment Setup

**Backend** — copy `dashboard/backend/.env.example` to `dashboard/backend/.env`:
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` — required for all routes
- `OPENAI_API_KEY`, `OPENAI_MODEL` — content generation
- `GOOGLE_MAPS_API_KEY`, `APIFY_TOKEN` — scraper
- `TWILIO_*` (7 vars) — browser calling; see `dashboard/TWILIO_CALLING_SETUP.md`
- `BACKEND_URL` — public HTTPS URL for Twilio callbacks
- `ELEVENLABS_API_KEY`, `N8N_WEBHOOK_URL` — legacy AI calling pipeline

**Module 2** — create `module2-email-sender/.env`:
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASS`
- `FROM_EMAIL`, `FROM_NAME`
- `IMAP_HOST`, `IMAP_PORT`, `IMAP_USER`, `IMAP_PASS`
- `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`

## Architecture

### Data Flow
```
Python scraper → output/*.csv → module2 importer → Supabase (leads table)
                                                         ↓
Dashboard backend (Express :4000) ←→ Supabase ←→ Frontend (React :5173)
                                         ↓
                               module2 mailer (SMTP sequences)
                               Twilio (browser calls)
```

### Supabase Tables
- `leads` — main table; fields include `lead_type`, `lead_status`, `sequence_status`, `phone_e164`
- `email_sequences` — one row per email sent (step 1/2/3), with `open_count`
- `email_events` — open/click tracking pixel events
- `call_attempts` — Twilio and ElevenLabs call records with `outcome`, `summary`, `transcript_json`
- `scrape_runs` — job tracking for Python scraper runs

### Backend Routes (`dashboard/backend/routes/`)
- `scrape.js` — spawns Python `main.py`, then auto-imports resulting CSV via module2
- `email.js` — spawns module2 `run.js send` as a child process
- `leads.js` — paginated lead list with filters; CSV export
- `calls.js` — Twilio Voice SDK token minting, TwiML, call history
- `webhooks.js` — receives ElevenLabs/n8n post-call payloads
- `content.js` — OpenAI-powered social media post generation
- `summary.js` — dashboard aggregate stats

### Frontend Pages (`dashboard/frontend/src/pages/`)
- `DashboardPage` — summary stats + scrape trigger
- `LeadsPage` — filterable/searchable lead table with email/call actions
- `CallsPage` — Twilio browser dialer using `@twilio/voice-sdk`
- `ContentPage` — AI content generation per market

### Python Scrapers (`scrapers/`)
- `google_maps.py` — Google Maps Places API for agency leads (dubai/uk/us)
- `owner_sources.py` — Apify or CSV import for property owner leads
- `propertyfinder.py`, `bayut.py`, `zoopla.py` — legacy market-specific scrapers

### Module 2 Key Files
- `mailer.js` — core send logic; reads `email_sequences` to decide which step each contact is on
- `reply-poller.js` — IMAP polling (every 15 min) to detect replies and mark leads accordingly
- `importer.js` — CSV→Supabase upsert with deduplication
- `server.js` — lightweight Express server for open-tracking pixel (`/t/:id`)
- `templates/email1.js`, `email2.js`, `email3.js` — email HTML templates

## Key Constraints

- The Python scraper path is hardcoded in `dashboard/backend/routes/scrape.js`: `C:\Users\Intel\...python.exe` for Windows. Change this if running on a different machine.
- Module 2 uses Node's `--experimental-sqlite` flag (built-in SQLite) though the primary store is Supabase.
- Frontend proxies `/api` to the backend — ensure Vite's proxy config aligns with backend port 4000.
- Twilio webhook validation requires `BACKEND_URL` to be a publicly reachable HTTPS URL; use a tunnel (e.g. ngrok) for local testing.
- Email rate limit: `MAX_EMAILS_PER_DAY: 50`, `DELAY_BETWEEN_EMAILS_MS: 8000` in `module2-email-sender/config.js`.
