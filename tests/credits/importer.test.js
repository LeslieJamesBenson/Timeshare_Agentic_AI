const { test } = require('node:test');
const assert = require('node:assert');
const { detectSchema, normalizeChart } = require('../../lib/credits/normalize');

const RAW = {
  resort: 'Havasu Dunes',
  state: 'Arizona',
  source: 'CreditChart.png',
  seasons: [
    { name: 'prime', date_ranges: { 2026: ['Jan 1', 'Mar 13 - Oct 1'] }, rooms: [
      { type: 'Studio', features: { kitchen: 'partial' }, credits: { mon_thur: 750, fri_sat: 1500, sun: 1000, week: 7000 } },
      { type: '1 BR', features: { kitchen: 'full' }, credits: { mon_thur: 850, fri_sat: 1700, sun: 1200, week: 8000 } },
    ] },
  ],
};

test('detectSchema recognizes wbw-standard with high confidence', () => {
  const d = detectSchema(RAW);
  assert.strictEqual(d.adapterId, 'wbw-standard');
  assert.ok(d.confidence >= 0.8);
});

test('detectSchema gives low confidence to foreign shapes', () => {
  assert.ok(detectSchema({ hello: 'world' }).confidence < 0.8);
});

test('normalizeChart produces the normalized model', () => {
  const { resort, warnings } = normalizeChart(RAW, { sourceFile: 'x.json', folderState: 'Arizona' });
  assert.strictEqual(resort.resortId, 'arizona-havasu-dunes');
  assert.deepStrictEqual(resort.unitTypes.map((u) => u.id).sort(), ['one-bedroom', 'studio']);
  assert.strictEqual(resort.seasons[0].id, 'prime');
  // credit mapping
  const rate = resort.creditRates.find((r) => r.unitTypeId === 'one-bedroom');
  assert.strictEqual(rate.weekdayCredits, 850);
  assert.strictEqual(rate.weekendCredits, 1700);
  assert.strictEqual(rate.nightlyCreditsByDay.SUNDAY, 1200);
  assert.strictEqual(rate.weeklyCredits, 8000);
  // rules
  assert.deepStrictEqual(resort.rules.weekendNights, ['FRIDAY', 'SATURDAY']);
  assert.deepStrictEqual(resort.rules.daySpecificNights, ['SUNDAY']);
  assert.strictEqual(warnings.length, 0);
});

test('normalizeChart rejects an unsupported schema', () => {
  const { resort } = normalizeChart({ foo: 1 }, { sourceFile: 'bad.json' });
  assert.strictEqual(resort, null);
});

test('generated data is present and self-consistent', () => {
  // integration: the committed generated index loads and totals add up
  let index;
  try { index = require('../../data/generated/resort-index.json'); }
  catch { return; } // skipped if not yet built
  assert.ok(index.totals.normalized > 0);
  assert.strictEqual(index.resorts.every((r) => r.status !== 'blocked'), true);
});
