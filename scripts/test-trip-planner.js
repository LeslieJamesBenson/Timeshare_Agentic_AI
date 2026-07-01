#!/usr/bin/env node
// Deterministic test suite for the trip-planner engine and data layer.
// No API key or network needed. Run: npm test
// Exits 1 on any failure.

const { loadResorts, seasonForDate, normalizeRoomType, parseDateToken } = require('../lib/resortData');
const { planTrip, costForStay, chooseRoom, dowBucket } = require('../lib/tripPlanner');

let pass = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { pass++; }
  else { fail++; console.log(`  FAIL: ${name}${detail ? ' — ' + detail : ''}`); }
}
function approx(name, got, want) {
  check(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
}

const dataset = loadResorts();
const { resorts, byId } = dataset;

console.log('Trip-planner test suite\n');

// ---- Data layer ----------------------------------------------------------
check('dataset loads', resorts.length === 100, `loaded ${resorts.length}`);
check('no loader errors', dataset.errors.length === 0, dataset.errors.join('; '));

// date token parsing
const rng = parseDateToken('Apr 17 - Sep 17', 2026);
approx('parse range start month', rng.start.getUTCMonth(), 3);
approx('parse range end day', rng.end.getUTCDate(), 17);
const single = parseDateToken('Jan 1', 2026);
approx('single-day token start=end', single.start.getTime(), single.end.getTime());
const wrap = parseDateToken('Nov 13 - Jan 5', 2026);
check('year-wrapping range rolls to next year', wrap.end.getUTCFullYear() === 2027, `got ${wrap.end.getUTCFullYear()}`);

// room normalization
approx('Studio -> 0 BR', normalizeRoomType('Studio').bedrooms, 0);
approx('"2 BR Deluxe" -> 2 BR', normalizeRoomType('2 BR Deluxe').bedrooms, 2);
approx('"1 BR Hotel or 2 BR Suite" -> takes larger (2)', normalizeRoomType('1 BR Hotel or 2 BR Suite').bedrooms, 2);
approx('"3 BR Penthouse" tier', normalizeRoomType('3 BR Penthouse').tier, 'penthouse');
check('every room type resolves a bedroom count', (() => {
  const types = new Set();
  resorts.forEach(r => r.seasons.forEach(s => s.rooms.forEach(rm => types.add(rm.raw))));
  return [...types].every(t => normalizeRoomType(t).bedrooms !== null);
})());

// day-of-week buckets (known dates)
approx('2026-07-15 is Wed -> mon_thur', dowBucket(new Date('2026-07-15T00:00:00Z')), 'mon_thur');
approx('2026-07-17 is Fri -> fri_sat', dowBucket(new Date('2026-07-17T00:00:00Z')), 'fri_sat');
approx('2026-07-19 is Sun -> sun', dowBucket(new Date('2026-07-19T00:00:00Z')), 'sun');

// ---- Cost engine (Birch Bay, known values) -------------------------------
const birch = resorts.find(r => r.name === 'Birch Bay');
check('Birch Bay present', !!birch);
approx('Birch Bay July 15 2026 -> prime', seasonForDate(birch, new Date('2026-07-15T00:00:00Z')), 'prime');
approx('Birch Bay Oct 25 2026 -> slow', seasonForDate(birch, new Date('2026-10-25T00:00:00Z')), 'slow');

// One weeknight (Wed) in prime 1BR = 1000 (from the chart we inspected)
const oneBR = birch.seasons.find(s => s.name === 'prime').rooms.find(r => r.bedrooms === 1);
const cost1 = costForStay(birch, oneBR, new Date('2026-07-15T00:00:00Z'), 1);
approx('1 weeknight prime 1BR = 1000 credits', cost1.credits, 1000);

// A 7-night prime stay should use the week rate when cheaper than nightly sum.
const cost7 = costForStay(birch, oneBR, new Date('2026-07-13T00:00:00Z'), 7);
check('7-night stay ok', cost7.ok);
// nightly sum for that week
const nightlySum = cost7.nightly.reduce((a, n) => a + n.credits, 0);
check('week rate applied when cheaper', cost7.usedWeekRate === (oneBR.credits.week < nightlySum),
  `usedWeekRate=${cost7.usedWeekRate}, week=${oneBR.credits.week}, nightlySum=${nightlySum}`);
check('7-night credits <= nightly sum', cost7.credits <= nightlySum, `${cost7.credits} vs ${nightlySum}`);

// ---- planTrip end-to-end --------------------------------------------------
// Specific location
const p1 = planTrip({ locationText: 'Birch Bay', checkIn: '2026-07-15', nights: 4, partySize: 4 }, dataset);
check('planTrip specific resort ok', p1.ok, p1.error);
check('planTrip returns Birch Bay', p1.options[0] && p1.options[0].resort === 'Birch Bay');
check('option has credits + cash', p1.options[0] && p1.options[0].credits > 0 && p1.options[0].cashEquivalentUSD > 0);
check('cash = credits * 0.041 (rounded)', p1.options[0] &&
  Math.abs(p1.options[0].cashEquivalentUSD - Math.round(p1.options[0].credits * 0.041 * 100) / 100) < 0.001);

// Region search returns multiple, sorted cheapest-first
const p2 = planTrip({ region: 'pacific-northwest', checkIn: '2026-09-20', nights: 3, partySize: 2 }, dataset);
check('planTrip region search ok', p2.ok, p2.error);
check('region search returns multiple resorts', p2.options.length > 1, `got ${p2.options.length}`);
check('options sorted cheapest-first', p2.options.every((o, i, a) => i === 0 || a[i - 1].credits <= o.credits));

// Flexible dates find a start <= the fixed-date cost
const fixed = planTrip({ locationText: 'Birch Bay', checkIn: '2026-07-17', nights: 3, partySize: 2, flexDays: 0 }, dataset);
const flex = planTrip({ locationText: 'Birch Bay', checkIn: '2026-07-17', nights: 3, partySize: 2, flexDays: 4 }, dataset);
check('flex search never costs more than fixed', flex.options[0].credits <= fixed.options[0].credits,
  `flex ${flex.options[0].credits} vs fixed ${fixed.options[0].credits}`);

// Party size that no unit fits is flagged, not crashed
const big = planTrip({ locationText: 'Birch Bay', checkIn: '2026-07-15', nights: 2, partySize: 99 }, dataset);
check('oversized party still returns an option', big.ok);
check('oversized party flagged roomFitsParty=false', big.options[0].roomFitsParty === false);

// "Suggest anywhere" — no location given
const p3 = planTrip({ checkIn: '2026-06-10', nights: 5, partySize: 2, maxResults: 10 }, dataset);
check('suggest-anywhere ok', p3.ok);
check('suggest-anywhere respects maxResults', p3.options.length <= 10);

// Bad input handling
check('rejects nights=0', planTrip({ locationText: 'Birch Bay', checkIn: '2026-07-15', nights: 0 }, dataset).ok === false);
check('rejects bad date', planTrip({ locationText: 'Birch Bay', checkIn: 'not-a-date', nights: 3 }, dataset).ok === false);
check('handles no location match', planTrip({ locationText: 'Narnia', checkIn: '2026-07-15', nights: 3 }, dataset).ok === false);

// notes always mention fees are excluded
check('result notes disclose fees excluded', p1.notes.some(n => /not included/i.test(n)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail > 0 ? 1 : 0);
