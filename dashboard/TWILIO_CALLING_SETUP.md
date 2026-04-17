# Twilio Calling Setup

## Required environment variables

Add these to `dashboard/backend/.env`:

- `BACKEND_URL`
  Used to build the public TwiML and status-callback URLs that Twilio hits.
- `TWILIO_ACCOUNT_SID`
  Used by the backend for Twilio REST authentication and webhook validation.
- `TWILIO_AUTH_TOKEN`
  Used for webhook signature validation and Twilio admin API access.
- `TWILIO_API_KEY_SID`
  Used to mint short-lived browser voice access tokens.
- `TWILIO_API_KEY_SECRET`
  Used to sign short-lived browser voice access tokens.
- `TWILIO_PHONE_NUMBER`
  Used as the caller ID for outbound calls.
- `TWILIO_TWIML_APP_SID`
  Used by Twilio Voice SDK access tokens for outbound call routing.

Existing app variables remain unchanged:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `OPENAI_API_KEY`
- `OPENAI_MODEL`
- `GOOGLE_MAPS_API_KEY`
- `APIFY_TOKEN`
- `ELEVENLABS_API_KEY`
- `N8N_WEBHOOK_URL`

## Twilio console checklist

1. Buy or confirm the outbound Twilio phone number you want to use.
2. Create a Standard API Key and store both the `SK...` SID and secret.
3. Create a TwiML App whose Voice URL points to:
   `https://<your-public-backend>/api/calls/twiml/outbound`
4. In the TwiML App, keep the method as `POST`.
5. If you use trial credits, verify any destination numbers you want to call.
6. Make sure `BACKEND_URL` is publicly reachable over HTTPS so Twilio callbacks succeed.

## Local development

1. Install backend dependencies:
   `cd dashboard/backend && npm install`
2. Install frontend dependencies:
   `cd dashboard/frontend && npm install`
3. Copy `dashboard/backend/.env.example` to `dashboard/backend/.env` and fill in the real values.
4. Run the backend:
   `cd dashboard/backend && npm run dev`
5. Run the frontend:
   `cd dashboard/frontend && npm run dev`
6. For real local test calls, expose the backend publicly with a tunnel and set `BACKEND_URL` to that tunnel URL.

## Vercel deployment notes

- The frontend already calls `/api`, so production routing must continue forwarding API traffic to the Express backend.
- `BACKEND_URL` must resolve to the public backend base URL that Twilio can reach.
- Keep all Twilio secrets server-side only in backend environment variables.
- Redeploy the backend after adding or rotating Twilio credentials.

## Manual QA script

1. Open the Calls page in the app.
2. Confirm the page shows the Twilio caller ID and no configuration error banner.
3. Click into the phone field, type an invalid number, and confirm inline validation appears.
4. Enter a valid E.164 number such as `+14155550123`.
5. Click `Call` and confirm the state sequence moves through:
   `requesting access` -> `ready` -> `connecting` -> `ringing` -> `in-call`
6. Toggle `Mute` while connected and confirm the label switches to `Unmute`.
7. Click `Hang Up` and confirm the state moves through `ending` -> `ended`.
8. Refresh Recent Calls and confirm the latest attempt appears with status and summary text.
9. Open a lead from the Leads page, jump to Calls, and confirm the selected lead pre-fills the dialer.

## Notes on validation and logging

- The UI and backend both require international-format numbers with a country code.
- The backend masks dialed phone numbers in logs instead of printing full values.
- Twilio webhook requests are signature-validated before call history is written.
