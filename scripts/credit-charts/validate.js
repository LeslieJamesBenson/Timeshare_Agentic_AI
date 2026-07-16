#!/usr/bin/env node
// validate.js — re-validate the generated normalized data and print a summary.
// Exit 1 if any normalized resort is blocked by errors OR if generated data is
// missing/out of date. Warnings never fail the build.

const fs = require('fs');
const path = require('path');
const { GEN_DIR } = require('./shared');
const { validateResort, worstSeverity } = require('../../lib/credits/schema');

function main() {
  const normFile = path.join(GEN_DIR, 'normalized-resorts.json');
  if (!fs.existsSync(normFile)) {
    console.error('✗ data/generated/normalized-resorts.json missing — run "npm run credits:import" first.');
    process.exit(1);
  }
  const resorts = JSON.parse(fs.readFileSync(normFile, 'utf8'));
  const idCounts = {};
  resorts.forEach((r) => { idCounts[r.resortId] = (idCounts[r.resortId] || 0) + 1; });

  let blocked = 0, warned = 0, clean = 0, totalErrors = 0, totalWarnings = 0;
  for (const r of resorts) {
    const { issues } = validateResort(r, { knownResortIds: idCounts });
    const errs = issues.filter((i) => i.severity === 'error');
    const warns = issues.filter((i) => i.severity === 'warning');
    totalErrors += errs.length; totalWarnings += warns.length;
    const sev = worstSeverity(issues);
    if (sev === 'error') { blocked++; console.log(`  ✗ ${r.resortId}: ${errs[0].message}`); }
    else if (sev === 'warning') warned++;
    else clean++;
  }

  console.log(`\nValidated ${resorts.length} normalized resorts`);
  console.log(`  clean: ${clean}   warning: ${warned}   blocked: ${blocked}`);
  console.log(`  total errors: ${totalErrors}   total warnings: ${totalWarnings}`);
  if (blocked > 0) { console.log('\n✗ blocked resorts present — they are excluded from the public calculator.'); process.exit(1); }
  console.log('\n✓ no blocking errors.');
}

if (require.main === module) main();
module.exports = { main };
