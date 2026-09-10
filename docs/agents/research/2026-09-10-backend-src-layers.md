---
date: 2026-09-10T21:11:26+00:00
git_commit: 48c690a5b60ebf1c1025ddedded43c57d71bb286
branch: main
topic: "How the layers of backend/src are built"
tags: [research, codebase, backend, layering, routes, repo, http, migrations, static]
status: complete
---

# Research: How the layers of `backend/src` are built

## Research Question

Research `backend/src`: how are the layers built?

## Summary

`backend/src` is arranged as five layers plus a parallel static-file half. Nothing in it is a
framework: every layer is a plain function or class that takes what it needs as an argument, and
the only thing holding them together is `serveOptions(repo)` in `server.ts`, which returns the
object literal that `Bun.serve` is called with.

The layers, from the outside in:

1. **Entry points** — `main.ts`, `migrate.ts`, `seed.ts`. Each is a `main()` guarded by
   `import.meta.main`, each opens the database itself, and none of them are imported by anything
   else in `src/`.
2. **Composition** — `server.ts`. A single 24-line function that names the three things
   `Bun.serve` needs: the route table, the `fetch` fallback, and the `error` hook.
3. **Routes** — `routes.ts` and `routes/*.routes.ts`. One file per URL group; each exports a
   function that takes `repo` and returns a partial route table. Handlers parse and validate, call
   exactly one or a few repository methods, and shape the JSON response.
4. **Data** — `repo/`. `Repo` is a flat facade over four entity repositories. All SQL in the
   project lives here and nowhere else.
5. **Persistence infrastructure** — `db.ts`, `migrations.ts`, `backend/migrations/*.sql`. Opens
   the SQLite file, sets pragmas, and applies numbered migrations on every open.

Cutting across those are two shared modules with no dependencies of their own beyond each other:
`http.ts` (the `HttpError` class, the JSON response helpers, the body reader) and `validate.ts`
(field-level parsers that throw `badRequest`).

The static half — `static.ts`, `paths.ts`, `transpile.ts` — never touches the database or the
repository. It is reached only when the route table matched nothing.

```
backend/
├── src/
│   ├── main.ts            entry point: open db, Bun.serve, SIGINT/SIGTERM
│   ├── migrate.ts         entry point: apply migrations, print version, exit
│   ├── seed.ts            entry point: sample data through Repo
│   ├── server.ts          composition: serveOptions(repo) → Bun.serve options
│   │
│   ├── routes.ts          route registry: spreads the per-entity tables
│   ├── routes/
│   │   ├── shared.ts          RouteTable/Handler types, guard(), guardAll(), MAX_NAME/MAX_NOTES
│   │   ├── meta.routes.ts     /api/health and the /api/* catch-all
│   │   ├── stats.routes.ts    /api/stats/summary
│   │   ├── exercise.routes.ts /api/exercises*
│   │   ├── workout.routes.ts  /api/workouts*
│   │   └── set.routes.ts      /api/sets/:id (+ exports readSetBody)
│   │
│   ├── http.ts            HttpError, badRequest/notFound/conflict, json/noContent, errorResponse
│   ├── validate.ts        requiredString/optionalString/requiredInt/... — all throw badRequest
│   │
│   ├── repo/
│   │   ├── index.ts       Repo facade, re-exports every entity type
│   │   ├── sql.ts         shared column lists, Epley fragment, buildUpdate(), isUniqueViolation()
│   │   ├── exercises.ts   ExerciseRepo + Exercise/ExerciseWithStats/SessionPoint/ExerciseInput
│   │   ├── workouts.ts    WorkoutRepo + Workout/WorkoutWithStats/WorkoutInput
│   │   ├── sets.ts        SetRepo + LiftSet/SetInput
│   │   └── stats.ts       StatsRepo + Summary
│   │
│   ├── db.ts              openDatabase(): mkdir, pragmas, migrate(); DEFAULT_DB_PATH
│   ├── migrations.ts      discover/assertConsistent/migrate/schemaVersion
│   │
│   ├── static.ts          the fetch fallback: vendor → frontend file → SPA index
│   ├── paths.ts           the only URL→filesystem mapping; traversal guard + vendor allowlist
│   └── transpile.ts       Bun.Transpiler for .ts modules requested by the browser
│
└── migrations/
    └── 001-initial-schema.sql
```

Request flow through the layers:

```
                         Bun.serve({ port, ...serveOptions(repo) })
                                        │
              ┌─────────────────────────┴──────────────────────────┐
        routes: apiRoutes(repo)                              fetch: serveStatic
              │                                                    │
   pattern match on /api/...                          resolveVendorPath(pathname)
              │                                          │ hit → node_modules file
        guardAll / guard  ──── catch ──► errorResponse()  │
              │                                          resolveStaticPath(pathname)
        handler (routes/*.routes.ts)                      │ null → 404
              │                                           ├─ .ts  → transpileModule()
      validate.ts  ──── throw badRequest ──► HttpError    ├─ file → Bun.file
              │                                           └─ extensionless → index.html
        repo.<method>()  ── Repo facade (repo/index.ts)
              │
        ExerciseRepo | WorkoutRepo | SetRepo | StatsRepo
              │   throw notFound()/conflict() ──► HttpError
        bun:sqlite  (db.query<Row, Params>(...))
              │
        http.json(data, status) ──► Response

        error: (err) => errorResponse(err)   ← Bun's last-resort hook
```

## Detailed Findings

### Entry points

Three files own a process, and they are the only files in `src/` that call `openDatabase` with
`DEFAULT_DB_PATH`.

- `backend/src/main.ts:10-33` — `main()` opens the database (logging each migration it applies),
  constructs `new Repo(db)`, reads `PORT` (default 3000), and calls
  `Bun.serve({ port, ...serveOptions(repo) })`. It then registers `SIGINT`/`SIGTERM` handlers that
  stop the server, close the database, and `process.exit(0)`.
- `backend/src/migrate.ts:9-21` — the same `openDatabase` call with no server, counting migrations
  through the `onMigration` callback and printing the resulting `schemaVersion(db)`. The header
  comment states the server does this on boot anyway, so this exists for doing it deliberately.
- `backend/src/seed.ts:6-7` — imports only `db` and `repo`; it writes sample data through the
  public `Repo` methods rather than through SQL of its own.

All three end with `if (import.meta.main) { main(); }` (`main.ts:35`, `migrate.ts:23`), which is
what keeps them importable-but-inert. `package.json` points `start`, `seed` and `migrate` at these
three files directly.

### Composition: `server.ts`

`backend/src/server.ts` is the whole of the wiring layer — 24 lines, one exported function:

```ts
export function serveOptions(repo: Repo): GainzServeOptions {
  return {
    routes: apiRoutes(repo),
    fetch: serveStatic,
    error: (err: Error): Response => errorResponse(err),
  };
}
```

The `GainzServeOptions` interface at `server.ts:11-15` is spelled out by hand rather than derived
from `Bun.Serve.Options`; the comment above it explains that Bun's port/unix union stops being
spreadable into `Bun.serve` once it is named.

Because it returns options rather than a running server, both the CLI (`main.ts:17`) and the test
suite (`backend/test/helpers/server.ts:58`) construct the identical server, the tests differing only
in `port: 0` and a `:memory:` database. `backend/test/meta.api.test.ts:32-38` calls the returned
`error` hook directly, on the reasoning — stated in a comment there — that no request can reach it
through the route table because `guard`/`guardAll` already catch everything.

### The route layer

`backend/src/routes.ts:17-26` is a registry and nothing else: it spreads six partial tables into one
object in a fixed order — meta, stats, exercises, workouts, sets, then `notFoundRoute()`. Its
comment records the one ordering constraint: the `/api/*` catch-all must come last.

Every route file follows the same shape:

- `export function <entity>Routes(repo: Repo): RouteTable`
- keys are Bun route patterns (`/api/exercises/:id`), values are `guardAll({ GET, POST, ... })`
- a module-private `read<Entity>Body(body)` builds the full input type for POST
- PATCH builds a `Partial<…>` field by field, each guarded by `isPresent(body, field)`

`backend/src/routes/shared.ts` holds what every route file needs:

- `RouteTable = Bun.Serve.Routes<undefined, string>` (`shared.ts:4`) — named once so partial tables
  can be spread together
- `ParamRequest` (`shared.ts:7`) — `Request & { params: Record<string, string | undefined> }`
- `guard(handler)` (`shared.ts:12-20`) — wraps one handler in `try/catch` and turns anything thrown
  into `errorResponse(err)`
- `guardAll(handlers)` (`shared.ts:22-24`) — maps `guard` over a method→handler record
- `MAX_NAME = 120` and `MAX_NOTES = 2000` (`shared.ts:26-27`) — the two length caps used across
  more than one entity; narrower caps are written inline at the call site (for example `60` for
  `muscle_group` in `exercise.routes.ts:10`).

`guard` catches *everything*, not just `HttpError`, so a bug inside a handler becomes the 500 branch
of `errorResponse` (`http.ts:29-30`) rather than reaching Bun's `error` hook.

Route files are otherwise independent of each other with one exception: `workout.routes.ts:4`
imports `readSetBody` from `set.routes.ts`, because `POST /api/workouts/:id/sets` creates a set
while living in the workouts file. `set.routes.ts:7` carries a comment saying exactly that.

The handlers are deliberately thin. `exercise.routes.ts:18` is `GET: () => json(repo.listExercises())`;
the most involved handler in the layer is `workout.routes.ts:19-24`, which reads two query
parameters through `queryInt` and assembles `{ items, total, limit, offset }` from two repository
calls.

### The HTTP and validation primitives

`backend/src/http.ts` defines the error protocol:

- `HttpError` (`http.ts:2-11`) carries `status`, `message` and optional `details`
- `badRequest` / `notFound` / `conflict` (`http.ts:13-15`) are the three constructors in use — 400,
  404, 409
- `json()` / `noContent()` (`http.ts:17-23`) are the two success shapes
- `errorResponse()` (`http.ts:25-31`) renders an `HttpError` as
  `{ error, details }` at its own status, and anything else as a logged 500
- `readJsonObject()` (`http.ts:43-54`) parses the body and rejects non-objects, using the
  `isJsonObject` type guard at `http.ts:38-40` — written as a guard, per the comment, so the
  narrowing the check performs is the narrowing the caller receives

`backend/src/validate.ts` is a flat set of field parsers over `Record<string, unknown>`, every one of
which throws `badRequest` on failure: `isPresent`, `requiredString`, `optionalString`, `requiredInt`,
`requiredNumber`, `requiredDate`, `pathId`, `queryInt`, plus `today()`. Two normalisation decisions
live here rather than in the routes: `optionalString` collapses empty strings and `null` to `null`
(`validate.ts:23-39`), and `requiredNumber` rounds to two decimals (`validate.ts:67`) with a comment
about `2.5000000000000004`-style noise. `requiredInt`/`requiredNumber` also accept numeric strings
(`validate.ts:47`, `validate.ts:59`).

`validate.ts` imports only `http.ts`; `http.ts` imports nothing.

### The data layer: `repo/`

`backend/src/repo/index.ts:1-5` states the layer's rule in its header: *"All SQL in this project
lives under `backend/src/repo/` and nowhere else."* The import graph bears that out — no file
outside `repo/` imports `bun:sqlite` or writes a query.

`Repo` (`repo/index.ts:14-122`) is a facade. Its constructor builds the four entity repositories and
its body is ~30 one-line delegations grouped by banner comments (`// --- exercises`, `// --- workouts`,
`// --- sets`, `// --- stats`). The stated reason is that the rest of the app keeps a single flat
surface — `repo.listSets(id)` — while the SQL lives in the module it belongs to. `index.ts:12`
re-exports every entity type, so route files import `Exercise`, `LiftSet`, `Summary` and friends from
`../repo` rather than reaching into the individual modules.

Each entity repository owns its row interfaces, its input interface, a module-private `FIELDS` tuple
for updates, and a class taking `db: DB` in the constructor:

- **`ExerciseRepo`** (`repo/exercises.ts:39-151`) — `list()` returns `ExerciseWithStats` from a
  three-table `LEFT JOIN` with `GROUP BY e.id`; `create`/`update` translate a unique-index violation
  into `conflict(...)`; `delete` refuses when sets reference the exercise, with a message naming the
  count (`exercises.ts:110-114`); `progress()` and `bestSet()` supply the two halves of the progress
  endpoint.
- **`WorkoutRepo`** (`repo/workouts.ts:28-113`) — `list(limit, offset)` aggregates set counts and
  volume; `create()` runs inside `db.transaction()` so that the "repeat this session" copy
  (`workouts.ts:86-94`) and the insert commit together, which is what makes an unknown `copyFrom`
  fail without leaving an empty workout behind.
- **`SetRepo`** (`repo/sets.ts:29-104`) — receives `WorkoutRepo` and `ExerciseRepo` as constructor
  arguments. The comment at `sets.ts:30-33` gives the reason: `exercises.ts` already imports the
  `LiftSet` *type* from `sets.ts`, so a value import in either direction would close a cycle.
  Dependency injection here is a cycle-avoidance measure, not a testing seam. `create()` defaults
  `position` to `MAX(position) + 1` (`sets.ts:68-71`), and `update()` re-checks `exercise_id` so an
  unknown exercise is a 404 instead of `ON DELETE RESTRICT` surfacing as a 500 (`sets.ts:88-92`).
- **`StatsRepo`** (`repo/stats.ts:21-52`) — two aggregate queries (whole-log totals, 30-day window)
  merged into one `Summary`, with an explicit null check because spreading a null would hand the
  endpoint an empty object.

`backend/src/repo/sql.ts` holds what the four share and executes nothing itself (`sql.ts:1-3`):

- `EST_1RM_SQL` (`sql.ts:9`) — the Epley formula fragment, used by both `progress()` and `bestSet()`
- `EXERCISE_COLUMNS` / `SET_COLUMNS` (`sql.ts:11-12`) — the column lists repeated across queries
- `isUniqueViolation()` (`sql.ts:14-16`) — matches on the SQLite error message
- `buildUpdate(table, fields, patch)` (`sql.ts:31-52`) — the shared PATCH mechanism. Column names
  come only from the hard-coded `FIELDS` tuple at the call site and never from the patch's own keys,
  so a request body cannot smuggle SQL in; membership is tested with `in` rather than
  `!== undefined`, so an explicitly-null field clears the column. It returns `null` when the patch
  touches nothing, which is why each `update()` reads `if (update) { … }` and then re-`require()`s
  the row.

The one deliberate crossing of layers: `exercises.ts`, `workouts.ts` and `sets.ts` all import
`notFound`/`conflict` from `../http`. The repository layer throws HTTP-shaped errors directly, which
is what lets `require()` be called from a route handler and produce a 404 with no translation step
in between.

### Persistence infrastructure

`backend/src/db.ts` is 26 lines. `openDatabase(path, onMigration?)` (`db.ts:12-24`) creates the
parent directory unless the path is `:memory:`, opens the `Database` with `create: true`, sets three
pragmas — `journal_mode = WAL`, `foreign_keys = ON`, `busy_timeout = 5000` — and then calls
`migrate(db, { onMigration })` before handing the database back. Migration on open is therefore not
optional for any caller. `DEFAULT_DB_PATH` (`db.ts:26`) is `process.env.GAINZ_DB ?? "data/gainz.sqlite"`.
`db.ts` also exports `type DB = Database`, and that alias is what every repository takes.

`backend/src/migrations.ts` is the runner, and its header states there is no library behind it
because `bun:sqlite` is synchronous and `db.transaction()` already rolls back on a throw. It holds:

- `MIGRATIONS_DIR` (`migrations.ts:36`) — `resolve(import.meta.dir, "../migrations")`
- the `schema_migrations` ledger DDL (`migrations.ts:38-44`) and the `FILENAME` pattern
  `^(\d{3,})-([a-z0-9-]+)\.sql$` (`migrations.ts:47`)
- `schemaVersion(db)` (`migrations.ts:55-61`) — 0 when the ledger table does not exist yet
- `discover(dir)` (`migrations.ts:64-93`) — throws on a malformed name, on version 0, and on two
  files sharing a version
- `assertConsistent(files, applied, dir)` (`migrations.ts:99-118`) — requires the applied versions to
  form an unbroken prefix of the files on disk, so a database newer than the checkout and a migration
  numbered below the high-water mark both fail loudly
- `migrate(db, options)` (`migrations.ts:121-169`) — applies each pending file in its own
  transaction, runs `PRAGMA foreign_key_check` inside it via `prepare()` rather than `query()` so the
  statement cache cannot serve a pre-change plan, and records the ledger row. `PRAGMA foreign_keys`
  is toggled off around the whole loop and restored in a `finally`, because it is a silent no-op
  inside a transaction (`migrations.ts:137-140`, `migrations.ts:164-166`).

`options.dir` exists so the tests can point at a temp directory; `backend/test/migrate.test.ts` is
the only caller that overrides it. `backend/migrations/001-initial-schema.sql` is currently the only
migration, and its header explains that its `IF NOT EXISTS` guards are specific to migration 001 —
databases from before the migration system already hold those tables — and that later migrations
should not use them.

### The static half

Reached only through `fetch`, i.e. only when no `/api` pattern matched.

- `backend/src/paths.ts` is described in its header as "the one place a URL becomes a filesystem
  path". `REPO_ROOT` is resolved relative to the module's own location (`paths.ts:14`) with a comment
  noting this only holds while the file sits directly in `backend/src/`.
  `resolveStaticPath(pathname)` (`paths.ts:42-58`) decodes, rejects NUL bytes, and returns null when
  the resolved target escapes `FRONTEND_DIR`. `VENDOR_FILES` (`paths.ts:23-25`) is a one-entry
  allowlist mapping `/vendor/pico.css` to a package specifier, resolved through `Bun.resolveSync` —
  an allowlist rather than a served directory so that installing a package never exposes anything.
- `backend/src/static.ts:8-57` — rejects non-GET/HEAD with 405, tries the vendor map, then the
  frontend path, appends `index.html` for directory-ish paths, routes `.ts` files to
  `transpileModule`, and falls back to `index.html` for extensionless unknown paths so the SPA can
  route them. It deliberately sets no `Content-Type` for ordinary files, with a comment
  (`static.ts:41-45`) explaining that `new Response(Bun.file(x))` already carries Bun's inferred type
  from a complete MIME database and a hand-written map would drift.
- `backend/src/transpile.ts:21-37` — one module-level `Bun.Transpiler({ loader: "ts", target: "browser" })`,
  `transformSync` per request, and a 500 naming the file on a syntax error. Its header records why
  this stays a transformation rather than a build: Bun's transpiler only erases types and does not
  rewrite import specifiers, so `import "./format.ts"` reaches the browser unchanged and asks for the
  file that actually exists. Types are erased, not checked — `bun run typecheck` is the gate.

### How the test suite enters the layers

`backend/test/helpers/server.ts:51-100` exposes `useServer()`, which registers `beforeEach`/`afterEach`
from inside the function — the comment at `helpers/server.ts:43-50` explains this is so each test
file gets its own hooks and database instead of sharing one through the module cache. Each test gets
`Bun.serve({ port: 0, ...serveOptions(new Repo(openDatabase(":memory:"))) })`, i.e. the full stack,
exercised over real HTTP.

The suite is split along the same seams as the source: `exercise.api.test.ts`, `workout.api.test.ts`,
`set.api.test.ts`, `meta.api.test.ts`, `static.api.test.ts`, and `migrate.test.ts` — the last of which
bypasses the server entirely and drives `migrate()` against temp-directory fixtures.

## Code References

- `backend/src/main.ts:10-33` — process entry point: open, serve, shut down
- `backend/src/server.ts:18-24` — `serveOptions(repo)`, the whole composition layer
- `backend/src/routes.ts:17-26` — the route registry and its one ordering rule
- `backend/src/routes/shared.ts:12-24` — `guard` / `guardAll`, the per-handler error boundary
- `backend/src/routes/shared.ts:26-27` — `MAX_NAME` / `MAX_NOTES`
- `backend/src/routes/workout.routes.ts:26-32` — the copy-from-workout POST handler
- `backend/src/routes/set.routes.ts:7-16` — `readSetBody`, shared with the workouts file
- `backend/src/http.ts:2-31` — `HttpError`, the constructors, and `errorResponse`
- `backend/src/http.ts:38-54` — `isJsonObject` guard and `readJsonObject`
- `backend/src/validate.ts:5-101` — every field parser, all throwing `badRequest`
- `backend/src/repo/index.ts:1-25` — the layer's SQL-containment rule and the facade's constructor
- `backend/src/repo/sql.ts:31-52` — `buildUpdate`, the shared PATCH mechanism
- `backend/src/repo/sets.ts:30-38` — sibling repositories injected to avoid an import cycle
- `backend/src/repo/workouts.ts:69-98` — the transactional create-with-copy
- `backend/src/repo/stats.ts:46-51` — the explicit null check before spreading two aggregate rows
- `backend/src/db.ts:12-24` — `openDatabase`: pragmas plus migration on every open
- `backend/src/migrations.ts:99-118` — the applied-versions-are-a-prefix consistency check
- `backend/src/migrations.ts:137-166` — foreign keys off around the loop, restored in `finally`
- `backend/src/paths.ts:42-58` — the traversal guard
- `backend/src/static.ts:8-57` — the `fetch` fallback chain
- `backend/src/transpile.ts:3-14` — why this is a transformation and not a build
- `backend/test/helpers/server.ts:51-65` — the suite entering through the same `serveOptions`

## Architecture Documentation

Patterns visible across the layers as they stand today:

- **Dependency direction.** Imports run entry point → composition → routes → repo → db →
  migrations, with `http.ts` and `validate.ts` as leaves that anything may import. The only edge
  running against the grain is `repo/* → ../http`, and it is deliberate: repositories throw
  `notFound`/`conflict` so no translation layer is needed between them and a handler.
- **Everything takes `repo` as an argument.** There is no module-level singleton, no container, and
  no global database handle. `openDatabase` is called by the three entry points and by the test
  helper, and the resulting `Repo` is threaded down by hand.
- **Composition returns options, not a server.** `serveOptions(repo)` gives the CLI and the test
  suite the identical stack; only the port and the database path differ.
- **One file per URL group, one class per table.** `routes/` and `repo/` are split along the same
  entity lines, and both are re-assembled by a small registry (`routes.ts`, `repo/index.ts`).
- **Errors are thrown, never returned.** A handler's happy path reads straight through; every
  failure is an `HttpError` thrown from `validate.ts` or from a repository's `require()`, caught by
  `guard`, and rendered by `errorResponse`. `guard` also catches non-`HttpError`s, so Bun's `error`
  hook is a net that requests do not normally reach.
- **PATCH is uniformly `isPresent` + `Partial<T>` + `buildUpdate`.** Presence is tested with
  `hasOwnProperty` and `in` rather than `!== undefined`, so an explicit `null` clears a column
  instead of being ignored.
- **Types travel with their data.** Row and input interfaces are declared in the repository file
  that queries them and re-exported through `repo/index.ts`; route files and tests import them from
  `../repo`.
- **Typed queries.** Every call is `db.query<Row, Params>(sql)` with both type arguments named, so
  the row shape and the bound parameters are checked at the call site.
- **Migrations are non-optional and fail loudly.** They run inside `openDatabase`, each in its own
  transaction with a `foreign_key_check`, and the runner refuses to proceed on a numbering
  inconsistency rather than skipping ahead.
- **Comments explain constraints, not mechanics.** The recurring pattern is a comment stating why a
  line cannot be written the obvious way — the un-spreadable Bun options union (`server.ts:6-10`),
  injected siblings avoiding a cycle (`sets.ts:30-33`), `prepare()` over `query()` after a schema
  change (`migrations.ts:147-148`), the absent `Content-Type` (`static.ts:41-45`).

## Open Questions

- An earlier research document, `docs/agents/research/2026-09-10-server-and-src-layout.md`, was
  written at commit `af42737`, which predates both `7db026a` ("Split server.ts into four modules")
  and `48c690a` ("refactor(db): Cleanup"). Its description of `server.ts` as the module that also
  holds the static-file serving no longer matches the tree; that responsibility now sits in
  `static.ts`, `paths.ts` and `transpile.ts`. This document describes the tree at `48c690a`.
- `repo/index.ts` currently delegates every method one-for-one. Whether the facade is meant to stay
  a pure pass-through as more entities arrive is not stated anywhere in the code.
- `MAX_NAME` and `MAX_NOTES` live in `routes/shared.ts` while narrower per-field caps (`60` for
  `muscle_group`, `1000` for reps, `100000` for weight) are written inline at their call sites. The
  rule for which limits are promoted to `shared.ts` is not documented.
