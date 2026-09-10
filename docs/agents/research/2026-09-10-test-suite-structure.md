---
date: 2026-09-10T21:16:35+00:00
git_commit: 2cecda6f1ac9fb0a6816de6e46b34a1583b49217
branch: main
topic: "How the tests are structured"
tags: [research, codebase, testing, bun-test, backend, migrations, static-files]
status: complete
---

# Research: How the tests are structured

## Research Question

How are the tests structured?

## Summary

The whole suite lives in `backend/test/`: six `*.test.ts` files and one shared helper module,
53 tests and 141 assertions, running in about 130 ms. There is no test configuration file, no
mocking library, no fixture directory and no frontend test suite — `bun test` discovers the
files by name, and `bunfig.toml` contains only an `[install]` section.

The suite has exactly two shapes:

1. **Five end-to-end API files.** Each one boots a *real* `Bun.serve` server on port 0 over a
   *real* in-memory SQLite database and drives it with `fetch` over HTTP. Nothing is stubbed;
   the assertions are status codes and parsed JSON bodies. All five get that server from a
   single helper, `useServer()` in `backend/test/helpers/server.ts`.
2. **One unit-test file.** `migrate.test.ts` tests the migration runner directly as a function,
   against throwaway `.sql` fixture files written into an OS temp directory per test. It does
   not use `useServer()` and registers its own `beforeEach`/`afterEach`.

There are no unit tests of `Repo`, of the validators, or of any other `backend/src` module —
those are covered only through the HTTP surface. `docs/backend.md:42-50` states this split as
the intended arrangement.

```
backend/
  src/
    server.ts               serveOptions(repo) — the seam the API tests bind to
    db.ts                   openDatabase(":memory:") — the seam for a per-test database
    migrations.ts           migrate(db, { dir }) — the seam migrate.test.ts drives directly
  test/
    helpers/
      server.ts             useServer(), body<T>(), at<T>(), response-shape interfaces
    meta.api.test.ts        6 tests  — health, JSON 404, the error hook, stats, body parsing
    exercise.api.test.ts    8 tests  — exercise CRUD + the progress endpoint
    workout.api.test.ts     8 tests  — workout CRUD, set-copying, pagination roll-ups
    set.api.test.ts         3 tests  — logging, updating and deleting sets
    static.api.test.ts     15 tests  — static files, vendor allowlist, .ts transpilation
    migrate.test.ts        13 tests  — the migration runner, plus the real migrations
```

Per-test lifecycle for the five API files:

```
  beforeEach ─┬─ openDatabase(":memory:")      fresh schema, migrations applied
              └─ Bun.serve({ port: 0, ...serveOptions(new Repo(db)) })
                        │
                        └─ base = server.url.origin   ("http://localhost:<random>")

  test  ──────── api()/post()/patch() ── fetch ──▶ real HTTP ──▶ routes ──▶ Repo ──▶ SQLite

  afterEach ──┬─ await server.stop(true)
              └─ db.close()
```

## Detailed Findings

### The shared harness: `useServer()`

`backend/test/helpers/server.ts:51-100` exports `useServer()`, which every API test file calls
once at module top level and destructures:

```ts
const { api, post, patch, createExercise, createWorkout } = useServer();
```

Inside, it declares `db`, `server` and `base` as closure variables and registers the
`beforeEach`/`afterEach` pair **from inside the function body** rather than at the module's top
level. The comment at `helpers/server.ts:47-50` gives the reason: each file that calls
`useServer()` gets its own hooks and its own database, instead of sharing one instance through
the module cache. The server is started on `port: 0`, so the OS assigns a free port and files
never collide; `base` is read back from `server.url.origin`.

Teardown is `await server.stop(true)` (the `true` closes active connections) followed by
`db.close()`. Because the database is `:memory:`, closing it discards all state — there is no
truncation step, no transaction rollback and no cleanup SQL anywhere in the suite.

The returned object carries five helpers:

- `api(path, init?)` — a bare `fetch` against `base`, used for GET/DELETE/HEAD and for
  hand-rolled requests (`meta.api.test.ts:61-68` uses it to post deliberately malformed JSON).
- `post(path, body)` / `patch(path, body)` — set `Content-Type: application/json` and
  `JSON.stringify` the body.
- `createExercise(name = "Bench Press")` and `createWorkout(performed_on = "2026-01-05")` — the
  suite's only fixtures. Both assert `201` *inside the helper* (`helpers/server.ts:89`, `:95`),
  so a broken create fails at the setup line rather than at some later assertion. `createWorkout`
  always sends `title: "Push day"`.

Those defaults are the closest thing to a fixture file: `"Bench Press"`, `"2026-01-05"` and
`"Push day"` recur as expected values across `exercise.api.test.ts:71`, `set.api.test.ts:23`
and `meta.api.test.ts:55`.

### Response-shape types live in the helper, not in `src`

`helpers/server.ts:10-32` declares four interfaces that exist only for the tests:
`WorkoutDetail` (a `Workout` plus its `sets`), `WorkoutPage` (`items`/`total`/`limit`/`offset`),
`Progress` (`exercise`/`sessions`/`best_set`) and `ErrorBody` (`{ error: string }`). These are the
HTTP envelopes the route handlers assemble; the backend types imported from `../src/repo`
(`Workout`, `LiftSet`, `Exercise`, `SessionPoint`, `WorkoutWithStats`, `Summary`,
`ExerciseWithStats`) describe rows. Test files import the row types from `src/repo` and the
envelope types from the helper — visible in the import block of every API file, e.g.
`exercise.api.test.ts:2-4`.

### Two typing helpers exist because of the strict compiler settings

`tsconfig.json` includes `backend/test` in `include` and sets `strict` plus
`noUncheckedIndexedAccess`, and `.oxlintrc.json` runs oxlint with `typeAware: true` and
`typescript/no-unsafe-type-assertion` as an error. Two exported helpers exist to satisfy that:

- `body<T>(res)` (`helpers/server.ts:109-113`) parses `res.json()` into `unknown` and performs the
  single asserted cast in the suite, with a one-line `oxlint-disable-next-line` and a comment
  explaining that Bun types `json()` as `Promise<any>` with no generic overload. Every call site
  names the shape it is claiming: `await body<WorkoutPage>(await api("/api/workouts"))`.
- `at<T>(items, index)` (`helpers/server.ts:116-122`) returns `items[index]` or throws a message
  naming the index and the array length. It exists because `noUncheckedIndexedAccess` types
  `sessions[1]` as possibly `undefined`. Tests use plain indexing when the assertion is
  `toMatchObject` (which tolerates `undefined` at the type level) and `at()` when they need to
  reach through to a property — compare `exercise.api.test.ts:73` with `:74`.

A handful of assertions skip `body<T>()` entirely and use `await res.json()` directly with
`toMatchObject` (`exercise.api.test.ts:34`, `meta.api.test.ts:16`), which needs no cast.

### Naming and organisation inside the API files

Each file opens one or more `describe` blocks named after the domain concept, not after a
module: `"workouts"`, `"exercises"` + `"progress"`, `"sets"`, `"health and routing"` +
`"stats"` + `"request bodies"`, `"static files"` + `"typescript modules"`. Test names are
lowercase sentences stating the behaviour, phrased from the API's point of view — `"defaults the
workout date to today"`, `"refuses to delete an exercise that has logged sets"`, `"rejects a
malformed copy_from_workout_id before writing anything"`, `"exposes only the allowlisted vendor
file, not node_modules"`.

The API files mirror `backend/src/routes/` one-for-one with one deliberate exception, recorded in
`docs/backend.md:46-48`: tests are grouped by the entity they exercise rather than by the file
the route lives in, so `POST /api/workouts/:id/sets` — defined in `workout.routes.ts` — is tested
in `set.api.test.ts:13`.

Assertion style is consistent across the files:

- Status codes are asserted on nearly every request, frequently inlined:
  `expect((await api("/api/exercises/9999")).status).toBe(404)` (`exercise.api.test.ts:38`).
- Bodies are checked with `toMatchObject` against a partial shape rather than deep equality, so
  server-generated fields (`id`, timestamps) do not have to be spelled out.
- Several tests assert a *negative* side effect by taking a count before and after — see the
  `before` / after `total` pattern in `workout.api.test.ts:42-59`, which proves that a failed
  create wrote nothing.
- Deletion tests assert the cascade by re-fetching the child and expecting `404`
  (`workout.api.test.ts:20-27`).
- One numeric assertion uses tolerance: `toBeCloseTo(75.83, 1)` for the Epley one-rep-max
  estimate, with the formula written out in a comment (`exercise.api.test.ts:75-77`).

### `meta.api.test.ts` — the one API file that also calls into `src` directly

`meta.api.test.ts:29-39` is the only test in the five API files that does not go over HTTP. It
constructs `openDatabase(":memory:")` and `serveOptions(new Repo(db))` itself, pulls the `error`
member out of the returned options and calls it with an `HttpError(418)` and a plain `Error`,
asserting `418` and `500`. The comment above it (`:25-28`) records why: `guardAll` wraps the
method maps and `guard` wraps the `/api/*` catch-all, so no request can reach `Bun.serve`'s error
hook through the route table — what is under test is the wiring in `serveOptions`, not Bun's
dispatch. It also notes that the 500 branch logs one `Unhandled error: Error: boom` line to
stderr, which is visible in the suite output. The database is closed in a `finally`.

`serveOptions` (`backend/src/server.ts:18-24`) exists specifically as this shared seam: it returns
`{ routes, fetch, error }` and is consumed by `main.ts` and by the test helper alike.

### `static.api.test.ts` — the frontend, tested through the backend

The frontend has no test runner of its own; it is covered entirely by
`static.api.test.ts`, which asserts what the server hands a browser. Two `describe` blocks:

`"static files"` (`:8-40`) checks that `/` returns `text/html` containing `gainz`, that
`/../package.json` is a 404, that the three app stylesheets are served as `text/css`, that Pico
is exposed at the fixed path `/vendor/pico.css`, and that the allowlist is exactly one file —
`/vendor/pico.scss` and `/node_modules/@picocss/pico/package.json` must both 404.

`"typescript modules"` (`:42-116`) covers `backend/src/transpile.ts` by asserting on the response
text rather than by calling the transpiler:

- Types are erased: `/src/format.ts` still contains `export const UNIT` but must not contain
  `": string"` or `"| null | undefined"` (`:43-53`).
- Import specifiers are left alone so a URL names a real file — the body must still contain
  `from "../../format.ts"` (`:55-58`).
- `index.html` names `/src/main.ts` and that module resolves (`:60-68`).
- A types-only module erases to an empty body (`:70-75`) and type-only imports are stripped, so
  `types.ts` is never fetched at runtime (`:77-80`).
- The load-bearing top-level `await define("gz-chart"` survives (`:82-85`) —
  `docs/backend.md:62` names this test as the one holding that behaviour in place.
- `HEAD` returns headers with an empty body (`:87-92`).
- Traversal is refused in *percent-encoded* form — `/%2e%2e/backend/src/server.ts` — with a
  comment noting the encoding is deliberate so the URL parser cannot normalise the traversal
  away before `resolveStaticPath` sees it (`:98-103`).

The last test (`:105-115`) is the only one in the suite that writes to the working tree: it
`Bun.write`s a deliberately unparseable `frontend/src/__broken.ts`, asserts the request returns
`500` with the filename in the body, and `unlink`s it in a `finally`. That failure also prints a
transpiler diagnostic to stderr during a passing run.

### `migrate.test.ts` — the unit-test file

This file does not import the helper at all. It declares module-level `dir` and `db` and
registers its own hooks (`migrate.test.ts:12-23`): `beforeEach` creates a temp directory with
`mkdtempSync(join(tmpdir(), "gainz-migrations-"))` and a bare `new Database(":memory:")` with
`PRAGMA foreign_keys = ON` — deliberately *not* `openDatabase`, so no real migration has run.
`afterEach` closes the database and removes the directory with
`rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 })`; the comment
explains the retries are for Windows, which releases the file handle a moment after `close()`.

Three local helpers keep the tests short (`:26-43`): `write(filename, sql)` drops a fixture
migration into the temp dir, `run()` calls `migrate(db, { dir })`, and `tables(database)` /
`foreignKeysOn(database)` query `sqlite_master` and `PRAGMA foreign_keys`. The `dir` option on
`migrate` exists for exactly this — `migrations.ts:30-31` documents it as "Only the tests
override this."

`describe("migration runner")` (`:45-150`) holds ten tests, each writing its own fixture SQL
about widgets/gadgets/doodads rather than touching the app's real schema: ordering by version
(with the files written out of order on purpose), the no-op second run, applying only pending
migrations, rollback-and-rethrow on a part-way failure, refusing an out-of-order version,
refusing duplicate versions, refusing a misnamed file, refusing a database newer than the
checkout, rolling back a migration that leaves orphaned rows, and leaving `foreign_keys` on after
both a success and a failure. Error cases assert with `expect(() => run()).toThrow(/…/)` against a
regex naming the offending file or message, then follow up by asserting the state was not
mutated — `schemaVersion(db)` and `tables(db)` (`:88-89`, `:137-138`).

`describe("the real migrations")` (`:152-192`) is the one place the actual `backend/migrations/`
directory is exercised: `openDatabase(":memory:")` must produce `exercises`, `workouts`, `sets`
and `schema_migrations` at schema version 1 (asserted one table at a time, with a comment
explaining that `expect.arrayContaining` is typed `any` and gives a worse failure message); a
file-backed database in the temp dir must report `journal_mode = wal`, closed with `close(true)`
and a comment about the Windows file lock; and a "legacy" database that already has the schema but
no ledger is adopted by `migrate()` without disturbing its rows.

### Running the suite

From `CLAUDE.md` and `README.md:28`:

```sh
bun test                                   # everything
bun test backend/test/workout.api.test.ts  # one file
bun test -t "health"                       # one test or describe by name
```

Current output: `53 pass, 0 fail, 141 expect() calls` across 6 files. The database path comes from
`DEFAULT_DB_PATH = process.env.GAINZ_DB ?? "data/gainz.sqlite"` (`db.ts:26`), but no test reads it —
every test names `:memory:` or a temp path explicitly, so the suite never touches `data/`.

## Code References

- `backend/test/helpers/server.ts:51-100` — `useServer()`: per-file hooks, port-0 server, in-memory DB
- `backend/test/helpers/server.ts:47-50` — comment on why the hooks are registered inside the function
- `backend/test/helpers/server.ts:10-32` — the four HTTP-envelope interfaces the tests assert against
- `backend/test/helpers/server.ts:87-97` — `createExercise` / `createWorkout`, the suite's only fixtures
- `backend/test/helpers/server.ts:109-113` — `body<T>()`, the suite's single asserted cast
- `backend/test/helpers/server.ts:116-122` — `at<T>()`, for `noUncheckedIndexedAccess`
- `backend/test/meta.api.test.ts:25-39` — the direct `serveOptions(...).error` test and its rationale
- `backend/test/workout.api.test.ts:42-59` — the before/after `total` pattern proving nothing was written
- `backend/test/exercise.api.test.ts:57-78` — the progress test, with the Epley formula in a comment
- `backend/test/set.api.test.ts:13` — `POST /api/workouts/:id/sets` tested by entity, not by route file
- `backend/test/static.api.test.ts:98-103` — percent-encoded traversal, deliberately un-normalisable
- `backend/test/static.api.test.ts:105-115` — the one test that writes into `frontend/src`, cleaned in `finally`
- `backend/test/migrate.test.ts:12-43` — own hooks, temp-dir fixtures, and the three local helpers
- `backend/test/migrate.test.ts:152-192` — the only tests that run the real `backend/migrations/`
- `backend/src/server.ts:18-24` — `serveOptions(repo)`, the seam shared by `main.ts` and the tests
- `backend/src/db.ts:13-24` — `openDatabase`, which applies migrations and accepts `:memory:`
- `backend/src/migrations.ts:29-33` — `MigrateOptions.dir`, documented as test-only
- `tsconfig.json` — `include` covers `backend/test`; `strict` + `noUncheckedIndexedAccess`
- `docs/backend.md:42-50` — the prose statement of the harness and the unit/E2E split
- `README.md:100-107` — the per-file summary of the test directory

## Architecture Documentation

Patterns observed in the suite as it stands:

- **One seam, one helper.** Everything the API tests need from the app is reached through
  `serveOptions(repo)` and `openDatabase(":memory:")`. No module is imported for stubbing, and
  there is no mock, spy or fake anywhere in `backend/test/`.
- **Real over simulated.** A real HTTP server, a real socket, a real SQLite engine and real
  migrations on every test. The in-memory database is what makes per-test isolation cheap enough
  for that to run in ~130 ms.
- **Isolation by construction, not by cleanup.** State is discarded by closing the database rather
  than by resetting tables; the only explicit cleanup in the suite is the temp directory in
  `migrate.test.ts` and the `__broken.ts` file in `static.api.test.ts`, both in `afterEach`/`finally`.
- **Fixtures as helper defaults.** Rather than a fixtures module, the two creation helpers carry
  default arguments, and tests override them only when the value matters to the assertion (dates
  in the progress and copy tests, names in the duplicate-name test).
- **Type-level plumbing is centralised and commented.** The suite's only `any`-adjacent escape
  hatch is `body<T>()`, with the lint suppression and reasoning in one place.
- **Comments carry the "why".** Non-obvious tests explain themselves in place: why the error hook
  is called directly, why a traversal path is percent-encoded, why fixture migrations are written
  out of order, why `close(true)` and `rmSync` retries are needed on Windows, why one assertion
  loops instead of using `expect.arrayContaining`.
- **Behavioural naming.** `describe` blocks name domain concepts; test names are full sentences
  describing observable API behaviour, which is what makes `bun test -t "health"` a usable filter.
- **Coverage is layered, not exhaustive.** The HTTP surface, the transpiler and the migration
  runner each have direct tests; `Repo`, the validators and the frontend modules are reached only
  transitively.

## Open Questions

- There is no CI workflow file in the repository, so how (or whether) `bun test`, `bun run
  typecheck`, `bun run lint` and `bun run fmt:check` are run automatically is not visible in the
  codebase.
- No coverage tooling is configured (`bun test --coverage` is not wired into any script), so the
  untested share of `backend/src` is not measured anywhere.
- The frontend custom elements and modules under `frontend/src/components/` are asserted on only as
  transpiler output text; there is no DOM-level or behavioural test for them.
