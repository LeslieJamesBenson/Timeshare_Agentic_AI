// helpers.js — fixture loaders and small resort factories for isolated tests.
// Tests use fixtures, never the production chart set.
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, '..', 'fixtures');

function loadFixture(name) {
  return JSON.parse(fs.readFileSync(path.join(FIX, `${name}.json`), 'utf8'));
}

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// Build a minimal single-season resort with overridable rules/rates.
function makeResort(overrides = {}) {
  const base = {
    resortId: 'test-x', resortName: 'X', state: 'T', region: 'test', country: 'USA', timezone: 'UTC',
    unitTypes: [{ id: 'one-bedroom', name: '1 BR', bedrooms: 1, maxOccupancy: 4 }],
    seasons: [{ id: 'red', name: 'red', dateRanges: [{ start: '2026-01-01', end: '2028-12-31' }] }],
    creditRates: [{ seasonId: 'red', unitTypeId: 'one-bedroom', weekdayCredits: 1000, weekendCredits: 2000, nightlyCreditsByDay: { SUNDAY: 1500 }, weeklyCredits: 9000 }],
    dateOverrides: [],
    rules: { weekendNights: ['FRIDAY', 'SATURDAY'], daySpecificNights: ['SUNDAY'], weeklyPricingStrategy: 'lowest-valid-rate', weeklyRequiresSingleSeason: true, minimumStay: 1 },
    source: { sourceFile: 'x', effectiveYear: 2026, effectiveStart: '2026-01-01', effectiveEnd: '2028-12-31', importedAt: '2026-01-01T00:00:00.000Z' },
  };
  return { ...base, ...overrides, rules: { ...base.rules, ...(overrides.rules || {}) }, source: { ...base.source, ...(overrides.source || {}) } };
}

module.exports = { loadFixture, clone, makeResort };
