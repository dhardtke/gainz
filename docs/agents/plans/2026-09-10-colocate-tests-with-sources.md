---
date: 2026-09-10T21:29:15+00:00
git_commit: 175a478d6e6c41b4b5ade482943fe5a0a5b1000c
branch: main
topic: "Move the test suite next to the source it exercises"
tags: [plan, testing, backend, refactor, bun-test]
status: draft
---

# PLAN: Move the test suite next to the source it exercises

Dissolve `backend/test/` and place every test file in the same directory as the module it
exercises, splitting the three test files that currently span several modules so the rule holds
without exception. The suite keeps all 53 tests; no test is renamed, deleted or added, and no
production code changes behaviour.

The starting point is the research document
`docs/agents/research/2026-09-10-test-suite-structure.md`, written at commit `2cecda6`, which maps
every describe block to the module it drives. This plan takes that mapping as given.

## Acceptance Criteria

- `backend/test/` no longer exists; every test file sits in the same directory as the source
  module it exercises.
- 53 tests still pass. No test is renamed, deleted, or added, and no new coverage is written.
- `bun run typecheck`, `bun run lint` and `bun run fmt:check` are clean.
- `backend/src/testing.ts` is the only module under `backend/src/` that ships no production code,
  and nothing in the production import graph reaches it.
- `README.md`, `docs/backend.md` and `AGENTS.md` describe the new layout, and `tsconfig.json` no
  longer names a directory that is gone.

## Technical Key Decisions and Tradeoffs

1. **Split by source module, not by relocation.** Six files become eleven, each beside the one
   module it exercises.
   - Why: makes "tests live next to the source" literally true, with no file left to explain.
   - Impact: `meta.api.test.ts`, `static.api.test.ts` and `migrate.test.ts` fan out. Describe
     blocks change home; test bodies and test names do not.

2. **The harness moves to `backend/src/testing.ts`.**
   - Why: nine of the eleven files import it, and a single module keeps the specifier short at
     both depths (`./testing` from `src/`, `../testing` from `src/routes/`).
   - Impact: one module under `src/` ships no production code. A doc comment on line 1 says so,
     since nothing else marks it.

3. **Strict grouping by declaring module, reversing `docs/backend.md:46-48`.** That paragraph
   records a deliberate choice to group tests by subject where routes group by URL, which is why
   set tests live apart from the workout routes that declare `POST /api/workouts/:id/sets`.
   - Why: it was the last exception standing between the layout and a single rule.
   - Impact: two of the three tests in `set.api.test.ts` move into `workout.routes.test.ts`;
     `set.routes.test.ts` keeps the one test that drives `/api/sets/:id`. The paragraph in
     `docs/backend.md` is rewritten rather than re-pathed.

4. **`useTempDir()` joins `useServer()` in `testing.ts`.**
   - Why: after the split both `migrations.test.ts` and `db.test.ts` need a throwaway directory,
     and the Windows `EBUSY` rationale behind `maxRetries: 5, retryDelay: 20` should be written
     once rather than twice.
   - Impact: `testing.ts` becomes the home for test lifecycle plumbing, not just for the server.

5. **Two assignments follow from decision 3 rather than from the describe blocks.** The HEAD test
   and the two path-guard tests currently sit in the `"typescript modules"` describe but assert
   `static.ts` and `paths.ts` behaviour, so they move to `static.test.ts`.
   - Why: `"answers HEAD with the headers and no body"` asserts that `static.ts` does not
     special-case HEAD — the `.ts` URL is incidental, and `docs/backend.md:62` cites the test for
     exactly that. The traversal probes assert the `paths.ts` escape guard as observed through the
     only module that calls `resolveStaticPath`.
   - Impact: `static.api.test.ts` splits 8/7, not 5/10. `static.test.ts` becomes "what the server
     serves and refuses"; `transpile.test.ts` becomes "what the transpiler outputs".

## Current State

Six test files in one flat directory, three of which fan out across several source modules:

```
backend/
  src/
    http.ts          readJsonObject ─────────────┐
    server.ts        serveOptions ───────────┐   │
    static.ts        serveStatic ────────┐   │   │
    paths.ts         resolve + guard ────┤   │   │
    transpile.ts     type erasure ───────┤   │   │
    migrations.ts    migrate() ──────┐   │   │   │
    db.ts            openDatabase ───┤   │   │   │
    routes/                          │   │   │   │
      meta.routes.ts ────────────────┼───┼───┼───┼──┐
      stats.routes.ts ───────────────┼───┼───┼───┼──┤
      exercise.routes.ts ────────────┼───┼───┼───┼──┼──┐
      workout.routes.ts ─────────────┼───┼───┼───┼──┼──┼──┐
      set.routes.ts ─────────────────┼───┼───┼───┼──┼──┼──┼──┐
  test/                              │   │   │   │  │  │  │  │
    helpers/server.ts   useServer()  │   │   │   │  │  │  │  │
    migrate.test.ts     13 ──────────┴───┘   │   │  │  │  │  │
    static.api.test.ts  15 ──────────────────┴───┘  │  │  │  │
    meta.api.test.ts     6 ──────── server.ts + http.ts + meta + stats
    exercise.api.test.ts 8 ─────────────────────────┼──┘  │  │
    workout.api.test.ts  8 ─────────────────────────┼─────┘  │
    set.api.test.ts      3 ─────────────────────────┼────────┘
```

Three facts make the move cheap. `bun test` discovers `*.test.ts` anywhere outside
`node_modules`, so co-location needs no configuration. `tsconfig.json:17` already includes
`backend/src`, so only its `"backend/test"` entry is dropped. And nothing at runtime enumerates
`backend/src` — `paths.ts` resolves under `frontend/` only and `MIGRATIONS_DIR` names
`backend/migrations` directly — so test files sitting in `src/` cannot leak into the served
surface.

`CLAUDE.md` is a symbolic link to `AGENTS.md`. Editing `AGENTS.md` updates both.

## Desired End State

Eleven test files, each beside its module, and one test-only support module:

```
backend/src/
  db.ts
  db.test.ts                 2   openDatabase: schema, WAL
  http.ts
  http.test.ts               2   readJsonObject: malformed, non-object
  migrations.ts
  migrations.test.ts        11   the runner, fixtures, legacy adoption
  server.ts
  server.test.ts             1   the Bun.serve error hook
  static.ts
  static.test.ts             8   serving, vendor allowlist, guard, HEAD
  transpile.ts
  transpile.test.ts          7   erasure, imports, the parse failure
  testing.ts                 -   useServer, useTempDir, body, at, envelopes
  paths.ts                       (no test file, as today)
  validate.ts                    (no test file, as today)
  repo/*.ts                      (no test files, as today)
  routes.ts                      (no test file, as today)
  main.ts, seed.ts, migrate.ts   (no test files, as today)
  routes/
    exercise.routes.ts
    exercise.routes.test.ts  8
    meta.routes.ts
    meta.routes.test.ts      2   health, the /api/* catch-all
    set.routes.ts
    set.routes.test.ts       1   PATCH/DELETE /api/sets/:id
    stats.routes.ts
    stats.routes.test.ts     1   the dashboard summary
    workout.routes.ts
    workout.routes.test.ts  10   8 existing + 2 regrouped set tests
    shared.ts                    (no test file, as today)
```

`2 + 2 + 11 + 1 + 8 + 7 + 8 + 2 + 1 + 1 + 10 = 53`, the count the suite reports today.

This plan adds no coverage. `paths.ts`, `validate.ts`, `repo/`, `routes.ts`, `main.ts`, `seed.ts`
and `migrate.ts` have no test file today and get none here.

## Abstractions and Code Reuse

The harness is reused wholesale — `useServer()`, `body<T>()`, `at<T>()` and the four envelope
interfaces move verbatim, only their import specifiers change. One new abstraction is added,
shaped after the existing one:

- `backend/src`
  - `testing.ts` — **new**, from `backend/test/helpers/server.ts`
    - `useServer` — unchanged body; imports become `./db`, `./repo`, `./server`
    - `useTempDir` — **new**; registers `beforeEach`/`afterEach` around `mkdtempSync`/`rmSync`
      and returns a getter, so callers read the path lazily rather than capture a stale binding
    - `body`, `at`, `WorkoutDetail`, `WorkoutPage`, `Progress`, `ErrorBody` — unchanged
  - `db.test.ts` — **new**; carries its own five-line `tables()` query. It is a bare
    `SELECT name FROM sqlite_master` with no rationale attached to it, unlike the `rmSync`
    retries, so duplicating it costs nothing and keeps SQL out of `testing.ts`.
  - `migrations.test.ts` — keeps its local `write()`, `run()`, `tables()` and `foreignKeysOn()`
    helpers; only `dir` changes, from a module-level binding to `tempDir()`

`useTempDir` returns `() => string` rather than a string because `beforeEach` has not run when the
module body executes:

```ts
/** A throwaway directory, made before each test and removed after it. */
export function useTempDir(): () => string {
  let dir = "";
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "gainz-"));
  });
  afterEach(() => {
    // Recursive, so the WAL/SHM sidecars of any file database written here go too. Windows
    // releases the handle a moment after close(), so retry rather than fail the test on EBUSY.
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });
  return () => dir;
}
```

## Logging & Observability

No change. The suite still prints two diagnostics on a passing run — `Unhandled error: Error: boom`
from the error-hook test, which moves to `server.test.ts`, and the transpiler's parse failure for
`__broken.ts`, which moves to `transpile.test.ts`. Both are expected output, and both keep the
comments that say so.

## Implementation

### Phase 1: Establish `backend/src/testing.ts`

Dependencies: None.

Give the harness its new home and prove both helpers work while the tests are still in place. The
suite does not move in this phase, so a failure here is unambiguously about the helper.

**Tasks**:

- [ ] `git mv backend/test/helpers/server.ts backend/src/testing.ts`, then remove the now-empty
      `backend/test/helpers/` directory.
- [ ] Rewrite the three source imports at the top of `testing.ts`: `../../src/db` → `./db`,
      `../../src/repo` → `./repo`, `../../src/server` → `./server`.
- [ ] Add a doc comment as the first line of `testing.ts` marking it test-only — nothing else in
      the file's name or location says so:
      ```ts
      /**
       * Test-only. The harness every *.test.ts under backend/src/ builds its fixtures from;
       * no production module imports it.
       */
      ```
- [ ] Add `useTempDir()` to `testing.ts` as shown in *Abstractions and Code Reuse*, with the
      `mkdtempSync`/`rmSync` imports from `node:fs`, `tmpdir` from `node:os` and `join` from
      `node:path`. Move the Windows `EBUSY` comment across from `migrate.test.ts:20-21` — this is
      the copy that survives.
- [ ] Re-point the five API test files from `./helpers/server` to `../src/testing`:
      `meta.api.test.ts:8`, `exercise.api.test.ts:3-4`, `workout.api.test.ts:3-4`,
      `set.api.test.ts:3-4`, `static.api.test.ts:4`. Both the `import type` and the value import
      change in the four files that have both.
- [ ] Switch `backend/test/migrate.test.ts` to `useTempDir()`: drop its `mkdtempSync`/`rmSync`
      lines and the `dir` binding from `migrate.test.ts:9-23`, add
      `const tempDir = useTempDir();`, and replace the four `dir` reads (`write()` at `:27`,
      `run()` at `:31`, and the WAL path at `:167`) with `tempDir()`. Its `beforeEach` keeps the
      bare `new Database(":memory:")` and `PRAGMA foreign_keys = ON`, which `useTempDir` does not
      cover.

**Automated Verification**:

- [ ] `bun test` reports 53 pass, 0 fail.
- [ ] `bun test backend/test/migrate.test.ts` reports 13 pass — the file that exercises the new
      `useTempDir()`.
- [ ] `bun run typecheck` is clean.
- [ ] `bun run lint` is clean.
- [ ] `bun run fmt:check` is clean.
- [ ] `bun start` serves the app and `curl http://localhost:3000/api/health` returns
      `{"status":"ok","app":"gainz"}` — confirms `testing.ts` under `src/` did not disturb the
      production import graph.

### Phase 2: Entity route tests move under `backend/src/routes/`

Dependencies: Phase 1.

Move the three files whose tests all drive route modules, applying the strict regrouping from
decision 3 as they land.

**Tasks**:

- [ ] `git mv backend/test/exercise.api.test.ts backend/src/routes/exercise.routes.test.ts`.
      Rewrite its imports: `../src/repo` → `../repo`, `../src/testing` → `../testing`. Both
      describes (`"exercises"`, `"progress"`) stay, unchanged, in this file.
- [ ] `git mv backend/test/workout.api.test.ts backend/src/routes/workout.routes.test.ts`, with
      the same two import rewrites. `describe("workouts")` keeps its eight tests.
- [ ] Add a second describe to `workout.routes.test.ts`, after `describe("workouts")`, holding the
      two tests moved out of `set.api.test.ts:9-33` verbatim — `"logs sets and returns them with
      the workout"` and `"rejects non-positive reps and unknown exercises"`. Name it for the route
      that declares them (`workout.routes.ts:63`), so the file reads as one describe per route
      pattern:
      ```ts
      describe("a workout's sets", () => {
        // POST /api/workouts/:id/sets, declared in workout.routes.ts, validated by
        // readSetBody from set.routes.ts.
      });
      ```
- [ ] `git mv backend/test/set.api.test.ts backend/src/routes/set.routes.test.ts`. Delete the two
      tests now living in `workout.routes.test.ts`, leaving `describe("sets")` with
      `"updates and deletes a set"` (`set.api.test.ts:35-46`) alone.
- [ ] Prune the imports of `set.routes.test.ts` to what the one remaining test uses — it still
      needs `LiftSet`, `WorkoutDetail`, `body`, `useServer`, `createExercise`, `createWorkout` and
      `patch`, but no longer `at`, which was used only by the departing first test
      (`set.api.test.ts:24`).

**Automated Verification**:

- [ ] `bun test backend/src/routes/exercise.routes.test.ts` reports 8 pass.
- [ ] `bun test backend/src/routes/workout.routes.test.ts` reports 10 pass.
- [ ] `bun test backend/src/routes/set.routes.test.ts` reports 1 pass.
- [ ] `bun test` reports 53 pass, 0 fail.
- [ ] `bun run typecheck`, `bun run lint` and `bun run fmt:check` are clean — `lint` in particular
      catches the unused `at` import if the prune above is missed.

### Phase 3: `meta.api.test.ts` fans out to four homes

Dependencies: Phase 1.

The file's three describes have four different subjects. Each moves to the module it drives, and
the file disappears.

**Tasks**:

- [ ] Create `backend/src/routes/meta.routes.test.ts` with `describe("health and routing")`
      holding the two HTTP tests from `meta.api.test.ts:13-23` — `"health endpoint responds"` and
      `"unknown api endpoint returns a JSON 404"`, which drive `metaRoutes()` and
      `notFoundRoute()` respectively. Imports: `ErrorBody`, `body` and `useServer` from
      `../testing`.
- [ ] Create `backend/src/routes/stats.routes.test.ts` with `describe("stats")` holding
      `"summarises the whole log"` (`meta.api.test.ts:43-57`). Imports: `Summary` from `../repo`,
      plus `body`, `useServer` from `../testing`.
- [ ] Create `backend/src/server.test.ts` with `describe("the error hook")` holding
      `"renders errors through Bun.serve's error hook"` (`meta.api.test.ts:29-39`), keeping the
      four-line comment above it (`:25-28`) verbatim — it is the only record of why the hook is
      unreachable over HTTP. This file does not call `useServer()`; it builds its own database and
      options, so it imports `openDatabase` from `./db`, `HttpError` from `./http`, `Repo` from
      `./repo` and `serveOptions` from `./server`, and nothing from `./testing`.
- [ ] Create `backend/src/http.test.ts` with `describe("request bodies")` holding the two tests
      from `meta.api.test.ts:61-73`, which exercise `readJsonObject` (`http.ts:43`). Imports:
      `api`, `post` and `useServer` from `./testing`.
- [ ] `git rm backend/test/meta.api.test.ts`.

**Automated Verification**:

- [ ] `bun test backend/src/routes/meta.routes.test.ts` reports 2 pass.
- [ ] `bun test backend/src/routes/stats.routes.test.ts` reports 1 pass.
- [ ] `bun test backend/src/server.test.ts` reports 1 pass, and prints one
      `Unhandled error: Error: boom` line to stderr.
- [ ] `bun test backend/src/http.test.ts` reports 2 pass.
- [ ] `bun test` reports 53 pass, 0 fail.
- [ ] `bun run typecheck`, `bun run lint` and `bun run fmt:check` are clean.

### Phase 4: `static.api.test.ts` splits into `static.test.ts` and `transpile.test.ts`

Dependencies: Phase 1.

Split by what each test asserts rather than by which describe it currently sits in, per decision 5.

**Tasks**:

- [ ] Create `backend/src/static.test.ts` with `describe("static files")` holding eight tests: the
      five already in that describe (`static.api.test.ts:9-39`) plus three moved out of
      `"typescript modules"` — `"answers HEAD with the headers and no body"` (`:87-92`),
      `"returns 404 for a .ts file that does not exist"` (`:94-96`) and `"refuses to transpile
      anything outside frontend/"` (`:98-103`). Keep the encoding comment at `:99-100` with the
      last of these. Imports: `useServer` from `./testing`.
- [ ] Create `backend/src/transpile.test.ts` with `describe("typescript modules")` holding the
      remaining seven: type erasure (`:43-53`), import specifiers left alone (`:55-58`), the entry
      point (`:60-68`), the types-only module (`:70-75`), type-only imports stripped (`:77-80`),
      the load-bearing top-level await (`:82-85`) and the unparseable module (`:105-115`). Keep
      every existing comment. Imports: `unlink` from `node:fs/promises`, `resolve` from
      `node:path`, `useServer` from `./testing`.
- [ ] Leave the `__broken.ts` fixture path in `transpile.test.ts` exactly as written —
      `resolve(import.meta.dir, "..", "..", "frontend", "src", "__broken.ts")`. `backend/src/` and
      `backend/test/` are both two levels below the repository root, so the path still resolves.
      This is the one place in the move where an unchanged line would be easy to "fix" wrongly.
- [ ] `git rm backend/test/static.api.test.ts`.

**Automated Verification**:

- [ ] `bun test backend/src/static.test.ts` reports 8 pass.
- [ ] `bun test backend/src/transpile.test.ts` reports 7 pass, and prints the
      `could not transpile ... __broken.ts` diagnostic to stderr.
- [ ] `git status --short` is clean of `frontend/src/__broken.ts` after the run — the fixture is
      still removed in its `finally`.
- [ ] `bun test` reports 53 pass, 0 fail.
- [ ] `bun run typecheck`, `bun run lint` and `bun run fmt:check` are clean.

### Phase 5: Split `migrate.test.ts`, delete `backend/test/`, update config and docs

Dependencies: Phases 1-4.

The last two describes find their homes, the directory goes, and the documentation catches up in
the same phase — the README tree and the `docs/backend.md` paragraph only become correct once
every file has landed.

**Tasks**:

- [ ] Create `backend/src/migrations.test.ts` from `backend/test/migrate.test.ts`, holding
      `describe("migration runner")` with its ten tests (`migrate.test.ts:45-150`) and a
      `describe("the real migrations")` with one — `"adopt a database that already has the schema
      but no ledger"` (`:176-191`), which calls `migrate()` directly rather than `openDatabase`.
      Keep the local `write()`, `run()`, `tables()` and `foreignKeysOn()` helpers and the
      `beforeEach` that opens the bare database. Imports: `Database` from `bun:sqlite`,
      `readFileSync`/`writeFileSync` from `node:fs`, `join` from `node:path`, `MIGRATIONS_DIR`,
      `migrate`, `schemaVersion` and `MigrateResult` from `./migrations`, and `useTempDir` from
      `./testing`.
- [ ] Create `backend/src/db.test.ts` with `describe("openDatabase")` holding two tests:
      `"openDatabase applies them to an in-memory database"` (`migrate.test.ts:153-164`) and
      `"openDatabase enables WAL for a file-backed database"` (`:166-174`). Keep the comment about
      `expect.arrayContaining` on the first and the `close(true)` comment on the second. Give the
      file its own five-line `tables()` helper and `const tempDir = useTempDir();`. Imports:
      `join` from `node:path`, `openDatabase` from `./db`, `schemaVersion` from `./migrations`,
      `useTempDir` from `./testing`.
- [ ] Drop `openDatabase` from the imports of `migrations.test.ts` — after the split only
      `db.test.ts` calls it.
- [ ] `git rm backend/test/migrate.test.ts` and confirm `backend/test/` is now empty and gone.
- [ ] `tsconfig.json:17` — `"include": ["backend/src", "backend/test", "frontend"]` becomes
      `"include": ["backend/src", "frontend"]`.
- [ ] `AGENTS.md:14` — the one-file example becomes
      `bun test backend/src/routes/workout.routes.test.ts`. Edit `AGENTS.md`, not `CLAUDE.md`,
      which is a symbolic link to it.
- [ ] `AGENTS.md:35` — the architecture sentence names `backend/test/` as "the API suite". Rewrite
      it to say that `backend/src/` holds the server and its tests side by side, with
      `*.test.ts` beside the module it exercises, and that `backend/migrations/` holds the
      numbered schema migrations.
- [ ] `README.md:69-107` — rebuild the `backend/` block of the Layout tree: delete the `test/`
      section entirely and add each test file on the line below the module it now sits beside,
      including `testing.ts` marked as the test-only harness. The `frontend/` block
      (`README.md:108-127`) is unaffected.
- [ ] `docs/backend.md:42-50` — rewrite the paragraph. `serveOptions(repo)` is still the exported
      seam, but the harness is now `backend/src/testing.ts`, the five API files are eleven, and
      the by-subject exception is gone: state instead that each test file sits beside the module
      declaring the routes it drives, which is why the two tests for
      `POST /api/workouts/:id/sets` are in `workout.routes.test.ts`. Keep the closing sentence
      that there are no unit tests of `Repo`.
- [ ] `docs/backend.md:62` — repoint `backend/test/static.api.test.ts:87` at the HEAD test's new
      home in `backend/src/static.test.ts`.

**Automated Verification**:

- [ ] `bun test backend/src/migrations.test.ts` reports 11 pass.
- [ ] `bun test backend/src/db.test.ts` reports 2 pass.
- [ ] `bun test` reports 53 pass, 0 fail across 11 files.
- [ ] `bun run typecheck`, `bun run lint` and `bun run fmt:check` are clean.
- [ ] `test ! -d backend/test` — the directory is gone.
- [ ] `grep -rn "backend/test\|\.api\.test\|helpers/server" README.md AGENTS.md docs/backend.md
      tsconfig.json` returns nothing.
- [ ] `bun start` serves the app, `curl http://localhost:3000/api/health` returns
      `{"status":"ok","app":"gainz"}`, and `curl http://localhost:3000/src/format.ts` returns
      transpiled JavaScript.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

Two things to leave alone, both of which look like omissions:

- `docs/agents/research/2026-09-10-test-suite-structure.md` describes the pre-move layout and is
  pinned to commit `2cecda6`. `AGENTS.md` forbids editing existing documents under `docs/agents/`,
  so it stays as a record of what the suite looked like before this plan, exactly as the earlier
  research documents were left when `server.ts` was split.
- The `__broken.ts` fixture path in `transpile.test.ts` needs no adjustment (Phase 4).

## References

- `docs/agents/research/2026-09-10-test-suite-structure.md` — the mapping this plan is built on
- `backend/test/helpers/server.ts:51-122` — `useServer()`, `body<T>()`, `at<T>()`, the envelopes
- `backend/test/migrate.test.ts:12-23` — the temp-directory hooks that become `useTempDir()`
- `backend/test/meta.api.test.ts:25-39` — the error-hook test and the comment that must travel
- `backend/test/static.api.test.ts:105-115` — the `__broken.ts` fixture and its `finally`
- `backend/src/routes/set.routes.ts:7` — `readSetBody`, exported because the POST route is next door
- `backend/src/routes/workout.routes.ts:63` — `/api/workouts/:id/sets`, the route being regrouped
- `backend/src/http.ts:43` — `readJsonObject`, the subject of `http.test.ts`
- `docs/backend.md:42-50` — the by-subject paragraph this plan reverses
- `docs/agents/plans/2026-09-10-split-routes-into-per-entity-files.md` — the split that produced
  the five API files being moved here
