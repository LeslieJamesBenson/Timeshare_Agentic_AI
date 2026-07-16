const { test } = require('node:test');
const assert = require('node:assert');
const { calculateStayCredits } = require('../../lib/credits/calculation');
const { loadFixture, clone } = require('./helpers');

const weekly = loadFixture('weekly-resort');
const basic = loadFixture('basic-resort');
const split = loadFixture('split-season-resort');

// nightly sum for 7 nights of weekly-resort one-bedroom: depends on DOW mix but
// always > weeklyCredits 10000, so the week rate should win.
const wreq = (o) => ({ resortId: weekly.resortId, unitTypeId: 'one-bedroom', ...o });

// 5. exactly 7 nights -> week rate applied
test('exactly 7 nights applies the week rate', () => {
  const r = calculateStayCredits(weekly, wreq({ checkIn: '2026-09-14', checkOut: '2026-09-21' }));
  assert.strictEqual(r.weeklyAdjustments.length, 1);
  assert.strictEqual(r.totalCredits, 10000);
  assert.ok(r.weeklySavings > 0);
  assert.ok(r.nights.every((n) => n.inWeeklyBlock));
});

// 6. 8-night stay -> one week + one extra night
test('8 nights = week rate + 1 nightly', () => {
  const r = calculateStayCredits(weekly, wreq({ checkIn: '2026-09-14', checkOut: '2026-09-22' }));
  assert.strictEqual(r.weeklyAdjustments.length, 1);
  const extra = r.nights[7]; // 2026-09-21 Monday weekday 2000
  assert.strictEqual(r.totalCredits, 10000 + extra.totalCredits);
});

// 7. 14-night stay -> two week rates
test('14 nights = two week rates', () => {
  const r = calculateStayCredits(weekly, wreq({ checkIn: '2026-09-14', checkOut: '2026-09-28' }));
  assert.strictEqual(r.weeklyAdjustments.length, 2);
  assert.strictEqual(r.totalCredits, 20000);
});

// 6-night stay -> no week rate
test('6 nights stays nightly', () => {
  const r = calculateStayCredits(weekly, wreq({ checkIn: '2026-09-14', checkOut: '2026-09-20' }));
  assert.strictEqual(r.weeklyAdjustments.length, 0);
});

// full week + extra weekend night
test('week + extra weekend night', () => {
  const r = calculateStayCredits(weekly, wreq({ checkIn: '2026-09-13', checkOut: '2026-09-21' }));
  // 8 nights; first 7 (Sun 09-13..Sat 09-19) one season -> week; +Sun? checkout exclusive
  assert.ok(r.weeklyAdjustments.length >= 1);
});

// 23. weekly rate unavailable -> nightly only, no crash
test('unit without a week rate never gets a weekly adjustment', () => {
  const r = calculateStayCredits(weekly, wreq({ unitTypeId: 'no-week', checkIn: '2026-09-14', checkOut: '2026-09-21' }));
  assert.strictEqual(r.weeklyAdjustments.length, 0);
  assert.ok(r.totalCredits > 0);
});

// 24. weekly pricing prohibited (nightly-only strategy)
test('nightly-only strategy never applies weekly', () => {
  const nightly = clone(weekly);
  nightly.rules.weeklyPricingStrategy = 'nightly-only';
  const r = calculateStayCredits(nightly, wreq({ checkIn: '2026-09-14', checkOut: '2026-09-21' }));
  assert.strictEqual(r.weeklyAdjustments.length, 0);
});

// week crossing two seasons -> NOT given a weekly rate (rule not in source)
test('mixed-season 7-night window stays nightly', () => {
  // split: red Sep, white Oct. A 7-night block straddling Sep 28 -> Oct 4.
  const r = calculateStayCredits(split, { resortId: split.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-28', checkOut: '2026-10-05' });
  assert.strictEqual(r.weeklyAdjustments.length, 0);
  assert.ok(r.nights.some((n) => n.seasonName === 'red') && r.nights.some((n) => n.seasonName === 'white'));
});

// week rate not applied when nightly is cheaper (lowest-valid-rate)
test('week rate skipped when nightly is cheaper', () => {
  const cheapNightly = clone(basic); // week 30000 vs 5 weekday+2 weekend nightly
  // make a 7-night all-weekday-ish stay cheaper than 30000
  const r = calculateStayCredits(cheapNightly, { resortId: basic.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-14', checkOut: '2026-09-21' });
  // nightly: Mon-Thu(4x2800)+Fri+Sat(2x7200)+Sun(3000)=11200+14400+3000=28600 < 30000 -> no week
  assert.strictEqual(r.weeklyAdjustments.length, 0);
  assert.strictEqual(r.totalCredits, 28600);
});

// multiple rooms with weekly
test('weekly rate scales with room count', () => {
  const r = calculateStayCredits(weekly, wreq({ checkIn: '2026-09-14', checkOut: '2026-09-21', roomCount: 2 }));
  assert.strictEqual(r.totalCredits, 20000);
  assert.strictEqual(r.weeklyAdjustments[0].appliedCredits, 20000);
});
