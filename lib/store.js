// store.js — lightweight persistence (Phase 5) using Node's built-in SQLite.
//
// node:sqlite ships with Node 22+ (no native build, no npm dependency). We use
// it to persist rep call context and drafted Salesforce logs so a page refresh
// or a dropped call doesn't lose the rep's work. If node:sqlite is unavailable
// (older Node), we fall back to an in-memory store and log a warning — the app
// still runs, it just won't persist across restarts.
//
// The DB file lives at data/repdata.db and is gitignored.

const fs = require('fs');
const path = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DB_PATH = path.join(DATA_DIR, 'repdata.db');

function createStore() {
  let DatabaseSync;
  try {
    ({ DatabaseSync } = require('node:sqlite'));
  } catch {
    console.warn('node:sqlite unavailable — using in-memory store (no persistence across restarts).');
    return createMemoryStore();
  }

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS rep_context (
      owner_key   TEXT PRIMARY KEY,
      context     TEXT NOT NULL,
      updated_at  INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sf_logs (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_key   TEXT NOT NULL,
      log         TEXT NOT NULL,
      created_at  INTEGER NOT NULL
    );
  `);

  const upsertCtx = db.prepare(
    `INSERT INTO rep_context (owner_key, context, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(owner_key) DO UPDATE SET context=excluded.context, updated_at=excluded.updated_at`
  );
  const getCtx = db.prepare(`SELECT context, updated_at FROM rep_context WHERE owner_key = ?`);
  const insLog = db.prepare(`INSERT INTO sf_logs (owner_key, log, created_at) VALUES (?, ?, ?)`);
  const listLogs = db.prepare(`SELECT id, log, created_at FROM sf_logs WHERE owner_key = ? ORDER BY created_at DESC LIMIT 50`);

  return {
    backend: 'sqlite',
    saveContext(ownerKey, context) {
      upsertCtx.run(ownerKey, JSON.stringify(context), Date.now());
    },
    loadContext(ownerKey) {
      const row = getCtx.get(ownerKey);
      return row ? { context: JSON.parse(row.context), updatedAt: row.updated_at } : null;
    },
    saveLog(ownerKey, log) {
      const info = insLog.run(ownerKey, String(log), Date.now());
      return Number(info.lastInsertRowid);
    },
    listLogs(ownerKey) {
      return listLogs.all(ownerKey).map(r => ({ id: r.id, log: r.log, createdAt: r.created_at }));
    },
  };
}

// In-memory fallback with the same interface.
function createMemoryStore() {
  const ctx = new Map();
  const logs = new Map();
  let seq = 1;
  return {
    backend: 'memory',
    saveContext(ownerKey, context) { ctx.set(ownerKey, { context, updatedAt: Date.now() }); },
    loadContext(ownerKey) { return ctx.get(ownerKey) || null; },
    saveLog(ownerKey, log) {
      const id = seq++;
      if (!logs.has(ownerKey)) logs.set(ownerKey, []);
      logs.get(ownerKey).unshift({ id, log: String(log), createdAt: Date.now() });
      return id;
    },
    listLogs(ownerKey) { return (logs.get(ownerKey) || []).slice(0, 50); },
  };
}

module.exports = { createStore };
