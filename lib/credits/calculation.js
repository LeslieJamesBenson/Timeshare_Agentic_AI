// calculation.js — the pure credit calculation engine.
//
// No React, no I/O, no globals. Given a normalized resort and a StayRequest it
// returns a fully transparent StayCalculation (night-by-night, season per night,
// weekday/weekend/day-specific classification, weekly adjustments) or throws a
// typed CalculationError. It NEVER guesses missing data.
//
// Per-night resolution order (documented in docs/calculation-rules.md):
//   1. date override (highest valid priority; equal-priority conflict throws)
//   2. season (exactly one; none -> SeasonNotFound; many -> AmbiguousSeason)
//   3. rate for (season, unit)  (missing -> RateNotFound)
//   4. day classification: day-specific (Sunday) > weekend (Fri/Sat) > weekday
//   5. base credits x roomCount
// Weekly pricing is applied only AFTER the nightly schedule is known.

const { enumerateNights, dayOfWeek, diffDays, shortDate } = require('./dates');
const E = require('./errors');

// --- season resolution ------------------------------------------------------

function resolveSeason(resort, date) {
  const hits = [];
  for (const s of resort.seasons) {
    for (const r of s.dateRanges) {
      if (date >= r.start && date <= r.end) { hits.push(s); break; }
    }
  }
  const uniq = [...new Map(hits.map((s) => [s.id, s])).values()];
  if (uniq.length === 0) throw new E.SeasonNotFoundError(date);
  if (uniq.length > 1) throw new E.AmbiguousSeasonError(date, uniq.map((s) => s.name));
  return uniq[0];
}

// --- date-override resolution ----------------------------------------------

function resolveDateOverride(resort, date, unitTypeId) {
  const applicable = (resort.dateOverrides || []).filter((o) =>
    date >= o.start && date <= o.end && (!o.unitTypeId || o.unitTypeId === unitTypeId));
  if (!applicable.length) return null;
  const maxPriority = Math.max(...applicable.map((o) => o.priority ?? 0));
  const top = applicable.filter((o) => (o.priority ?? 0) === maxPriority);
  if (top.length > 1) throw new E.ConflictingOverrideError(date, top.map((o) => o.id));
  return top[0];
}

// --- rate resolution --------------------------------------------------------

function resolveRate(resort, seasonId, unitTypeId, date) {
  const rate = resort.creditRates.find((r) => r.seasonId === seasonId && r.unitTypeId === unitTypeId);
  if (!rate) throw new E.RateNotFoundError(date, seasonId, unitTypeId);
  return rate;
}

// Classify a night and return { dayType, baseCredits, pricingSource, sourceDescription }.
function classifyNight(resort, rate, date, dow) {
  const rules = resort.rules || {};
  const daySpecific = rules.daySpecificNights || [];
  const weekend = rules.weekendNights || [];

  if (daySpecific.includes(dow) && rate.nightlyCreditsByDay && rate.nightlyCreditsByDay[dow] != null) {
    return { dayType: 'custom', baseCredits: rate.nightlyCreditsByDay[dow], pricingSource: 'day-specific-rate', sourceDescription: `${dow} rate` };
  }
  if (weekend.includes(dow)) {
    if (rate.weekendCredits == null) throw new E.RateNotFoundError(date, rate.seasonId, rate.unitTypeId);
    return { dayType: 'weekend', baseCredits: rate.weekendCredits, pricingSource: 'weekend-rate', sourceDescription: 'weekend rate' };
  }
  if (rate.weekdayCredits == null) throw new E.RateNotFoundError(date, rate.seasonId, rate.unitTypeId);
  return { dayType: 'weekday', baseCredits: rate.weekdayCredits, pricingSource: 'weekday-rate', sourceDescription: 'weekday rate' };
}

// --- weekly pricing ---------------------------------------------------------

// Greedy single-season 7-night blocks. Applies the week rate when it beats the
// block's nightly total (strategy "lowest-valid-rate", constrained to one
// season). Never applied across seasons or over override nights.
function applyWeeklyPricing(resort, nights, unitTypeId, roomCount) {
  const rules = resort.rules || {};
  const strategy = rules.weeklyPricingStrategy || 'nightly-only';
  const adjustments = [];
  if (strategy === 'nightly-only') return { adjustments, weeklyNightFlags: new Set() };
  if (!['lowest-valid-rate', 'weekly-when-exactly-seven', 'weekly-plus-extra-nights', 'resort-specific'].includes(strategy)) {
    throw new E.UnsupportedWeeklyPricingError(strategy);
  }

  const weeklyNightFlags = new Set();
  let i = 0;
  while (i < nights.length) {
    if (nights.length - i >= 7) {
      const block = nights.slice(i, i + 7);
      const sameSeason = block.every((n) => n.seasonId === block[0].seasonId);
      const noOverride = block.every((n) => n.pricingSource !== 'date-override');
      if ((!rules.weeklyRequiresSingleSeason || sameSeason) && sameSeason && noOverride) {
        const rate = resolveRate(resort, block[0].seasonId, unitTypeId, block[0].date);
        const weekRate = rate.weeklyCredits;
        const nightlySubtotal = block.reduce((a, n) => a + n.totalCredits, 0);
        const weeklyTotal = weekRate != null ? weekRate * roomCount : null;
        const beats = strategy === 'weekly-when-exactly-seven'
          ? weeklyTotal != null
          : weeklyTotal != null && weeklyTotal < nightlySubtotal;
        if (beats) {
          for (let k = i; k < i + 7; k++) weeklyNightFlags.add(k);
          adjustments.push({
            startDate: block[0].date,
            endDate: block[6].date,
            unitTypeId,
            seasonId: block[0].seasonId,
            nightlySubtotal,
            weeklyRate: weeklyTotal,
            appliedCredits: weeklyTotal,
            savings: nightlySubtotal - weeklyTotal,
            strategy,
          });
          i += 7;
          continue;
        }
      }
    }
    i += 1;
  }
  return { adjustments, weeklyNightFlags };
}

// --- main entry -------------------------------------------------------------

// calculateStayCredits(resort, request) -> StayCalculation. Throws typed errors.
function calculateStayCredits(resort, request) {
  if (!resort) throw new E.ResortNotFoundError(request && request.resortId);
  const { unitTypeId, checkIn, checkOut } = request;
  const roomCount = request.roomCount == null ? 1 : Number(request.roomCount);

  if (!Number.isInteger(roomCount) || roomCount < 1) {
    throw new E.InvalidStayDatesError('Room count must be a whole number of 1 or more.');
  }

  const unit = resort.unitTypes.find((u) => u.id === unitTypeId);
  if (!unit) throw new E.UnitTypeNotFoundError(unitTypeId, resort.resortId);

  // date validation
  const { isValidISODate } = require('./dates');
  if (!isValidISODate(checkIn) || !isValidISODate(checkOut)) {
    throw new E.InvalidStayDatesError('Check-in and check-out must be valid calendar dates (YYYY-MM-DD).');
  }
  const span = diffDays(checkIn, checkOut);
  if (span <= 0) throw new E.InvalidStayDatesError('Check-out must be after check-in (at least one night).');

  const minStay = (resort.rules && resort.rules.minimumStay) || 1;
  const warnings = [];
  if (span < minStay) warnings.push(`Stay is ${span} night(s); resort minimum is ${minStay}.`);

  const effStart = resort.source && resort.source.effectiveStart;
  const effEnd = resort.source && resort.source.effectiveEnd;
  if (effStart && checkIn < effStart) warnings.push(`Check-in ${checkIn} is before the chart's effective period (${effStart}).`);
  if (effEnd && checkOut > require('./dates').addDays(effEnd, 1)) warnings.push(`Stay extends past the chart's effective period (ends ${effEnd}).`);

  const dateList = enumerateNights(checkIn, checkOut);
  const nights = [];
  for (const date of dateList) {
    const dow = dayOfWeek(date);

    // 1. override
    const override = resolveDateOverride(resort, date, unitTypeId);
    if (override) {
      let base;
      let desc = override.name || 'date override';
      if (override.nightlyCreditsByDay && override.nightlyCreditsByDay[dow] != null) base = override.nightlyCreditsByDay[dow];
      else if (override.nightlyCredits != null) base = override.nightlyCredits;
      else throw new E.RateNotFoundError(date, 'override', unitTypeId);
      nights.push({
        date, dayOfWeek: dow, seasonId: `override:${override.id}`, seasonName: desc,
        dayType: 'custom', baseCredits: base, roomCount, totalCredits: base * roomCount,
        pricingSource: 'date-override', sourceDescription: desc,
      });
      continue;
    }

    // 2-4. season -> rate -> classify
    const season = resolveSeason(resort, date);
    const rate = resolveRate(resort, season.id, unitTypeId, date);
    const cls = classifyNight(resort, rate, date, dow);
    nights.push({
      date, dayOfWeek: dow, seasonId: season.id, seasonName: season.name,
      dayType: cls.dayType, baseCredits: cls.baseCredits, roomCount,
      totalCredits: cls.baseCredits * roomCount,
      pricingSource: cls.pricingSource, sourceDescription: cls.sourceDescription,
    });
  }

  const nightlySubtotal = nights.reduce((a, n) => a + n.totalCredits, 0);

  // 5. weekly pricing
  const { adjustments, weeklyNightFlags } = applyWeeklyPricing(resort, nights, unitTypeId, roomCount);
  nights.forEach((n, idx) => { n.inWeeklyBlock = weeklyNightFlags.has(idx); });

  let totalCredits = 0;
  // sum nights not covered by a weekly block, then add weekly applied credits
  nights.forEach((n, idx) => { if (!weeklyNightFlags.has(idx)) totalCredits += n.totalCredits; });
  for (const adj of adjustments) totalCredits += adj.appliedCredits;

  return {
    resortId: resort.resortId,
    resortName: resort.resortName,
    unitTypeId,
    unitTypeName: unit.name,
    checkIn,
    checkOut,
    nightCount: span,
    roomCount,
    nights,
    nightlySubtotal,
    weeklyAdjustments: adjustments,
    weeklySavings: adjustments.reduce((a, w) => a + w.savings, 0),
    totalCredits,
    warnings,
  };
}

module.exports = {
  calculateStayCredits,
  resolveSeason,
  resolveRate,
  resolveDateOverride,
  classifyNight,
  applyWeeklyPricing,
};
