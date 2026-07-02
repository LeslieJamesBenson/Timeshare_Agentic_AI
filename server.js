require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadResorts } = require('./lib/resortData');
const { planTrip } = require('./lib/tripPlanner');
const auth = require('./lib/auth');
const { createRateLimiter } = require('./lib/rateLimit');
const { createStore } = require('./lib/store');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const OWNER_WIDGET_ENABLED = process.env.OWNER_WIDGET_ENABLED === 'true';

// ── Startup config checks (fail fast, don't boot half-secured) ───────────────
const missing = [];
if (!ANTHROPIC_API_KEY) missing.push('ANTHROPIC_API_KEY');
if (!process.env.REP_PASSWORD) missing.push('REP_PASSWORD');
if (!process.env.SESSION_SECRET) missing.push('SESSION_SECRET');
if (missing.length) {
  console.error(`ERROR: missing required env var(s): ${missing.join(', ')}. See .env.example.`);
  process.exit(1);
}

// Real WorldMark dataset (100 resorts) — loaded and normalized once at startup.
// Powers the trip planner. See lib/resortData.js.
const resortDataset = loadResorts();
if (resortDataset.errors.length) {
  console.warn(`Resort data loaded with ${resortDataset.errors.length} warning(s):`);
  resortDataset.errors.slice(0, 5).forEach(e => console.warn('  ' + e));
}
const REGIONS = [...new Set(resortDataset.resorts.map(r => r.region))].sort();

// check availability of a hardcoded resort list for testing purposes
//TODO: replace with live availability data from WBW database
const availabilityData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public', 'availability.json'), 'utf8')
);

// Persistence for rep call context + drafted SF logs (Phase 5).
const store = createStore();

// Behind a load balancer / TLS terminator, trust X-Forwarded-* so req.ip and
// req.secure are accurate (needed for the Secure cookie flag and rate limiting).
app.set('trust proxy', true);
app.disable('x-powered-by');

app.use(express.json({ limit: '256kb' }));

// Lightweight request log (Phase 7). Skips the noisy health check.
app.use((req, res, next) => {
  if (req.path === '/health') return next();
  const started = Date.now();
  res.on('finish', () => {
    console.log(`${new Date().toISOString()} ${req.method} ${req.path} ${res.statusCode} ${Date.now() - started}ms`);
  });
  next();
});

// Baseline security headers (Phase 4). Kept conservative so the self-contained
// pages keep working (they use inline styles/scripts).
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  next();
});

// Rate limiters (Phase 4). Login is stricter to blunt password guessing.
const apiLimiter = createRateLimiter({ windowMs: 60_000, max: 60 });
const loginLimiter = createRateLimiter({ windowMs: 60_000, max: 10 });

// ── PUBLIC ROUTES (no auth required) ─────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', resorts: resortDataset.resorts.length, store: store.backend, ownerWidget: OWNER_WIDGET_ENABLED });
});

// Quiet the browser's automatic favicon request (avoids noisy 404s).
app.get('/favicon.ico', (req, res) => res.status(204).end());

app.get('/login.html', (req, res) => res.sendFile(path.join(__dirname, 'public', 'login.html')));

app.post('/api/login', loginLimiter, (req, res) => {
  if (!auth.checkPassword(req.body && req.body.password)) {
    return res.status(401).json({ error: 'Incorrect password' });
  }
  auth.setSessionCookie(res, req.secure);
  res.json({ ok: true });
});

app.post('/api/logout', (req, res) => {
  auth.clearSessionCookie(res);
  res.json({ ok: true });
});

// ── AUTH GATE — everything below requires a valid rep session ────────────────
// Also serves as defense-in-depth against serving source/config as static.
const BLOCKED = [/^\/server\.js$/, /^\/package(-lock)?\.json$/, /\.md$/i,
  /^\/lib\//, /^\/scripts\//, /^\/docs\//, /^\/node_modules\//,
  /^\/email-templates\//, /^\/objection-scripts\//, /^\/compliance\//,
  /^\/Resort_Info_WBW\//, /^\/data\//];

app.use((req, res, next) => {
  if (BLOCKED.some(rx => rx.test(req.path))) return res.status(404).end();
  if (auth.isAuthed(req)) return next();
  if (req.path.startsWith('/api/')) {
    return res.status(401).json({ error: 'Not authenticated' });
  }
  const next_ = encodeURIComponent(req.originalUrl);
  return res.redirect(`/login.html?next=${next_}`);
});

// Owner concierge widget is disabled for the rep-only launch. Redirect its
// entry points to the rep tool unless explicitly enabled.
if (!OWNER_WIDGET_ENABLED) {
  app.get(['/', '/index.html'], (req, res) => res.redirect('/sales-agent.html'));
}

// Static assets (authenticated). Default dotfiles:'ignore' keeps .env private;
// the BLOCKED gate above keeps source/config out too.
app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Apply the general rate limit to the AI/planner API surface.
app.use('/api', apiLimiter);

function checkAvailability({ resort, checkIn, checkOut, unitType }) {
  const resortData = availabilityData.resorts.find(r =>
    r.name.toLowerCase().includes(resort.toLowerCase()) ||
    r.id.toLowerCase().includes(resort.toLowerCase()) ||
    r.location.toLowerCase().includes(resort.toLowerCase())
  );

  if (!resortData) {
    const names = availabilityData.resorts.map(r => r.name).join(', ');
    return { error: `Resort not found. Available resorts: ${names}` };
  }

  let slots = resortData.availability;

  if (checkIn) {
    slots = slots.filter(s => {
      const slotStart = new Date(s.checkIn);
      const slotEnd = new Date(s.checkOut);
      const reqStart = new Date(checkIn);
      const reqEnd = checkOut ? new Date(checkOut) : reqStart;
      // Keep slot if it overlaps the requested window at all
      return slotStart <= reqEnd && slotEnd >= reqStart;
    });
  }

  if (unitType) {
    slots = slots.filter(s =>
      s.unitType.toLowerCase().includes(unitType.toLowerCase())
    );
  }

  return {
    resort: resortData.name,
    location: resortData.location,
    nearbyAttractions: resortData.nearbyAttractions,
    availableSlots: slots.map(s => ({
      unitType: s.unitType,
      checkIn: s.checkIn,
      checkOut: s.checkOut,
      creditsPerNight: s.creditsPerNight,
      totalCredits: s.creditsPerNight * Math.round((new Date(s.checkOut) - new Date(s.checkIn)) / 86400000),
      status: s.status
    }))
  };
}

function listResorts() {
  return availabilityData.resorts.map(r => ({
    name: r.name,
    location: r.location,
    id: r.id,
    unitTypes: r.units.map(u => u.type)
  }));
}

function runTool(name, input) {
  if (name === 'check_availability') return checkAvailability(input);
  if (name === 'list_resorts') return listResorts();
  return { error: `Unknown tool: ${name}` };
}

const tools = [
  {
    name: 'check_availability',
    description: 'Check real-time availability for a WorldMark resort. Returns available dates, unit types, and credit costs. Use this whenever the owner asks about availability, dates, or booking a specific resort.',
    input_schema: {
      type: 'object',
      properties: {
        resort: {
          type: 'string',
          description: 'Resort name, partial name, or location (e.g. "Seaside", "Las Vegas", "Anaheim")'
        },
        checkIn: {
          type: 'string',
          description: 'Desired check-in date in YYYY-MM-DD format (optional)'
        },
        checkOut: {
          type: 'string',
          description: 'Desired check-out date in YYYY-MM-DD format (optional)'
        },
        unitType: {
          type: 'string',
          description: 'Unit type filter: "Studio", "1BR", or "2BR" (optional)'
        }
      },
      required: ['resort']
    }
  },
  {
    name: 'list_resorts',
    description: 'List all WorldMark resorts in the availability system. Use this when the owner asks which resorts are available, wants to browse options, or asks a general travel question without a specific resort in mind.',
    input_schema: {
      type: 'object',
      properties: {},
      required: []
    }
  }
];

// Owner concierge chat — only mounted when the owner widget is enabled.
app.post('/api/chat', async (req, res) => {
  if (!OWNER_WIDGET_ENABLED) {
    return res.status(410).json({ error: 'Owner widget is disabled for this deployment.' });
  }
  try {
    const { model, max_tokens, system, messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages must be an array' });
    let currentMessages = [...messages];

    // Agentic loop: keep running until Claude stops using tools
    while (true) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens, system, messages: currentMessages, tools })
      });

      const data = await response.json();

      if (!response.ok) {
        return res.status(response.status).json(data);
      }

      // If Claude is done (no tool use), return the final response
      if (data.stop_reason !== 'tool_use') {
        return res.json(data);
      }

      // Claude wants to use a tool — run it and feed results back
      const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');

      currentMessages.push({ role: 'assistant', content: data.content });

      const toolResults = toolUseBlocks.map(block => ({
        type: 'tool_result',
        tool_use_id: block.id,
        content: JSON.stringify(runTool(block.name, block.input))
      }));

      currentMessages.push({ role: 'user', content: toolResults });
    }
  } catch (err) {
    console.error('Proxy error:', err);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

// ── TRIP PLANNER ────────────────────────────────────────────────────────────
// Direct, deterministic endpoint used by the "Plan a Trip" form in the rep
// tool. Runs the engine with NO AI call, so it works (and is testable) even
// without an Anthropic key. Request body = planTrip() request object.
app.post('/api/plan-trip', (req, res) => {
  try {
    const result = planTrip(req.body || {}, resortDataset);
    // 400 only for malformed input; a valid query with no matches is 200 ok:false.
    const status = result.ok ? 200 : (result.errorType === 'validation' ? 400 : 200);
    res.status(status).json(result);
  } catch (err) {
    console.error('plan-trip error:', err);
    res.status(500).json({ ok: false, error: 'Trip planning failed' });
  }
});

// Region + resort catalog for populating the planner form dropdowns.
app.get('/api/regions', (req, res) => {
  res.json({
    regions: REGIONS,
    resorts: resortDataset.resorts
      .map(r => ({ id: r.id, name: r.name, state: r.state, region: r.region }))
      .sort((a, b) => a.name.localeCompare(b.name))
  });
});

// ── REP CONTEXT + SF LOG PERSISTENCE (Phase 5) ───────────────────────────────
// Simple key/value persistence so a rep's pre-call context and drafted logs
// survive a refresh. ownerKey is any stable rep-chosen identifier (e.g. owner
// name or Salesforce ID).
app.post('/api/rep-context', (req, res) => {
  const { ownerKey, context } = req.body || {};
  if (!ownerKey || typeof context === 'undefined') {
    return res.status(400).json({ error: 'ownerKey and context are required' });
  }
  store.saveContext(String(ownerKey), context);
  res.json({ ok: true });
});

app.get('/api/rep-context/:ownerKey', (req, res) => {
  const row = store.loadContext(req.params.ownerKey);
  if (!row) return res.status(404).json({ error: 'not found' });
  res.json(row);
});

app.post('/api/sf-log', (req, res) => {
  const { ownerKey, log } = req.body || {};
  if (!ownerKey || !log) return res.status(400).json({ error: 'ownerKey and log are required' });
  const id = store.saveLog(String(ownerKey), log);
  res.json({ ok: true, id });
});

app.get('/api/sf-logs/:ownerKey', (req, res) => {
  res.json({ logs: store.listLogs(req.params.ownerKey) });
});

// ── SALES AGENT ENDPOINT ────────────────────────────────────────────────────
// Internal rep-facing tool — not owner-facing. The agent is conversational with
// a compliance-guardrailed system prompt AND can call the trip-planner tool so
// reps can plan trips in natural language during a call.
const salesTools = [
  {
    name: 'plan_trip',
    description: 'Plan a WorldMark trip for an owner and get ranked options with exact credit costs and Personal Choice cash-equivalent totals. Use whenever the rep wants to build travel options: specific or flexible dates, a specific resort/state/region or an open "suggest somewhere" request, and a party size. Returns real credit costs from the WorldMark charts.',
    input_schema: {
      type: 'object',
      properties: {
        locationText: { type: 'string', description: 'Resort name, city, or state to search (e.g. "Seaside", "Hawaii", "Birch Bay"). Omit to suggest anywhere.' },
        region: { type: 'string', description: 'Optional region filter. One of: ' + REGIONS.join(', ') },
        secondaryLocationText: { type: 'string', description: 'Optional fallback/second location to also include as suggestions.' },
        checkIn: { type: 'string', description: 'Check-in date, YYYY-MM-DD.' },
        nights: { type: 'integer', description: 'Number of nights (>= 1).' },
        flexDays: { type: 'integer', description: 'If dates are flexible, +/- days to search for a cheaper start (e.g. 5). Default 0 = exact date.' },
        partySize: { type: 'integer', description: 'Number of travelers. Default 2.' },
        maxResults: { type: 'integer', description: 'Max options to return. Default 5.' }
      },
      required: ['checkIn', 'nights']
    }
  },
  {
    name: 'list_regions',
    description: 'List the available WorldMark regions and how many resorts are in each. Use when the rep asks "where can we go" or wants to browse by area.',
    input_schema: { type: 'object', properties: {}, required: [] }
  }
];

function runSalesTool(name, input) {
  if (name === 'plan_trip') return planTrip(input || {}, resortDataset);
  if (name === 'list_regions') {
    const counts = {};
    resortDataset.resorts.forEach(r => { counts[r.region] = (counts[r.region] || 0) + 1; });
    return { regions: Object.entries(counts).map(([region, resorts]) => ({ region, resorts })) };
  }
  return { error: `Unknown tool: ${name}` };
}

app.post('/api/sales-chat', async (req, res) => {
  try {
    const { model, max_tokens, system, messages } = req.body;
    if (!Array.isArray(messages)) return res.status(400).json({ error: 'messages must be an array' });
    let currentMessages = [...messages];

    // Agentic loop: run tools until the model produces a final answer.
    while (true) {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({ model, max_tokens, system, messages: currentMessages, tools: salesTools })
      });

      const data = await response.json();
      if (!response.ok) return res.status(response.status).json(data);
      if (data.stop_reason !== 'tool_use') return res.json(data);

      const toolUseBlocks = data.content.filter(b => b.type === 'tool_use');
      currentMessages.push({ role: 'assistant', content: data.content });
      currentMessages.push({
        role: 'user',
        content: toolUseBlocks.map(block => ({
          type: 'tool_result',
          tool_use_id: block.id,
          content: JSON.stringify(runSalesTool(block.name, block.input))
        }))
      });
    }
  } catch (err) {
    console.error('Sales chat proxy error:', err);
    res.status(500).json({ error: 'Proxy request failed' });
  }
});

app.listen(PORT, () => {
  console.log(`Timeshare AI running at http://localhost:${PORT}`);
  console.log(`Sales rep agent: http://localhost:${PORT}/sales-agent.html`);
  console.log(`Owner concierge: ${OWNER_WIDGET_ENABLED ? `http://localhost:${PORT}/index.html` : 'disabled (OWNER_WIDGET_ENABLED=false)'}`);
  console.log(`Persistence backend: ${store.backend}`);
});
