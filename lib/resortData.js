// resortData.js — loads and normalizes the Resort_Info_WBW/ dataset.
//
// The raw JSONs (one folder per resort, grouped by state) use human-readable
// date ranges ("Apr 17 - Sep 17") keyed by year, and 56 distinct free-text
// room-type strings. This module turns all of that into a normalized in-memory
// model the trip planner can query: real dates, bedroom/sleeps per room, and a
// region grouping derived from the state folder.
//
// Nothing here mutates the source files — they remain the source of truth.

const fs = require('fs');
const path = require('path');

const DATA_ROOT = path.join(__dirname, '..', 'Resort_Info_WBW');

const MONTHS = {
  Jan: 0, Feb: 1, Mar: 2, Apr: 3, May: 4, Jun: 5,
  Jul: 6, Aug: 7, Sep: 8, Oct: 9, Nov: 10, Dec: 11
};

// State/region folder -> planner region bucket. Powers "somewhere on the
// Oregon coast" and secondary-location suggestions ("show me nearby resorts").
const STATE_TO_REGION = {
  'Washington': 'pacific-northwest',
  'Oregon': 'pacific-northwest',
  'Idaho': 'pacific-northwest',
  'Montana': 'mountain',
  'Colorado': 'mountain',
  'Utah': 'mountain',
  'California': 'california',
  'Nevada': 'desert-southwest',
  'Arizona': 'desert-southwest',
  'New Mexico': 'desert-southwest',
  'Texas': 'south-central',
  'Oklahoma': 'south-central',
  'Louisiana': 'south-central',
  'Missouri': 'midwest',
  'Illinois': 'midwest',
  'Florida': 'southeast',
  'South Carolina': 'southeast',
  'Virginia': 'mid-atlantic',
  'Hawaii': 'hawaii',
  'Fiji': 'south-pacific',
  'Mexico': 'mexico',
  'BC Canada': 'canada',
  'Alberta Canada': 'canada',
  'St. Thomas VI': 'caribbean'
};

// WorldMark standard max occupancy by bedroom count (used when the room-type
// string doesn't say otherwise). Deliberately conservative; flagged for review.
const SLEEPS_BY_BEDROOMS = { 0: 4, 1: 4, 2: 6, 3: 8, 4: 10 };

// Parse one token like "Apr 17 - Sep 17" or "Jan 1" into {start,end} Date
// objects for the given year. Ranges that read backwards (e.g. "Nov 13 - Jan 5")
// are treated as wrapping into the next year.
function parseDateToken(token, year) {
  const parts = token.split('-').map(s => s.trim());
  const parseOne = (str, y) => {
    const m = str.match(/^([A-Z][a-z]{2})\s+(\d{1,2})$/);
    if (!m || !(m[1] in MONTHS)) return null;
    return new Date(Date.UTC(y, MONTHS[m[1]], parseInt(m[2], 10)));
  };
  const start = parseOne(parts[0], year);
  if (!start) return null;
  if (parts.length === 1) {
    // single day
    return { start, end: start };
  }
  let end = parseOne(parts[1], year);
  if (!end) return null;
  if (end < start) {
    // wraps past new year
    end = parseOne(parts[1], year + 1);
  }
  return { start, end };
}

// Turn a free-text room type into structured info the planner can match on.
// Handles "Studio", "1 BR", "2 BR Deluxe", "3 BR Penthouse", oddities like
// "1 BR Hotel or 2 BR Suite" (takes the larger), "Studio & 1 BR Suite".
function normalizeRoomType(typeStr) {
  const raw = typeStr.trim();
  const lower = raw.toLowerCase();

  // Collect every "N BR" and every "studio" mention; use the largest capacity.
  let bedrooms = null;
  const brMatches = [...lower.matchAll(/(\d+)\s*br/g)].map(m => parseInt(m[1], 10));
  if (brMatches.length) bedrooms = Math.max(...brMatches);
  else if (lower.includes('studio')) bedrooms = 0;
  else if (lower.includes('hotel')) bedrooms = 0; // hotel room, no separate bedroom

  // "Class" tier for display/ranking — best-effort from keywords.
  let tier = 'standard';
  for (const t of ['presidential', 'penthouse', 'deluxe', 'suite', 'plus', 'compact']) {
    if (lower.includes(t)) { tier = t; break; }
  }

  const sleeps = bedrooms === null ? null : (SLEEPS_BY_BEDROOMS[bedrooms] ?? (bedrooms * 2 + 2));

  return { raw, bedrooms, tier, sleeps };
}

// Load and normalize the whole dataset. Returns { resorts, byId, errors }.
function loadResorts() {
  const resorts = [];
  const errors = [];
  if (!fs.existsSync(DATA_ROOT)) {
    return { resorts, byId: {}, errors: [`data root not found: ${DATA_ROOT}`] };
  }

  for (const stateDir of fs.readdirSync(DATA_ROOT)) {
    const statePath = path.join(DATA_ROOT, stateDir);
    if (!fs.statSync(statePath).isDirectory()) continue;

    for (const resortDir of fs.readdirSync(statePath)) {
      const resortPath = path.join(statePath, resortDir);
      if (!fs.statSync(resortPath).isDirectory()) continue;

      const jsonFile = fs.readdirSync(resortPath).find(f => f.endsWith('.json'));
      if (!jsonFile) { errors.push(`no JSON in ${stateDir}/${resortDir}`); continue; }

      const fullPath = path.join(resortPath, jsonFile);
      let raw;
      try {
        raw = JSON.parse(fs.readFileSync(fullPath, 'utf8'));
      } catch (e) {
        errors.push(`invalid JSON: ${stateDir}/${resortDir}/${jsonFile} — ${e.message}`);
        continue;
      }

      // id keyed by state + resort so the two "La Paloma" resorts don't collide.
      const id = `${stateDir}/${resortDir}`
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '');

      const region = STATE_TO_REGION[stateDir] || 'other';

      const seasons = (raw.seasons || []).map(s => {
        const ranges = {};
        for (const [year, tokens] of Object.entries(s.date_ranges || {})) {
          ranges[year] = tokens
            .map(t => parseDateToken(t, parseInt(year, 10)))
            .filter(Boolean);
        }
        const rooms = (s.rooms || []).map(r => ({
          ...normalizeRoomType(r.type),
          features: r.features || {},
          credits: r.credits || {}
        }));
        return { name: s.name, meaning: s.meaning || null, ranges, rooms };
      });

      resorts.push({
        id,
        name: raw.resort || resortDir,
        state: raw.state || stateDir,
        region,
        sourceFile: path.relative(path.join(__dirname, '..'), fullPath),
        seasons
      });
    }
  }

  const byId = Object.fromEntries(resorts.map(r => [r.id, r]));
  return { resorts, byId, errors };
}

// Given a resort and a check-in Date, return the season name in effect, or null.
function seasonForDate(resort, date) {
  const year = String(date.getUTCFullYear());
  for (const season of resort.seasons) {
    const ranges = season.ranges[year] || [];
    for (const { start, end } of ranges) {
      if (date >= start && date <= end) return season.name;
    }
  }
  return null;
}

module.exports = {
  loadResorts,
  seasonForDate,
  normalizeRoomType,
  parseDateToken,
  STATE_TO_REGION,
  SLEEPS_BY_BEDROOMS
};
