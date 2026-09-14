---
date: 2026-09-14T17:37:06.280846+00:00
git_commit: 7c6ef930aafa082a425f40cc137429515d37c248
branch: main
topic: "How migrations.ts is built"
tags: [research, codebase, db, migrations, sqlite]
status: complete
---

# Research: How migrations.ts is built

## Research Question

How is `src/backend/db/migrations.ts` built — its structure, how it discovers and applies
migrations, what it guards against, and who calls it?

## Summary

`migrations.ts` is a self-contained, synchronous schema migration runner of about 165 lines over
`bun:sqlite`. It reads numbered `.sql` files from `src/backend/db/migrations/`, records applied
ones in a `schema_migrations` ledger table, and applies pending files in version order, each in
its own transaction. Foreign-key enforcement is switched off for the whole run and restored in a
`finally`; each migration must pass `PRAGMA foreign_key_check` before its transaction commits. It
refuses to run (throws) when filenames are malformed, versions collide, the database has a version
the checkout lacks, or an unapplied file is numbered at or below the highest applied version.

It exports three values (`MIGRATIONS_DIR`, `schemaVersion`, `migrate`) and three types
(`Migration`, `MigrateResult`, `MigrateOptions`). It does no logging; progress is reported through
an `onMigration` callback. The only production caller is `openDatabase()` in `db.ts`, which runs it
on every open — so the server, the `migrate` script, the `seed` script and every test database are
migrated the same way.

```
src/
├── backend/
│   ├── main.ts                        server entry; openDatabase + log per applied migration
│   ├── testing.ts                     useTempDir(), tables() used by the runner tests
│   └── db/
│       ├── db.ts                      openDatabase(): PRAGMAs, then migrate()
│       ├── db.test.ts                 real migrations via openDatabase
│       ├── migrations.ts              the runner
│       ├── migrations.test.ts         runner unit tests on fixture dirs + legacy adoption
│       └── migrations/
│           └── 001-initial-schema.sql exercises, workouts, sets + indexes
└── scripts/
    ├── migrate.ts                     `bun run migrate`: openDatabase + report, then close
    └── seed.ts                        `bun run seed`: openDatabase (migrates implicitly)
```

```
openDatabase(path, onMigration?)                      db.ts:12
  ├─ mkdir, new Database, WAL, foreign_keys=ON, busy_timeout
  └─ migrate(db, { onMigration })                      migrations.ts:118
       ├─ CREATE TABLE IF NOT EXISTS schema_migrations  (LEDGER)
       ├─ discover(dir)            → Migration[] sorted, validated names/versions
       ├─ SELECT version, name FROM schema_migrations
       ├─ assertConsistent(files, applied, dir)
       ├─ pending = files − applied   ── empty? return { version, applied: [] }
       ├─ PRAGMA foreign_keys = OFF
       ├─ for each pending:
       │    transaction {
       │      run file SQL
       │      PRAGMA foreign_key_check (prepare, uncached) → orphan? throw
       │      INSERT INTO schema_migrations
       │    }  on error → rethrow "Migration X failed and was rolled back: …"
       │    applied.push; onMigration?.(migration)
       ├─ finally: PRAGMA foreign_keys = ON
       └─ return { version: schemaVersion(db), applied }
```

## Detailed Findings

### Module header and imports

- A JSDoc block describes the module as a small runner applying numbered `.sql` files in ascending
  order, each in its own transaction, recorded in `schema_migrations` (`migrations.ts:1-5`).
- Imports: `readdirSync`, `readFileSync` from `node:fs`; `basename`, `join`, `resolve` from
  `node:path`; and `type DB` from `./db.ts` (`migrations.ts:6-8`). `DB` is an alias for
  `bun:sqlite`'s `Database` (`db.ts:6`). The import of `DB` is type-only, so the value-level
  dependency runs one way: `db.ts` imports `migrate` from `migrations.ts`.

### Public types

- `Migration` — `version: number` (leading number of the filename, the ordering key), `name: string`
  (the kebab part without the version; what the ledger stores), `file: string` (absolute path)
  (`migrations.ts:10-17`).
- `MigrateResult` — `version` (highest applied version after the run) and `applied: Migration[]`
  (what this run applied, empty when already up to date) (`migrations.ts:19-24`).
- `MigrateOptions` — optional `dir` (only tests override it) and optional
  `onMigration(migration)` called after each migration commits (`migrations.ts:26-31`).

### Constants

- `MIGRATIONS_DIR = resolve(import.meta.dir, 'migrations')` — the directory beside the module,
  resolved from Bun's `import.meta.dir`, so it does not depend on the working directory
  (`migrations.ts:33`).
- `LEDGER` — `CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT
  NOT NULL, applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')))`
  (`migrations.ts:35-41`). The timestamp format matches the `created_at` columns in
  `001-initial-schema.sql`.
- `FILENAME = /^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/` — at least three digits, a hyphen, then
  lowercase kebab-case segments (`migrations.ts:43-44`).
- `AppliedRow` — internal `{ version, name }` row type for ledger reads (`migrations.ts:46-49`).

### `schemaVersion(db)` — exported

- Checks `sqlite_master` for a `schema_migrations` table; returns `0` if absent, otherwise
  `MAX(version)` with `?? 0` for an empty ledger (`migrations.ts:51-58`).
- Used by `migrate()` for its return value, by `scripts/migrate.ts:18` for reporting, and by both
  test files.

### `discover(dir)` — internal

- Lists `dir` with `readdirSync`, skips non-`.sql` entries (`migrations.ts:65-68`).
- For each `.sql` entry, throws if it does not match `FILENAME` (`migrations.ts:70-73`), if the
  parsed version is below 1 — "version 0 means never migrated" (`migrations.ts:75-78`), or if the
  version is already taken by another file, tracked in a `Map<number, string>`
  (`migrations.ts:80-84`).
- Builds `{ version, name, file: join(dir, entry) }` and returns the list sorted numerically by
  version (`migrations.ts:86-89`). Sorting is numeric, not lexical, so `1000-…` sorts after `999-…`.

### `assertConsistent(files, applied, dir)` — internal

- The doc comment states the invariant: applied versions must form an unbroken prefix of the files
  on disk (`migrations.ts:92-95`).
- First loop: every ledger row must have a matching file; otherwise throws "the database is newer
  than this checkout" (`migrations.ts:97-104`).
- Second loop: computes the highest applied version; any file numbered at or below it that has not
  run throws with "renumber it above N" (`migrations.ts:106-114`).

### `migrate(db, options)` — exported

- Resolves `dir` from options or `MIGRATIONS_DIR` (`migrations.ts:119`).
- Creates the ledger, discovers files, reads applied rows ordered by version, and checks
  consistency before touching anything else (`migrations.ts:121-124`). All validation errors are
  thrown before any migration SQL runs.
- Computes `pending` as files whose version is not in the ledger; returns early with
  `{ version: schemaVersion(db), applied: [] }` when none (`migrations.ts:126-130`). The early
  return happens before the PRAGMA toggling, so an up-to-date database never has foreign keys
  switched off.
- Turns `PRAGMA foreign_keys = OFF` outside any transaction. The inline comment gives the reason:
  SQLite's 12-step table rebuild requires foreign keys off, and the PRAGMA is a silent no-op
  inside a transaction (`migrations.ts:134-137`).
- For each pending migration, `db.transaction(() => { … })()` (`migrations.ts:141-152`):
  - runs the whole file with `db.run(readFileSync(file, 'utf8'))` — a single multi-statement
    string;
  - runs `PRAGMA foreign_key_check` via `db.prepare()` rather than `db.query()`, because `query()`
    caches statements and the schema has just changed (`migrations.ts:144-149`); the first
    offending row's `table` becomes the error;
  - inserts `(version, name)` into `schema_migrations` inside the same transaction, so the ledger
    row and the schema change commit or roll back together.
- Any error is wrapped as `Migration <file> failed and was rolled back: <reason>` with the
  original as `cause` (`migrations.ts:153-156`). The loop stops at the first failure; earlier
  migrations in the same run stay committed.
- After each commit, the migration is pushed onto `applied` and `onMigration` is called
  (`migrations.ts:158-159`).
- `finally` restores `PRAGMA foreign_keys = ON` whether the loop finished or threw
  (`migrations.ts:161-163`). It sets ON unconditionally rather than restoring a prior value.
- Returns `{ version: schemaVersion(db), applied }` (`migrations.ts:165`).

### The migration files

- One file exists: `001-initial-schema.sql`, creating `exercises`, `workouts`, `sets` and four
  indexes. Every statement uses `IF NOT EXISTS` (`001-initial-schema.sql:1-33`).
- That `IF NOT EXISTS` is what lets the runner adopt a database created before migrations existed:
  on such a database the ledger is missing, `schemaVersion` is 0, 001 runs as a no-op against the
  existing tables and is recorded (`migrations.test.ts:141-156`).

### Callers

- `openDatabase(path, onMigration?)` creates the parent directory for file databases, opens the
  database, sets `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`, then calls
  `migrate(db, { onMigration })` and returns the handle (`db.ts:12-24`). It ignores the
  `MigrateResult`.
- `main.ts:6-8` passes a callback logging `applied <basename>` for each migration before starting
  the server.
- `scripts/migrate.ts:9-21` counts applied migrations through the callback, then prints either
  "now at schema version N" or "already at schema version N — nothing to apply" and closes. Its
  header comment notes the server does the same on boot. Wired as `bun run migrate`
  (`package.json:12`).
- `scripts/seed.ts:51`, `testing.ts:35` (`useServer`) and the facade tests call
  `openDatabase(':memory:')` / `openDatabase(DEFAULT_DB_PATH)` without a callback, so every test
  database is built by the real migrations.

### Tests

- `migrations.test.ts` drives the runner against a raw `new Database(':memory:')` with
  `foreign_keys = ON`, pointing `dir` at a per-test temp directory from `useTempDir()`
  (`migrations.test.ts:8-27`; `testing.ts:69-83`). Fixture files use invented tables (`widgets`,
  `gadgets`, `parts`).
- Cases in `describe('migration runner')` (`migrations.test.ts:33-138`): version-ordered apply of
  files written out of order; no-op re-run; pending-only apply; mid-file failure rolls back DDL and
  leaves version at 1; out-of-order late addition refused; duplicate version refused; malformed
  filename refused; database newer than checkout refused; orphaned rows caught by
  `foreign_key_check` and rolled back; foreign keys ON after both success and failure.
- `describe('the real migrations')` in `migrations.test.ts:140-157` covers adopting a legacy
  database that has the schema but no ledger, and checks existing rows survive.
- `db.test.ts:9-32` checks `openDatabase(':memory:')` produces the expected tables including
  `schema_migrations` at version 1, and that a file-backed database is in WAL mode.

## Code References

- `src/backend/db/migrations.ts:10-31` - `Migration`, `MigrateResult`, `MigrateOptions`
- `src/backend/db/migrations.ts:33` - `MIGRATIONS_DIR`
- `src/backend/db/migrations.ts:35-41` - `schema_migrations` ledger DDL
- `src/backend/db/migrations.ts:44` - filename regex
- `src/backend/db/migrations.ts:52-58` - `schemaVersion`
- `src/backend/db/migrations.ts:61-90` - `discover`
- `src/backend/db/migrations.ts:96-115` - `assertConsistent`
- `src/backend/db/migrations.ts:118-166` - `migrate`
- `src/backend/db/migrations.ts:137,162` - foreign keys OFF / ON around the run
- `src/backend/db/migrations.ts:141-152` - per-migration transaction
- `src/backend/db/db.ts:12-24` - `openDatabase` calling `migrate`
- `src/backend/db/migrations/001-initial-schema.sql` - the only migration
- `src/backend/main.ts:6-8` - server-boot logging callback
- `src/scripts/migrate.ts:9-21` - `bun run migrate`
- `src/backend/db/migrations.test.ts` - runner unit tests
- `src/backend/db/db.test.ts` - real migrations through `openDatabase`
- `docs/backend.md:136-142` - prose description of the migration model

## Architecture Documentation

- **Synchronous throughout.** Everything uses `bun:sqlite`'s synchronous API and `node:fs` sync
  calls; `migrate` returns a value, not a promise, and `openDatabase` can migrate inline.
- **Validate, then mutate.** Filename, version-uniqueness and ledger-consistency checks all run
  before the first migration's SQL executes.
- **One transaction per file, ledger row inside it.** A migration and its record commit atomically;
  a failure leaves the database at the previous version.
- **Foreign keys off at the connection level, integrity checked per migration.** The PRAGMA is set
  outside transactions, and `foreign_key_check` inside each transaction replaces the enforcement
  that was switched off.
- **Forward-only.** There are no down migrations and no rollback command; the ledger has no
  checksum column, so edits to an already-applied file are not detected.
- **No logging in the runner.** Output is the caller's concern, via `onMigration`.
- **Migrate on open.** Every consumer gets a current schema by calling `openDatabase`; the
  `migrate` script exists to do it without starting the server.
- **Injectable directory.** `options.dir` exists for tests; production always uses
  `MIGRATIONS_DIR`.

## Open Questions

None. `docs/agents/plans/2026-09-12-migrate-remaining-features.md` matches a filename search for
"migrat" but concerns reorganising features; it only cites `001-initial-schema.sql` as evidence.
