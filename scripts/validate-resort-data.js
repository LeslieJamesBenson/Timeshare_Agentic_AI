#!/usr/bin/env node
// Validates every resort JSON in resort-data/resorts/ plus wbw-rules.json.
// Run with: npm run validate-data
// Exit code 0 = all good, 1 = errors found.

const fs = require('fs');
const path = require('path');

const RESORTS_DIR = path.join(__dirname, '..', 'resort-data', 'resorts');
const RULES_FILE = path.join(__dirname, '..', 'resort-data', 'wbw-rules.json');

const VALID_REGIONS = [
  'pacific-northwest', 'california-coast', 'southern-california',
  'desert-southwest', 'mountain', 'lake', 'hawaii', 'mexico',
  'midwest', 'southeast', 'northeast', 'international'
];

let errors = 0;
let warnings = 0;

function err(file, msg) { console.log(`  ERROR   [${file}] ${msg}`); errors++; }
function warn(file, msg) { console.log(`  warning [${file}] ${msg}`); warnings++; }

function mmddToDay(mmdd) {
  const [m, d] = mmdd.split('-').map(Number);
  if (!m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
  // 2024 is a leap year so 02-29 is representable
  return Math.floor((Date.UTC(2024, m - 1, d) - Date.UTC(2024, 0, 1)) / 86400000);
}

function validateResort(file, r) {
  const required = ['id', 'name', 'location', 'region', 'unitTypes', 'seasons', 'creditChart'];
  for (const key of required) {
    if (r[key] === undefined) { err(file, `missing required field "${key}"`); }
  }
  if (errors > 0 && !r.id) return;

  const expectedId = path.basename(file, '.json');
  if (r.id !== expectedId) err(file, `id "${r.id}" does not match filename "${expectedId}"`);

  if (r.location && (!r.location.city || !r.location.state)) {
    err(file, 'location must include city and state');
  }

  (r.region || []).forEach(reg => {
    if (!VALID_REGIONS.includes(reg)) {
      err(file, `unknown region "${reg}" — valid: ${VALID_REGIONS.join(', ')}`);
    }
  });

  const unitNames = (r.unitTypes || []).map(u => u.type);
  if (unitNames.length === 0) err(file, 'unitTypes is empty');
  (r.unitTypes || []).forEach(u => {
    if (!u.maxGuests || u.maxGuests < 1) err(file, `unitType "${u.type}" missing maxGuests`);
  });

  // Season coverage: every day of the year must belong to exactly one season
  const seasonNames = (r.seasons || []).map(s => s.name);
  const dayCover = new Array(366).fill(0);
  (r.seasons || []).forEach(s => {
    (s.dateRanges || []).forEach(range => {
      const a = mmddToDay(range.start);
      const b = mmddToDay(range.end);
      if (a === null || b === null) {
        err(file, `season "${s.name}" has invalid date "${range.start}" or "${range.end}" (use MM-DD)`);
        return;
      }
      if (a <= b) {
        for (let i = a; i <= b; i++) dayCover[i]++;
      } else {
        // wraps around new year, e.g. 11-01 → 02-29
        for (let i = a; i < 366; i++) dayCover[i]++;
        for (let i = 0; i <= b; i++) dayCover[i]++;
      }
    });
  });
  const uncovered = dayCover.filter(c => c === 0).length;
  const overlapped = dayCover.filter(c => c > 1).length;
  if (uncovered > 0) err(file, `seasons leave ${uncovered} day(s) of the year uncovered`);
  if (overlapped > 0) err(file, `seasons overlap on ${overlapped} day(s)`);

  // Credit chart: every season × unitType combo must exist with positive numbers
  const chartKeys = new Set();
  (r.creditChart || []).forEach(row => {
    if (!seasonNames.includes(row.season)) {
      err(file, `creditChart references unknown season "${row.season}"`);
    }
    if (!unitNames.includes(row.unitType)) {
      err(file, `creditChart references unknown unitType "${row.unitType}"`);
    }
    if (!(row.sunThu > 0) || !(row.friSat > 0)) {
      err(file, `creditChart ${row.season}/${row.unitType} has non-positive credits (sunThu=${row.sunThu}, friSat=${row.friSat}) — template zeros left in?`);
    }
    if (row.friSat < row.sunThu) {
      warn(file, `creditChart ${row.season}/${row.unitType}: friSat (${row.friSat}) < sunThu (${row.sunThu}) — unusual, double-check the chart`);
    }
    chartKeys.add(`${row.season}|${row.unitType}`);
  });
  seasonNames.forEach(s => unitNames.forEach(u => {
    if (!chartKeys.has(`${s}|${u}`)) err(file, `creditChart missing row for ${s}/${u}`);
  }));
  if ((r.creditChart || []).length !== chartKeys.size) {
    err(file, 'creditChart contains duplicate season/unitType rows');
  }

  if (!r.sourceFile) warn(file, 'no sourceFile — link the credit-chart screenshot for auditability');
  if (r.notes && r.notes.includes('EXAMPLE FILE')) {
    warn(file, 'still marked as EXAMPLE data — replace with real chart values');
  }
}

console.log('Validating resort-data/\n');

// wbw-rules.json
try {
  const rules = JSON.parse(fs.readFileSync(RULES_FILE, 'utf8'));
  const pending = JSON.stringify(rules).match(/NEEDS_CONFIRMATION/g) || [];
  if (pending.length > 0) {
    warn('wbw-rules.json', `${pending.length} section(s) still marked NEEDS_CONFIRMATION`);
  }
} catch (e) {
  err('wbw-rules.json', `unreadable or invalid JSON: ${e.message}`);
}

// resorts/
const files = fs.existsSync(RESORTS_DIR)
  ? fs.readdirSync(RESORTS_DIR).filter(f => f.endsWith('.json') && !f.startsWith('_'))
  : [];

if (files.length === 0) {
  console.log('  (no resort files found yet — copy _TEMPLATE.json to get started)');
}

for (const f of files) {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(RESORTS_DIR, f), 'utf8'));
    validateResort(f, data);
  } catch (e) {
    err(f, `invalid JSON: ${e.message}`);
  }
}

console.log(`\n${files.length} resort file(s) checked — ${errors} error(s), ${warnings} warning(s)`);
process.exit(errors > 0 ? 1 : 0);
