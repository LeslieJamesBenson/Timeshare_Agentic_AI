- API Key ~ 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

# Timeshare AI — WorldMark Concierge Chatbot

## Project Purpose
Internal demo of an AI-powered concierge widget for WorldMark by Wyndham timeshare owners. Not yet in production. Untested as of project creation.

## How to Run Locally
1. Add your Anthropic API key to `.env`: `ANTHROPIC_API_KEY=sk-...`
2. `npm install`
3. `npm start`
4. Open `http://localhost:3000`

## Architecture
- **Frontend:** Single HTML file (`index.html`) — vanilla JS, no framework, no build step
- **Backend:** Express server (`server.js`) — serves static files and proxies AI requests
- **Database:** SQLite (planned) — for persisting user profiles so owners don't re-enter info on each session
- **AI:** Anthropic Claude API via `/api/chat` proxy endpoint (key stays server-side)

## AI Model
Use `claude-sonnet-4-6`. Never downgrade to an older model version.

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
- Internal demos only — not a customer-facing production tool yet
- Do not add authentication, rate limiting, or production hardening unless asked
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

## Salesforce Integration
Pilot phase: rep manually pastes Salesforce data into the checklist textarea.
Future: OAuth integration with Salesforce API to auto-populate owner profile and call history.

## Sales Agent Scope Constraints
- Output format is always full word-for-word scripts — never bullet points
- CRM write-back: rep copies the drafted log manually; no auto-write to Salesforce yet
- Verbal close only — contracts handled by a separate system outside this tool
- Do not add authentication or multi-user features without instruction
- Do not change compliance guardrails without explicit instruction and legal review
