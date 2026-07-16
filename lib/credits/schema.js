// schema.js — runtime validation of the normalized model.
//
// Plain-JS validation (no external dep) that mirrors the Zod-style contract in
// lib/credits/types.d.ts. Produces severity-tagged issues. An `error` blocks a
// resort from the public calculator; `warning`/`info` keep it active but visible
// on /data-status and in validation-report.json.

const { isValidISODate, diffDays, dayOfWeek } = require('./dates');

const SEVERITY = { ERROR: 'error', WARNING: 'warning', INFO: 'info' };
const VALID_DOW = ['MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY'];

function issue(severity, code, message) {
  return { severity, code, message };
}

// Expand a resort's season date ranges into a per-year day map for coverage
// analysis. Returns { [year]: Map(iso -> [seasonId,...]) } limited to the
// resort's effective years.
function seasonCoverage(resort) {
  const byYear = {};
  const years = new Set();
  for (const s of resort.seasons) {
    for (const r of s.dateRanges) {
      years.add(r.start.slice(0, 4));
      years.add(r.end.slice(0, 4));
    }
  }
  for (const y of years) byYear[y] = new Map();
  for (const s of resort.seasons) {
    for (const r of s.dateRanges) {
      if (!isValidISODate(r.start) || !isValidISODate(r.end)) continue;
      const n = diffDays(r.start, r.end); // inclusive end
      for (let i = 0; i <= n; i++) {
        const d = require('./dates').addDays(r.start, i);
        const y = d.slice(0, 4);
        if (!byYear[y]) byYear[y] = new Map();
        const list = byYear[y].get(d) || [];
        list.push(s.id);
        byYear[y].set(d, list);
      }
    }
  }
  return byYear;
}

// Validate one normalized resort. Returns { issues, coverage }.
function validateResort(resort, { knownResortIds } = {}) {
  const issues = [];
  const add = (sev, code, msg) => issues.push(issue(sev, code, msg));

  // --- structural / identity ---
  if (!resort.resortId) add(SEVERITY.ERROR, 'MISSING_RESORT_ID', 'resort has no resortId');
  if (!resort.resortName) add(SEVERITY.ERROR, 'MISSING_RESORT_NAME', 'resort has no name');
  if (!resort.timezone) add(SEVERITY.ERROR, 'MISSING_TIMEZONE', 'resort has no timezone');
  if (knownResortIds && knownResortIds[resort.resortId] > 1) {
    add(SEVERITY.ERROR, 'DUPLICATE_RESORT_ID', `resortId "${resort.resortId}" is not unique`);
  }
  if (!resort.source || !resort.source.effectiveYear) {
    add(SEVERITY.WARNING, 'MISSING_EFFECTIVE_YEAR', 'no effective year in source metadata');
  }

  // --- units ---
  const unitIds = new Set();
  for (const u of resort.unitTypes || []) {
    if (unitIds.has(u.id)) add(SEVERITY.ERROR, 'DUPLICATE_UNIT_ID', `duplicate unit id "${u.id}"`);
    unitIds.add(u.id);
    if (u.bedrooms == null) add(SEVERITY.WARNING, 'UNKNOWN_UNIT_CAPACITY', `unit "${u.name}" — bedroom count not inferable`);
  }
  if (!unitIds.size) add(SEVERITY.ERROR, 'NO_UNITS', 'resort has no unit types');

  // --- rules ---
  const wknd = (resort.rules && resort.rules.weekendNights) || [];
  if (!wknd.length) add(SEVERITY.ERROR, 'UNKNOWN_WEEKEND_CONFIG', 'no weekend-night configuration');
  for (const d of wknd) if (!VALID_DOW.includes(d)) add(SEVERITY.ERROR, 'BAD_WEEKEND_DAY', `invalid weekend day "${d}"`);

  // --- seasons + date validity ---
  const seasonIds = new Set();
  for (const s of resort.seasons || []) {
    if (seasonIds.has(s.id)) add(SEVERITY.WARNING, 'DUPLICATE_SEASON_ID', `duplicate season "${s.id}"`);
    seasonIds.add(s.id);
    if (!s.dateRanges || !s.dateRanges.length) add(SEVERITY.WARNING, 'SEASON_NO_RANGES', `season "${s.id}" has no date ranges`);
    for (const r of s.dateRanges || []) {
      if (!isValidISODate(r.start) || !isValidISODate(r.end)) {
        add(SEVERITY.ERROR, 'INVALID_DATE', `season "${s.id}" has an invalid date range`);
      } else if (diffDays(r.start, r.end) < 0) {
        add(SEVERITY.ERROR, 'END_BEFORE_START', `season "${s.id}" range ends before it starts (${r.start}..${r.end})`);
      }
    }
  }
  if (!seasonIds.size) add(SEVERITY.ERROR, 'NO_SEASONS', 'resort has no seasons');

  // --- rates ---
  const rateKeys = new Set();
  let rateCount = 0;
  for (const rate of resort.creditRates || []) {
    rateCount++;
    const key = `${rate.seasonId}|${rate.unitTypeId}`;
    if (rateKeys.has(key)) add(SEVERITY.WARNING, 'DUPLICATE_RATE', `duplicate rate for ${key}`);
    rateKeys.add(key);
    if (!seasonIds.has(rate.seasonId)) add(SEVERITY.ERROR, 'RATE_UNKNOWN_SEASON', `rate references unknown season "${rate.seasonId}"`);
    if (!unitIds.has(rate.unitTypeId)) add(SEVERITY.ERROR, 'RATE_UNKNOWN_UNIT', `rate references unknown unit "${rate.unitTypeId}"`);

    for (const [label, v] of [['weekday', rate.weekdayCredits], ['weekend', rate.weekendCredits], ['weekly', rate.weeklyCredits]]) {
      if (v == null) add(SEVERITY.WARNING, 'MISSING_RATE_VALUE', `${key}: missing ${label} rate`);
      else if (typeof v !== 'number' || Number.isNaN(v)) add(SEVERITY.ERROR, 'NON_NUMERIC_RATE', `${key}: ${label} rate is not a number`);
      else if (v < 0) add(SEVERITY.ERROR, 'NEGATIVE_RATE', `${key}: negative ${label} rate`);
      else if (!Number.isInteger(v)) add(SEVERITY.ERROR, 'DECIMAL_RATE', `${key}: ${label} rate is not a whole credit value`);
    }
    const sun = rate.nightlyCreditsByDay && rate.nightlyCreditsByDay.SUNDAY;
    if (sun == null) add(SEVERITY.WARNING, 'MISSING_DAY_RATE', `${key}: missing Sunday rate`);
    else if (sun < 0 || !Number.isInteger(sun)) add(SEVERITY.ERROR, 'BAD_DAY_RATE', `${key}: invalid Sunday rate`);
  }
  // every (season, unit) pair should have a rate
  for (const s of seasonIds) for (const u of unitIds) {
    if (!rateKeys.has(`${s}|${u}`)) add(SEVERITY.ERROR, 'MISSING_RATE', `no rate for season "${s}" unit "${u}"`);
  }
  if (!rateCount) add(SEVERITY.ERROR, 'NO_RATES', 'resort has no credit rates');

  // --- overrides ---
  const ovIds = new Set();
  for (const o of resort.dateOverrides || []) {
    if (ovIds.has(o.id)) add(SEVERITY.ERROR, 'DUPLICATE_OVERRIDE', `duplicate override id "${o.id}"`);
    ovIds.add(o.id);
    if (!isValidISODate(o.start) || !isValidISODate(o.end)) add(SEVERITY.ERROR, 'OVERRIDE_INVALID_DATE', `override "${o.id}" has invalid dates`);
  }

  // --- coverage (gaps + overlaps) ---
  const coverage = seasonCoverage(resort);
  for (const [year, map] of Object.entries(coverage)) {
    let uncovered = 0, overlap = 0;
    const uSample = [], oSample = [];
    for (const [d, list] of map) {
      const uniq = [...new Set(list)];
      if (uniq.length > 1) { overlap++; if (oSample.length < 5) oSample.push(d); }
    }
    // uncovered = days in the year with no season at all
    const start = `${year}-01-01`;
    const totalDays = diffDays(start, `${year}-12-31`) + 1;
    for (let i = 0; i < totalDays; i++) {
      const d = require('./dates').addDays(start, i);
      if (!map.has(d)) { uncovered++; if (uSample.length < 5) uSample.push(d); }
    }
    if (uncovered) add(SEVERITY.WARNING, 'COVERAGE_GAP', `${year}: ${uncovered} uncovered day(s) — e.g. ${uSample.join(', ')}`);
    if (overlap) add(SEVERITY.WARNING, 'SEASON_OVERLAP', `${year}: ${overlap} day(s) covered by >1 season — e.g. ${oSample.join(', ')}`);
  }

  return { issues, coverage };
}

function worstSeverity(issues) {
  if (issues.some((i) => i.severity === SEVERITY.ERROR)) return SEVERITY.ERROR;
  if (issues.some((i) => i.severity === SEVERITY.WARNING)) return SEVERITY.WARNING;
  return SEVERITY.INFO;
}

module.exports = { validateResort, seasonCoverage, worstSeverity, SEVERITY };
