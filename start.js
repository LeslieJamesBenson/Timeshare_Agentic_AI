


const state = {
    open: false,
    profile: null,
    personality: 'friendly',
    messages: [],
    thinking: false
  };

  const personalities = {
    luxury: {
      name: 'Aria',
      label: 'Your Luxury Concierge',
      prompt: `You are Aria, an elite luxury travel concierge for WorldMark by Wyndham. Your tone is refined, sophisticated, and effortlessly knowledgeable — like a seasoned concierge at a 5-star hotel. Use elegant language, never rushed. Reference the owner's tier and preferences with subtle flattery. Speak in a warm but elevated register. Occasionally use phrases like "I'd be delighted to arrange...", "For a discerning traveler such as yourself...", "Allow me to suggest..."`
    },
    friendly: {
      name: 'Jordan',
      label: 'Your Travel Buddy',
      prompt: `You are Jordan, a warm and enthusiastic personal travel buddy for WorldMark by Wyndham. Your tone is upbeat, genuine, and conversational — like a well-traveled friend who happens to know everything about your ownership. Use casual but helpful language. Be encouraging and excited about travel possibilities. Use phrases like "Oh you're going to love...", "Here's a little tip...", "Great news —"`
    },
    professional: {
      name: 'Alex',
      label: 'Your Travel Advisor',
      prompt: `You are Alex, a professional and efficient travel advisor for WorldMark by Wyndham. Your tone is clear, direct, and knowledgeable — like a seasoned travel agent who values the owner's time. Be concise, accurate, and solution-focused. Provide structured answers when helpful. Use phrases like "Based on your ownership...", "I recommend...", "Here's what you need to know:"`
    }
  };

  function getSystemPrompt() {
    const p = state.profile;
    const pers = personalities[state.personality];
    const prefs = p.prefs.length ? p.prefs.join(', ') : 'not specified';
    const booking = p.booking ? `Upcoming reservation: ${p.booking}.` : 'No upcoming reservations on file.';
    
    return `${pers.prompt}

OWNER PROFILE:
- Name: ${p.first} ${p.last}
- Membership tier: ${p.tier}
- Available credits: ${p.credits.toLocaleString()}
- Home resort: ${p.resort}
- Travel preferences: ${prefs}
- ${booking}

KNOWLEDGE BASE:
- WorldMark credits cost varies: studio ~3,500–5,000/week, 1BR ~5,000–8,000/week, 2BR ~8,000–14,000/week depending on resort and season.
- Peak seasons (summer, holidays, spring break) require more credits and earlier booking (10–13 months out for best availability).
- Owners can book their home resort up to 13 months in advance; other resorts up to 10 months.
- Credit banking and borrowing: credits can be banked for 2 years, borrowing from next year's allocation is allowed.
- Guest certificates allow non-member guests to use booked units.
- Bonus time: last-minute availability at steep credit discounts (often 50%+ off).
- Popular resorts: Anaheim, Las Vegas (Tropicana & Boulevard), Seaside OR, Palm Springs, Birch Bay WA, Depoe Bay OR.

You have access to LIVE availability data via two tools: check_availability (look up dates, unit types, and credit costs for a specific resort) and list_resorts (show all available resorts). Always use these tools when the owner asks about availability, dates, or resort options — never guess or make up availability. After fetching data, summarize it clearly in terms of the owner's credit balance.

Keep responses helpful, concise, and always tied back to the owner's specific profile. Never invent specific reservation details. If asked about making actual bookings, direct them to wyndhamvacations.com or 1-800-WYNDHAM.`;
  }

  async function sendToAI(userMsg) {
    state.messages.push({ role: 'user', content: userMsg });
    setThinking(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-5',
          max_tokens: 1000,
          system: getSystemPrompt(),
          messages: state.messages.map(m => ({ role: m.role, content: m.content }))
        })
      });

      const data = await res.json();
      const reply = data.content?.find(b => b.type === 'text')?.text || 'I apologize — something went wrong. Please try again.';
      state.messages.push({ role: 'assistant', content: reply });
      setThinking(false);
      addMsg('agent', reply);
    } catch (e) {
      setThinking(false);
      addMsg('agent', 'I\'m having a moment — please try again shortly.');
    }
  }

  function addMsg(role, text) {
    const area = document.getElementById('chat-area');
    const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    const p = state.profile;
    const pers = personalities[state.personality];

    const initials = role === 'user'
      ? `${p.first[0]}${p.last[0]}`
      : pers.name[0];

    const div = document.createElement('div');
    div.className = `msg ${role}`;
    div.innerHTML = `
      <div class="msg-avatar ${role}">${initials}</div>
      <div>
        <div class="msg-bubble">${text.replace(/\n/g, '<br>')}</div>
        <div class="msg-time">${now}</div>
      </div>`;
    area.appendChild(div);
    area.scrollTop = area.scrollHeight;
  }

  function setThinking(val) {
    state.thinking = val;
    const dot = document.getElementById('status-dot');
    const txt = document.getElementById('status-text');
    const btn = document.getElementById('send-btn');
    const area = document.getElementById('chat-area');

    if (val) {
      dot.className = 'dot thinking';
      txt.textContent = 'Thinking…';
      btn.disabled = true;
      const t = document.createElement('div');
      t.className = 'msg agent'; t.id = 'typing-msg';
      t.innerHTML = `<div class="msg-avatar agent">${personalities[state.personality].name[0]}</div>
        <div class="msg-bubble"><div class="typing-indicator">
          <div class="typing-dot"></div><div class="typing-dot"></div><div class="typing-dot"></div>
        </div></div>`;
      area.appendChild(t);
      area.scrollTop = area.scrollHeight;
    } else {
      dot.className = 'dot';
      txt.textContent = 'Ready to assist';
      btn.disabled = false;
      const t = document.getElementById('typing-msg');
      if (t) t.remove();
    }
  }

  function startChat() {
    const first = document.getElementById('s-first').value.trim() || 'Guest';
    const last = document.getElementById('s-last').value.trim() || '';
    const tier = document.getElementById('s-tier').value;
    const credits = parseInt(document.getElementById('s-credits').value) || 0;
    const resort = document.getElementById('s-resort').value;
    const booking = document.getElementById('s-booking').value.trim();
    const prefs = Array.from(document.querySelectorAll('.pref-tag.selected')).map(el => el.dataset.val);

    state.profile = { first, last, tier, credits, resort, booking, prefs };

    document.getElementById('ow-avatar').textContent = `${first[0]}${last ? last[0] : ''}`;
    document.getElementById('ow-name').textContent = `${first} ${last}`.trim();
    document.getElementById('ow-tier').textContent = `${tier} Member · ${resort}`;
    document.getElementById('ow-credits').textContent = credits.toLocaleString();

    document.getElementById('setup-view').style.display = 'none';
    document.getElementById('chat-view').style.display = 'flex';

    updatePersonalityUI();

    const pers = personalities[state.personality];
    const greeting = state.personality === 'luxury'
      ? `Welcome back, ${first}. I'm ${pers.name}, your personal concierge. As a ${tier} member with ${credits.toLocaleString()} credits, you have wonderful options awaiting you. How may I assist you today?`
      : state.personality === 'friendly'
      ? `Hey ${first}! I'm ${pers.name}, your WorldMark travel buddy! So excited to help you plan your next getaway. You've got ${credits.toLocaleString()} credits ready to use — let's make them count! What are you thinking?`
      : `Hello ${first}. I'm ${pers.name}, your WorldMark travel advisor. Your ${tier} membership gives you ${credits.toLocaleString()} credits and access to 100+ resorts. How can I assist you today?`;

    addMsg('agent', greeting);
    state.messages.push({ role: 'assistant', content: greeting });
  }

  function updatePersonalityUI() {
    const pers = personalities[state.personality];
    document.getElementById('agent-name-head').textContent = pers.label;
    document.querySelectorAll('.personality-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.p === state.personality);
    });
  }

  document.getElementById('launcher-btn').addEventListener('click', () => {
    state.open = !state.open;
    document.getElementById('widget-panel').classList.toggle('hidden', !state.open);
  });

  document.getElementById('close-btn').addEventListener('click', () => {
    state.open = false;
    document.getElementById('widget-panel').classList.add('hidden');
  });

  document.getElementById('start-btn').addEventListener('click', startChat);

  document.querySelectorAll('.pref-tag').forEach(tag => {
    tag.addEventListener('click', () => tag.classList.toggle('selected'));
  });

  document.querySelectorAll('.personality-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.thinking) return;
      state.personality = btn.dataset.p;
      updatePersonalityUI();
      if (state.profile) {
        const pers = personalities[state.personality];
        const msgs = {
          luxury: `Of course, ${state.profile.first} — I'm now in luxury concierge mode. How may I be of service?`,
          friendly: `Switching it up! I'm your travel buddy now, ${state.profile.first}. Let's find you something amazing!`,
          professional: `Understood. Switching to professional mode. How can I assist you efficiently today?`
        };
        addMsg('agent', msgs[state.personality]);
        state.messages.push({ role: 'assistant', content: msgs[state.personality] });
      }
    });
  });

  document.querySelectorAll('.quick-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.thinking) return;
      const q = btn.dataset.q;
      addMsg('user', q);
      sendToAI(q);
    });
  });

  document.getElementById('send-btn').addEventListener('click', send);
  document.getElementById('chat-input').addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  function send() {
    const inp = document.getElementById('chat-input');
    const val = inp.value.trim();
    if (!val || state.thinking) return;
    inp.value = '';
    addMsg('user', val);
    sendToAI(val);
  }
