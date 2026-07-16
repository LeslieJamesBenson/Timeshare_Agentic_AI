// detect-schema.js — pick the adapter for a raw chart.
//
// Runs every registered adapter's supports() and returns the best match. If two
// adapters match with similar high confidence the file is flagged AMBIGUOUS and
// must not be imported automatically.

const wbwStandard = require('./wbw-standard');

const ADAPTERS = [wbwStandard];
const MIN_CONFIDENCE = 0.8;
const AMBIGUITY_MARGIN = 0.15;

function detectAdapter(raw) {
  const scored = ADAPTERS
    .map((a) => ({ adapter: a, confidence: a.supports(raw) }))
    .sort((x, y) => y.confidence - x.confidence);

  const best = scored[0];
  if (!best || best.confidence < MIN_CONFIDENCE) {
    return { adapter: null, confidence: best ? best.confidence : 0, status: 'unsupported', scored };
  }
  const second = scored[1];
  if (second && best.confidence - second.confidence < AMBIGUITY_MARGIN && second.confidence >= MIN_CONFIDENCE) {
    return { adapter: null, confidence: best.confidence, status: 'ambiguous', scored };
  }
  return { adapter: best.adapter, confidence: best.confidence, status: 'ok', scored };
}

module.exports = { detectAdapter, ADAPTERS, MIN_CONFIDENCE };
