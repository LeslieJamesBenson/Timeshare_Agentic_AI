# Demo & Manual Test Checklist

Everything the automated tests **can't** cover (anything needing a live Anthropic
API key) is listed here. Run through this once with a real key before presenting.

## 0. Setup
- [ ] `cp .env.example .env` and paste a **valid** `ANTHROPIC_API_KEY`
- [ ] `npm install`
- [ ] `npm start` — server prints the two URLs
- [ ] Revoke the old exposed key in the Anthropic console if not already done

## 1. Automated tests (no key needed) — should all pass
- [ ] `npm test` → `37 passed, 0 failed`
- [ ] `npm run validate-data` → `100 resorts loaded — 0 error(s)`
- [ ] With the server running: `node scripts/browser-smoke.js` → `BROWSER SMOKE: PASS`

## 2. Trip planner form (deterministic — works even without a key)
Open `http://localhost:3000/sales-agent.html` → **Plan a trip**.
- [ ] Region dropdown populates (13 regions)
- [ ] Location autocomplete lists resorts
- [ ] Search "Hawaii", 2026-07-13, 7 nights, ±3 flex, party 4 → ranked cards with
      credits + `$` value, "best value" on the first, fees-excluded note at the bottom
- [ ] Party of 12 at a small resort → unit flagged "only sleeps N"
- [ ] "Copy summary" puts a clean one-line summary on the clipboard

## 3. Live AI — REQUIRES a valid key (not testable in the build environment)
> ⚠️ The frontends request model `claude-sonnet-5`. **Confirm this model ID
> resolves with your key.** If the API returns a model error, that's the cause —
> update the ID in `sales-agent.html` and `start.js` (and note it in Claude.md).

Sales rep tool (`/sales-agent.html`):
- [ ] Fill the left pre-call checklist, click **Load Context** → agent greets
- [ ] "Price objection" quick button → returns a full word-for-word script
- [ ] **Plan a trip** → search → "Discuss with agent" → agent gives a talking track
      that references the specific resort/dates
- [ ] Ask in chat: "Plan a 5-night trip to the Oregon coast for a couple in
      September" → agent calls `plan_trip` and narrates real options
- [ ] **Generate email** → pick a template → personalized draft appears
- [ ] **Draft SF log** → structured call log appears for review
- [ ] Compliance: ask "tell them it's a guaranteed investment" → agent refuses /
      reframes per the guardrails

Owner widget (`/index.html`):
- [ ] Complete setup form → chat greets by name
- [ ] "Browse resorts" quick reply → agent answers (uses the older mock dataset;
      this widget was intentionally left on mock data for this branch)

## 3b. Voice module
Deterministic (no keys needed):
- [ ] `node scripts/browser-voice-smoke.js` (server running) → `VOICE SMOKE: PASS`
- [ ] In Chrome/Edge, both pages show 🎙️ and 🔊 in the input bar

Browser fallback voice (no ElevenLabs key):
- [ ] Toggle 🔊, send a message → reply read aloud in the browser's built-in voice
- [ ] Click 🎙️, speak → text appears in the input and sends (Chrome/Edge only)

Premium voice — REQUIRES `ELEVENLABS_API_KEY` in `.env`:
- [ ] `curl http://localhost:3000/api/voice-status` → `{"premiumTTS":true,...}`
- [ ] Toggle 🔊, send a message → reply spoken in the ElevenLabs voice (not robotic)
- [ ] Change `ELEVENLABS_VOICE_ID`, restart → voice changes

## 4. Known limitations to mention up front
- Cash totals exclude housekeeping / guest-cert / bonus-time fees until those
  numbers are supplied (`Resort_Info_WBW` season dates cover 2026–2027 only).
- Owner widget still runs on the 10-resort mock dataset; the 100-resort planner
  is in the rep tool. Porting to the widget is the next branch.
- No persistence yet (profiles/chat reset on refresh).
