// errors.js — typed calculation errors. Each carries a machine `code` and a
// user-safe `message`. The UI shows `message`; it never shows a stack trace.

class CalculationError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = this.constructor.name;
    this.code = code;
    this.details = details;
  }
}

class ResortNotFoundError extends CalculationError {
  constructor(resortId) {
    super('RESORT_NOT_FOUND', `Resort "${resortId}" was not found or is not active.`, { resortId });
  }
}
class UnitTypeNotFoundError extends CalculationError {
  constructor(unitTypeId, resortId) {
    super('UNIT_NOT_FOUND', `Unit type "${unitTypeId}" is not available at this resort.`, { unitTypeId, resortId });
  }
}
class SeasonNotFoundError extends CalculationError {
  constructor(date) {
    super('SEASON_NOT_FOUND', `No season covers ${date}. This date cannot be priced from the chart.`, { date });
  }
}
class RateNotFoundError extends CalculationError {
  constructor(date, seasonId, unitTypeId) {
    super('RATE_NOT_FOUND', `No credit rate is defined for ${date} (${seasonId}) on the selected unit.`, { date, seasonId, unitTypeId });
  }
}
class AmbiguousSeasonError extends CalculationError {
  constructor(date, seasons) {
    super('AMBIGUOUS_SEASON', `${date} is covered by more than one season (${seasons.join(', ')}); the chart is ambiguous for this date.`, { date, seasons });
  }
}
class InvalidStayDatesError extends CalculationError {
  constructor(message) {
    super('INVALID_STAY_DATES', message);
  }
}
class ConflictingOverrideError extends CalculationError {
  constructor(date, ids) {
    super('CONFLICTING_OVERRIDE', `${date} has conflicting equal-priority overrides (${ids.join(', ')}).`, { date, ids });
  }
}
class UnsupportedWeeklyPricingError extends CalculationError {
  constructor(strategy) {
    super('UNSUPPORTED_WEEKLY_PRICING', `Weekly pricing strategy "${strategy}" is not supported.`, { strategy });
  }
}

module.exports = {
  CalculationError,
  ResortNotFoundError,
  UnitTypeNotFoundError,
  SeasonNotFoundError,
  RateNotFoundError,
  AmbiguousSeasonError,
  InvalidStayDatesError,
  ConflictingOverrideError,
  UnsupportedWeeklyPricingError,
};
