require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');
const { loadResorts } = require('./lib/resortData');
const { planTrip } = require('./lib/tripPlanner');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set in .env');
  process.exit(1);
}

// ElevenLabs is OPTIONAL — the voice module falls back to the browser's built-in
// voice when this key is absent, so the app still runs without it.
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
// Default voice ("Rachel" — warm, professional). Override per request or via env.
const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || '21m00Tcm4TlvDq8ikWAM';
const ELEVENLABS_MODEL = process.env.ELEVENLABS_MODEL || 'eleven_turbo_v2_5';

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

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(path.join(__dirname, 'public')));

// Quiet the browser's automatic favicon request (avoids noisy 404s).
app.get('/favicon.ico', (req, res) => res.status(204).end());

// ── VOICE ───────────────────────────────────────────────────────────────────
// Lets the frontend know whether premium (ElevenLabs) TTS is available so it can
// choose premium audio vs. the browser's built-in speech synthesis.
app.get('/api/voice-status', (req, res) => {
  res.json({ premiumTTS: Boolean(ELEVENLABS_API_KEY), provider: ELEVENLABS_API_KEY ? 'elevenlabs' : 'browser' });
});

// Text-to-speech proxy. Keeps the ElevenLabs key server-side; streams MP3 back.
// Returns 503 (not 500) when no key is configured so the client can fall back
// gracefully to browser TTS instead of treating it as a hard error.
app.post('/api/tts', async (req, res) => {
  if (!ELEVENLABS_API_KEY) {
    return res.status(503).json({ error: 'Premium TTS not configured', fallback: 'browser' });
  }
  const text = (req.body && req.body.text || '').toString().slice(0, 5000).trim();
  if (!text) return res.status(400).json({ error: 'text is required' });
  const voiceId = (req.body && req.body.voiceId) || ELEVENLABS_VOICE_ID;

  try {
    const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg'
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_MODEL,
        voice_settings: { stability: 0.5, similarity_boost: 0.75 }
      })
    });
    if (!r.ok) {
      const detail = await r.text();
      console.error('ElevenLabs TTS error:', r.status, detail.slice(0, 300));
      return res.status(502).json({ error: 'TTS provider error', status: r.status });
    }
    res.setHeader('Content-Type', 'audio/mpeg');
    const buf = Buffer.from(await r.arrayBuffer());
    res.send(buf);
  } catch (err) {
    console.error('TTS proxy error:', err);
    res.status(500).json({ error: 'TTS request failed' });
  }
});

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

app.post('/api/chat', async (req, res) => {
  try {
    const { model, max_tokens, system, messages } = req.body;
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
  console.log(`Owner concierge: http://localhost:${PORT}/index.html`);
  console.log(`Sales rep agent: http://localhost:${PORT}/sales-agent.html`);
  console.log(`Voice (TTS): ${ELEVENLABS_API_KEY ? 'ElevenLabs premium' : 'browser fallback (set ELEVENLABS_API_KEY for premium)'}`);
});
