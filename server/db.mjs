// server/db.mjs
// Single shared SQLite handle, lazily opened. Uses node:sqlite (Node 22+).
// PRAGMA journal_mode=WAL is set in the migration so the connection
// returns the right thing immediately.

import { DatabaseSync } from "node:sqlite";
import { mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";

let _db = null;

export function getDb(dbPath) {
  if (_db) return _db;
  if (!existsSync(dirname(dbPath))) {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  _db = new DatabaseSync(dbPath);
  _db.exec("PRAGMA foreign_keys = ON");
  _db.exec("PRAGMA journal_mode = WAL");
  _db.exec("PRAGMA synchronous = NORMAL");
  return _db;
}

export function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// Tiny transaction helper. The callback runs synchronously inside
// `db.exec('BEGIN') ... 'COMMIT'`. Throwing rolls back. node:sqlite's
// exec is synchronous so this is safe to use in async handlers.
export function tx(db, fn) {
  db.exec("BEGIN");
  try {
    const out = fn();
    db.exec("COMMIT");
    return out;
  } catch (e) {
    try { db.exec("ROLLBACK"); } catch {}
    throw e;
  }
}
