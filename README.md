# Rigel Voice

Campaign dialer with AI call scoring. Agents call through the browser (Twilio), calls are
recorded and transcribed (Deepgram), and Claude scores each call against your scorecard.
An AI voice handles voicemail drops and automated broadcast campaigns.

Stack: Next.js 16 · Supabase (auth + Postgres) · Vercel · Twilio Voice · Deepgram · Anthropic.

## What it does

- **Campaigns** – agent-dialled lists or AI voice broadcasts, CSV contact import with phone clean-up
- **Power dialer** – browser softphone, auto-dial next contact, script, mute, keypad, outcomes, call-back times, retries
- **Voicemail drop** – one click leaves an AI-voiced message and frees the agent
- **AI voice broadcast** – automated spoken message with "press 1 for a call back, 9 to opt out"
- **Recording → transcript → scorecard** – per-criterion scores, evidence quotes, coaching tips, compliance flags
- **Scorecard editor** – define your own criteria and points
- **Dashboard** – connect rate, talk time, average AI score, per-agent table
- **Teams** – owner / manager / agent roles, join code, every company's data isolated by row level security
- **Do-not-call list** – enforced by the dialer and broadcasts

## Setup (about 30 minutes)

### 1. Supabase
1. Create a project at supabase.com.
2. SQL Editor → paste all of `supabase/schema.sql` → Run.
3. Project Settings → API: copy the project URL, `anon` key and `service_role` key.
4. (Optional, for quick testing) Authentication → Providers → Email → turn off "Confirm email".

### 2. Deploy to Vercel
1. Import this repo in Vercel.
2. Add every variable from `.env.example` (you will fill in the Twilio ones next).
3. Deploy, then set `APP_BASE_URL` to the live URL (e.g. `https://rigel-voice.vercel.app`) and redeploy.

Background scoring uses a function that may run for a few minutes. Vercel's default limits allow this
on current plans; if scoring is cut off on long calls, raise the function max duration in project settings.

### 3. Twilio
1. Buy a voice-capable phone number. Put it in `TWILIO_CALLER_ID` as `+353…`.
2. Account → API keys → create a Standard key → `TWILIO_API_KEY_SID` / `TWILIO_API_KEY_SECRET`.
3. Voice → TwiML Apps → create one with **Voice Request URL** = `{APP_BASE_URL}/api/twilio/voice` (HTTP POST).
   Copy its SID to `TWILIO_TWIML_APP_SID`.
4. Copy the Account SID and Auth Token to `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN`.
5. Voice → Settings → Geo permissions: enable the countries you will call.

### 4. Deepgram and Anthropic
- Deepgram console → API key → `DEEPGRAM_API_KEY`.
- Anthropic console → API key → `ANTHROPIC_API_KEY`. `ANTHROPIC_MODEL` sets which Claude model scores calls.

### 5. First run
1. Open the app, create an account (this creates your company and a default scorecard).
2. New companies cannot place calls until you allow it. In Supabase SQL Editor run:
   `update organizations set calling_enabled = true where name = 'Your company';`
3. Campaigns → New campaign → set status to **Active** → import a CSV with a `phone` column.
4. Dialer → Start dialing. Use your own mobile as the first contact.
5. After you hang up, the call appears under Calls; the scorecard arrives about a minute later.

## Running on your laptop

```bash
npm install
cp .env.example .env.local   # fill in the values
npm run dev
```

Twilio has to reach your machine for calls to work locally. Run `ngrok http 3000`, set `APP_BASE_URL`
and the TwiML App's Voice URL to the ngrok address, and restart `npm run dev`.

## How a call flows

1. Dialer asks `/api/dialer/next` → the database hands this agent the next contact (safe with many agents).
2. Browser connects to Twilio → Twilio calls `/api/twilio/voice` → we return instructions to dial and record.
3. Twilio reports progress to `/api/twilio/status` and the finished recording to `/api/twilio/recording`.
4. `src/lib/processing.ts` downloads the recording, transcribes it with Deepgram (agent and customer on
   separate channels), and asks Claude to fill in the scorecard. Totals are calculated in code.

All Twilio webhooks verify Twilio's signature, so `APP_BASE_URL` must exactly match the public URL.

## Security

- Every company's data is isolated by Postgres row level security.
- Browsers cannot create or change call records; the server does it after checking permissions,
  so nobody can dial numbers outside a campaign or tamper with recordings.
- Twilio webhooks are rejected unless Twilio's signature checks out.
- Recordings are streamed only to signed-in members of the owning company.
- New sign-ups cannot place calls until you set `calling_enabled` on their organisation.
- Strict security headers (CSP, HSTS, no framing, microphone limited to this site).

Supabase settings to turn on: Authentication → email confirmation, leaked-password protection,
and a minimum password length of 8+.

## Not in this version

- **Predictive / parallel dialling** (several lines per agent) – needs an always-on worker, not serverless.
- **Two-way AI voice agent** (AI holds a conversation) – needs a WebSocket server for Twilio ConversationRelay.
- **Inbound queues / IVR, SMS, email channels.**
- **Per-customer Twilio accounts and billing** – all companies currently share the one Twilio account in env.
- **Rigel CRM link** – contacts are imported by CSV; the Supabase schema is close enough to sync later.

## Before calling real customers

You are responsible for telemarketing and data protection rules where you call. In Ireland that includes
checking the National Directory Database opt-out register for marketing calls, having prior consent for
automated (AI voice) marketing calls, telling people calls are recorded, and GDPR duties for recordings
and transcripts (lawful basis, retention, processor agreements with Twilio, Deepgram and Anthropic).
Get advice before launch.
