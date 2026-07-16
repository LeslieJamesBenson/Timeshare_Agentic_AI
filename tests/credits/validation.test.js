const { test } = require('node:test');
const assert = require('node:assert');
const { validateResort, worstSeverity } = require('../../lib/credits/schema');
const { normalizeUnitTypeId, normalizeResortId } = require('../../lib/credits/ids');
const { loadFixture } = require('./helpers');

test('malformed resort surfaces the expected error codes and is blocked', () => {
  const bad = loadFixture('malformed-resort');
  const { issues } = validateResort(bad);
  const codes = new Set(issues.map((i) => i.code));
  assert.ok(codes.has('NEGATIVE_RATE'), 'negative rate');
  assert.ok(codes.has('DECIMAL_RATE'), 'decimal rate');
  assert.ok(codes.has('END_BEFORE_START'), 'end before start');
  assert.ok(codes.has('RATE_UNKNOWN_SEASON'), 'rate references unknown season');
  assert.ok(codes.has('MISSING_RATE'), 'missing rate for a season/unit pair');
  assert.strictEqual(worstSeverity(issues), 'error');
});

test('clean resort validates with no errors', () => {
  const good = loadFixture('basic-resort');
  const { issues } = validateResort(good);
  assert.strictEqual(issues.filter((i) => i.severity === 'error').length, 0);
});

test('coverage gap is a warning, not an error', () => {
  const r = loadFixture('basic-resort');
  r.seasons[0].dateRanges = [{ start: '2026-01-01', end: '2026-06-30' }, { start: '2026-07-02', end: '2027-12-31' }];
  const { issues } = validateResort(r);
  assert.ok(issues.some((i) => i.code === 'COVERAGE_GAP' && i.severity === 'warning'));
  assert.strictEqual(issues.filter((i) => i.severity === 'error').length, 0);
});

test('duplicate unit id is an error', () => {
  const r = loadFixture('basic-resort');
  r.unitTypes.push({ id: 'one-bedroom', name: '1 BR dup', bedrooms: 1 });
  const { issues } = validateResort(r);
  assert.ok(issues.some((i) => i.code === 'DUPLICATE_UNIT_ID'));
});

// 27. multiple valid unit aliases map to one id; different labels stay distinct
test('unit id normalization: aliases collapse, distinct labels stay separate', () => {
  assert.strictEqual(normalizeUnitTypeId('1 BR'), 'one-bedroom');
  assert.strictEqual(normalizeUnitTypeId('1BR'), 'one-bedroom');
  assert.strictEqual(normalizeUnitTypeId('One Bedroom'), 'one-bedroom');
  assert.notStrictEqual(normalizeUnitTypeId('1 BR Deluxe'), normalizeUnitTypeId('1 BR'));
  assert.strictEqual(normalizeUnitTypeId('2 BR Ocean View'), 'two-bedroom-ocean-view');
});

test('the two La Paloma resorts get distinct ids', () => {
  assert.notStrictEqual(normalizeResortId('California', 'La Paloma'), normalizeResortId('Mexico', 'La Paloma'));
});
