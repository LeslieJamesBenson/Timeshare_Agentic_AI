#!/usr/bin/env node
// audit.js — Phase-0 style inspection of the raw charts. Read-only. Prints a
// schema-family summary and coverage anomalies; writes nothing. The prose
// report lives in docs/credit-chart-audit.md.

const { listRawCharts, readJson } = require('./shared');
const { detectAdapter } = require('./adapters/detect-schema');

function main() {
  const raws = listRawCharts().filter((r) => !r.missing);
  const topKeys = new Set(), seasonNames = new Set(), creditKeys = new Set();
  const unitLabels = new Set(), years = new Set();
  const adapterHits = {};
  let parseErrors = 0;

  for (const e of raws) {
    let raw;
    try { raw = readJson(e.file); } catch { parseErrors++; continue; }
    Object.keys(raw).forEach((k) => topKeys.add(k));
    const det = detectAdapter(raw);
    const key = det.adapter ? det.adapter.id : det.status;
    adapterHits[key] = (adapterHits[key] || 0) + 1;
    for (const s of raw.seasons || []) {
      seasonNames.add(s.name);
      Object.keys(s.date_ranges || {}).forEach((y) => years.add(y));
      for (const rm of s.rooms || []) {
        unitLabels.add(rm.type);
        Object.keys(rm.credits || {}).forEach((k) => creditKeys.add(k));
      }
    }
  }

  console.log('Credit-chart audit (raw source scan)\n');
  console.log(`Chart files          : ${raws.length}`);
  console.log(`Parse errors         : ${parseErrors}`);
  console.log(`Adapter detection    : ${JSON.stringify(adapterHits)}`);
  console.log(`Top-level keys       : ${[...topKeys].join(', ')}`);
  console.log(`Season names         : ${[...seasonNames].join(', ')}`);
  console.log(`Years represented    : ${[...years].sort().join(', ')}`);
  console.log(`Credit keys          : ${[...creditKeys].join(', ')}`);
  console.log(`Distinct unit labels : ${unitLabels.size}`);
  console.log('\nFull prose report: docs/credit-chart-audit.md');
}

if (require.main === module) main();
module.exports = { main };
