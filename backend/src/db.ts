import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Migration, migrate } from "./migrations";

export type DB = Database;

/**
 * Opens (and if needed creates) the SQLite database, then brings its schema up to date by applying
 * any pending migrations. `:memory:` is supported and used by the test suite, which is why every
 * test starts from exactly the DDL the on-disk database was built by.
 */
export function openDatabase(path: string, onMigration?: (migration: Migration) => void): DB {
  const onDisk = path !== ":memory:";
  if (onDisk) {
    mkdirSync(dirname(path), { recursive: true });
  }

  const db = new Database(path, { create: true });
  if (onDisk) {
    // SQLite ignores the journal mode of an in-memory database, so asking for WAL there is noise.
    db.run("PRAGMA journal_mode = WAL;");
  }
  db.run("PRAGMA foreign_keys = ON;");
  db.run("PRAGMA busy_timeout = 5000;");
  migrate(db, { onMigration });
  return db;
}

export const DEFAULT_DB_PATH = process.env.GAINZ_DB ?? "data/gainz.sqlite";
