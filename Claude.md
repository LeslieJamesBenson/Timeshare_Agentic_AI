# Timeshare AI — WorldMark Concierge Chatbot

> **Security rule:** API keys live ONLY in `.env` (gitignored). Never write a key into this file, any tracked file, or a commit.

## Project Purpose
Internal demo of an AI-powered concierge widget for WorldMark by Wyndham timeshare owners. Not yet in production. Untested as of project creation.

## How to Run Locally
1. Copy `.env.example` to `.env` and set `ANTHROPIC_API_KEY`, `REP_PASSWORD`,
   and `SESSION_SECRET` (server fails fast if any are missing).
2. `npm install`
3. `npm start`
4. Rep tool: `http://localhost:3000/sales-agent.html` (log in with `REP_PASSWORD`).
   Owner widget is disabled unless `OWNER_WIDGET_ENABLED=true`.

## Production Hardening (rep-only launch — implemented)
The rep tool is gated for real use. See `docs/GO-LIVE-CHECKLIST.md` for the full
status; remaining items need live keys / TLS / real numbers / legal sign-off.
- **Auth:** shared-password login (`lib/auth.js`, `public/login.html`), httpOnly
  signed session cookie. Everything except `/login.html`, `/api/login`, `/health`
  requires a session. `REP_PASSWORD` + `SESSION_SECRET` in `.env`.
- **Rate limiting:** `lib/rateLimit.js` — 60/min on `/api`, 10/min on login.
- **Persistence:** `lib/store.js` — Node built-in SQLite (`node:sqlite`), stores
  rep call context + drafted SF logs under `data/` (gitignored). Falls back to
  in-memory if unavailable.
- **Owner widget disabled:** `OWNER_WIDGET_ENABLED=false` (default). `/api/chat`
  returns 410; `/` redirects to the rep tool.
- **Deploy:** `Dockerfile` (needs Node 22+ for `node:sqlite`); config via env vars;
  `/health` endpoint; request logging. Terminate TLS at the host (cookie auto-sets
  `Secure` behind an HTTPS proxy; `trust proxy` is on).

## Testing
- `npm test` — deterministic trip-planner + data-layer unit tests (no API key needed)
- `npm run validate-data` — checks all 100 resort JSONs load and price correctly
- `node scripts/browser-smoke.js` — headless UI test of the rep-tool trip planner
  (start the server first; uses the preinstalled Chromium)

## Architecture
- **Frontend:** Static HTML + vanilla JS, no framework, no build step
  - `index.html` + `start.js` — owner concierge widget
  - `sales-agent.html` — internal sales rep tool (self-contained)
- **Backend:** Express server (`server.js`) — serves static files, proxies AI
  requests, and hosts the deterministic trip-planner endpoints
- **Engine (`lib/`):** `resortData.js` loads/normalizes the real resort dataset;
  `tripPlanner.js` does all credit/cash math (no AI involved)
- **Data:** `Resort_Info_WBW/` — 100 real WorldMark resorts (credit charts as JSON,
  one folder per resort, grouped by state)
- **AI:** Anthropic Claude API, proxied server-side so the key never reaches the browser
  - `/api/chat` — owner widget (availability tools over the old mock dataset)
  - `/api/sales-chat` — rep tool (compliance-guardrailed; can call the `plan_trip` tool)
  - `/api/plan-trip` — direct, deterministic trip planner (used by the "Plan a Trip" form; no AI)
  - `/api/regions` — region + resort catalog for the planner form

## AI Model
Use `claude-sonnet-5`. Never downgrade to an older model version.
> ⚠️ The model ID lives in the frontend files (`start.js`, `sales-agent.html`).
> It has NOT been verified against a live key in this environment — confirm it
> resolves before the exec demo (see the manual API checklist in
> `docs/DEMO-CHECKLIST.md`).

## Concierge Personalities
Three modes, each with a named agent. Do not change these without explicit instruction.
- **Luxury** — Agent: Aria. Refined, sophisticated tone.
- **Friendly** — Agent: Jordan. Upbeat, conversational. (default)
- **Professional** — Agent: Alex. Direct, efficient.

## Knowledge Base Rules
- Credit costs for resort stays are **fixed constants** — never change them without explicit instruction.
- The system prompt contains hardcoded credit costs, booking windows, banking/borrowing rules, and resort lists. Treat these as source of truth.
- Never invent specific reservation details for a user.

## User Profile Fields (Setup Form)
Collected once on first use. All fields are correct as-is — do not add or remove without instruction.
- First name, Last name
- Membership tier (Explorer, Gold, Platinum, Presidential)
- Available credits
- Home resort (8 options)
- Upcoming reservation (optional)
- Travel preferences (8 tag options)

## User Persistence (Planned Feature)
Add a SQLite database to the backend so user profiles are saved after first login. Users should not need to re-enter their information on subsequent visits. Use a simple identifier (e.g. name or generated ID) for lookup.

## Quick-Reply Buttons
These four are correct and should not be changed without instruction:
- "Browse resorts" → sends: "What resorts are available for my dates?"
- "Credit costs" → sends: "How many credits does a 7-night stay typically cost?"
- "Booking tips" → sends: "What's the best time to book for summer?"
- "My resort" → sends: "Tell me about my home resort"

## Booking Redirects
When a user asks about making an actual booking, direct them to WorldMark's booking site.
**TODO:** Specific WorldMark booking URL not yet confirmed — add it here once known and update the system prompt accordingly. Current placeholder redirects to Wyndham (wrong — must be fixed).

## Scope Constraints
- Internal tool — the rep tool is being hardened for a live rep-only pilot
  (auth, rate limiting, persistence now implemented; see Production Hardening above)
- The owner concierge widget is NOT production-ready and stays disabled by default
- Do not add features beyond what is described here unless explicitly requested

---

# Sales AI Agent — Rep Tool

## Purpose
A separate internal tool for sales reps, accessed at `http://localhost:3000/sales-agent.html`.
This is NOT owner-facing. It assists reps on live inbound/outbound phone calls with existing owners.
Current status: Pilot with 1–2 reps.

## Access
- Owner concierge widget: `http://localhost:3000/index.html`
- Sales rep agent: `http://localhost:3000/sales-agent.html`
- API endpoint: `POST /api/sales-chat` (served by `server.js`)

## What the Sales Agent Does
1. **Pre-call checklist** — Rep fills out owner name, call type, deal stage, objections heard, ownership level, travel preferences, and optionally pastes Salesforce data. Clicking "Load Context" seeds the agent.
2. **Live chat** — Rep asks anything or uses Quick Action buttons. Agent replies with full word-for-word scripts labeled "SCRIPT:" followed by "WHY THIS WORKS:" notes.
3. **Email generator** — 10 templates selectable from a modal; agent personalizes each to the loaded owner context.
4. **Post-call SF log** — "Draft SF Log" generates a structured Salesforce call log the rep reviews, edits, then copies manually into Salesforce.

## Quick Action Buttons (do not change without instruction)
- Price objection
- Maintenance fees objection
- Need to think
- Spouse not present
- Already enough points
- Soft close
- Hard close
- Generate email (opens email modal)
- Draft SF log (opens log modal)

## Email Templates (email-templates/ folder)
10 .txt templates. Numbered 01–10. Do not renumber without updating the modal buttons in sales-agent.html.
01. Post-call follow-up (no decision)
02. Upgrade offer summary
03. Reschedule / missed call
04. Price/budget objection follow-up
05. Loyal owner / exclusive offer
06. Call recap / next steps confirmation
07. Re-engagement / win-back
08. Post-close welcome
09. Referral request
10. Maintenance fee objection follow-up

## Resource Folders
- `objection-scripts/` — Drop .docx, .pdf, or .txt objection scripts here. README.txt inside explains naming conventions.
- `compliance/` — Drop Travel + Leisure compliance docs here. README.txt inside explains what to upload. Standard US timeshare guardrails are already built into the system prompt.

## Compliance Guardrails (built into system prompt — do not weaken)
1. No investment/appreciation language
2. No guaranteed rental income claims
3. No misrepresentation of the rescission period
4. No high-pressure or manufactured-urgency language
5. No misrepresentation of what ownership includes
6. No misleading competitor statements
7. No minimizing or hiding ongoing costs
8. Agent must be truthful; never invent information
9. No pressure to decide same-day if owner requested time

## Trip Planner (rep tool)
"Plan a Trip" button opens a form: location or region, check-in date, nights,
date flexibility (± days), and party size. It calls `/api/plan-trip` (deterministic,
no AI) and renders ranked options — each showing the matched unit, real credit total
from the WorldMark charts, and Personal Choice cash-equivalent ($0.041/credit,
Diamond VIP+). Reps can copy a summary or push an option into the chat for a
talking track. The agent can also plan trips conversationally via the `plan_trip` tool.

Credit math (in `lib/tripPlanner.js`): each night priced by its season
(prime/average/slow) and day bucket (Sun / Mon–Thu / Fri–Sat); the 7-night week
rate is applied when a full week sits in one season and beats the nightly sum.

**Not yet included in cash totals** (need official numbers — see `wbw-rules` TODO):
housekeeping fees, guest-certificate fees, bonus-time cash rates, resort taxes.
The UI clearly discloses these are excluded.

## Salesforce Integration
Pilot phase: rep manually pastes Salesforce data into the checklist textarea.
Future: OAuth integration with Salesforce API to auto-populate owner profile and call history.

## Sales Agent Scope Constraints
- Output format is always full word-for-word scripts — never bullet points
- CRM write-back: rep copies the drafted log manually; no auto-write to Salesforce yet
- Verbal close only — contracts handled by a separate system outside this tool
- Do not add authentication or multi-user features without instruction
- Do not change compliance guardrails without explicit instruction and legal review
