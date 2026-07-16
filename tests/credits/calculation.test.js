const { test } = require('node:test');
const assert = require('node:assert');
const { calculateStayCredits } = require('../../lib/credits/calculation');
const E = require('../../lib/credits/errors');
const { loadFixture, clone, makeResort } = require('./helpers');

const basic = loadFixture('basic-resort');
const req = (o) => ({ resortId: basic.resortId, unitTypeId: 'one-bedroom', roomCount: 1, ...o });

// 1. one weekday night
test('1 weekday night', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-09-14', checkOut: '2026-09-15' }));
  assert.strictEqual(r.totalCredits, 2800);
  assert.strictEqual(r.nights[0].dayType, 'weekday');
  assert.strictEqual(r.nights[0].pricingSource, 'weekday-rate');
});

// 2. one weekend night
test('1 weekend night (Friday)', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-09-18', checkOut: '2026-09-19' }));
  assert.strictEqual(r.totalCredits, 7200);
  assert.strictEqual(r.nights[0].dayType, 'weekend');
});

// 3. multiple weekday nights
test('4 weekday nights', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-09-14', checkOut: '2026-09-18' }));
  assert.strictEqual(r.nightCount, 4);
  assert.strictEqual(r.totalCredits, 11200);
});

// 4. mixed weekday + weekend (the brief's worked example)
test('mixed stay Sep 14–19 = 18,400', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-09-14', checkOut: '2026-09-19' }));
  assert.strictEqual(r.nightCount, 5);
  assert.strictEqual(r.totalCredits, 18400);
  assert.strictEqual(r.weeklyAdjustments.length, 0);
});

// 25. day-specific (Sunday) rate
test('Sunday uses day-specific rate', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-09-20', checkOut: '2026-09-21' }));
  assert.strictEqual(r.totalCredits, 3000);
  assert.strictEqual(r.nights[0].dayType, 'custom');
  assert.strictEqual(r.nights[0].pricingSource, 'day-specific-rate');
});

// 10. two rooms
test('two rooms doubles credits', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-09-14', checkOut: '2026-09-15', roomCount: 2 }));
  assert.strictEqual(r.totalCredits, 5600);
  assert.strictEqual(r.nights[0].roomCount, 2);
});

// 8. split-season stay prices each night by its own season
test('split-season stay prices each night independently', () => {
  const split = loadFixture('split-season-resort');
  // 2026-09-29 (Tue) red weekday 2000, 09-30 (Wed) red 2000, 10-01 (Thu) white 1000, 10-02 (Fri) white weekend 1500
  const r = calculateStayCredits(split, { resortId: split.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-29', checkOut: '2026-10-03' });
  assert.deepStrictEqual(r.nights.map((n) => n.seasonName), ['red', 'red', 'white', 'white']);
  assert.strictEqual(r.totalCredits, 2000 + 2000 + 1000 + 1500);
});

// 9. date override
test('date override wins over season rate', () => {
  const ov = loadFixture('override-resort');
  // 07-03 Fri, 07-04 Sat, 07-05 Sun all in override (5000 flat); checkout 07-06
  const r = calculateStayCredits(ov, { resortId: ov.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-07-03', checkOut: '2026-07-06' });
  assert.strictEqual(r.totalCredits, 15000);
  assert.ok(r.nights.every((n) => n.pricingSource === 'date-override'));
});

// 28. conflicting overrides
test('equal-priority conflicting overrides throw', () => {
  const r = makeResort({ dateOverrides: [
    { id: 'a', name: 'A', start: '2026-07-04', end: '2026-07-04', nightlyCredits: 5000, priority: 5 },
    { id: 'b', name: 'B', start: '2026-07-04', end: '2026-07-04', nightlyCredits: 6000, priority: 5 },
  ] });
  assert.throws(() => calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-07-04', checkOut: '2026-07-05' }), E.ConflictingOverrideError);
});

// 11. missing resort
test('missing resort throws ResortNotFoundError', () => {
  assert.throws(() => calculateStayCredits(null, req({ checkIn: '2026-09-14', checkOut: '2026-09-15' })), E.ResortNotFoundError);
});

// 12. missing unit type
test('unknown unit throws UnitTypeNotFoundError', () => {
  assert.throws(() => calculateStayCredits(basic, req({ unitTypeId: 'penthouse', checkIn: '2026-09-14', checkOut: '2026-09-15' })), E.UnitTypeNotFoundError);
});

// 13. missing rate
test('unit with no rate in season throws RateNotFoundError', () => {
  const r = makeResort();
  r.unitTypes.push({ id: 'ghost', name: 'Ghost', bedrooms: 1 }); // no rate rows
  assert.throws(() => calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'ghost', checkIn: '2026-09-14', checkOut: '2026-09-15' }), E.RateNotFoundError);
});

// 14. overlapping seasons
test('overlapping seasons on a night throw AmbiguousSeasonError', () => {
  const r = makeResort({ seasons: [
    { id: 'red', name: 'red', dateRanges: [{ start: '2026-01-01', end: '2026-12-31' }] },
    { id: 'white', name: 'white', dateRanges: [{ start: '2026-09-14', end: '2026-09-14' }] },
  ], creditRates: [
    { seasonId: 'red', unitTypeId: 'one-bedroom', weekdayCredits: 1000, weekendCredits: 2000, nightlyCreditsByDay: { SUNDAY: 1500 }, weeklyCredits: 9000 },
    { seasonId: 'white', unitTypeId: 'one-bedroom', weekdayCredits: 500, weekendCredits: 900, nightlyCreditsByDay: { SUNDAY: 700 }, weeklyCredits: 4000 },
  ] });
  assert.throws(() => calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-14', checkOut: '2026-09-15' }), E.AmbiguousSeasonError);
});

// 15. uncovered date
test('uncovered date throws SeasonNotFoundError', () => {
  const r = makeResort({ seasons: [{ id: 'red', name: 'red', dateRanges: [{ start: '2026-06-01', end: '2026-06-30' }] }] });
  assert.throws(() => calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-14', checkOut: '2026-09-15' }), E.SeasonNotFoundError);
});

// 16/18. check-out before check-in
test('check-out before check-in throws InvalidStayDatesError', () => {
  assert.throws(() => calculateStayCredits(basic, req({ checkIn: '2026-09-19', checkOut: '2026-09-14' })), E.InvalidStayDatesError);
});

// 17. check-in equals check-out
test('check-in equals check-out throws InvalidStayDatesError', () => {
  assert.throws(() => calculateStayCredits(basic, req({ checkIn: '2026-09-14', checkOut: '2026-09-14' })), E.InvalidStayDatesError);
});

// 19. leap day
test('leap day (2028-02-29) is priced', () => {
  const r = makeResort();
  const res = calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'one-bedroom', checkIn: '2028-02-29', checkOut: '2028-03-01' });
  assert.strictEqual(r.creditRates[0].weekdayCredits, 1000);
  assert.strictEqual(res.nights[0].dayOfWeek, 'TUESDAY');
  assert.strictEqual(res.totalCredits, 1000);
});

// 20. year boundary
test('year boundary Dec 31 → Jan 1', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-12-31', checkOut: '2027-01-02' }));
  // Dec 31 Thu weekday 2800, Jan 1 Fri weekend 7200
  assert.deepStrictEqual(r.nights.map((n) => n.dayOfWeek), ['THURSDAY', 'FRIDAY']);
  assert.strictEqual(r.totalCredits, 10000);
});

// 21. DST transition day count is unaffected (UTC date-only engine)
test('DST transition weekend keeps correct night count', () => {
  const r = calculateStayCredits(basic, req({ checkIn: '2026-03-07', checkOut: '2026-03-09' }));
  assert.strictEqual(r.nightCount, 2);
});

// 26. weekend configuration differing by resort
test('resort with Sat/Sun weekend prices Sunday as weekend', () => {
  const r = makeResort({ rules: { weekendNights: ['SATURDAY', 'SUNDAY'], daySpecificNights: [] } });
  // 2026-09-20 is Sunday -> weekend rate (2000), not the day-specific 1500
  const res = calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-20', checkOut: '2026-09-21' });
  assert.strictEqual(res.nights[0].dayType, 'weekend');
  assert.strictEqual(res.totalCredits, 2000);
});

// 29. chart outside effective period -> warning
test('stay past effective period emits a warning', () => {
  const r = makeResort({ source: { effectiveStart: '2026-01-01', effectiveEnd: '2026-06-30' } });
  const res = calculateStayCredits(r, { resortId: r.resortId, unitTypeId: 'one-bedroom', checkIn: '2026-09-14', checkOut: '2026-09-15' });
  assert.ok(res.warnings.some((w) => /effective period/.test(w)));
});

// invalid roomCount
test('roomCount < 1 throws', () => {
  assert.throws(() => calculateStayCredits(basic, req({ checkIn: '2026-09-14', checkOut: '2026-09-15', roomCount: 0 })), E.InvalidStayDatesError);
});
