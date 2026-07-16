// normalize.js — converts a raw WBW credit chart into the normalized model.
//
// The dataset is a single schema family ("wbw-standard"), so there is one
// adapter plus a strict detector. The detector returns a confidence score;
// anything that does not clearly match is reported as unsupported rather than
// force-parsed. Nothing here mutates source files.

const { parseDateToken, isValidISODate } = require('./dates');
const { normalizeResortId, normalizeUnitTypeId, normalizeSeasonId } = require('./ids');

const CREDIT_KEYS = ['mon_thur', 'fri_sat', 'sun', 'week'];
const SLEEPS_BY_BEDROOMS = { 0: 4, 1: 4, 2: 6, 3: 8, 4: 10 };

// State/country folder -> region + country, for search and grouping.
const STATE_META = {
  Washington: ['pacific-northwest', 'USA'], Oregon: ['pacific-northwest', 'USA'],
  Idaho: ['pacific-northwest', 'USA'], Montana: ['mountain', 'USA'],
  Colorado: ['mountain', 'USA'], Utah: ['mountain', 'USA'],
  California: ['california', 'USA'], Nevada: ['desert-southwest', 'USA'],
  Arizona: ['desert-southwest', 'USA'], 'New Mexico': ['desert-southwest', 'USA'],
  Texas: ['south-central', 'USA'], Oklahoma: ['south-central', 'USA'],
  Louisiana: ['south-central', 'USA'], Missouri: ['midwest', 'USA'],
  Illinois: ['midwest', 'USA'], Florida: ['southeast', 'USA'],
  'South Carolina': ['southeast', 'USA'], Virginia: ['mid-atlantic', 'USA'],
  Hawaii: ['hawaii', 'USA'], Fiji: ['south-pacific', 'Fiji'],
  Mexico: ['mexico', 'Mexico'], 'BC Canada': ['canada', 'Canada'],
  'Alberta Canada': ['canada', 'Canada'], 'St. Thomas VI': ['caribbean', 'USVI'],
};

// ---- Schema detection ------------------------------------------------------

// Returns { adapterId, confidence (0..1), evidence[] }.
function detectSchema(raw) {
  const evidence = [];
  let score = 0;
  const checks = 5;
  if (raw && typeof raw.resort === 'string') { score++; evidence.push('has string "resort"'); }
  if (raw && typeof raw.state === 'string') { score++; evidence.push('has string "state"'); }
  if (Array.isArray(raw && raw.seasons)) { score++; evidence.push('has "seasons" array'); }
  const s0 = raw && Array.isArray(raw.seasons) && raw.seasons[0];
  if (s0 && s0.date_ranges && typeof s0.date_ranges === 'object') { score++; evidence.push('season has "date_ranges"'); }
  const r0 = s0 && Array.isArray(s0.rooms) && s0.rooms[0];
  if (r0 && r0.credits && CREDIT_KEYS.some((k) => k in r0.credits)) { score++; evidence.push('room has WBW credit keys'); }
  return { adapterId: 'wbw-standard', confidence: score / checks, evidence };
}

// ---- Unit-type parsing -----------------------------------------------------

function parseUnit(typeStr) {
  const raw = String(typeStr).trim();
  const lower = raw.toLowerCase();

  let bedrooms = null;
  const brs = [...lower.matchAll(/(\d+)\s*br/g)].map((m) => parseInt(m[1], 10));
  if (brs.length) bedrooms = Math.max(...brs);
  else if (lower.includes('studio')) bedrooms = 0;
  else if (lower.includes('hotel')) bedrooms = 0;

  let roomType = 'standard';
  for (const t of ['presidential', 'penthouse', 'deluxe', 'suite', 'plus', 'compact', 'chalet', 'cottage', 'loft']) {
    if (lower.includes(t)) { roomType = t; break; }
  }

  let viewType;
  if (lower.includes('ocean')) viewType = 'ocean';
  else if (lower.includes('lake')) viewType = 'lake';

  const maxOccupancy = bedrooms === null ? null : (SLEEPS_BY_BEDROOMS[bedrooms] ?? bedrooms * 2 + 2);

  return { raw, bedrooms, maxOccupancy, roomType, viewType };
}

// ---- Main adapter ----------------------------------------------------------

// Normalize one raw chart. Returns { resort, warnings }. `resort` is null when
// the file is unsupported (a `blocked`-worthy problem is surfaced by validation
// downstream; here we only reject on unrecognized schema).
function normalizeChart(raw, { sourceFile, folderState, folderResort } = {}) {
  const warnings = [];
  const det = detectSchema(raw);
  if (det.confidence < 0.8) {
    return { resort: null, warnings: [`unsupported schema (confidence ${det.confidence.toFixed(2)}) in ${sourceFile}`], detection: det };
  }

  const stateName = raw.state || folderState || 'Unknown';
  const resortName = raw.resort || folderResort || 'Unknown';
  const [region, country] = STATE_META[stateName] || ['other', 'Unknown'];
  const resortId = normalizeResortId(stateName, resortName);

  // Collect unit types (dedup by id) and their per-season rates.
  const unitMap = new Map();     // unitTypeId -> UnitType
  const aliasMap = new Map();    // unitTypeId -> Set(raw labels)
  const seasons = [];
  const creditRates = [];
  const years = new Set();

  for (const s of raw.seasons || []) {
    const seasonId = normalizeSeasonId(s.name);
    const dateRanges = [];
    for (const [year, tokens] of Object.entries(s.date_ranges || {})) {
      years.add(parseInt(year, 10));
      for (const tok of tokens || []) {
        const r = parseDateToken(tok, parseInt(year, 10));
        if (!r || !isValidISODate(r.start) || !isValidISODate(r.end)) {
          warnings.push(`season "${s.name}" ${year}: unparseable date token "${tok}"`);
          continue;
        }
        dateRanges.push({ start: r.start, end: r.end });
      }
    }
    seasons.push({ id: seasonId, name: s.name, meaning: s.meaning || undefined, dateRanges });

    for (const room of s.rooms || []) {
      const info = parseUnit(room.type);
      const unitTypeId = normalizeUnitTypeId(room.type);
      if (!unitMap.has(unitTypeId)) {
        unitMap.set(unitTypeId, {
          id: unitTypeId,
          name: info.raw,
          bedrooms: info.bedrooms,
          maxOccupancy: info.maxOccupancy,
          roomType: info.roomType,
          viewType: info.viewType,
          accessibilityType: room.features && room.features.accessible ? 'accessible' : undefined,
        });
        aliasMap.set(unitTypeId, new Set());
      }
      aliasMap.get(unitTypeId).add(info.raw);

      const c = room.credits || {};
      creditRates.push({
        seasonId,
        unitTypeId,
        weekdayCredits: c.mon_thur,
        weekendCredits: c.fri_sat,
        nightlyCreditsByDay: c.sun != null ? { SUNDAY: c.sun } : undefined,
        weeklyCredits: c.week,
      });
    }
  }

  const unitTypes = [...unitMap.values()].map((u) => {
    const aliases = [...aliasMap.get(u.id)].filter((a) => a !== u.name);
    return aliases.length ? { ...u, aliases } : u;
  });

  const yearsSorted = [...years].sort((a, b) => a - b);
  const source = {
    sourceFile,
    sourcePointer: raw.source,
    effectiveYear: yearsSorted[0],
    effectiveStart: yearsSorted.length ? `${yearsSorted[0]}-01-01` : undefined,
    effectiveEnd: yearsSorted.length ? `${yearsSorted[yearsSorted.length - 1]}-12-31` : undefined,
    importedAt: new Date().toISOString(),
  };

  const rules = {
    // Fri & Sat are weekend; Sunday is priced via its own day-specific rate.
    weekendNights: ['FRIDAY', 'SATURDAY'],
    daySpecificNights: ['SUNDAY'],
    // 7-night single-season block gets the week rate when it beats nightly.
    weeklyPricingStrategy: 'lowest-valid-rate',
    weeklyRequiresSingleSeason: true,
    useCheckInSeasonForEntireStay: false,
    allowSplitSeasonCalculation: true,
    minimumStay: 1,
  };

  return {
    resort: {
      resortId,
      resortName,
      destination: stateName,
      region,
      country,
      state: stateName,
      timezone: 'UTC', // charts are calendar-day; UTC keeps day-of-week stable
      unitTypes,
      seasons,
      creditRates,
      dateOverrides: [],
      rules,
      source,
    },
    warnings,
    detection: det,
  };
}

module.exports = { detectSchema, normalizeChart, parseUnit, STATE_META, CREDIT_KEYS };
