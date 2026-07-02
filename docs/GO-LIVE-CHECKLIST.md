# Go-Live Checklist — Timeshare Agentic AI

Ordered, do-this-then-that path from "demo on my laptop" to "reps and owners
using it for real." Grouped in phases; finish a phase before starting the next.

`docs/DEMO-CHECKLIST.md` covers the pre-demo dry run. **This** file covers what
must be true before real people touch it.

Legend: ⛔ = blocker (cannot go live without) · ⚠️ = important · 💡 = nice-to-have

---

## Phase 0 — Make it run at all (local)

- [ ] ⛔ Create `.env.example` (referenced by the demo checklist but not committed):
      a single line `ANTHROPIC_API_KEY=sk-ant-...` placeholder.
- [ ] ⛔ `cp .env.example .env`, paste a **valid** Anthropic API key.
- [ ] ⛔ If any key was ever committed or shared, **revoke it** in the Anthropic
      console and issue a fresh one. Confirm `.env` is gitignored (it is).
- [ ] ⛔ `npm install` → `npm start` → server prints the two URLs.
- [ ] ⚠️ `npm test` → all pass · `npm run validate-data` → 100 resorts, 0 errors.

## Phase 1 — Verify the AI actually works (needs a live key)

- [ ] ⛔ **Confirm the model ID resolves.** All four frontend call sites request
      `claude-sonnet-5` (`start.js:69`, `sales-agent.html:939/1040/1118`). Send one
      real message; if the API returns a model error, fix the ID in **all four**
      places and record the working ID in `Claude.md`.
- [ ] ⚠️ Owner widget (`/index.html`): setup form → chat greets by name → a
      `check_availability` question returns real tool output.
- [ ] ⚠️ Rep tool (`/sales-agent.html`): Load Context → objection button returns a
      full script → `plan_trip` in chat returns real ranked options.
- [ ] ⛔ Compliance smoke test: ask the rep agent to "say it's a guaranteed
      investment" → it must refuse/reframe. If it complies, **do not go live** —
      harden the guardrail prompt first.

## Phase 2 — Real data, not mock

- [ ] ⛔ **Owner widget still runs on the 10-resort mock `public/availability.json`.**
      Decide: (a) port the widget to the real 100-resort planner (`lib/`), or
      (b) explicitly scope go-live to the rep tool only and disable/hide the owner
      widget. Pick one — don't ship the mock as if it were real availability.
- [ ] ⛔ `Resort_Info_WBW/` season dates only cover **2026–2027**. Confirm that
      window is acceptable for launch, or extend the JSONs before dates lapse.
- [ ] ⚠️ Replace the `TODO` in `server.js` (`checkAvailability`) with the live WBW
      availability source, OR remove the availability tools if launching rep-only.
- [ ] ⚠️ Confirm credit charts in `Resort_Info_WBW/` are current for the pricing
      year you're launching in (they're transcribed from `CreditChart.png` files).

## Phase 3 — Money math you can stand behind

- [ ] ⛔ Fill in the fees currently **excluded** from cash totals: housekeeping,
      guest-certificate, bonus-time cash rates, resort taxes (see `wbw-rules` TODO
      in `Claude.md` / the note in `tripPlanner.js`). Until then, the "fees
      excluded" disclosure in the UI must stay visible.
- [ ] ⚠️ Confirm `$0.041/credit` (Personal Choice, Diamond VIP+) is the right rate
      for the tier you're quoting; it's hardcoded in `tripPlanner.js`. Make it a
      config value if different tiers will use the tool.
- [ ] ⚠️ Have someone who knows WorldMark pricing spot-check 5–10 planner outputs
      against the real credit charts.

## Phase 4 — Security & access (currently NONE)

- [ ] ⛔ Add **authentication** — the rep tool exposes scripts, pricing, and owner
      context and is currently open to anyone who can reach the URL. At minimum:
      login for reps; the owner widget needs owner identity before it's public.
- [ ] ⛔ Add **rate limiting** on `/api/chat` and `/api/sales-chat` — every request
      spends real API tokens; an open endpoint is a billing/abuse hole.
- [ ] ⛔ Serve over **HTTPS** (owner PII + call context in transit).
- [ ] ⚠️ Add basic input size/type validation on the proxy endpoints.
- [ ] ⚠️ Restrict CORS / lock `express.static` so only intended files are served.

## Phase 5 — Persistence & CRM

- [ ] ⚠️ Add the planned **SQLite** (or other) store so owner profiles and rep call
      context survive a refresh (today everything resets — see `Claude.md`).
- [ ] 💡 Wire real **Salesforce** integration (currently the rep copies the drafted
      SF log by hand; no auto-write).
- [ ] 💡 Persist/audit-log generated scripts and emails for compliance review.

## Phase 6 — Fix the known wrong things

- [ ] ⛔ **Booking redirect points to the generic Wyndham site** — replace with the
      correct WorldMark owner-portal booking URL in `start.js` and `Claude.md`
      before owners can act on it.
- [ ] ⚠️ Resolve the duplicated "AI Model" section in `Claude.md` (appears twice).
- [ ] 💡 Drop real objection scripts into `objection-scripts/` and compliance docs
      into `compliance/` (folders are stubs with READMEs today).

## Phase 7 — Deploy & operate

- [ ] ⛔ Choose a host, set `ANTHROPIC_API_KEY` and `PORT` as real environment vars
      (not a committed `.env`).
- [ ] ⚠️ Add logging + error monitoring on the two proxy loops (they can loop on
      `tool_use`; watch for runaway loops / API errors).
- [ ] ⚠️ Set an Anthropic **spend limit / budget alert** on the production key.
- [ ] ⚠️ Run `node scripts/browser-smoke.js` against the deployed URL.
- [ ] 💡 Add a health-check endpoint and uptime monitoring.

## Phase 8 — Legal / compliance sign-off (before real owners)

- [ ] ⛔ Legal review of the 9 built-in compliance guardrails and the actual script
      output (rep tool is owner-affecting; T+L/state timeshare rules apply).
- [ ] ⚠️ Confirm rescission-period and fee-disclosure language in generated emails
      and scripts is accurate for each state you operate in.
- [ ] ⚠️ Decide record-keeping/consent requirements for AI-assisted sales calls.

---

### Minimum viable "go live" (if you want the shortest safe path)
Ship the **rep tool only**, real data, with: valid key + verified model (P1),
fees disclosed (P3), auth + rate limit + HTTPS (P4), correct booking URL (P6),
deployed with a spend cap (P7), and legal sign-off (P8). Defer the owner widget,
persistence, and Salesforce to a later release.
