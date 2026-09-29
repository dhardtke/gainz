/**
 * A small schema migration runner.
 *
 * Numbered `.sql` migrations are applied in ascending order, each inside its own transaction, and recorded in `schema_migrations`.
 * A built file takes them from its embedded list; otherwise they are read from `src/backend/db/migrations/`. Both are validated the same way.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { EMBEDDED } from '../embedded.ts';
import type { DB } from './db.ts';

/** One migration file: its bare filename and its contents. */
export interface MigrationSource {
  filename: string;
  sql: string;
}

export interface Migration {
  /** The leading number of the filename — the ordering key. */
  version: number;
  /** The kebab part of the filename, without the version. This is what the ledger stores. */
  name: string;
  /** The bare filename, `001-initial-schema.sql`. */
  file: string;
  sql: string;
}

export interface MigrateResult {
  /** The highest applied version once the run finished. */
  version: number;
  /** What this run applied, in order. Empty when the database was already up to date. */
  applied: Migration[];
}

export interface MigrateOptions {
  /** Where the `.sql` files live. Only the tests override this; a built file reads the embedded list. */
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

/** Every `.sql` file in `dir` with its contents, in directory order — `discover` sorts. */
export function readMigrations(dir: string): MigrationSource[] {
  return readdirSync(dir)
    .filter((entry) => entry.endsWith('.sql'))
    .map((filename) => ({ filename, sql: readFileSync(join(dir, filename), 'utf8') }));
}

/** Every source, sorted by version. Throws on anything it cannot order confidently. */
function discover(sources: MigrationSource[]): Migration[] {
  const found: Migration[] = [];
  const byVersion = new Map<number, string>();

  for (const { filename, sql } of sources) {
    const [, rawVersion, name] = FILENAME.exec(filename) ?? [];
    if (!rawVersion || !name) {
      throw new Error(`Migration ${filename} does not match <version>-<name>.sql, for example 002-add-exercise-archived.sql`);
    }

    const version = Number(rawVersion);
    if (version < 1) {
      throw new Error(`Migration ${filename} must be numbered from 001 upwards — version 0 means "never migrated"`);
    }

    const clash = byVersion.get(version);
    if (clash) {
      throw new Error(`Migrations "${clash}" and "${filename}" share version ${version}`);
    }
    byVersion.set(version, filename);

    found.push({ version, name, file: filename, sql });
  }

  return found.sort((a, b) => a.version - b.version);
}

/**
 * The applied versions must form an unbroken prefix of the migration files. Anything else means the
 * database and the code disagree in a way that silently skipping migrations would hide.
 */
function pendingMigrations(files: Migration[], applied: AppliedRow[]): Migration[] {
  const highest = applied.at(-1)?.version ?? 0;
  for (const [i, row] of applied.entries()) {
    const file = files[i];
    if (!file || file.version > row.version) {
      throw new Error(
        `Database has migration ${row.version} (${row.name}) applied, but no migration file for it exists — the database is newer than this code`,
      );
    }
    if (file.version < row.version) {
      throw new Error(
        `Migration ${file.file} is numbered at or below the highest applied version (${highest}) but has never run — renumber it above ${highest}`,
      );
    }
  }
  return files.slice(applied.length);
}

function apply(db: DB, migration: Migration): void {
  try {
    db.transaction(() => {
      db.run(migration.sql);

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
    throw new Error(`Migration ${migration.file} failed and was rolled back: ${reason}`, { cause: err });
  }
}

// Changing an existing column means SQLite's 12-step table rebuild, which requires foreign keys
// off — and `PRAGMA foreign_keys` is a silent no-op inside a transaction, so it has to be toggled
// out here. `foreign_key_check` in `apply` is what keeps that from hiding a broken migration.
function withForeignKeysOff(db: DB, fn: () => void): void {
  db.run('PRAGMA foreign_keys = OFF;');
  try {
    fn();
  } finally {
    db.run('PRAGMA foreign_keys = ON;');
  }
}

/** Applies every pending migration. Returns what ran; throws, having rolled back, on the first failure. */
export function migrate(db: DB, options: MigrateOptions = {}): MigrateResult {
  const sources = options.dir !== undefined ? readMigrations(options.dir) : (EMBEDDED?.migrations ?? readMigrations(MIGRATIONS_DIR));

  db.run(LEDGER);
  const previous = db.query<AppliedRow, []>('SELECT version, name FROM schema_migrations ORDER BY version').all();
  const pending = pendingMigrations(discover(sources), previous);
  if (pending.length === 0) {
    return { version: schemaVersion(db), applied: [] };
  }

  withForeignKeysOff(db, () => {
    for (const migration of pending) {
      apply(db, migration);
      options.onMigration?.(migration);
    }
  });

  return { version: schemaVersion(db), applied: pending };
}
