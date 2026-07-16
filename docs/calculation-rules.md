# Calculation Rules

How the credit engine (`lib/credits/calculation.js`) prices a stay. These rules
are derived from the WBW credit charts and the existing engine
(`lib/tripPlanner.js` / `Claude.md`). The engine **never guesses** — when a rule
or a rate is not present in the source data, it returns a typed error or a
visible warning instead of a number.

## Date semantics

- **Check-out is exclusive.** A stay is the set of _occupied nights_
  `[checkIn, checkOut)`.
  - Check-in `2026-09-14`, check-out `2026-09-19` → nights Sep 14, 15, 16, 17, 18 = **5 nights**.
- Dates are handled as **calendar dates only** (`YYYY-MM-DD`). All arithmetic and
  day-of-week resolution is done in UTC so the result is identical regardless of
  the browser/server timezone. There is no time-of-day and therefore no
  daylight-saving ambiguity.
- Invalid ranges throw `InvalidStayDatesError`:
  - check-out before check-in
  - check-in equal to check-out (zero nights)
  - a non-calendar date (e.g. `2026-02-30`)

## Day-of-week classification

Every WBW chart prices three day buckets. The resort's normalized `rules`
declare which days are weekend and which are day-specific:

| Day | Rate key (source) | Classification | Normalized field |
| --- | --- | --- | --- |
| Sunday | `sun` | day-specific | `nightlyCreditsByDay.SUNDAY` |
| Mon–Thu | `mon_thur` | weekday | `weekdayCredits` |
| Fri, Sat | `fri_sat` | weekend | `weekendCredits` |

Weekend nights are **not** hard-coded globally — they come from
`rules.weekendNights` (`["FRIDAY","SATURDAY"]` for every WBW resort). Sunday is
priced via its own day-specific rate (`rules.daySpecificNights = ["SUNDAY"]`).
A resort could declare a different weekend (e.g. `["SATURDAY","SUNDAY"]`) and the
engine honors it.

## Per-night resolution order

For each occupied night, in order:

1. **Date override.** If a `DateOverride` covers the date (and the unit, if the
   override is unit-scoped), the highest-priority override wins. Equal-priority
   overrides that both apply throw `ConflictingOverrideError`. _(No WBW resort
   currently ships overrides; the mechanism exists for holiday/premium periods.)_
2. **Season.** Exactly one season must cover the date.
   - zero → `SeasonNotFoundError` (unpriceable date)
   - two or more → `AmbiguousSeasonError` (chart overlap — see audit)
3. **Rate.** The `(seasonId, unitTypeId)` rate must exist → else `RateNotFoundError`.
4. **Day type → base credits** using the table above.
5. **Room count.** `totalCredits = baseCredits × roomCount`.

The result carries a `pricingSource` per night (`weekday-rate`, `weekend-rate`,
`day-specific-rate`, `date-override`) so the breakdown shows the math.

## Split-season stays

Each night is priced by **its own** season (`rules.allowSplitSeasonCalculation
= true`). A stay that crosses a season boundary is billed night-by-night — the
check-in season does **not** control the whole stay. The engine supports
`rules.useCheckInSeasonForEntireStay`, but no WBW resort enables it, so it is
never assumed.

## Weekly pricing

`rules.weeklyPricingStrategy = "lowest-valid-rate"` with
`weeklyRequiresSingleSeason = true`.

After the nightly schedule is known, the engine scans greedily for **7
consecutive nights that all sit in one season and contain no override night**.
For each such block it compares:

- the block's nightly subtotal (`baseCredits × roomCount`, summed), vs.
- the season's `weeklyCredits × roomCount`.

If the weekly rate is **strictly cheaper**, it replaces those seven nights and is
recorded as a `WeeklyAdjustment` (start, end, nightly subtotal, weekly rate,
savings). Otherwise the nights stay nightly. Consequences:

- A 14-night single-season stay gets **two** weekly blocks.
- An 8-night stay gets one weekly block + one nightly night.
- If the week rate **equals or exceeds** nightly, it is not applied (no fake savings).
- **Mixed-season** 7-night windows are **never** given a weekly rate — the
  official rule for that case is not in the source data, so the engine keeps
  nightly pricing rather than inventing one.
- `nightly-only` strategy disables weekly entirely; a missing `weeklyCredits`
  simply means no weekly block is possible for that unit.

"Weekly savings" is only reported when the configured rule actually produces a
lower total.

## Multiple rooms

`roomCount` (whole number ≥ 1) multiplies every night's base credits and the
weekly rate uniformly. Room count is applied per night, then weekly pricing runs
on the already-multiplied nightly totals.

## Owner-credit comparison (optional)

When `ownerCredits` is supplied, the API returns a neutral comparison:
`available`, `required`, `difference`, `status` (`surplus`/`short`), and
`coveragePct = round(available / required × 100)`. No sales language.

## Warnings vs errors

- **Errors** (`CalculationError` subclasses) stop the calculation and surface a
  user-safe message — never a stack trace. The affected stay gets no total.
- **Warnings** are attached to a successful result (e.g. the stay extends past
  the chart's effective period). They are always shown, never hidden.

## Effective period

Each resort's chart covers `source.effectiveStart..effectiveEnd`
(2026-01-01 → 2027-12-31 for the current dataset). A stay before the start or
past the end raises a visible warning; a date with no covering season is a hard
`SeasonNotFoundError`.
