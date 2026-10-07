import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { type Migration, migrate } from './migrations.ts';

export type DB = Database;

export function openDatabase(path: string, onMigration?: (migration: Migration) => void): DB {
  const inMemory = path === ':memory:';
  if (!inMemory) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path, { create: true });
  db.run('PRAGMA journal_mode = WAL');
  db.run('PRAGMA foreign_keys = ON');
  db.run('PRAGMA busy_timeout = 5000');
  migrate(db, { onMigration });
  return db;
}

export const DEFAULT_DB_PATH = process.env.GAINZ_DB ?? 'data/gainz.sqlite';
