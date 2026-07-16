// shared.js — filesystem helpers for the credit-chart pipeline.
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const RAW_ROOT = path.join(ROOT, 'Resort_Info_WBW');
const GEN_DIR = path.join(ROOT, 'data', 'generated');
const RESORTS_DIR = path.join(GEN_DIR, 'resorts');

// Walk Resort_Info_WBW/<State>/<WBW Resort>/<file>.json.
// Returns [{ file, state, resortDir, relPath }].
function listRawCharts() {
  const out = [];
  if (!fs.existsSync(RAW_ROOT)) return out;
  for (const state of fs.readdirSync(RAW_ROOT).sort()) {
    const sp = path.join(RAW_ROOT, state);
    if (!fs.statSync(sp).isDirectory()) continue;
    for (const resortDir of fs.readdirSync(sp).sort()) {
      const rp = path.join(sp, resortDir);
      if (!fs.statSync(rp).isDirectory()) continue;
      const jsonName = fs.readdirSync(rp).find((f) => f.endsWith('.json'));
      if (!jsonName) { out.push({ file: null, state, resortDir, relPath: null, missing: true }); continue; }
      const file = path.join(rp, jsonName);
      out.push({ file, state, resortDir, relPath: path.relative(ROOT, file) });
    }
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2) + '\n');
}

module.exports = { ROOT, RAW_ROOT, GEN_DIR, RESORTS_DIR, listRawCharts, readJson, ensureDir, writeJson };
