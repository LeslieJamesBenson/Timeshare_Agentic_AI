require('dotenv').config();
const express = require('express');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('ERROR: ANTHROPIC_API_KEY is not set in .env');
  process.exit(1);
}


// check availability of a hardcoded resort list for testing purposes
//TODO: replace with live availability data from WBW database
const availabilityData = JSON.parse(
  fs.readFileSync(path.join(__dirname, 'public', 'availability.json'), 'utf8')
);

app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/public', express.static(path.join(__dirname, 'public')));

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

app.listen(PORT, () => {
  console.log(`Timeshare AI running at http://localhost:${PORT}`);
});
