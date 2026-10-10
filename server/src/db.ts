import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { SPECIES_IDS } from '../../shared/src/types.ts';
import { getSpeciesPayload } from '../../shared/src/anatomy/index.ts';

export function openDb(file: string): DatabaseSync {
  if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS species (
      id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS structures (
      species TEXT NOT NULL,
      id TEXT NOT NULL,
      kind TEXT NOT NULL,
      grp TEXT NOT NULL,
      name_la TEXT NOT NULL,
      name_cs TEXT NOT NULL,
      name_en TEXT NOT NULL,
      payload TEXT NOT NULL,
      PRIMARY KEY (species, id)
    );
    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      species TEXT NOT NULL,
      structure_id TEXT NOT NULL,
      text TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS notes_device ON notes(device_id, species);
    CREATE TABLE IF NOT EXISTS settings (
      device_id TEXT PRIMARY KEY,
      payload TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS progress (
      device_id TEXT NOT NULL,
      species TEXT NOT NULL,
      structure_id TEXT NOT NULL,
      known INTEGER NOT NULL DEFAULT 1,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (device_id, species, structure_id)
    );
  `);
  return db;
}

/** (Re)seed the anatomy dataset – idempotent, runs on every start so data edits propagate. */
export function seed(db: DatabaseSync) {
  const now = new Date().toISOString();
  const upSpecies = db.prepare('INSERT INTO species (id, payload, updated_at) VALUES (?, ?, ?) ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, updated_at = excluded.updated_at');
  const delStructs = db.prepare('DELETE FROM structures WHERE species = ?');
  const insStruct = db.prepare('INSERT INTO structures (species, id, kind, grp, name_la, name_cs, name_en, payload) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  let count = 0;
  db.exec('BEGIN');
  try {
    for (const id of SPECIES_IDS) {
      const p = getSpeciesPayload(id);
      upSpecies.run(id, JSON.stringify(p), now);
      delStructs.run(id);
      for (const s of p.structures) {
        insStruct.run(id, s.id, s.kind, s.group, s.names.la, s.names.cs, s.names.en, JSON.stringify(s));
        count++;
      }
    }
    db.exec('COMMIT');
  } catch (e) {
    db.exec('ROLLBACK');
    throw e;
  }
  return count;
}
