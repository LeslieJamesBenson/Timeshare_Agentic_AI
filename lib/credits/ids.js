// ids.js — stable identifier normalization.
//
// Display names are inconsistent across the source charts, so joins between
// seasons, rates, and units must use slugs — never raw display strings.
// Meaningfully different unit labels ("1 BR" vs "1 BR Deluxe") MUST produce
// different ids; only truly identical labels collapse.

function slug(str) {
  return String(str)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

// Number words so "1 BR Deluxe" -> "one-bedroom-deluxe" (readable, stable).
const NUM_WORDS = { 0: 'studio', 1: 'one', 2: 'two', 3: 'three', 4: 'four', 5: 'five' };

function normalizeResortId(state, resortName) {
  return `${slug(state)}-${slug(resortName)}`.replace(/-+/g, '-');
}

// "1 BR Deluxe" -> "one-bedroom-deluxe", "Studio King" -> "studio-king",
// "2 BR Ocean View" -> "two-bedroom-ocean-view". Falls back to a plain slug
// when there is no "N BR" / "Studio" token.
function normalizeUnitTypeId(typeStr) {
  let s = String(typeStr).trim();
  // expand "N BR" -> "<word>-bedroom"
  s = s.replace(/(\d+)\s*br\b/gi, (_, n) => `${NUM_WORDS[+n] || n}-bedroom`);
  return slug(s);
}

function normalizeSeasonId(name) {
  return slug(name);
}

module.exports = { slug, normalizeResortId, normalizeUnitTypeId, normalizeSeasonId, NUM_WORDS };
