/**
 * A small schema migration runner.
 *
 * Numbered `.sql` files under `src/backend/migrations/` are applied in ascending order, each inside
 * its own transaction, and recorded in `schema_migrations`. There is no library behind this:
 * `bun:sqlite` is synchronous and `db.transaction()` already rolls back on a thrown exception,
 * which is the whole of what a migration runner needs.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import type { DB } from './db';

export interface Migration {
  /** The leading number of the filename — the ordering key. */
  version: number;
  /** The kebab part of the filename, without the version. This is what the ledger stores. */
  name: string;
  /** Absolute path to the `.sql` file. */
  file: string;
}

export interface MigrateResult {
  /** The highest applied version once the run finished. */
  version: number;
  /** What this run applied, in order. Empty when the database was already up to date. */
  applied: Migration[];
}

export interface MigrateOptions {
  /** Where the `.sql` files live. Only the tests override this. */
  dir?: string;
  /** Called after each migration commits, so callers can report progress without logging here. */
  onMigration?: (migration: Migration) => void;
}

export const MIGRATIONS_DIR = resolve(import.meta.dir, 'migrations');

const LEDGER = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
`;

/** `002-add-exercise-archived.sql` → version 2, name `add-exercise-archived`. */
const FILENAME = /^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/;

interface AppliedRow {
  version: number;
  name: string;
}

/** The highest applied migration, or 0 when the database has never been migrated. */
export function schemaVersion(db: DB): number {
  const ledger = db.query<{ name: string }, [string]>("SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?").get('schema_migrations');
  if (!ledger) {
    return 0;
  }
  return db.query<{ version: number | null }, []>('SELECT MAX(version) AS version FROM schema_migrations').get()?.version ?? 0;
}

/** Every `.sql` file in `dir`, sorted by version. Throws on anything it cannot order confidently. */
function discover(dir: string): Migration[] {
  const found: Migration[] = [];
  const byVersion = new Map<number, string>();

  for (const entry of readdirSync(dir)) {
    if (!entry.endsWith('.sql')) {
      continue;
    }

    const [, rawVersion, name] = FILENAME.exec(entry) ?? [];
    if (!rawVersion || !name) {
      throw new Error(`Migration ${entry} does not match <version>-<name>.sql, for example 002-add-exercise-archived.sql`);
    }

    const version = Number(rawVersion);
    if (version < 1) {
      throw new Error(`Migration ${entry} must be numbered from 001 upwards — version 0 means "never migrated"`);
    }

    const clash = byVersion.get(version);
    if (clash) {
      throw new Error(`Migrations "${clash}" and "${entry}" share version ${version}`);
    }
    byVersion.set(version, entry);

    found.push({ version, name, file: join(dir, entry) });
  }

  return found.sort((a, b) => a.version - b.version);
}

/**
 * The applied versions must form an unbroken prefix of the files on disk. Anything else means the
 * database and the checkout disagree in a way that silently skipping migrations would hide.
 */
function assertConsistent(files: Migration[], applied: AppliedRow[], dir: string): void {
  const known = new Set(files.map((migration) => migration.version));
  for (const row of applied) {
    if (!known.has(row.version)) {
      throw new Error(
        `Database has migration ${row.version} (${row.name}) applied, but no matching file exists in ${dir} — the database is newer than this checkout`,
      );
    }
  }

  const highest = applied.reduce((max, row) => Math.max(max, row.version), 0);
  const done = new Set(applied.map((row) => row.version));
  for (const migration of files) {
    if (migration.version <= highest && !done.has(migration.version)) {
      throw new Error(
        `Migration ${basename(migration.file)} is numbered at or below the highest applied version (${highest}) but has never run — renumber it above ${highest}`,
      );
    }
  }
}

/** Applies every pending migration. Returns what ran; throws, having rolled back, on the first failure. */
export function migrate(db: DB, options: MigrateOptions = {}): MigrateResult {
  const dir = options.dir ?? MIGRATIONS_DIR;

  db.run(LEDGER);
  const files = discover(dir);
  const previous = db.query<AppliedRow, []>('SELECT version, name FROM schema_migrations ORDER BY version').all();
  assertConsistent(files, previous, dir);

  const done = new Set(previous.map((row) => row.version));
  const pending = files.filter((migration) => !done.has(migration.version));
  if (pending.length === 0) {
    return { version: schemaVersion(db), applied: [] };
  }

  const applied: Migration[] = [];

  // Changing an existing column means SQLite's 12-step table rebuild, which requires foreign keys
  // off — and `PRAGMA foreign_keys` is a silent no-op inside a transaction, so it has to be toggled
  // out here. `foreign_key_check` below is what keeps that from hiding a broken migration.
  db.run('PRAGMA foreign_keys = OFF;');
  try {
    for (const migration of pending) {
      try {
        db.transaction(() => {
          db.run(readFileSync(migration.file, 'utf8'));

          // prepare() rather than query(): the schema just changed under us, so this must not come
          // from the statement cache.
          const orphan = db.prepare<{ table: string }, []>('PRAGMA foreign_key_check').get();
          if (orphan) {
            throw new Error(`it left orphaned rows in "${orphan.table}"`);
          }

          db.query('INSERT INTO schema_migrations (version, name) VALUES (?, ?)').run(migration.version, migration.name);
        })();
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        throw new Error(`Migration ${basename(migration.file)} failed and was rolled back: ${reason}`, { cause: err });
      }

      applied.push(migration);
      options.onMigration?.(migration);
    }
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }

  return { version: schemaVersion(db), applied };
}
