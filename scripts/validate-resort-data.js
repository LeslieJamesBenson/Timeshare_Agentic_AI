#!/usr/bin/env node
// Validates the Resort_Info_WBW/ dataset via the normalizing loader.
// Run: npm run validate-data
// Exit 0 = no errors, 1 = errors found. Warnings never fail the build.

const { loadResorts, normalizeRoomType } = require('../lib/resortData');

let errors = 0, warnings = 0;
const err = (id, m) => { console.log(`  ERROR   [${id}] ${m}`); errors++; };
const warn = (id, m) => { console.log(`  warning [${id}] ${m}`); warnings++; };

console.log('Validating Resort_Info_WBW/\n');

const { resorts, errors: loadErrors } = loadResorts();
loadErrors.forEach(e => err('loader', e));

// Duplicate display-name detection (two "La Paloma" is expected — flag, don't fail)
const nameCounts = {};
resorts.forEach(r => { nameCounts[r.name] = (nameCounts[r.name] || 0) + 1; });

const CREDIT_KEYS = ['mon_thur', 'fri_sat', 'sun', 'week'];

for (const r of resorts) {
  if (!r.seasons.length) { err(r.id, 'no seasons'); continue; }

  // prime season should exist everywhere (it does across all 100 today)
  if (!r.seasons.some(s => s.name === 'prime')) {
    warn(r.id, 'no "prime" season — unusual, verify chart');
  }

  for (const s of r.seasons) {
    // date coverage for each declared year
    for (const [year, ranges] of Object.entries(s.ranges)) {
      if (!ranges.length) warn(r.id, `season "${s.name}" year ${year} has no parseable date ranges`);
    }
    if (!s.rooms.length) { err(r.id, `season "${s.name}" has no rooms`); continue; }

    for (const room of s.rooms) {
      if (room.bedrooms === null) {
        warn(r.id, `room type "${room.raw}" — could not infer bedroom count (needs manual capacity)`);
      }
      for (const k of CREDIT_KEYS) {
        if (typeof room.credits[k] !== 'number' || room.credits[k] <= 0) {
          err(r.id, `${s.name}/"${room.raw}" missing/invalid credits.${k}`);
        }
      }
      if (room.credits.fri_sat && room.credits.mon_thur &&
          room.credits.fri_sat < room.credits.mon_thur) {
        warn(r.id, `${s.name}/"${room.raw}": fri_sat < mon_thur (unusual)`);
      }
    }
  }
}

Object.entries(nameCounts).filter(([, c]) => c > 1)
  .forEach(([n, c]) => warn('dataset', `resort name "${n}" appears ${c}× (distinct locations? verify)`));

// Coverage summary
const roomTypeCount = new Set();
resorts.forEach(r => r.seasons.forEach(s => s.rooms.forEach(rm => roomTypeCount.add(rm.raw))));
const unmapped = [...roomTypeCount].filter(t => normalizeRoomType(t).bedrooms === null);

console.log(`\n${resorts.length} resorts loaded — ${errors} error(s), ${warnings} warning(s)`);
console.log(`${roomTypeCount.size} distinct room types; ${unmapped.length} need manual capacity` +
  (unmapped.length ? `: ${unmapped.join(', ')}` : ''));

process.exit(errors > 0 ? 1 : 0);
