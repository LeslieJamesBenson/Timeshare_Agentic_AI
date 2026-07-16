# Data Import Guide

How raw credit charts become the normalized data the calculator serves.

## Pipeline overview

```
Resort_Info_WBW/**/*.json   (raw source of truth — never mutated)
        │
        ▼  npm run credits:import
  detect schema → adapter.normalize → validate → status
        │
        ▼
data/generated/
  normalized-resorts.json     all normalized resorts (array)
  resort-index.json           catalog + search index (active/warning only)
  resorts/<resortId>.json     one file per resort (loaded on demand)
  validation-report.json      machine-readable issues per resort
```

## Commands

| Command | What it does |
| --- | --- |
| `npm run credits:audit` | Read-only scan of the raw charts; prints schema family + anomalies. |
| `npm run credits:import` | Normalize all charts and (re)write `data/generated/`. |
| `npm run credits:validate` | Re-validate the generated data; exits non-zero if any resort is blocked. |
| `npm run credits:build` | audit → import → validate, in sequence. |

Run `npm run credits:build` whenever a raw chart changes.

## Stages

1. **List** raw charts — `scripts/credit-charts/shared.js` walks
   `Resort_Info_WBW/<State>/<WBW Resort>/*.json`.
2. **Detect schema** — `scripts/credit-charts/adapters/detect-schema.js` runs
   every adapter's `supports()` and returns the best match with a confidence
   score. Confidence < 0.8 → `unsupported`; two near-tied high scores →
   `ambiguous`. Neither is imported.
3. **Normalize** — the chosen adapter (`wbw-standard`) calls
   `lib/credits/normalize.js`, producing the model in `lib/credits/types.d.ts`:
   stable ids, unit types (with aliases), seasons (ISO date ranges), credit
   rates, resort rules, and source metadata.
4. **Validate** — `lib/credits/schema.js` checks structure, ids, dates, season
   coverage (gaps/overlaps), and rate integrity, tagging issues `error` /
   `warning` / `info`.
5. **Classify + write** — status is derived from the worst issue:
   - `active` — clean
   - `warning` — warnings only (kept in the catalog, flagged)
   - `blocked` — ≥ 1 error (excluded from the public calculator)
   - `unsupported` — schema not recognized

## Identifiers

Stable slugs, never display names, are used for joins:

- `normalizeResortId(state, name)` → `california-palm-springs`
- `normalizeUnitTypeId("1 BR Deluxe")` → `one-bedroom-deluxe`
- `normalizeSeasonId("prime")` → `prime`

Meaningfully different unit labels stay distinct (`one-bedroom` ≠
`one-bedroom-deluxe`). Alternate spellings of the _same_ label collapse to one id
and the originals are preserved as `aliases`.

## Traceability

Every normalized resort records `source.sourceFile` (the raw path) and
`source.sourcePointer` (the chart image name). The `/data-status` page and
`validation-report.json` show the source file for each resort.

## Raw files are never mutated

The importer only reads `Resort_Info_WBW/`. All output goes to
`data/generated/`, which is fully reproducible from the raw charts via the
scripts above.
