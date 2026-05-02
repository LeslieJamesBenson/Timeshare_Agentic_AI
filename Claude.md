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
