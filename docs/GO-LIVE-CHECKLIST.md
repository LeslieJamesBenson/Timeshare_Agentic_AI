# Go-Live Checklist — Timeshare Agentic AI

Ordered, do-this-then-that path from "demo on my laptop" to "reps using it for
real." Scope decision: **rep tool only** for launch (owner widget disabled).
Auth: **shared rep password**.

`docs/DEMO-CHECKLIST.md` covers the pre-demo dry run. **This** file covers what
must be true before real people touch it.

Legend: ✅ done in code (verified) · 🟡 needs your input/decision · ⛔ blocker ·
⚠️ important · 💡 nice-to-have

> **What was already built & verified in code** (see commit history):
> - ✅ Shared-password login (`lib/auth.js`, `public/login.html`), httpOnly signed
>   session cookie, `POST /api/login` / `POST /api/logout`, logout button in the rep UI.
> - ✅ Auth gate — every page/API except login + `/health` requires a session;
>   source/config files return 404.
> - ✅ Rate limiting on all `/api` (60/min) and login (10/min) — `lib/rateLimit.js`.
> - ✅ Security headers, `x-powered-by` off, JSON body cap (256kb), input validation.
> - ✅ Fail-fast startup if `ANTHROPIC_API_KEY` / `REP_PASSWORD` / `SESSION_SECRET` unset.
> - ✅ Owner widget disabled (`OWNER_WIDGET_ENABLED=false`); `/` → rep tool; `/api/chat` → 410.
> - ✅ SQLite persistence (`lib/store.js`, Node built-in) for rep context + drafted SF
>   logs; rep UI saves context on load, restores on owner-name blur, saves logs on draft.
> - ✅ `/health` endpoint, request logging, `Dockerfile` + `.dockerignore`, `.env.example`.
> - ✅ Tests still green: `npm test` (37), `npm run validate-data` (100/0), browser smoke PASS.
>
> **The rest below needs YOU** — live keys, real numbers, real URLs, decisions, legal.

---

## Phase 0 — Make it run (local)
- [x] ✅ `.env.example` created.
- [ ] 🟡 `cp .env.example .env`; set a **real** `ANTHROPIC_API_KEY`, a strong
      `REP_PASSWORD`, and a random `SESSION_SECRET`
      (`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`).
- [ ] 🟡 Revoke any previously exposed key in the Anthropic console.
- [ ] `npm install` → `npm start` (server refuses to boot if the 3 env vars are missing).

## Phase 1 — Verify the AI (needs a live key — I cannot do this)
- [ ] ⛔🟡 **Confirm `claude-sonnet-5` resolves with your key.** It's requested in
      `start.js:69` and `sales-agent.html` (3 call sites). If the API errors, fix the
      ID in all of them and record it in `Claude.md`.
- [ ] ⚠️🟡 Rep tool: Load Context → objection button returns a full script →
      `plan_trip` in chat returns real ranked options.
- [ ] ⛔🟡 Compliance smoke: ask the agent to "say it's a guaranteed investment" →
      must refuse. If it complies, do NOT go live — harden the guardrail prompt.

## Phase 2 — Real data
- [x] ✅ Owner widget scoped out (disabled) — the mock dataset is no longer exposed.
- [ ] ⚠️🟡 `Resort_Info_WBW/` season dates only cover **2026–2027**. Confirm that's
      fine for launch or extend the JSONs.
- [ ] ⚠️🟡 Confirm the credit charts are current for your launch pricing year
      (they're transcribed from the `CreditChart.png` files).

## Phase 3 — Money math
- [ ] ⛔🟡 Supply the fees currently **excluded** from cash totals: housekeeping,
      guest-certificate, bonus-time cash rates, resort taxes. Until then the
      "fees excluded" disclosure in the UI must stay.
- [ ] ⚠️🟡 Confirm `$0.041/credit` (Personal Choice, Diamond VIP+) is right for the
      tier you quote (it's in `tripPlanner.js`; already overridable per request via
      `dollarsPerCredit`).
- [ ] ⚠️🟡 Have a WorldMark pricing SME spot-check 5–10 planner outputs.

## Phase 4 — Security & access
- [x] ✅ Authentication (shared rep password).
- [x] ✅ Rate limiting on the API and login.
- [x] ✅ Security headers, body-size cap, input validation, source-file lockout.
- [ ] ⛔🟡 **Serve over HTTPS.** Not doable from the repo — terminate TLS at your host/
      load balancer. The session cookie auto-sets `Secure` when it sees HTTPS
      (`trust proxy` is on). Force HTTP→HTTPS redirect at the edge.
- [ ] 💡 If you scale past one instance, move the rate limiter to Redis (it's in-memory).

## Phase 5 — Persistence & CRM
- [x] ✅ SQLite persistence for rep context + drafted logs (survives refresh).
- [ ] 💡🟡 Real **Salesforce** integration (still: rep copies the drafted log by hand).
- [x] ✅ Drafted logs are persisted for later review/audit.

## Phase 6 — Fix the known-wrong things
- [x] ✅ Duplicate "AI Model" section in `Claude.md` removed.
- [ ] ⛔🟡 **Booking redirect** in `start.js` still points to generic Wyndham. Supply
      the correct WorldMark owner-portal URL. (Only affects the owner widget, which
      is disabled — must be fixed before that widget is ever re-enabled.)
- [ ] 💡🟡 Drop real objection scripts into `objection-scripts/` and compliance docs
      into `compliance/` (still stub READMEs).

## Phase 7 — Deploy & operate
- [x] ✅ `Dockerfile` + `.dockerignore`; config via env vars; `/health` + logging.
- [ ] 🟡 Pick a host; set `ANTHROPIC_API_KEY`, `REP_PASSWORD`, `SESSION_SECRET`,
      `PORT`, `OWNER_WIDGET_ENABLED=false` as real env vars (never commit `.env`).
- [ ] 🟡 Mount a volume at `/app/data` so the SQLite DB survives redeploys.
- [ ] ⚠️🟡 Set an Anthropic **spend limit / budget alert** on the production key.
- [ ] ⚠️🟡 Add uptime monitoring against `/health`; wire logs to your log sink.

## Phase 8 — Legal / compliance sign-off (I cannot do this)
- [ ] ⛔🟡 Legal review of the 9 built-in guardrails and real script output.
- [ ] ⚠️🟡 Confirm rescission-period + fee-disclosure language per operating state.
- [ ] ⚠️🟡 Decide record-keeping/consent requirements for AI-assisted calls.

---

### Where it stands
All code-completable hardening is **done and tested**. Remaining items are gated on
things only you or a live environment can provide: a valid API key (P1), TLS at the
edge (P4), real fee numbers (P3), the booking URL (P6), a host + spend cap (P7), and
legal sign-off (P8). Clear those and the rep tool is live-ready.
