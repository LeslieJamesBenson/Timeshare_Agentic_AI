#!/usr/bin/env node
// import.js — normalize every raw chart, validate, and emit generated data.
//
//   Reads : Resort_Info_WBW/**/*.json  (never mutated)
//   Writes: data/generated/normalized-resorts.json
//           data/generated/resort-index.json
//           data/generated/resorts/<resortId>.json
//           data/generated/validation-report.json
//
// Status per resort:
//   unsupported — schema not recognized (never imported)
//   blocked     — has >=1 validation error (excluded from public catalog)
//   warning     — warnings only (kept active, flagged)
//   active      — clean

const fs = require('fs');
const { listRawCharts, readJson, writeJson, GEN_DIR, RESORTS_DIR } = require('./shared');
const { detectAdapter } = require('./adapters/detect-schema');
const { validateResort, worstSeverity } = require('../../lib/credits/schema');

function buildSearchText(resort) {
  const parts = [resort.resortName, resort.destination, resort.region, resort.state, resort.country];
  for (const u of resort.unitTypes) { parts.push(u.name); if (u.aliases) parts.push(...u.aliases); }
  return parts.filter(Boolean).join(' ').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function main() {
  const raws = listRawCharts();
  const normalized = [];
  const reportResorts = [];
  const indexResorts = [];
  const idCounts = {};

  // first pass: normalize
  const pending = [];
  for (const entry of raws) {
    if (entry.missing) {
      reportResorts.push({ resortId: null, sourceFile: `${entry.state}/${entry.resortDir}`, status: 'unsupported', issues: [{ severity: 'error', code: 'NO_JSON', message: 'no JSON file in resort folder' }] });
      continue;
    }
    let raw;
    try { raw = readJson(entry.file); }
    catch (e) {
      reportResorts.push({ resortId: null, sourceFile: entry.relPath, status: 'unsupported', issues: [{ severity: 'error', code: 'PARSE_ERROR', message: e.message }] });
      continue;
    }
    const det = detectAdapter(raw);
    if (det.status !== 'ok') {
      reportResorts.push({ resortId: null, sourceFile: entry.relPath, status: 'unsupported', confidence: det.confidence, issues: [{ severity: 'error', code: det.status === 'ambiguous' ? 'AMBIGUOUS_SCHEMA' : 'UNSUPPORTED_SCHEMA', message: `schema ${det.status} (confidence ${det.confidence.toFixed(2)})` }] });
      continue;
    }
    const { resort, warnings } = det.adapter.normalize(raw, { sourceFile: entry.relPath, folderState: entry.state, folderResort: entry.resortDir });
    if (!resort) {
      reportResorts.push({ resortId: null, sourceFile: entry.relPath, status: 'unsupported', issues: (warnings || []).map((m) => ({ severity: 'error', code: 'UNSUPPORTED', message: m })) });
      continue;
    }
    idCounts[resort.resortId] = (idCounts[resort.resortId] || 0) + 1;
    pending.push({ entry, resort, importWarnings: warnings || [], adapterId: det.adapter.id, confidence: det.confidence });
  }

  // second pass: validate (now that we know id uniqueness)
  let rateCombos = 0;
  const counts = { active: 0, warning: 0, blocked: 0, unsupported: reportResorts.length };
  for (const p of pending) {
    const { resort } = p;
    rateCombos += resort.creditRates.length;
    const { issues } = validateResort(resort, { knownResortIds: idCounts });
    const allIssues = [
      ...p.importWarnings.map((m) => ({ severity: 'warning', code: 'IMPORT_WARNING', message: m })),
      ...issues,
    ];
    const sev = worstSeverity(allIssues);
    let status = 'active';
    if (sev === 'error') status = 'blocked';
    else if (sev === 'warning') status = 'warning';
    counts[status]++;

    resort.status = status;
    normalized.push(resort);

    // per-resort file
    writeJson(require('path').join(RESORTS_DIR, `${resort.resortId}.json`), resort);

    reportResorts.push({
      resortId: resort.resortId,
      resortName: resort.resortName,
      sourceFile: p.entry.relPath,
      adapterId: p.adapterId,
      confidence: p.confidence,
      effectivePeriod: resort.source.effectiveStart && resort.source.effectiveEnd
        ? `${resort.source.effectiveStart} .. ${resort.source.effectiveEnd}` : null,
      status,
      errorCount: allIssues.filter((i) => i.severity === 'error').length,
      warningCount: allIssues.filter((i) => i.severity === 'warning').length,
      issues: allIssues,
    });

    if (status !== 'blocked') {
      indexResorts.push({
        resortId: resort.resortId,
        resortName: resort.resortName,
        destination: resort.destination,
        region: resort.region,
        state: resort.state,
        country: resort.country,
        status,
        unitCount: resort.unitTypes.length,
        seasonCount: resort.seasons.length,
        effectiveStart: resort.source.effectiveStart,
        effectiveEnd: resort.source.effectiveEnd,
        aliases: [].concat(...resort.unitTypes.map((u) => u.aliases || [])),
        searchText: buildSearchText(resort),
      });
    }
  }

  reportResorts.sort((a, b) => (a.sourceFile || '').localeCompare(b.sourceFile || ''));
  indexResorts.sort((a, b) => a.resortName.localeCompare(b.resortName));

  const report = {
    importedAt: new Date().toISOString(),
    totals: {
      sourceFiles: raws.length,
      normalized: normalized.length,
      rateCombinations: rateCombos,
      ...counts,
    },
    resorts: reportResorts,
  };

  writeJson(require('path').join(GEN_DIR, 'normalized-resorts.json'), normalized);
  writeJson(require('path').join(GEN_DIR, 'resort-index.json'), { importedAt: report.importedAt, totals: report.totals, resorts: indexResorts });
  writeJson(require('path').join(GEN_DIR, 'validation-report.json'), report);

  // console summary (matches the brief's example format)
  const c = report.totals;
  console.log(`${symbol(c.blocked === 0 && c.unsupported === 0)} ${c.normalized} resort files imported (of ${c.sourceFiles})`);
  console.log(`${symbol(true)} ${c.rateCombinations} unit/season rate combinations validated`);
  console.log(`  active: ${c.active}   warning: ${c.warning}   blocked: ${c.blocked}   unsupported: ${c.unsupported}`);
  const warnResorts = reportResorts.filter((r) => r.status === 'warning');
  for (const r of warnResorts.slice(0, 10)) {
    console.log(`  ⚠ ${r.resortId}: ${r.warningCount} warning(s) — ${r.issues.find((i) => i.severity === 'warning').message}`);
  }
  if (warnResorts.length > 10) console.log(`    …and ${warnResorts.length - 10} more with warnings`);
  for (const r of reportResorts.filter((r) => r.status === 'blocked')) {
    console.log(`  ✗ BLOCKED ${r.resortId || r.sourceFile}: ${r.issues.find((i) => i.severity === 'error').message}`);
  }
  for (const r of reportResorts.filter((r) => r.status === 'unsupported')) {
    console.log(`  ✗ UNSUPPORTED ${r.sourceFile}: ${r.issues[0].message}`);
  }
  console.log(`\nGenerated files written to ${require('path').relative(process.cwd(), GEN_DIR)}/`);
}

function symbol(ok) { return ok ? '✓' : '✗'; }

if (require.main === module) main();
module.exports = { main };
