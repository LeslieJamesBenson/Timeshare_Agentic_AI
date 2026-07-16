// repository.js — the single data boundary between generated data and the app.
//
// The UI and API never read generated JSON from scattered locations; they go
// through these functions. Blocked resorts (validation errors) are excluded
// from the public catalog but remain queryable for /data-status.

const fs = require('fs');
const path = require('path');

const GEN_DIR = path.join(__dirname, '..', '..', 'data', 'generated');
const INDEX_FILE = path.join(GEN_DIR, 'resort-index.json');
const RESORTS_DIR = path.join(GEN_DIR, 'resorts');
const REPORT_FILE = path.join(GEN_DIR, 'validation-report.json');

let _cache = null;

function _load() {
  if (_cache) return _cache;
  if (!fs.existsSync(INDEX_FILE)) {
    throw new Error(`generated data not found at ${INDEX_FILE}. Run "npm run credits:build" first.`);
  }
  const index = JSON.parse(fs.readFileSync(INDEX_FILE, 'utf8'));
  const report = fs.existsSync(REPORT_FILE) ? JSON.parse(fs.readFileSync(REPORT_FILE, 'utf8')) : null;
  _cache = { index, report, resorts: new Map() };
  return _cache;
}

function _resort(resortId) {
  const c = _load();
  if (c.resorts.has(resortId)) return c.resorts.get(resortId);
  const f = path.join(RESORTS_DIR, `${resortId}.json`);
  if (!fs.existsSync(f)) return null;
  const data = JSON.parse(fs.readFileSync(f, 'utf8'));
  c.resorts.set(resortId, data);
  return data;
}

// Public catalog = active + warning resorts (not blocked/unsupported).
function getAllResorts() {
  const { index } = _load();
  return index.resorts.filter((r) => r.status === 'active' || r.status === 'warning');
}

function getResortIndex() {
  return _load().index;
}

function getResortById(resortId) {
  const meta = getResortIndex().resorts.find((r) => r.resortId === resortId);
  if (!meta || (meta.status !== 'active' && meta.status !== 'warning')) return null;
  return _resort(resortId);
}

// Includes blocked resorts — for /data-status only.
function getAnyResortById(resortId) {
  return _resort(resortId);
}

function getUnitsForResort(resortId) {
  const r = getResortById(resortId);
  return r ? r.unitTypes : [];
}

function getResortValidationStatus(resortId) {
  const rep = _load().report;
  if (!rep) return null;
  return rep.resorts.find((r) => r.resortId === resortId) || null;
}

// Lightweight text search over the generated index (name, aliases, destination,
// region). Case/punctuation-insensitive. Returns catalog records.
function searchResorts(query, limit = 25) {
  const catalog = getAllResorts();
  const q = String(query || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  if (!q) return catalog.slice(0, limit);
  const terms = q.split(' ');
  const scored = [];
  for (const r of catalog) {
    const hay = r.searchText || '';
    if (terms.every((t) => hay.includes(t))) {
      // rank exact-name / prefix matches higher
      const name = r.resortName.toLowerCase();
      let score = 0;
      if (name === q) score += 100;
      if (name.startsWith(q)) score += 50;
      if (name.includes(q)) score += 20;
      scored.push({ r, score });
    }
  }
  scored.sort((a, b) => b.score - a.score || a.r.resortName.localeCompare(b.r.resortName));
  return scored.slice(0, limit).map((s) => s.r);
}

function getValidationReport() {
  return _load().report;
}

function _clearCache() { _cache = null; }

module.exports = {
  getAllResorts,
  getResortIndex,
  getResortById,
  getAnyResortById,
  getUnitsForResort,
  getResortValidationStatus,
  searchResorts,
  getValidationReport,
  _clearCache,
  GEN_DIR,
};
