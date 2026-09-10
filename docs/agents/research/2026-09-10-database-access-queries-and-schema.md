---
date: 2026-09-10T08:28:18.478228+00:00
git_commit: b94d3a4e48d2a75c9746f279a7d667c8414ea26c
branch: main
topic: "How does the database access work (in terms of queries that are executed, schema migrations)?"
tags: [research, codebase, sqlite, bun-sqlite, repo, schema, queries]
status: complete
---

# Research: Database access — executed queries and schema migrations

## Research Question

How does the database access work (in terms of queries that are executed, schema migrations)?

## Summary

Database access is split across exactly two files. `src/db.ts` owns the connection and the
schema DDL; `src/repo.ts` owns every SQL statement the application ever executes. Nothing else
in the repository contains SQL — routes, the seeder and the tests all reach the database through
the `Repo` class.

**There is no migration system.** `openDatabase()` executes one `SCHEMA` string of idempotent
`CREATE TABLE IF NOT EXISTS` / `CREATE INDEX IF NOT EXISTS` statements on every process start
(`src/db.ts:5-39`, `src/db.ts:56`). There is no version table, no `user_version` pragma, no
migrations directory and no ordering mechanism. `docs/backend.md:11-13` states this explicitly
and notes that changing an existing column would require a hand-written path rather than an edit
to `SCHEMA`. Git history shows `src/db.ts` has been touched by two commits since the initial
import (`a43b5ef`, then `330e8e2 chore: Enable curly lint rule`), and the schema itself has never
been altered.

Access is fully synchronous. `bun:sqlite` is a blocking API, so route handlers call `Repo`
methods directly with no `await` and no connection pool; one `Database` instance is created at
startup and lives for the process (`src/server.ts:107`, closed in the signal handler at
`src/server.ts:116-122`). Every statement runs in SQLite's implicit auto-commit mode —
`db.transaction()` appears nowhere in the codebase.

Every value that reaches SQL does so as a `?` placeholder. The only string interpolation into SQL
text is column-name material: the two shared column lists (`src/repo.ts:82-83`), the Epley
expression (`src/repo.ts:80`), and the `SET` assignment lists in the three `update*` methods,
which are built by iterating a hard-coded `as const` field allowlist rather than over user keys
(`src/repo.ts:148`, `src/repo.ts:266`, `src/repo.ts:339`).

```
src/
  db.ts        Connection factory, PRAGMAs, the whole SCHEMA string, DEFAULT_DB_PATH
  repo.ts      The Repo class — every SQL statement in the project, 20 methods
  server.ts    Opens the database at startup, closes it on SIGINT/SIGTERM
  routes.ts    Calls Repo methods; contains no SQL
  seed.ts      Writes sample data through Repo; contains no SQL
  http.ts      HttpError / notFound / conflict — the errors Repo throws
  validate.ts  Bounds every field before it reaches a Repo method
test/
  api.test.ts  Opens a fresh :memory: database per test (beforeEach), closes it (afterEach)
docs/
  backend.md   States the "no migrations" rule (lines 11-13)
README.md      Data model and REST surface; DB path and GAINZ_DB override (lines 29-30)
```

Layering, and where SQL is allowed to live:

```
   HTTP request
        │
        ▼
   routes.ts ── validate.ts (bounds every field)
        │            └─ throws badRequest → 400
        ▼
     repo.ts  ◄── THE ONLY PLACE SQL EXISTS
        │            └─ throws notFound → 404, conflict → 409
        ▼
      db.ts   (one long-lived Database, opened once in server.ts)
        │
        ▼
   data/gainz.sqlite   (or :memory: under test)
```

## Detailed Findings

### Connection setup and PRAGMAs (`src/db.ts`)

`openDatabase(path)` (`src/db.ts:47-58`) performs five steps in order:

1. Unless the path is the literal `":memory:"`, it creates the parent directory with
   `mkdirSync(dirname(path), { recursive: true })` (`src/db.ts:48-50`).
2. Opens `new Database(path, { create: true })` (`src/db.ts:52`).
3. `PRAGMA journal_mode = WAL;` (`src/db.ts:53`).
4. `PRAGMA foreign_keys = ON;` (`src/db.ts:54`) — SQLite defaults this off, so this is what makes
   the `ON DELETE CASCADE` and `ON DELETE RESTRICT` clauses in the schema actually take effect.
5. `PRAGMA busy_timeout = 5000;` (`src/db.ts:55`).
6. `db.exec(SCHEMA)` (`src/db.ts:56`), which runs the entire multi-statement DDL block.

The database location is resolved once at module load: `DEFAULT_DB_PATH = process.env.GAINZ_DB ??
"data/gainz.sqlite"` (`src/db.ts:60`). Three call sites use it — `src/server.ts:107`,
`src/seed.ts:50`, and `test/api.test.ts:13` (which passes `":memory:"` instead).

`export type DB = Database` (`src/db.ts:41`) is the alias `Repo` is typed against
(`src/repo.ts:1`, `src/repo.ts:90`).

### The schema (`src/db.ts:5-39`)

Three tables and four indexes, every one guarded by `IF NOT EXISTS`:

| Object | Definition detail |
| --- | --- |
| `exercises` | `id INTEGER PRIMARY KEY AUTOINCREMENT`, `name TEXT NOT NULL`, `muscle_group TEXT`, `notes TEXT`, `created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))` (`db.ts:6-12`) |
| `idx_exercises_name` | `UNIQUE` on `exercises (name COLLATE NOCASE)` — case-insensitive name uniqueness (`db.ts:14`) |
| `workouts` | `id`, `performed_on TEXT NOT NULL`, `title TEXT`, `notes TEXT`, `created_at` with the same `strftime` default (`db.ts:16-22`) |
| `idx_workouts_performed_on` | `workouts (performed_on DESC)` (`db.ts:24`) |
| `sets` | `id`, `workout_id INTEGER NOT NULL REFERENCES workouts(id) ON DELETE CASCADE`, `exercise_id INTEGER NOT NULL REFERENCES exercises(id) ON DELETE RESTRICT`, `reps INTEGER NOT NULL`, `weight REAL NOT NULL`, `notes TEXT`, `position INTEGER NOT NULL DEFAULT 0`, `created_at` (`db.ts:26-35`) |
| `idx_sets_workout` | `sets (workout_id, position, id)` — matches the `listSets` ordering (`db.ts:37`) |
| `idx_sets_exercise` | `sets (exercise_id)` (`db.ts:38`) |

Timestamps are text: `created_at` is written by SQLite itself via `strftime`, while `performed_on`
is supplied by the application as a `YYYY-MM-DD` string validated at `src/validate.ts:71-77`.
Weights are stored as `REAL` and rounded to two decimals before they reach SQL
(`src/validate.ts:67`).

The relationship, as `README.md:236` renders it:

```
exercises ──< sets >── workouts
              ▲
              └── the fact table: one row per set performed,
                  carrying reps, weight, notes and position
```

### Schema migrations — the absence of a mechanism

Everything about schema evolution happens through the single `SCHEMA` constant:

- `SCHEMA` is a template literal of DDL statements (`src/db.ts:5-39`), applied with one
  `db.exec()` call (`src/db.ts:56`) on every open.
- Because every statement carries `IF NOT EXISTS`, re-running it against a populated database is
  a no-op; adding a new table or index to the string is picked up on the next start.
- There is no schema-version tracking of any kind: no `schema_migrations` table, no
  `PRAGMA user_version` read or write, no numbered migration files, and no `ALTER TABLE`
  statement anywhere in the repository.
- `docs/backend.md:11-13` records the consequence: "There are no migrations — `openDatabase()`
  applies idempotent `CREATE TABLE IF NOT EXISTS` DDL on every start. A schema change to an
  existing column needs a hand-written path, not just an edit to `SCHEMA`."
- The same code path runs for all three environments — the server, the seeder, and the test
  suite — so an in-memory test database is built by exactly the DDL the on-disk one is.

### Repo: the complete query catalogue (`src/repo.ts`)

`Repo` (`src/repo.ts:89-404`) holds the `Database` as `private readonly db` and exposes 20
methods. Three fragments are shared by interpolation:

- `EST_1RM_SQL = "s.weight * (1 + s.reps / 30.0)"` — the Epley formula (`src/repo.ts:80`), used
  in `exerciseProgress` and to order `exerciseBestSet`.
- `EXERCISE_COLUMNS` (`src/repo.ts:82`) and `SET_COLUMNS` (`src/repo.ts:83`) — projection lists;
  `SET_COLUMNS` includes `e.name AS exercise_name`, which is why every set-returning query joins
  `exercises`.

**Exercises**

| Method | Line | Statement(s) executed |
| --- | --- | --- |
| `listExercises` | 94-109 | One `SELECT` over `exercises` with `LEFT JOIN sets` and `LEFT JOIN workouts`, `GROUP BY e.id`, aggregating `COUNT(s.id)`, `COUNT(DISTINCT s.workout_id)`, `MAX(w.performed_on)`, `MAX(s.weight)`; `ORDER BY e.name COLLATE NOCASE ASC` |
| `getExercise` | 111-113 | `SELECT ${EXERCISE_COLUMNS} FROM exercises e WHERE e.id = ?` |
| `requireExercise` | 115-121 | Calls `getExercise`; throws `notFound("Exercise")` on null |
| `createExercise` | 123-141 | `INSERT INTO exercises (...) VALUES (?,?,?) RETURNING id, name, muscle_group, notes, created_at` |
| `updateExercise` | 143-167 | `requireExercise` (1 read), then a dynamic `UPDATE exercises SET <fields> WHERE id = ?`, then `requireExercise` again to return the row |
| `deleteExercise` | 169-176 | `requireExercise`, then `SELECT COUNT(*) AS n FROM sets WHERE exercise_id = ?`, then `DELETE FROM exercises WHERE id = ?` |
| `exerciseProgress` | 179-196 | `SELECT` over `sets JOIN workouts`, `WHERE s.exercise_id = ?`, `GROUP BY w.id`, aggregating `COUNT`, `SUM(reps)`, `SUM(reps*weight)`, `MAX(weight)`, `MAX(EST_1RM_SQL)`; `ORDER BY w.performed_on ASC, w.id ASC` |
| `exerciseBestSet` | 199-211 | `SELECT ${SET_COLUMNS}, w.performed_on` over `sets JOIN exercises JOIN workouts`, `ORDER BY EST_1RM_SQL DESC, s.weight DESC, s.reps DESC LIMIT 1` |

**Workouts**

| Method | Line | Statement(s) executed |
| --- | --- | --- |
| `listWorkouts` | 215-230 | One `SELECT` with `LEFT JOIN sets`, `GROUP BY w.id`, `COUNT(s.id)`, `COUNT(DISTINCT s.exercise_id)`, `COALESCE(SUM(reps),0)`, `COALESCE(SUM(reps*weight),0)`; `ORDER BY w.performed_on DESC, w.id DESC LIMIT ? OFFSET ?` |
| `countWorkouts` | 232-234 | `SELECT COUNT(*) AS n FROM workouts` |
| `getWorkout` | 236-238 | `SELECT id, performed_on, title, notes, created_at FROM workouts WHERE id = ?` |
| `requireWorkout` | 240-246 | `getWorkout`; throws `notFound("Workout")` |
| `createWorkout` | 248-259 | `INSERT INTO workouts (...) VALUES (?,?,?) RETURNING ...` |
| `updateWorkout` | 261-276 | `requireWorkout`, optional dynamic `UPDATE`, then `requireWorkout` again |
| `deleteWorkout` | 278-281 | `requireWorkout`, then `DELETE FROM workouts WHERE id = ?` — the child `sets` rows go with it through `ON DELETE CASCADE`, which works because of the `foreign_keys` pragma |

**Sets**

| Method | Line | Statement(s) executed |
| --- | --- | --- |
| `listSets` | 285-295 | `SELECT ${SET_COLUMNS} FROM sets s JOIN exercises e ON e.id = s.exercise_id WHERE s.workout_id = ? ORDER BY s.position ASC, s.id ASC` |
| `getSet` | 297-299 | Same join, `WHERE s.id = ?` |
| `requireSet` | 301-307 | `getSet`; throws `notFound("Set")` |
| `createSet` | 309-329 | `requireWorkout`, `requireExercise`, then — only when `position` was not supplied — `SELECT COALESCE(MAX(position), 0) + 1 AS next FROM sets WHERE workout_id = ?`, then `INSERT INTO sets (...) VALUES (?,?,?,?,?,?) RETURNING id`, then `requireSet(inserted.id)` to return the row with `exercise_name` joined in |
| `updateSet` | 331-349 | `requireSet`, plus `requireExercise` when `exercise_id` is in the patch, then a dynamic `UPDATE sets SET ... WHERE id = ?`, then `requireSet` again |
| `deleteSet` | 351-354 | `requireSet`, then `DELETE FROM sets WHERE id = ?` |
| `copySets` | 357-366 | A single `INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position) SELECT ?, exercise_id, reps, weight, notes, position FROM sets WHERE workout_id = ?`; returns `Number(result.changes)` |

**Stats**

`summary()` (`src/repo.ts:370-403`) runs exactly two queries and spreads the two result rows into
one object:

1. A single row of six scalar subqueries — `COUNT(*)` on `workouts`, `COUNT(*)` on `sets`,
   `COALESCE(SUM(reps),0)`, `COALESCE(SUM(reps*weight),0)`, `COUNT(*)` on `exercises`, and
   `MAX(performed_on)` (`src/repo.ts:383-388`).
2. A 30-day window: `workouts LEFT JOIN sets` filtered by
   `WHERE w.performed_on >= date('now', '-30 day')`, producing `COUNT(DISTINCT w.id)` and
   `COALESCE(SUM(s.reps * s.weight), 0)` (`src/repo.ts:394-398`). This is the only place the
   current date is computed inside SQLite rather than in TypeScript.

### Statement construction and parameter binding

Every statement is created with `this.db.query<Row, Params>(sql)` and then executed with `.all()`,
`.get()` or `.run()`. `query()` is `bun:sqlite`'s caching variant — the prepared statement is
retained on the `Database` instance keyed by SQL text — as distinct from `prepare()`, which does
not cache. Because the three `update*` methods assemble their `SET` clause from whichever fields
appear in the patch, each distinct combination of fields produces a distinct SQL string and
therefore its own cache entry.

The generic parameters are declared explicitly, so the row shape and the bound-parameter tuple are
both type-checked — for instance
`this.db.query<ExerciseWithStats, []>(...)` (`src/repo.ts:96`) and
`this.db.query<Exercise, [string, string | null, string | null]>(...)` (`src/repo.ts:126`). The
row interfaces themselves (`Exercise`, `ExerciseWithStats`, `Workout`, `WorkoutWithStats`,
`LiftSet`, `SessionPoint`) are declared at `src/repo.ts:4-54` and mirror the column names as
snake_case, which is also how they reach the JSON API.

Dynamic SQL is limited to the field-name loops:

```ts
for (const field of ["name", "muscle_group", "notes"] as const) {   // repo.ts:148
  if (field in patch) {
    assignments.push(`${field} = ?`);   // name comes from the literal tuple, value from `?`
    values.push(patch[field] ?? null);
  }
}
```

The same shape appears for workouts over `["performed_on", "title", "notes"]`
(`src/repo.ts:266`) and for sets over `["exercise_id", "reps", "weight", "notes", "position"]`
(`src/repo.ts:339`). When the patch touches none of the allowed fields, `updateExercise` returns
early without issuing an `UPDATE` (`src/repo.ts:154-156`), and `updateWorkout`/`updateSet` guard
the statement with `if (assignments.length > 0)` (`src/repo.ts:272`, `src/repo.ts:345`).

### Constraint violations and how they surface

Two schema constraints are handled, by two different strategies:

- **Unique name** — `createExercise` and `updateExercise` wrap their statement in `try/catch` and
  run `isUniqueViolation(err)` (`src/repo.ts:85-87`), which matches `/UNIQUE constraint failed/i`
  against the error message. A match is rethrown as `conflict(...)`, i.e. HTTP 409
  (`src/repo.ts:136-139`, `src/repo.ts:160-164`). Because the index is `COLLATE NOCASE`, this
  fires for a differently-cased duplicate too — covered by the test at `test/api.test.ts:117`.
- **`ON DELETE RESTRICT` on `sets.exercise_id`** — `deleteExercise` does not let the constraint
  fire. It counts referencing rows first and throws `conflict` with the count in the message
  (`src/repo.ts:171-174`), so the `DELETE` only runs when nothing points at the exercise.

Anything else propagates: `errorResponse` in `src/http.ts:25-31` logs the unrecognised error and
returns a generic `{ error: "Internal server error" }` with status 500. The three `RETURNING`
call sites also throw a plain `Error` if the insert somehow yields no row (`src/repo.ts:132`,
`src/repo.ts:256`, `src/repo.ts:326`), which lands in that same 500 path.

### Queries per HTTP request

Because the `require*` helpers each issue their own `SELECT`, most endpoints run more than one
statement. Counting the statements executed per request:

| Endpoint | Statements |
| --- | --- |
| `GET /api/health` | 0 (`routes.ts:61`) |
| `GET /api/stats/summary` | 2 (`summary`) |
| `GET /api/exercises` | 1 |
| `POST /api/exercises` | 1 |
| `GET /api/exercises/:id` | 1 |
| `PATCH /api/exercises/:id` | 3 (require + update + re-read), or 2 when the patch is empty |
| `DELETE /api/exercises/:id` | 3 (require + usage count + delete) |
| `GET /api/exercises/:id/progress` | 3 — `requireExercise`, `exerciseProgress`, `exerciseBestSet` (`routes.ts:103-107`) |
| `GET /api/workouts` | 2 — `listWorkouts` + `countWorkouts` (`routes.ts:118`) |
| `POST /api/workouts` | 2 plain; 5 with `copy_from_workout_id` — create, `requireWorkout` on the source, `copySets`, then `listSets` for the response (`routes.ts:121-130`) |
| `GET /api/workouts/:id` | 2 — `requireWorkout` + `listSets` (`routes.ts:136`) |
| `PATCH /api/workouts/:id` | 3, or 2 when the patch is empty |
| `DELETE /api/workouts/:id` | 2 — require + delete (the cascade is SQLite's own work) |
| `GET /api/workouts/:id/sets` | 2 — `requireWorkout` then `listSets` (`routes.ts:164-165`) |
| `POST /api/workouts/:id/sets` | 5 — require workout, require exercise, next-position, insert, re-read; 4 when `position` is supplied |
| `GET /api/sets/:id` | 1 |
| `PATCH /api/sets/:id` | 3, or 4 when `exercise_id` is in the patch |
| `DELETE /api/sets/:id` | 2 |

None of these sequences is wrapped in a transaction. `POST /api/workouts` with
`copy_from_workout_id` is the longest write sequence: the `INSERT` for the workout and the
`INSERT ... SELECT` for its sets are two separate auto-committed statements (`routes.ts:123-127`).

### Connection lifecycle

The server creates one database and one `Repo` at startup and hands the `Repo` to the route table:

```ts
const db = openDatabase(DEFAULT_DB_PATH);   // server.ts:107
const repo = new Repo(db);                  // server.ts:108
const server = Bun.serve({ port, ...serveOptions(repo) });   // server.ts:111
```

`serveOptions(repo)` (`src/server.ts:98-104`) builds `{ routes: apiRoutes(repo), fetch:
serveStatic, error }`, and is exported precisely so the test suite can reuse it. Shutdown stops
the server and then calls `db.close()` on `SIGINT`/`SIGTERM` (`src/server.ts:116-122`). The
selected path is echoed at boot (`src/server.ts:114`).

### Database access in the seeder (`src/seed.ts`)

The seeder contains no SQL. It opens the same `DEFAULT_DB_PATH` (`src/seed.ts:50`), constructs a
`Repo`, and guards itself with `repo.countWorkouts() > 0` — if the database already holds
workouts it prints a message and closes without writing (`src/seed.ts:53-57`). Otherwise it
writes through the public repository methods: six `createExercise` calls (`src/seed.ts:60-62`),
then a `createWorkout` plus a `createSet` per logged set across six weeks of three day-templates
(`src/seed.ts:67-98`), and finally reads `repo.summary()` for its console line
(`src/seed.ts:100-101`) before `db.close()`. Every insert is its own auto-committed statement.

### Database access under test (`test/api.test.ts`)

The suite is end-to-end over HTTP; `docs/backend.md:16` records that there are no unit tests of
`Repo`. `beforeEach` opens `openDatabase(":memory:")` and starts a real server on port 0 with
`serveOptions(new Repo(db))` (`test/api.test.ts:12-16`); `afterEach` stops the server and closes
the database (`test/api.test.ts:19-22`). Each test therefore runs the full `SCHEMA` DDL against a
brand-new in-memory database, and no state leaks between tests.

Tests that exercise database-level behaviour specifically:

- `test/api.test.ts:117` — duplicate name regardless of case (the `COLLATE NOCASE` unique index).
- `test/api.test.ts:134` — refusing to delete an exercise that has logged sets (the count guard).
- `test/api.test.ts:201` — deleting a workout removes its sets (the `ON DELETE CASCADE`).
- `test/api.test.ts:210` — copying sets from a previous workout (`copySets`).
- `test/api.test.ts:223` — workout list roll-up statistics (`listWorkouts` aggregates).
- `test/api.test.ts:240` — per-session aggregation and best set (`exerciseProgress`,
  `exerciseBestSet`).
- `test/api.test.ts:264` — the whole-log summary (`summary`).

## Code References

- `src/db.ts:5-39` — the complete `SCHEMA` string: three tables, four indexes, all `IF NOT EXISTS`
- `src/db.ts:47-58` — `openDatabase()`: mkdir, open, three PRAGMAs, `db.exec(SCHEMA)`
- `src/db.ts:53-55` — `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000`
- `src/db.ts:60` — `DEFAULT_DB_PATH = process.env.GAINZ_DB ?? "data/gainz.sqlite"`
- `src/repo.ts:80` — `EST_1RM_SQL`, the Epley expression interpolated into two queries
- `src/repo.ts:82-83` — `EXERCISE_COLUMNS` and `SET_COLUMNS` projection fragments
- `src/repo.ts:85-87` — `isUniqueViolation()`, a regex over the SQLite error message
- `src/repo.ts:94-211` — every exercise query, including the two aggregate/progress queries
- `src/repo.ts:215-281` — every workout query, including the paginated list and its `COUNT`
- `src/repo.ts:285-366` — every set query, including next-position lookup and `INSERT ... SELECT`
- `src/repo.ts:148`, `src/repo.ts:266`, `src/repo.ts:339` — the `as const` field allowlists that
  drive dynamic `UPDATE` construction
- `src/repo.ts:370-403` — `summary()`, the two statistics queries
- `src/server.ts:107-108` — the single `Database` and `Repo` for the process
- `src/server.ts:116-122` — `db.close()` on `SIGINT`/`SIGTERM`
- `src/seed.ts:50-57` — seeder opens the same path and short-circuits on `countWorkouts() > 0`
- `test/api.test.ts:12-22` — fresh `:memory:` database per test
- `docs/backend.md:11-13` — the documented "no migrations" rule
- `README.md:29-30` — DB path, `GAINZ_DB` override, created on first run, git-ignored
- `README.md:234-242` — the data model narrative

## Architecture Documentation

**One file owns all SQL.** `docs/backend.md:3-4` describes the layering as `db.ts` (connection +
schema DDL) → `repo.ts` (all SQL, one method per operation, returns typed rows) → `routes.ts` →
`server.ts`. The codebase holds to it: grepping for SQL keywords outside `db.ts` and `repo.ts`
returns nothing, and both `seed.ts` and `api.test.ts` go through `Repo`.

**Schema by idempotent DDL, applied on every open.** Rather than versioned migrations, the schema
is a single constant re-executed at startup. Additive changes propagate by themselves; the
documented boundary is that a change to an existing column needs a hand-written path.

**Method-per-operation, typed rows.** Each `Repo` method corresponds to one API operation and
declares both its row interface and its parameter tuple as generics on `db.query<Row, Params>()`.
Column names travel unchanged from SQL through the TypeScript interfaces into the JSON responses,
so `muscle_group`, `performed_on` and `exercise_id` are snake_case at every layer.

**Existence checks as reads that throw.** `requireExercise` / `requireWorkout` / `requireSet`
(`src/repo.ts:115`, `240`, `301`) turn a missing row into an `HttpError(404)` at the point of
lookup, which `guardAll()` in `routes.ts:11-23` converts into the JSON error body. This is why
mutating endpoints issue a read before their write and another read after it.

**Read-after-write for joined shapes.** `createSet` inserts with `RETURNING id` and then re-reads
through `requireSet` (`src/repo.ts:318-328`), because the response shape includes
`exercise_name`, which only the join produces. `createExercise` and `createWorkout` need no join
and return their full row directly from `RETURNING`.

**Aggregation pushed into SQL.** Set counts, volumes, rep totals, best weights, estimated 1RM and
the 30-day window are all computed by SQLite in `GROUP BY` / scalar-subquery form rather than in
TypeScript; no `Repo` method loops over rows to compute a total.

**Validation before SQL, constraints as a backstop.** `validate.ts` bounds every field — names to
120 characters, notes to 2000, reps to 1-1000, weight to 0-100000 rounded to two decimals, dates
to `YYYY-MM-DD`, path ids to positive integers — before any value reaches a statement
(`routes.ts:25-52`, `validate.ts:10-102`).

## Open Questions

- No `db.transaction()` call exists anywhere, so multi-statement sequences
  (`POST /api/workouts` with `copy_from_workout_id`, the seeder's run) commit statement by
  statement. Whether that is intended to change is not recorded in the codebase or the docs.
- `PRAGMA journal_mode = WAL` is set on every open including `:memory:`, where SQLite ignores it;
  no comment addresses that case.
- The schema has never been altered since the initial commit, so the "hand-written path" that
  `docs/backend.md:12-13` anticipates for a column change has no precedent in the repository to
  point at.
