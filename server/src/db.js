import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DB_PATH = process.env.DB_PATH || path.join(here, '..', 'data', 'stockroom.db');

if (DB_PATH !== ':memory:') fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

export const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`);

export function migrate() {
  db.exec(fs.readFileSync(path.join(here, 'schema.sql'), 'utf8'));
}

export const one = (sql, ...params) => db.prepare(sql).get(...params);
export const all = (sql, ...params) => db.prepare(sql).all(...params);
export const run = (sql, ...params) => {
  const r = db.prepare(sql).run(...params);
  return { changes: Number(r.changes), id: Number(r.lastInsertRowid) };
};

let depth = 0;

/**
 * Runs fn inside a single write transaction. BEGIN IMMEDIATE takes the write lock
 * up front, so a read-check-write sequence inside fn cannot interleave with another
 * writer. Any throw — from our own checks or from a DB constraint/trigger — rolls
 * back every statement. Nested calls join the outer transaction.
 */
export function tx(fn) {
  if (depth > 0) return fn();
  db.exec('BEGIN IMMEDIATE');
  depth++;
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  } finally {
    depth--;
  }
}

export const nowIso = () => new Date().toISOString();
