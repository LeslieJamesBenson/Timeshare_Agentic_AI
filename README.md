# WorldMark AI Concierge

A personalized AI chat widget for WorldMark by Wyndham owners. Owners enter their membership profile and chat with an AI agent that answers questions about their ownership, looks up real resort availability, and calculates credit costs.

---

## Features

- Three agent personalities: Luxury (Aria), Friendly (Jordan), Professional (Alex)
- Owner profile personalization (tier, credits, home resort, travel preferences)
- Live availability lookup across 10 real WorldMark resorts via Claude tool use
- Credit cost calculations per unit type and stay length
- Quick-reply buttons for common questions
- Secure API key handling — key never exposed to the browser

---

## Project Structure

```
Timeshare_AI/
├── server.js               # Express server — API proxy and tool execution
├── index.html              # Widget markup and layout
├── start.js                # Frontend logic — state, chat, API calls
├── style.css               # WorldMark-branded styles
├── public/
│   └── availability.json   # Mock availability dataset (10 resorts)
├── .env                    # API key (not committed)
└── package.json
```

---

## Resorts in the Dataset

| Resort | Location |
|--------|----------|
| WorldMark Anaheim | Anaheim, CA |
| WorldMark Las Vegas — Tropicana | Las Vegas, NV |
| WorldMark Las Vegas — Boulevard | Las Vegas, NV |
| WorldMark Seaside | Seaside, OR |
| WorldMark Birch Bay | Birch Bay, WA |
| WorldMark Depoe Bay | Depoe Bay, OR |
| WorldMark Palm Springs | Palm Springs, CA |
| WorldMark Solvang | Solvang, CA |
| WorldMark Running Y | Klamath Falls, OR |
| WorldMark Windsor | Windsor, CA |

---

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```
ANTHROPIC_API_KEY=your_key_here          # required — get one at console.anthropic.com
REP_PASSWORD=a-strong-shared-password     # required — reps type this to log in
SESSION_SECRET=a-long-random-string       # required — signs the session cookie
OWNER_WIDGET_ENABLED=false                # rep-only launch; owner widget off
```

Generate a session secret with:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

The server **refuses to start** if any of the three required vars are missing.

### 3. Start the server

```bash
npm start
```

### 4. Open the rep tool

Visit [http://localhost:3000/sales-agent.html](http://localhost:3000/sales-agent.html),
enter the shared password, and you're in. (`/` redirects here; the owner concierge
widget is disabled by default for a rep-only deployment.)

---

## How It Works

1. **Owner fills out the setup form** — name, membership tier, credit balance, home resort, travel preferences
2. **Chat begins** with a personality-matched greeting
3. **Owner asks questions** — the agent uses two tools to answer:
   - `list_resorts` — returns all resorts in the system
   - `check_availability` — queries `availability.json` for dates, unit types, and credit costs
4. **Server runs an agentic loop** — when Claude calls a tool, `server.js` executes it against the dataset and feeds results back before returning the final reply to the browser

---

## Architecture

```
Browser (index.html + start.js)
    │
    │  POST /api/chat
    ▼
Express Server (server.js)
    │  Agentic tool loop
    │  ├─ check_availability → queries availability.json
    │  └─ list_resorts       → queries availability.json
    │
    │  POST https://api.anthropic.com/v1/messages
    ▼
Anthropic Claude API (claude-sonnet-5)
```

---

## Limitations & Roadmap

- **No live booking data** — `availability.json` is a mock dataset. Marked with `TODO` in `server.js` for replacement with a real WBW database connection.
- **No persistence** — owner profile and chat history are lost on page refresh. SQLite integration is planned.
- **No authentication** — this is an internal demo; no login or rate limiting is implemented.
- **Booking redirect** — the "make a booking" redirect currently points to the generic Wyndham site; the correct WorldMark owner portal URL needs to be confirmed.

---

## Tech Stack

- **Backend:** Node.js, Express
- **AI:** Anthropic Claude (`claude-sonnet-5`) via Claude tool use
- **Frontend:** Vanilla JS, no framework or build tools
- **Data:** Static JSON dataset in `public/`
