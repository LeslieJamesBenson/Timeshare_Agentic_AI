RESORT DATA — HOW TO ADD A RESORT
==================================

The trip-planner engine reads every JSON file in resorts/.
One file per resort. Copy resorts/_TEMPLATE.json, rename it, fill it in.
seaside.json is a completed example (marked EXAMPLE — its numbers are
placeholders, not the real chart).

EASIEST WORKFLOW (recommended)
------------------------------
1. Drop the credit-chart screenshot for each resort into credit-charts/
   (any .png/.jpg — name it <resort-id>-credits.png)
2. Ask Claude to convert them — it reads the images and writes the JSONs
3. You spot-check the generated numbers against the screenshots
4. Run:  npm run validate-data

MANUAL WORKFLOW
---------------
1. Copy resorts/_TEMPLATE.json → resorts/<resort-id>.json
   (id must be kebab-case and match the filename, e.g. birch-bay.json)
2. Fill in every section (see checklist below)
3. Run:  npm run validate-data
   Fix anything it flags. Zero errors = the engine can use it.

WHAT'S NEEDED PER RESORT (checklist)
------------------------------------
[ ] Resort name + city/state
[ ] Region tag(s) — pick from the list in _TEMPLATE.json (powers
    "somewhere on the Oregon coast" style searches)
[ ] Optional tags — beach / ski / golf / theme-park etc. (powers
    "suggest something for a family" searches)
[ ] Unit types offered + max guests each
[ ] SEASONS: the date ranges from the credit chart (e.g. High = Jun 15–Sep 15).
    Every day of the year must fall in exactly one season — the validator checks.
    Use MM-DD format; ranges may wrap the new year (11-01 → 02-29 is fine).
[ ] CREDIT CHART: for every season × unit type, credits per night
    Sun–Thu and Fri–Sat (the two columns on the WorldMark chart)
[ ] sourceFile: filename of the screenshot in credit-charts/ so numbers
    can be audited later
[ ] notes: anything odd (holiday surcharges, no-kitchen studios, etc.)

WHAT'S NEEDED ONCE, GLOBALLY (wbw-rules.json)
---------------------------------------------
These power the cash side of "credits + cash total". Sections marked
NEEDS_CONFIRMATION in wbw-rules.json still need official numbers:
[ ] Housekeeping fee per unit type (and any free-housekeeping threshold)
[ ] Guest certificate fee
[ ] Bonus time window + cash rates
[ ] Official Personal Choice rate + rounding rules (currently $0.041/credit,
    Diamond VIP and above)
[ ] Any per-resort taxes/resort fees

VALIDATION
----------
  npm run validate-data

Catches: invalid JSON, missing fields, season gaps/overlaps, missing or
zeroed credit-chart rows, id/filename mismatches, unknown regions.
Run it after every batch of files.
