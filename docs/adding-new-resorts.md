# Adding New Resorts

The calculator is data-driven — new resorts require **no application-code
changes** when they use the existing WBW chart schema.

## 1. Where to place the source file

Add the chart JSON under the state/country folder, matching the existing layout:

```
Resort_Info_WBW/<State or Country>/WBW <Resort Name>/<resort_slug>.json
```

Keep the original chart image alongside it as `CreditChart.png` for reference.
The raw file is the source of truth and must follow the `wbw-standard` shape:

```jsonc
{
  "resort": "New Resort",
  "state": "Oregon",
  "source": "CreditChart.png",
  "seasons": [
    {
      "name": "prime",                    // prime | average | slow
      "meaning": "…",
      "date_ranges": { "2026": ["Jan 1", "Mar 13 - Oct 1"], "2027": ["…"] },
      "rooms": [
        { "type": "1 BR", "features": { "kitchen": "full" },
          "credits": { "mon_thur": 850, "fri_sat": 1700, "sun": 1200, "week": 8000 } }
      ]
    }
  ]
}
```

Every room needs all four credit keys (`mon_thur`, `fri_sat`, `sun`, `week`) as
whole numbers > 0, and the season date ranges must cover the intended period
without gaps or overlaps.

## 2. How schema detection works

`scripts/credit-charts/adapters/detect-schema.js` scores each adapter's
`supports()` against the file. The `wbw-standard` adapter returns high confidence
when it sees `resort`, `state`, a `seasons` array, `date_ranges`, and WBW credit
keys. Confidence ≥ 0.8 and unambiguous → the file is imported.

## 3. How to add an adapter (only for a NEW schema shape)

If a source uses a different structure, add an adapter instead of editing the
existing one:

1. Create `scripts/credit-charts/adapters/<family>.js` exporting
   `{ id, supports(raw) → 0..1, normalize(raw, meta) → { resort, warnings } }`.
   `normalize` must return a resort matching `lib/credits/types.d.ts`.
2. Register it in `detect-schema.js`'s `ADAPTERS` array.
3. Make `supports()` specific enough that it does not collide with
   `wbw-standard` (near-tied confidences are flagged `ambiguous` and skipped).

Do **not** grow one giant conditional — keep one adapter per chart family.

## 4. Run the importer

```bash
npm run credits:build
```

This audits, imports, and validates. Watch the summary for your resort.

## 5. Review validation

Open `data/generated/validation-report.json` or visit `/data-status`. Check your
resort's:

- **status** — must be `active` or `warning` to appear in the calculator
  (`blocked` and `unsupported` are hidden).
- **issues** — resolve any `error` in the source data (missing/negative/decimal
  rates, invalid dates, missing coverage). Fix warnings (season gaps/overlaps)
  where possible; unavoidable ones stay visible.

## 6. Verify before activating

Spot-check pricing against the original `CreditChart.png`:

1. `npm start`, open `/calculator`, select the resort.
2. Price a known weekday, weekend, and Sunday night and confirm they match the
   chart.
3. Price a 7-night single-season stay and confirm the weekly rate behavior.
4. Confirm `/data-status` shows the correct effective period and source file.

A resort should only be considered "done" when its status is `active` (or its
warnings are understood) and spot-checks match the chart.
