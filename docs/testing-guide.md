# Testing Guide

All calculator tests are deterministic and need no API key or network.

## Commands

| Command | Scope |
| --- | --- |
| `npm run test:credits` | Unit tests for the credit engine, importer, and validation (`tests/credits/*.test.js`, Node's built-in `node:test`). |
| `npm run test:e2e` | Playwright end-to-end smoke test of the calculator UI (`tests/e2e/calculator.spec.js`; starts its own server). |
| `npm run credits:validate` | Re-validates the generated dataset; fails if any resort is blocked. |
| `npm test` | The pre-existing trip-planner engine tests (unchanged). |
| `npm run validate-data` | The pre-existing raw-dataset loader check (unchanged). |

## Unit tests (`tests/credits/`)

Isolated tests use **fixtures**, never the production charts, so they stay stable
as the dataset changes. Fixtures live in `tests/fixtures/`:

| Fixture | Purpose |
| --- | --- |
| `basic-resort.json` | Single all-year season; weekday/weekend/Sunday + week rate. |
| `split-season-resort.json` | Two seasons for split-season pricing. |
| `weekly-resort.json` | Cheap week rate + a unit with no week rate. |
| `override-resort.json` | A date override (holiday). |
| `malformed-resort.json` | Deliberate errors for the validator. |

`tests/credits/helpers.js` also exposes `makeResort()` for building edge-case
resorts inline (overlaps, conflicting overrides, alternate weekends, leap-year
coverage).

### Coverage of the required calculation cases

`calculation.test.js` + `weeklyPricing.test.js` cover: one weekday night, one
weekend night, multiple weekday nights, mixed stays, exactly 7 / 8 / 14 nights,
6-night (no weekly), week + extra weekday/weekend night, mixed-season week,
split-season, date override, conflicting overrides, two rooms, missing resort /
unit / rate, overlapping seasons, uncovered date, invalid ranges, check-in ==
check-out, check-out < check-in, leap day, year boundary, DST-transition night
count, alternate weekend config, effective-period warning, weekly rate
unavailable, and weekly pricing prohibited.

`dates.test.js` covers exclusive check-out, UTC day-of-week, calendar validation,
leap-day arithmetic, and WBW token parsing (single day, range, year-wrap).

`validation.test.js` covers the malformed fixture's error codes, coverage-gap
warnings, duplicate ids, unit-id normalization (aliases collapse; distinct
labels stay separate), and the two-La-Paloma disambiguation.

`importer.test.js` covers schema detection (high vs low confidence), the
normalized mapping, unsupported-schema rejection, and generated-data
self-consistency.

## End-to-end test (`tests/e2e/`)

`calculator.spec.js` drives the real page with the preinstalled Chromium via
`playwright-core` (same approach as `scripts/browser-smoke.js`). It exercises:
resort search + select, unit population, date entry, calculating a total,
the nightly breakdown, an owner-credit shortage, copying the breakdown, adding a
trip to the planner and seeing the annual total, the friendly error for an
unpriceable date, and reset.

> `playwright-core` is provided by the environment (not a tracked dependency),
> matching the existing browser smoke test. Install with
> `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 npm install --no-save playwright-core` if
> it is missing.

## What "green" means

```bash
npm run credits:build   # ✓ 0 blocked, 0 unsupported
npm run test:credits    # ✓ all pass
npm test                # ✓ existing engine unaffected
npm run test:e2e        # ✓ UI flow works (needs playwright-core)
```
