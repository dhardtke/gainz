---
date: 2026-09-10T09:03:16.851984+00:00
git_commit: b94d3a4e48d2a75c9746f279a7d667c8414ea26c
branch: main
topic: "SQL schema migrations and database-layer refactor"
tags: [plan, sqlite, bun-sqlite, migrations, repo, db, transactions]
status: complete
---

# PLAN: SQL schema migrations and a split database layer

Replace the single idempotent `SCHEMA` constant with a versioned, file-based migration system that
runs on startup, and refactor the database layer around it: split the 404-line `src/repo.ts` into one
module per entity behind an unchanged `Repo` facade, and close the two atomicity gaps the research
found.

Based on `docs/agents/research/2026-09-10-database-access-queries-and-schema.md`.

## Acceptance Criteria

- `migrations/001-initial-schema.sql` holds the schema; `src/db.ts` no longer contains a `SCHEMA`
  constant.
- Opening a database applies every pending migration in ascending version order, each inside its own
  transaction, and records it in a `schema_migrations` table (`version`, `name`, `applied_at`).
- Reopening an already-migrated database applies nothing and issues no DDL beyond the ledger's own
  `CREATE TABLE IF NOT EXISTS`.
- Opening the existing `data/gainz.sqlite` — schema present, no `schema_migrations` table — stamps it
  at version 1 without altering a single row, because migration 001 is today's idempotent DDL verbatim.
- A migration that throws part-way leaves the database exactly as it was and aborts startup with the
  offending filename in the error message.
- Foreign keys are `OFF` for the duration of the run and `ON` again afterwards, including after a
  failure; a migration that leaves orphaned rows fails `PRAGMA foreign_key_check` and rolls back.
- The runner refuses to run when: two files share a version number; a `.sql` file does not match
  `<version>-<name>.sql`; an applied version has no corresponding file; or a new file is numbered at
  or below the highest already-applied version.
- `bun run migrate` applies pending migrations and prints the resulting schema version without booting
  the server.
- `POST /api/workouts` with a `copy_from_workout_id` that does not exist returns 404 and leaves **no**
  workout behind.
- `bun run seed` commits its whole run as one transaction.
- `PRAGMA journal_mode = WAL` is still applied to file-backed databases and is not issued for
  `:memory:`, where SQLite ignores it.
- `src/repo/` contains one module per entity; `Repo`'s constructor and its 23 public method names are
  unchanged apart from `copySets`, which is removed — its behaviour folds into
  `createWorkout(input, { copyFrom })`, leaving 22.
- The dynamic-`UPDATE` construction exists in exactly one place.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass, and the existing
  HTTP test cases are unchanged in content.

## Technical Key Decisions and Tradeoffs

1. **No migration library — we own roughly 90 lines.** Bun 1.4.2 ships no migration facility;
   `bun:sqlite` is a synchronous better-sqlite3-style driver and the only migration material in Bun's
   own docs is the Prisma ecosystem guide. Every candidate package (`bun-migrate`,
   `bun-sqlite-migrations`, `@dnl-fm/bun-sqlite`) is third-party.
   - Why: a dependency for `readdirSync` plus `db.transaction()` is not a trade this project makes,
     and every dependency here is pinned and deliberate.
   - Impact: one new file, `src/migrations.ts`; no new `package.json` entry.

2. **Runner and CLI are separate files.** `src/migrations.ts` is the runner; `src/migrate.ts` is the
   CLI carrying the `import.meta.main` block, exactly parallel to `src/seed.ts`.
   - Why: `db.ts` must import the runner and the CLI must import `openDatabase`. Putting both in one
     file would make that a runtime import cycle. The runner's only reference to `db.ts` is
     `import type { DB }`, which `verbatimModuleSyntax` erases entirely.
   - Impact: the runtime import edge runs one way only, `db.ts → migrations.ts`.

3. **A `schema_migrations` table, prefix-checked.** `version INTEGER PRIMARY KEY`, `name`, `applied_at`.
   - Why: a legible, queryable history of what ran and when, rather than a bare integer.
   - Impact: the runner creates the table itself before reading it, and can detect a migration
     inserted _below_ the high-water mark — a check `PRAGMA user_version` could not express.

4. **Foreign keys off during the run, `PRAGMA foreign_key_check` inside each transaction, restored in
   a `finally`.**
   - Why: SQLite's [12-step table rebuild](https://www.sqlite.org/lang_altertable.html#otheralter) —
     the only way to change an existing column — requires foreign keys off, and `PRAGMA foreign_keys`
     is a **silent no-op inside a transaction**. Without this, the first rebuild migration would drop
     `workouts` with `ON DELETE CASCADE` live and take the user's `sets` with it.
   - Impact: table rebuilds are safe from day one; a migration that leaves orphans rolls back instead
     of committing corruption.

5. **`migrate(db, { dir })` takes the migrations directory as an option.**
   - Why: the failure, gap and duplicate paths can only be exercised against throwaway fixtures.
   - Impact: `test/migrate.test.ts` is the project's first non-HTTP test file, so the claim at
     `docs/backend.md:16` changes.

6. **`Repo` becomes a facade over `src/repo/`.** Same constructor, same 23 public method names.
   - Why: `routes.ts`, `seed.ts` and every existing test stay untouched, so the suite remains a valid
     check on a refactor it did not have to be rewritten for. `moduleResolution: "bundler"` resolves
     `./repo` through `src/repo/index.ts`, so even the import specifiers are unchanged.
   - Impact: the thrice-written dynamic-`UPDATE` builder (`repo.ts:146-153`, `264-271`, `337-344`)
     collapses into one `buildUpdate()`.

7. **`createWorkout(input, { copyFrom })` owns its transaction**; `copySets` leaves the public surface
   and the `INSERT … SELECT` moves into `workouts.ts`.
   - Why: the repo owns every database concern, atomicity included, and `routes.ts` stays free of
     orchestration. Keeping the copy in `sets.ts` would need `WorkoutRepo → SetRepo → WorkoutRepo`,
     a runtime constructor cycle.
   - Impact: an optional second parameter, so `seed.ts`'s `createWorkout(input)` is unchanged.

8. **`journal_mode = WAL` is skipped for `:memory:`**, where SQLite ignores it anyway.
   - Why: the research flagged it as an unexplained no-op.
   - Impact: one conditional in `openDatabase`.

## Current State

```
                     openDatabase(path)                       src/db.ts:47-58
                            │
      ┌─────────────────────┼──────────────────────────────┐
      │                     │                              │
  mkdirSync            PRAGMAs: journal_mode=WAL,     db.exec(SCHEMA)     ← one template literal,
  (skipped for         foreign_keys=ON,              src/db.ts:56           3 tables + 4 indexes,
   ":memory:")         busy_timeout=5000                                    every one IF NOT EXISTS

  Three call sites, all identical:
      src/server.ts:107    openDatabase(DEFAULT_DB_PATH)    → one long-lived Database
      src/seed.ts:50       openDatabase(DEFAULT_DB_PATH)
      test/api.test.ts:13  openDatabase(":memory:")         → a fresh DB per test (beforeEach)
```

There is no version tracking of any kind: no `schema_migrations` table, no `PRAGMA user_version`, no
numbered files, and no `ALTER TABLE` statement anywhere in the repository.

Layering today, and the two gaps this plan closes:

```
   HTTP request
        │
        ▼
   routes.ts ── validate.ts
        │   └── POST /api/workouts orchestrates create + requireWorkout + copySets
        │       as three separate auto-commits            ← GAP 1: not atomic
        ▼
    repo.ts   404 lines, 23 public methods, the only place SQL lives
        │     buildUpdate logic written out three times   ← GAP 2: triplication
        ▼
     db.ts    SCHEMA constant, re-executed on every open
```

`src/repo.ts` cross-references within itself: `createSet` calls `requireWorkout` and `requireExercise`
(`repo.ts:310-311`), `updateSet` calls `requireExercise` (`repo.ts:334`), and `exerciseBestSet`
returns a `LiftSet` (`repo.ts:199`). Those edges determine how the file can be split.

## Desired End State

```
                     openDatabase(path)
                            │
      ┌──────────┬──────────┴──────────┬──────────────────┐
      │          │                     │                  │
  mkdirSync   journal_mode=WAL    foreign_keys=ON     migrate(db)          ← src/migrations.ts
  (unless     (unless :memory:)   busy_timeout             │
   :memory:)                                               ▼
                                              CREATE TABLE IF NOT EXISTS schema_migrations
                                                           │
                                              discover migrations/*.sql, validate, sort
                                                           │
                                              PRAGMA foreign_keys = OFF
                                                           │
                                         ┌─────────────────┴──────────────────┐
                                         │  for each pending migration:       │
                                         │    BEGIN                           │
                                         │      <file contents>               │
                                         │      PRAGMA foreign_key_check      │  rows → throw
                                         │      INSERT INTO schema_migrations │
                                         │    COMMIT                          │
                                         └─────────────────┬──────────────────┘
                                                           │
                                              PRAGMA foreign_keys = ON   (finally)
```

```
migrations/
  001-initial-schema.sql          today's SCHEMA, verbatim, IF NOT EXISTS intact

src/
  migrations.ts   the runner: discover, validate, apply, record
  migrate.ts      the CLI (import.meta.main), parallel to seed.ts
  db.ts           connection + PRAGMAs only; no DDL
  repo/
    index.ts      Repo facade — new Repo(db), delegates each public method
    sql.ts        EST_1RM_SQL, EXERCISE_COLUMNS, SET_COLUMNS, isUniqueViolation, buildUpdate
    exercises.ts  ExerciseRepo + Exercise, ExerciseWithStats, SessionPoint, ExerciseInput
    workouts.ts   WorkoutRepo  + Workout, WorkoutWithStats, WorkoutInput
    sets.ts       SetRepo      + LiftSet, SetInput
    stats.ts      StatsRepo    + summary()
```

Module dependency graph, deliberately acyclic at runtime:

```
  sql.ts        (no imports)
     ▲  ▲  ▲
     │  │  └──────── stats.ts   (no repo imports)
     │  └────── workouts.ts     ── owns the workout INSERT and the copy INSERT…SELECT
     └──── exercises.ts  ┐
                         ├──type-only──► sets.ts   (ExerciseRepo / WorkoutRepo as parameter types)
        workouts.ts  ────┘
        exercises.ts ──type-only──► sets.ts   (LiftSet)
                                index.ts ──► all of the above  (the only value imports)
```

Every edge between the entity modules is type-only and therefore erased. `sets.ts` names
`ExerciseRepo` and `WorkoutRepo` only as constructor parameter types — the instances are built in
`index.ts` and injected — so `import type` is correct on **both** sides of the `exercises ↔ sets`
pair. Writing either as a value import would turn that pair into a genuine runtime cycle, so both
Phase 2 tasks call it out explicitly.

## Abstractions and Code Reuse

Reused as-is: `HttpError`/`notFound`/`conflict` from `src/http.ts` (`Repo` keeps throwing them), the
`db.query<Row, Params>()` typed-generic pattern, the snake_case row interfaces, and
`db.transaction()` from `bun:sqlite` — which begins a transaction on call, commits on return, and
**rolls back and rethrows on a thrown exception**, which is exactly the semantics both the migration
runner and the atomic workout creation need.

`db.transaction()` also **nests**: Bun's documentation states that calling a transaction function
from inside another turns the inner one into a `SAVEPOINT`. Phase 3 relies on this — the seeder wraps
its whole run in a transaction and calls `createWorkout`, which opens one of its own — so no
conditional-transaction workaround is needed.

New abstractions, all small:

- `Migration` / `MigrateResult` — plain data describing a discovered file and the outcome of a run.
  Note the two distinct strings: `name` is the kebab part only (`initial-schema`) and is what the
  ledger stores, while the human-facing log and error lines use the full file stem
  (`001-initial-schema`) via `basename(file, ".sql")`.
- `buildUpdate(table, fields, patch)` — the one dynamic-`UPDATE` builder, returning `null` when the
  patch touches no allowed field. Field names still come from a hard-coded `as const` tuple, never
  from user keys, so the injection-safety property of the current code is preserved verbatim.
- `ExerciseRepo` / `WorkoutRepo` / `SetRepo` / `StatsRepo` — one class per entity, each taking the
  `DB` (and the sibling repos it needs) in its constructor.

File tree of changes:

- `migrations/`
  - `001-initial-schema.sql` — new. The `SCHEMA` string from `src/db.ts:5-39`, moved verbatim.
- `src`
  - `migrations.ts` — new. The runner.
    - `MIGRATIONS_DIR` — resolved from `import.meta.dir`
    - `migrate(db, options)` — discover, validate, apply, record; returns `MigrateResult`
    - `schemaVersion(db)` — highest applied version, `0` on an unmigrated database
  - `migrate.ts` — new. CLI entry point for `bun run migrate`.
  - `db.ts` — `SCHEMA` deleted; `openDatabase` gains an optional `onMigration` callback and skips WAL
    for `:memory:`.
    - `openDatabase` — calls `migrate(db)` after the PRAGMAs
  - `repo.ts` — deleted; replaced by `src/repo/`.
  - `repo/index.ts` — new. `Repo` facade.
  - `repo/sql.ts` — new. Shared fragments, `isUniqueViolation`, `buildUpdate`.
  - `repo/exercises.ts` — new. `ExerciseRepo`, 8 methods moved from `repo.ts:94-211`.
  - `repo/workouts.ts` — new. `WorkoutRepo`, 7 methods from `repo.ts:215-281`, plus the copy.
  - `repo/sets.ts` — new. `SetRepo`, 6 methods from `repo.ts:285-366`.
  - `repo/stats.ts` — new. `StatsRepo`, `summary()` from `repo.ts:370-403`.
  - `routes.ts` — `POST /api/workouts` collapses from four calls to one.
  - `seed.ts` — writing run wrapped in `db.transaction`.
  - `server.ts` — reports applied migrations at boot.
- `test`
  - `migrate.test.ts` — new. Unit tests for the runner against fixture directories.
  - `api.test.ts` — two cases added for copy-workout atomicity; existing cases untouched.
- `docs/backend.md` — layering sentence, the "no migrations" paragraph, the "no unit tests" sentence.
- `README.md` — Layout tree, script table, the database paragraph, Data model.
- `CLAUDE.md` — commands block and architecture list.

## Logging & Observability

The runner itself never writes to the console — it returns `MigrateResult` and takes an optional
`onMigration` callback — because `openDatabase` is called once per test in a ~30-test suite and must
stay silent there.

One wording, used by both callers: `applied <file stem>`, i.e. `basename(m.file, ".sql")`, **not**
`m.name` — which holds only the kebab part. The CLI indents it two spaces because it sits under a
`database:` header; the server prints it flush.

Server boot with a pending migration:

```
applied 002-add-exercise-archived
gainz is lifting on http://localhost:3000/
  database: data/gainz.sqlite
```

Server boot with nothing pending is byte-for-byte what it prints today.

The CLI:

```
$ bun run migrate
database: data/gainz.sqlite
  applied 001-initial-schema
now at schema version 1

$ bun run migrate
database: data/gainz.sqlite
already at schema version 1 — nothing to apply
```

Failures abort startup, and every message names the file:

```
Migration 003-split-notes.sql failed and was rolled back: no such column: note_text
Migration 004-backfill.sql left orphaned rows in "sets"
Migrations "002-add-archived.sql" and "002-add-tags.sql" share version 2
Migration 002-late-addition.sql is numbered at or below the highest applied version (5) but has never run
Database has migration 6 (add-programs) applied, but no matching file exists in migrations/
```

## Implementation

### Phase 1: Versioned schema migrations

Dependencies: None.

Move the schema into a numbered SQL file and build the runner that applies it. This phase must leave
an existing `data/gainz.sqlite` byte-identical in content — migration 001 is the current idempotent
DDL, so applying it to a populated database is a no-op that only writes the ledger row.

**Tasks**:

- [x] Create `migrations/001-initial-schema.sql` containing the `SCHEMA` template literal from
      `src/db.ts:5-39` verbatim — all three `CREATE TABLE IF NOT EXISTS` and all four
      `CREATE INDEX IF NOT EXISTS` statements, unchanged.
- [x] Add a leading SQL comment to `001-initial-schema.sql` explaining that its `IF NOT EXISTS`
      guards exist so databases created before the migration system adopt cleanly, and that later
      migrations need not use them.
- [x] Create `src/migrations.ts` with the `Migration` and `MigrateResult` interfaces and
      `MIGRATIONS_DIR`, resolved as `resolve(import.meta.dir, "../migrations")`.
      `ts
export interface Migration {
  version: number;
  name: string;
  file: string; // absolute path
}
export interface MigrateResult {
  version: number; // highest applied version after the run
  applied: Migration[]; // what this run applied, in order
}
`
- [x] Add the ledger DDL constant and `schemaVersion(db)` to `src/migrations.ts`.
      `sql
CREATE TABLE IF NOT EXISTS schema_migrations (
  version    INTEGER PRIMARY KEY,
  name       TEXT    NOT NULL,
  applied_at TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
);
`
      Match the `strftime` default used by the three existing tables. `schemaVersion(db)` must not
      assume the table exists — probe `sqlite_master` for it and return `0` when absent, rather than
      letting `SELECT MAX(version) FROM schema_migrations` throw "no such table".
- [x] Add file discovery to `src/migrations.ts`: `readdirSync(dir)`, keep `*.sql`, match each against
      `/^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/`, throw on a non-matching `.sql` file, throw on a
      duplicate version naming both files, and sort ascending by version. Note that
      `noUncheckedIndexedAccess` makes the regex groups `string | undefined` — narrow them, do not
      assert with `!`.
- [x] Add the consistency check: every version in `schema_migrations` must have a matching file, and
      no file numbered at or below the highest applied version may be unapplied. Throw with the
      messages listed under Logging & Observability.
- [x] Implement `migrate(db, options)` with the apply loop.
      ```ts
      export interface MigrateOptions {
        dir?: string;
        onMigration?: (migration: Migration) => void;
      }

      export function migrate(db: DB, options: MigrateOptions = {}): MigrateResult {
        // exec ledger DDL, discover, read applied rows, assert consistency
        if (pending.length === 0) { return { version: current, applied: [] }; }
        db.exec("PRAGMA foreign_keys = OFF;");
        try {
          for (const migration of pending) {
            try {
              db.transaction(() => {
                db.exec(readFileSync(migration.file, "utf8"));
                const orphans = db.query<{ table: string }, []>("PRAGMA foreign_key_check").all();
                if (orphans.length > 0) { throw new Error(/* names orphans[0].table */); }
                db.query("INSERT INTO schema_migrations (version, name) VALUES (?, ?)")
                  .run(migration.version, migration.name);
              })();
            } catch (err) {
              throw new Error(`Migration ${basename(migration.file)} failed and was rolled back: …`,
                              { cause: err });
            }
            applied.push(migration);
            options.onMigration?.(migration);
          }
        } finally {
          db.exec("PRAGMA foreign_keys = ON;");
        }
        return { version, applied };
      }
      ```
      The `finally` is what guarantees foreign keys come back on after a failure. `orphans[0]` is
      `T | undefined` under `noUncheckedIndexedAccess` — narrow it, as with the regex groups above.

- [x] Delete the `SCHEMA` constant from `src/db.ts` and replace `db.exec(SCHEMA)` with `migrate(db, { onMigration })`.
- [x] Give `openDatabase` an optional second parameter `onMigration?: (m: Migration) => void`,
      forwarded to `migrate`. Existing call sites pass nothing and are unchanged.
- [x] Guard `PRAGMA journal_mode = WAL` in `src/db.ts` so it is only issued when the path is not
      `":memory:"`, reusing the condition that already guards `mkdirSync`.
- [x] Create `src/migrate.ts`: an `import.meta.main` CLI modelled on `src/seed.ts`. It prints
      `database: <path>`, calls `openDatabase(DEFAULT_DB_PATH, onMigration)` where the callback logs
      `  applied ${basename(m.file, ".sql")}`, then prints either
      `now at schema version N` or `already at schema version N — nothing to apply` depending on
      whether the callback fired, and closes the database.
- [x] Add `"migrate": "bun run src/migrate.ts"` to the `scripts` block in `package.json`.
- [x] Report applied migrations at boot in `src/server.ts:107` by passing an `onMigration` callback to
      `openDatabase` that logs `applied ${basename(m.file, ".sql")}` flush-left, before the two
      existing startup lines. A boot with nothing pending prints exactly what it prints today.
- [x] Create `test/migrate.test.ts` with a `beforeEach`/`afterEach` that makes and removes a temp
      fixture directory via `mkdtempSync(join(tmpdir(), "gainz-migrations-"))` and
      `rmSync(dir, { recursive: true, force: true })`, plus a helper that writes a numbered `.sql`
      file into it.
- [x] Test: `migrate` applies every fixture migration to a fresh `:memory:` database, in ascending
      order, and returns them in `applied`.
- [x] Test: a second `migrate` call on the same database returns `applied: []` and the same version.
- [x] Test: adding a new fixture file applies only that one.
- [x] Test: a fixture whose SQL is invalid throws, the error message contains the filename, the
      table it tried to create does not exist, and `schema_migrations` has no row for it.
- [x] Test: a fixture numbered at or below the highest applied version but never applied throws.
- [x] Test: two fixtures sharing a version number throw, naming both files.
- [x] Test: a `.sql` file whose name does not match `<version>-<name>.sql` throws.
- [x] Test: a database whose `schema_migrations` names a version with no corresponding file throws —
      insert a ledger row for version 99 by hand, then call `migrate`.
- [x] Test: a fixture that inserts a row referencing a missing parent fails `foreign_key_check`,
      rolls back, and leaves no row behind.
- [x] Test: `PRAGMA foreign_keys` reads `1` after a successful run and after a failed one.
- [x] Test: `openDatabase(":memory:")` yields `exercises`, `workouts`, `sets` and
      `schema_migrations`, and `schemaVersion(db)` returns `1`.
- [x] Test: `openDatabase` against a file path in a temp directory reports
      `PRAGMA journal_mode` = `wal`, proving the WAL guard did not disable it for real databases.
      (The `:memory:` half of that criterion is not observable — SQLite reports `memory` either way —
      so it rests on the guard being visible in `src/db.ts`.) Remove the file and its `-wal`/`-shm`
      sidecars in `afterEach`.
- [x] Test: a database that already has the tables but no ledger — built by executing
      `001-initial-schema.sql` by hand against a fresh `:memory:` database — is stamped at version 1
      by `migrate` without error. This is the on-disk `data/gainz.sqlite` adoption path.
- [x] Update `docs/backend.md`: change the layering sentence to `db.ts` (connection + PRAGMAs) →
      `migrations.ts` (schema), replace the "There are no migrations" paragraph at lines 11-13 with a
      description of the runner — numbered files, one transaction each, `schema_migrations`, foreign
      keys off during the run — and amend the line 16 sentence so it no longer claims the suite is
      exclusively end-to-end.
- [x] Update `README.md`: add `bun run migrate` to the script table (lines 21-27), add `migrations/`,
      `src/migrations.ts`, `src/migrate.ts` and `test/migrate.test.ts` to the Layout tree
      (lines 64-94), and extend the database paragraph at lines 29-30 to say the schema is applied by
      numbered migrations on startup.
- [x] Add a short paragraph to `README.md`'s Data model section (line 233) explaining how to add a
      migration: create `migrations/<next>-<name>.sql`, restart, done.
- [x] Update `CLAUDE.md`: add `bun run migrate` to the commands block and `migrations/` to the
      architecture list.

**Automated Verification**:

- [x] `bun test test/migrate.test.ts` passes.
- [x] `bun test` passes with the existing `test/api.test.ts` cases unmodified.
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `@(Select-String -Path src/db.ts -Pattern "CREATE TABLE").Count` is 0.
- [x] `$env:GAINZ_DB = ":memory:"; bun run migrate` prints `applied 001-initial-schema` and
      `now at schema version 1`. Unset `GAINZ_DB` afterwards.

**Manual Verification**:

- [x] Against your real `data/gainz.sqlite`: note `bun run seed`'s summary counts before, run
      `bun run migrate`, and confirm the counts are identical afterwards and the app still loads its
      history at `http://localhost:3000`.

### Phase 2: Split the repository layer

Dependencies: Phase 1.

A pure refactor with no user-visible surface, which is a deliberate exception to vertical slicing —
its safety comes from the ~30 existing HTTP tests passing without a single edit. Move the SQL into one
module per entity behind a facade, and collapse the triplicated `UPDATE` builder.

**Tasks**:

- [x] Create `src/repo/sql.ts` holding `EST_1RM_SQL`, `EXERCISE_COLUMNS`, `SET_COLUMNS` and
      `isUniqueViolation`, moved verbatim from `repo.ts:80-87`.
- [x] Add `buildUpdate` to `src/repo/sql.ts`.
      ```ts
      export interface UpdateStatement {
        sql: string;
        values: (string | number | null)[];
      }

      /** Builds `UPDATE <table> SET a = ?, b = ? WHERE id = ?`, or null when the patch is empty. */
      export function buildUpdate<T extends object, F extends Extract<keyof T, string>>(
        table: string,
        fields: readonly F[],
        patch: Partial<T>,
      ): UpdateStatement | null;
      ```
      Field names come only from the `fields` tuple, never from `Object.keys(patch)`. It must test
      membership with `field in patch` and push `patch[field] ?? null`, matching `repo.ts:149-151`
      exactly — `patch[field] !== undefined` would change how an explicit `null` is treated.

- [x] Create `src/repo/exercises.ts`: the `Exercise`, `ExerciseWithStats`, `SessionPoint` and
      `ExerciseInput` interfaces plus an `ExerciseRepo` class with `list`, `get`, `require`, `create`,
      `update`, `delete`, `progress` and `bestSet`, moved from `repo.ts:94-211`. Import `LiftSet` from
      `./sets` with `import type` so no runtime edge is created.
- [x] Create `src/repo/workouts.ts`: `Workout`, `WorkoutWithStats`, `WorkoutInput` and a `WorkoutRepo`
      with `list`, `count`, `get`, `require`, `create`, `update` and `delete`, from `repo.ts:215-281`.
- [x] Create `src/repo/sets.ts`: `LiftSet`, `SetInput` and a `SetRepo` taking
      `(db, workouts: WorkoutRepo, exercises: ExerciseRepo)`, with `list`, `get`, `require`, `create`,
      `update`, `delete` and `copyInto`, from `repo.ts:285-366`. Import `WorkoutRepo` and
      `ExerciseRepo` with `import type` — they appear only as constructor parameter types, and a value
      import here would close a runtime cycle with `exercises.ts`.
- [x] Create `src/repo/stats.ts`: a `StatsRepo` with `summary()`, from `repo.ts:370-403`.
- [x] Rewrite the three `update*` methods to use `buildUpdate`, keeping each one's existing
      pre-checks. The shared skeleton, with the leading `require` intact:
      `ts
// ExerciseRepo.update — the only one that can hit a unique index
this.require(id);                                     // repo.ts:144
const update = buildUpdate("exercises", ["name", "muscle_group", "notes"] as const, patch);
if (update) {
  try { this.db.query(update.sql).run(...update.values, id); }
  catch (err) { if (isUniqueViolation(err)) { throw conflict(…); } throw err; }
}
return this.require(id);                              // repo.ts:155 / :166
`
      Let the type arguments infer — TypeScript requires all type arguments or none, so an explicit
      `buildUpdate<ExerciseInput, …>` does not compile.
      This preserves behaviour exactly, including the SELECT count: all three methods issue two reads
      on every path today, and still do. `updateExercise`'s current early return (`repo.ts:154-156`)
      also skipped the `try`/`catch`, and with no assignments there is nothing that can conflict.
- [x] Keep `WorkoutRepo.update` and `SetRepo.update` free of the `isUniqueViolation` catch — neither
      `workouts` nor `sets` carries a unique index, so it would be dead code needing an invented
      conflict message. Only `ExerciseRepo.update` gets it, matching `repo.ts:160-165`.
- [x] Preserve `SetRepo.update`'s `requireExercise(patch.exercise_id)` guard (`repo.ts:333-335`).
      Dropping it is observable: patching a set with an unknown `exercise_id` currently returns a 404
      naming "Exercise"; without the guard SQLite's `ON DELETE RESTRICT` raises a raw error that
      `errorResponse` turns into a 500.
- [x] Create `src/repo/index.ts` with the `Repo` facade: construct the four sub-repos in the
      constructor in dependency order (`exercises`, `workouts`, then `sets`, then `stats`), and expose
      one delegating method per current public method, keeping every name identical.
- [x] Re-export `Exercise`, `ExerciseWithStats`, `ExerciseInput`, `Workout`, `WorkoutWithStats`,
      `WorkoutInput`, `LiftSet`, `SetInput` and `SessionPoint` from `src/repo/index.ts` so
      `routes.ts:2`'s `import type { ExerciseInput, Repo, SetInput, WorkoutInput } from "./repo"`
      resolves unchanged.
- [x] Delete `src/repo.ts`.
- [x] Update the layering sentence in `docs/backend.md:3-6` to describe `repo/` as a facade over one
      module per entity, and state that all SQL still lives under `repo/` and nowhere else.
- [x] Update the `src/` tree in `README.md:65-72`, replacing `repo.ts` with the `repo/` directory and
      its six files.

**Automated Verification**:

- [x] `bun test` passes with `test/api.test.ts` byte-identical to its Phase 1 state.
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `git diff HEAD --stat -- test/api.test.ts` is empty for this phase (`HEAD` so a staged edit is
      caught too).
- [x] No SQL keyword survives outside `src/repo/` and `src/migrations.ts`. Glob only the top level, so
      the excluded directories never enter the result set:
      `@(Select-String -CaseSensitive -Path src/*.ts -Pattern "\b(SELECT|INSERT INTO|UPDATE |DELETE FROM|CREATE TABLE)\b" | Where-Object { $_.Filename -ne "migrations.ts" }).Count`
      is 0.
- [x] The dynamic-`UPDATE` builder exists in exactly one place:
      `@(Select-String -Path src/repo/*.ts -Pattern "export function buildUpdate").Count` is 1, and
      `@(Select-String -Path src/repo/*.ts -Pattern 'UPDATE \$\{').Count` is 1. (Do not assert on
      `assignments.push` — a `filter`/`map` implementation is equally valid and would score 0.)

### Phase 3: Atomic writes

Dependencies: Phase 2.

Close the two atomicity gaps the research recorded. Note this changes observable behaviour for one
endpoint, deliberately: `POST /api/workouts` with an unknown `copy_from_workout_id` currently returns
404 _and_ leaves an empty workout in the log. It will now return 404 and leave nothing. A malformed
(non-integer) `copy_from_workout_id` will likewise 400 before anything is written, because validation
now happens before the insert rather than after it.

**Tasks**:

- [x] Change `WorkoutRepo.create` to `create(input: WorkoutInput, options: { copyFrom?: number } = {})`
      and wrap its body in `this.db.transaction(...)`: require the source workout first, insert the new
      workout with `RETURNING`, then run the `INSERT INTO sets … SELECT` when `copyFrom` is set. Move
      that statement from `sets.ts` into `workouts.ts` — putting it in `SetRepo` would need
      `WorkoutRepo → SetRepo → WorkoutRepo`, a constructor cycle.
- [x] Widen the facade's delegate to `createWorkout(input: WorkoutInput, options?: { copyFrom?: number })`
      in `src/repo/index.ts` so `routes.ts` can pass the second argument through.
- [x] Remove `copySets` from the `Repo` facade in `src/repo/index.ts` and delete `SetRepo.copyInto`,
      taking the facade from 23 public methods to 22.
- [x] Simplify `POST /api/workouts` in `src/routes.ts:121-130` to a single `createWorkout` call.
      `ts
POST: async (req) => {
  const body = await readJsonObject(req);
  const workout = repo.createWorkout(readWorkoutBody(body), {
    copyFrom: isPresent(body, "copy_from_workout_id")
      ? requiredInt(body, "copy_from_workout_id", { min: 1 })
      : undefined,
  });
  return json({ ...workout, sets: repo.listSets(workout.id) }, 201);
},
`
- [x] Wrap the writing part of `src/seed.ts:59-98` — the exercise creation and the workout/set loops —
      in a single `db.transaction(...)()`, leaving the `countWorkouts()` guard and the closing
      `summary()` read outside it. The `createWorkout` calls inside it now open transactions of their
      own; that is fine, because a nested `db.transaction()` becomes a `SAVEPOINT`.
- [x] Add a test to `test/api.test.ts`: `POST /api/workouts` with `copy_from_workout_id` pointing at a
      non-existent id returns 404, and a following `GET /api/workouts` reports the same `total` as
      before the request.
- [x] Add a test to `test/api.test.ts`: `POST /api/workouts` with a non-integer
      `copy_from_workout_id` returns 400 and creates no workout.
- [x] Add a paragraph to `docs/backend.md` stating the rule that multi-statement writes belong inside
      a `Repo` method wrapped in `db.transaction()`, and that `routes.ts` never opens a transaction.
- [x] Add a sentence to `README.md` beside the `performed_on` note at line 231 stating that
      `copy_from_workout_id` copies the source session's sets atomically — an unknown id creates no
      workout at all. The Workouts table at line 214 lists the field in the request shape and needs no
      change.

**Automated Verification**:

- [x] `bun test` passes, including the two new atomicity cases.
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `@(Select-String -Path (Get-ChildItem -Recurse -Filter *.ts -Path src, test).FullName -Pattern "copySets").Count`
      is 0. (`-Path src/**/*.ts` must **not** be used — PowerShell does not recurse on `**`, so it
      would silently skip `src/routes.ts` and pass vacuously.)
- [x] `@(Select-String -Path src/routes.ts -Pattern "transaction").Count` is 0.
- [x] The seeder runs green against a scratch database:
      `powershell
$env:GAINZ_DB = "$env:TEMP\gainz-seed-check.sqlite"
bun run seed          # expect non-zero workout and set counts
Remove-Item "$env:TEMP\gainz-seed-check.sqlite*"
Remove-Item Env:\GAINZ_DB
`
      The trailing `*` also clears the `-wal` and `-shm` sidecars. Note this proves the seeder still
      works, not that it used one transaction — that rests on the shape check below.
- [x] `@(Select-String -Path src/seed.ts -Pattern "db\.transaction").Count` is 1.

**Manual Verification**:

- [x] In the running app, open a workout, use "repeat this session" against a valid workout and
      confirm the sets are copied as before.

## Implementation Notes

**`db.close()` does not release the file on Windows.** The WAL test failed with `EBUSY` when
`rmSync` tried to remove the temp directory. `bun:sqlite` documents the cause: statements from
`prepare()` keep the connection alive until they are finalized or garbage collected, and only
`close(true)` finalizes them and releases the connection immediately. The test now calls
`close(true)`; `rmSync` also got `maxRetries`/`retryDelay` as a second line of defence. Worth
remembering for any future test that opens a file-backed database.

**`PRAGMA foreign_key_check` uses `prepare()`, not `query()`.** `query()` caches the prepared
statement by SQL text on the `Database`, and the runner executes this one immediately after DDL has
changed the schema underneath it. `prepare()` does not cache, which is what we want here.

**The orphan-migration error reads slightly differently from the plan's sample.** The inner throw
says `it left orphaned rows in "sets"` and the outer wrapper prefixes it, so the real message is
`Migration 004-backfill.sql failed and was rolled back: it left orphaned rows in "sets"` rather than
the plan's shorter sample. One code path for all migration failures seemed better than two.

**The new atomicity tests do not exercise rollback.** `createWorkout` validates `copyFrom` before
inserting, so an unknown id fails fast and nothing is written — the tests pass on the fail-fast
ordering alone. The transaction is still load-bearing for a failure in the copy step itself (the
`INSERT … SELECT` failing after the workout row exists), but that is not reachable over HTTP without
concurrency, so it is covered by construction rather than by a test.

**`CLAUDE.md` is a symlink to `AGENTS.md`.** Edits have to go to the target; writing through the
link is refused.

**`bun run fmt:check` cannot pass repo-wide, and could not before this work.** Four tracked files
under `.agents/skills/` and `docs/agents/research/2026-09-10-…md` are already unformatted on `main`.
Verification was therefore scoped to `oxfmt --check src test migrations`, which is clean. Fixing the
pre-existing files is a separate, unrelated change.

## References

- `docs/agents/research/2026-09-10-database-access-queries-and-schema.md` — the research this plan is
  built on; the query catalogue, the "no migrations" finding, and the open questions about
  transactions and WAL on `:memory:`.
- `src/db.ts:5-39` — the `SCHEMA` constant that becomes `migrations/001-initial-schema.sql`.
- `src/db.ts:47-58` — `openDatabase`, where the runner is hooked in.
- `src/repo.ts:146-153`, `264-271`, `337-344` — the three copies of the dynamic-`UPDATE` builder.
- `src/routes.ts:121-130` — the non-atomic copy-workout flow.
- `src/seed.ts:59-98` — the seeder's per-statement auto-commits.
- `docs/backend.md:11-13`, `:16` — the documented rules this plan invalidates.
- [SQLite: making other kinds of table schema changes](https://www.sqlite.org/lang_altertable.html#otheralter)
  — the 12-step rebuild that requires `PRAGMA foreign_keys = OFF`.
- [SQLite: PRAGMA foreign_keys](https://www.sqlite.org/pragma.html#pragma_foreign_keys) — "This pragma
  is a no-op within a transaction."
- [bun:sqlite transactions](https://bun.com/docs/runtime/sqlite) — `db.transaction()` commits on
  return, rolls back on a thrown exception, and rethrows.
