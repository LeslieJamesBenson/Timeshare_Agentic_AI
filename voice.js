// voice.js — shared voice module for both the owner widget and the rep tool.
// Classic (non-module) script that attaches a global `VoiceKit`.
//
//   Listening: browser SpeechRecognition (push-to-talk toggle) — free, no key.
//   Speaking:  premium ElevenLabs via the server /api/tts proxy, with automatic
//              fallback to the browser's built-in speechSynthesis when premium
//              TTS isn't configured or a request fails.
//
// Include BEFORE any page script that calls it:  <script src="voice.js"></script>

(function () {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  let premiumTTS = null;         // null = unknown yet, true/false once probed
  let currentAudio = null;       // active <audio> for premium playback
  let recognizer = null;         // active SpeechRecognition instance
  let listening = false;

  async function probePremium() {
    if (premiumTTS !== null) return premiumTTS;
    try {
      const r = await fetch('/api/voice-status');
      const d = await r.json();
      premiumTTS = Boolean(d.premiumTTS);
    } catch (e) {
      premiumTTS = false;
    }
    return premiumTTS;
  }

  // ── LISTENING (push-to-talk toggle) ────────────────────────────────────────
  // Wire a mic button: first click starts listening, second click stops and
  // fires onResult(finalTranscript). Handles the "active" CSS class and errors.
  function attachPushToTalk(button, { onResult, onStart, onEnd, onError } = {}) {
    if (!SR) {
      button.disabled = true;
      button.title = 'Speech recognition not supported in this browser (try Chrome or Edge)';
      button.classList.add('unsupported');
      return { supported: false };
    }
    button.addEventListener('click', () => {
      if (listening) { stopListening(); return; }
      startListening({ onResult, onStart, onEnd, onError }, button);
    });
    return { supported: true };
  }

  function startListening(handlers, button) {
    recognizer = new SR();
    recognizer.lang = 'en-US';
    recognizer.interimResults = true;
    recognizer.continuous = false;
    let finalText = '';

    recognizer.onstart = () => {
      listening = true;
      if (button) button.classList.add('listening');
      handlers.onStart && handlers.onStart();
    };
    recognizer.onresult = (ev) => {
      let interim = '';
      for (let i = ev.resultIndex; i < ev.results.length; i++) {
        const chunk = ev.results[i][0].transcript;
        if (ev.results[i].isFinal) finalText += chunk;
        else interim += chunk;
      }
      handlers.onResult && handlers.onResult(finalText || interim, ev.results[ev.results.length - 1].isFinal);
    };
    recognizer.onerror = (ev) => { handlers.onError && handlers.onError(ev.error); };
    recognizer.onend = () => {
      listening = false;
      if (button) button.classList.remove('listening');
      handlers.onEnd && handlers.onEnd(finalText.trim());
    };
    recognizer.start();
  }

  function stopListening() {
    if (recognizer) { try { recognizer.stop(); } catch (e) {} }
  }

  // ── SPEAKING ────────────────────────────────────────────────────────────────
  // Speak text aloud. Prefers premium ElevenLabs; falls back to browser TTS.
  async function speak(text, { voiceId } = {}) {
    if (!text) return;
    stopSpeaking();
    const usePremium = await probePremium();
    if (usePremium) {
      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voiceId })
        });
        if (res.ok) {
          const blob = await res.blob();
          const url = URL.createObjectURL(blob);
          currentAudio = new Audio(url);
          currentAudio.onended = () => URL.revokeObjectURL(url);
          await currentAudio.play();
          return;
        }
        // 503/502/etc → fall through to browser voice
      } catch (e) { /* fall through */ }
    }
    browserSpeak(text);
  }

  function browserSpeak(text) {
    if (!window.speechSynthesis) return;
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1.0; u.pitch = 1.0;
    window.speechSynthesis.speak(u);
  }

  function stopSpeaking() {
    if (currentAudio) { try { currentAudio.pause(); } catch (e) {} currentAudio = null; }
    if (window.speechSynthesis) window.speechSynthesis.cancel();
  }

  // Strip markdown/formatting so spoken output sounds natural.
  function cleanForSpeech(text) {
    return (text || '')
      .replace(/```[\s\S]*?```/g, ' ')      // code blocks
      .replace(/[*_#>`|]/g, '')              // markdown symbols
      .replace(/\[(.*?)\]\(.*?\)/g, '$1')    // links -> label
      .replace(/\s+/g, ' ')
      .trim();
  }

  window.VoiceKit = {
    listeningSupported: Boolean(SR),
    attachPushToTalk,
    stopListening,
    speak,
    stopSpeaking,
    cleanForSpeech,
    probePremium
  };
})();
