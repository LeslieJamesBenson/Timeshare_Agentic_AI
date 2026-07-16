const { test } = require('node:test');
const assert = require('node:assert');
const d = require('../../lib/credits/dates');

test('enumerateNights: check-out is exclusive (Sep 14–19 => 5 nights)', () => {
  const nights = d.enumerateNights('2026-09-14', '2026-09-19');
  assert.deepStrictEqual(nights, ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']);
});

test('dayOfWeek is UTC-anchored and TZ-independent', () => {
  assert.strictEqual(d.dayOfWeek('2026-09-14'), 'MONDAY');
  assert.strictEqual(d.dayOfWeek('2026-09-20'), 'SUNDAY');
});

test('isValidISODate rejects impossible calendar dates', () => {
  assert.strictEqual(d.isValidISODate('2026-02-30'), false);
  assert.strictEqual(d.isValidISODate('2026-13-01'), false);
  assert.strictEqual(d.isValidISODate('2028-02-29'), true); // leap year
  assert.strictEqual(d.isValidISODate('2026-02-29'), false); // non-leap
});

test('addDays / diffDays across a leap day', () => {
  assert.strictEqual(d.addDays('2028-02-28', 1), '2028-02-29');
  assert.strictEqual(d.addDays('2028-02-29', 1), '2028-03-01');
  assert.strictEqual(d.diffDays('2028-02-28', '2028-03-01'), 2);
});

test('parseDateToken handles single day and range', () => {
  assert.deepStrictEqual(d.parseDateToken('Jan 1', 2026), { start: '2026-01-01', end: '2026-01-01' });
  assert.deepStrictEqual(d.parseDateToken('Mar 13 - Oct 1', 2026), { start: '2026-03-13', end: '2026-10-01' });
});

test('parseDateToken wraps a backwards range into the next year', () => {
  assert.deepStrictEqual(d.parseDateToken('Nov 13 - Jan 5', 2026), { start: '2026-11-13', end: '2027-01-05' });
});
