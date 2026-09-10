---
date: 2026-09-10T20:15:18+00:00
git_commit: af4273798310ed3fbadc41716e98768fece6018e
branch: main
topic: "How backend/src/server.ts is built, and the file layout directly under backend/src/"
tags: [research, codebase, server, bun-serve, static-files, module-layout]
status: complete
---

# Research: `backend/src/server.ts` and the layout of `backend/src/`

## Research Question

How is `server.ts` built and what is in there? And what is the folder structure of the
files directly under `src/`?

## Summary

`backend/src/server.ts` (146 lines) is two things in one file: **the static-file half of
the HTTP surface**, and **the process entry point**. It contains no API handler and no SQL.
Its exported API is a single function, `serveOptions(repo)` (`backend/src/server.ts:114`),
which returns the option bag for `Bun.serve` — `{ routes, fetch, error }`. The API half of
that bag comes from elsewhere (`apiRoutes(repo)`); what `server.ts` itself implements is the
`fetch` fallback, `serveStatic` (`backend/src/server.ts:55`), reached only when no API route
pattern matched.

Everything below `serveOptions` in the file sits behind `if (import.meta.main)`
(`backend/src/server.ts:122`), so importing the module — which the test suite does — opens no
database, binds no port and installs no signal handlers.

`backend/src/` holds **nine `.ts` files and two directories**. The nine files are one concern
each, and the layering between them is documented in `docs/backend.md:3-9`: `db.ts` →
`migrations.ts` → `repo/` → `routes.ts` + `routes/` → `server.ts`, with `validate.ts` and
`http.ts` as leaf utilities used from the route layer. Three of the nine are runnable entry
points (`server.ts`, `migrate.ts`, `seed.ts`), matching three `package.json` scripts.

```
backend/
|-- migrations/                 numbered .sql schema files (001-initial-schema.sql)
|-- test/                       five *.api.test.ts over HTTP + migrate.test.ts, helpers/server.ts
`-- src/
    |-- server.ts      4.4 KB   ENTRY. serveOptions(repo), serveStatic, vendor allowlist, Bun.serve
    |-- migrate.ts     0.8 KB   ENTRY. applies pending migrations, prints the version, exits
    |-- seed.ts        3.5 KB   ENTRY. writes ~6 weeks of sample training history
    |-- db.ts          1.1 KB   openDatabase(path) + PRAGMAs + DEFAULT_DB_PATH; type DB
    |-- migrations.ts  6.5 KB   the migration runner: discover, assertConsistent, migrate
    |-- routes.ts      1.0 KB   apiRoutes(repo): spreads the routes/ tables into one table
    |-- http.ts        1.9 KB   HttpError, badRequest/notFound/conflict, json/noContent, readJsonObject
    |-- validate.ts    3.6 KB   per-field parsers: requiredString, pathId, queryInt, today, ...
    |-- transpile.ts   1.5 KB   Bun.Transpiler wrapper: serves frontend .ts as .js
    |-- repo/                   ALL SQL. index.ts facade + exercises/workouts/sets/stats + sql.ts
    `-- routes/                 one file per URL group + shared.ts (RouteTable, guard/guardAll)
```

How a request is answered, and where `server.ts` sits in it:

```
                          Bun.serve({ port, ...serveOptions(repo) })      server.ts:129
                                          |
                 +------------------------+------------------------+
                 |                        |                        |
            routes:                   fetch:                    error:
       apiRoutes(repo)             serveStatic                errorResponse
        (routes.ts:17)            (server.ts:55)              (http.ts:25)
                 |                        |
     /api/* matched here                  | nothing matched
                 |                        |
       routes/*.routes.ts        +--------+---------+---------------------+
       guardAll -> handler       |                  |                     |
                 |          /vendor/pico.css   file exists in         no extension
                 |          -> node_modules    frontend/              -> index.html
            repo/* (SQL)     (allowlist,       |                      (SPA fallback)
                 |            server.ts:18)    +-- .ts -> transpileModule()
                 v                             +-- else -> file, Cache-Control: no-cache
        json() / noContent()
```

## Detailed Findings

### `server.ts` — the module graph

Seven imports, and their direction says what the file is (`backend/src/server.ts:1-7`): two
from `node:` (`path`, `url`), then `./db`, `./http`, `./repo`, `./routes`, `./transpile`.
It is the only module under `src/` that imports both the database layer and the route layer,
because it is the only one that has to assemble them. Nothing imports `server.ts` except the
test helper.

Two module-level path constants are computed once at import
(`backend/src/server.ts:9-10`):

```ts
const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));
const FRONTEND_DIR = resolve(REPO_ROOT, "frontend");
```

`REPO_ROOT` is derived from the module's own URL rather than `process.cwd()`, so the two
directories do not depend on where the process was started. `../..` from `backend/src/`
lands on the repository root; `FRONTEND_DIR` is the sibling `frontend/` directory, which
holds `index.html` and `src/`.

### `server.ts` — the vendor allowlist

`VENDOR_FILES` (`backend/src/server.ts:18-20`) maps exactly one URL path to one package
specifier:

```ts
const VENDOR_FILES: Record<string, string> = {
  "/vendor/pico.css": "@picocss/pico/css/pico.orange.min.css",
};
```

The comment above it (`backend/src/server.ts:12-17`) records the reasoning: it is an
explicit allowlist of single files rather than a served directory, so installing a package
never exposes anything the app did not ask to publish. `resolveVendorPath`
(`backend/src/server.ts:22-32`) looks the pathname up in that map and, on a hit, resolves the
specifier with `Bun.resolveSync(specifier, REPO_ROOT)` inside a try/catch that returns `null`
rather than throwing. `docs/backend.md:50-52` states the same rule: serving anything else out
of a package means adding it to that map.

A resolved vendor file that does not exist on disk answers **500** with
`"Vendor stylesheet missing — run \`bun install\`"` (`backend/src/server.ts:66`) rather than
404, and a served one carries `Cache-Control: public, max-age=3600`
(`backend/src/server.ts:70`) — the comment notes it is versioned by the lockfile rather than
by the URL, and only changes on install.

### `server.ts` — the path-escape guard

`resolveStaticPath` (`backend/src/server.ts:37-53`) is the only place a URL becomes a
filesystem path. It performs three checks in order:

1. `decodeURIComponent(pathname)` inside a try/catch — a malformed escape returns `null`
   (`backend/src/server.ts:39-43`).
2. A literal NUL byte in the decoded path returns `null` (`backend/src/server.ts:44-46`).
3. The path is resolved as `resolve(FRONTEND_DIR, ".${normalize(decoded)}")` and then
   required to be `FRONTEND_DIR` itself or to start with `FRONTEND_DIR + sep`
   (`backend/src/server.ts:48-51`). `sep` is imported from `node:path`, so the comparison is
   separator-correct on Windows.

The `.` prefix before the normalized path is what turns an absolute-looking URL path into a
relative one before resolution.

### `server.ts` — `serveStatic`

`serveStatic(req)` (`backend/src/server.ts:55-100`) is the `fetch` fallback, and runs only
for requests no route pattern in `apiRoutes` claimed. Its sequence:

- Anything other than `GET`/`HEAD` returns **405** `"Method not allowed"`
  (`backend/src/server.ts:56-58`).
- The vendor allowlist is consulted first (`backend/src/server.ts:62-72`).
- `resolveStaticPath` runs; `null` is **404** (`backend/src/server.ts:74-77`).
- A pathname that is `/` or ends in `/` has `index.html` appended
  (`backend/src/server.ts:79-80`).
- If the candidate file exists and its extension is `.ts`, the response is delegated to
  `transpileModule(candidate)` (`backend/src/server.ts:85-87`). Any other existing file is
  served with `Cache-Control: no-cache` (`backend/src/server.ts:89`), the comment explaining
  that the app is a single page and assets carry hash-free URLs, so they revalidate.
- If nothing exists at the path **and** the pathname has no extension, `index.html` is served
  as the single-page-app fallback (`backend/src/server.ts:92-98`). Otherwise **404**.

The extension test is what makes the SPA fallback safe: a missing `.js` or `.css` is a real
404 rather than a copy of the HTML shell. The complementary guard is on the API side — the
`/api/*` catch-all in `routes/meta.routes.ts` answers unknown API paths with a JSON 404 so
they never reach this function.

### `server.ts` — `serveOptions` and the local option type

`GainzServeOptions` (`backend/src/server.ts:107-111`) is declared locally with three fields:
`routes: Bun.Serve.Routes<undefined, string>`, `fetch`, and `error`. The comment above it
(`backend/src/server.ts:102-106`) records why it is spelled out instead of reusing
`Bun.Serve.Options`: that type's port/unix union stops being spreadable into `Bun.serve` once
it is named.

`serveOptions(repo: Repo)` (`backend/src/server.ts:114-120`) returns
`{ routes: apiRoutes(repo), fetch: serveStatic, error: (err) => errorResponse(err) }`. The
repository arrives as a parameter and is closed over — there is no module-level database or
singleton anywhere in the chain. `errorResponse` is wired as `Bun.serve`'s own `error` hook,
so a throw that escapes the route table is rendered as the same JSON body a guarded handler
would have produced.

`docs/backend.md:40-42` records the reason this function is exported at all: the test suite
starts a real server on port 0 against an in-memory database. `backend/test/helpers/server.ts:58`
is the only non-CLI caller — `Bun.serve({ port: 0, ...serveOptions(new Repo(db)) })`.

### `server.ts` — the CLI entry point

Guarded by `if (import.meta.main)` (`backend/src/server.ts:122-145`):

1. `openDatabase(DEFAULT_DB_PATH, callback)` — the callback logs `applied <name>` per
   migration, using `basename(migration.file, ".sql")` (`backend/src/server.ts:123-125`).
   Migrations therefore run on every boot, before the port is bound.
2. `new Repo(db)` (`backend/src/server.ts:126`).
3. `const port = Number(process.env.PORT ?? 3000)` (`backend/src/server.ts:127`).
4. `Bun.serve({ port, ...serveOptions(repo) })` (`backend/src/server.ts:129`) — `port` is
   spread first, so it is a property of the same literal rather than part of `serveOptions`.
5. Two log lines: `gainz is lifting on ${server.url}` and the database path
   (`backend/src/server.ts:131-132`).
6. A `shutdown` closure awaiting `server.stop()`, then `db.close()`, then `process.exit(0)`,
   registered on both `SIGINT` and `SIGTERM` with `void shutdown()`
   (`backend/src/server.ts:134-144`).

### The files directly under `backend/src/`

**`db.ts` (1.1 KB)** — `export type DB = Database` (`backend/src/db.ts:6`) is the alias every
other module types against, so `bun:sqlite` is named in one place. `openDatabase(path, onMigration?)`
(`backend/src/db.ts:13-28`) creates the parent directory with `mkdirSync(..., { recursive: true })`
for an on-disk path, opens with `{ create: true }`, then sets three PRAGMAs: `journal_mode = WAL`
(on-disk only — the comment at `backend/src/db.ts:21` notes SQLite ignores it for `:memory:`),
`foreign_keys = ON`, and `busy_timeout = 5000`. It then calls `migrate(db, { onMigration })`
before returning, so no caller can hold a connection to an unmigrated database.
`DEFAULT_DB_PATH` (`backend/src/db.ts:30`) is `process.env.GAINZ_DB ?? "data/gainz.sqlite"`.

**`migrations.ts` (6.5 KB)** — the largest file under `src/`, and a self-contained migration
runner with no library behind it. It exports `Migration`, `MigrateResult`, `MigrateOptions`
(`backend/src/migrations.ts:13-34`), `MIGRATIONS_DIR` (`:36`, resolved from `import.meta.dir`),
`schemaVersion(db)` (`:55`) and `migrate(db, options)` (`:121`). The ledger table
`schema_migrations` is created with `CREATE TABLE IF NOT EXISTS` on every run (`:38-44`), and
filenames must match `/^(\d{3,})-([a-z0-9]+(?:-[a-z0-9]+)*)\.sql$/` (`:47`). `discover`
(`:64-93`) throws on an unparseable name, on version `< 1`, and on two files sharing a
version. `assertConsistent` (`:99-118`) enforces that applied versions form an unbroken
prefix of the files on disk, throwing either "the database is newer than this checkout" or a
renumber instruction. In `migrate` itself, `PRAGMA foreign_keys = OFF` is set outside the
loop and restored in a `finally` (`:140`, `:165`) — the comment explains SQLite's 12-step
table rebuild needs it and that the pragma is a silent no-op inside a transaction. Each file
runs in its own `db.transaction()`, followed by a `PRAGMA foreign_key_check` that throws if
it returns a row, and then the ledger insert (`:144-155`). The check deliberately uses
`db.prepare` rather than `db.query` because the schema just changed and must not come from
the statement cache (`:148-149`).

**`migrate.ts` (0.8 KB)** — the `bun run migrate` entry point (`package.json`). `main()`
(`backend/src/migrate.ts:9-21`) prints the database path, calls `openDatabase` with a counting
callback, then reports either `now at schema version N` or
`already at schema version N — nothing to apply`, and closes the database. Behind
`import.meta.main` (`:23`). The header comment notes the server does the same work on boot,
so this exists only for doing it deliberately.

**`routes.ts` (1.0 KB)** — holds no handler code. `apiRoutes(repo)`
(`backend/src/routes.ts:17-26`) spreads six partial tables in a fixed order: `metaRoutes()`,
`statsRoutes(repo)`, `exerciseRoutes(repo)`, `workoutRoutes(repo)`, `setRoutes(repo)`,
`notFoundRoute()`. The doc comment (`:9-16`) states order matters only at the ends, because
the `/api/*` catch-all has to come last.

**`http.ts` (1.9 KB)** — the HTTP vocabulary. `HttpError` (`backend/src/http.ts:2-11`) carries
`status`, `message` and optional `details`; `badRequest` (400), `notFound` (404) and
`conflict` (409) are one-line constructors (`:13-15`). `json(data, status = 200, headers = {})`
(`:17`) wraps `Response.json`; `noContent()` (`:21`) is a 204 with a null body.
`errorResponse(err)` (`:25-31`) renders an `HttpError` as `{ error, details }` at its status,
and logs anything else before returning a generic 500. `readJsonObject(req)` (`:43-54`)
rejects unparseable JSON and any non-plain-object body, narrowing through the `isJsonObject`
type guard (`:38-40`) — written as a guard rather than a check plus a cast so the caller gets
the same narrowing.

**`validate.ts` (3.6 KB)** — nine exported parsers, each throwing `badRequest` with a message
naming the field: `isPresent` (`:5`), `requiredString` (`:10`), `optionalString` (`:23`),
`requiredInt` (`:41`), `requiredNumber` (`:57`), `requiredDate` (`:71`), `pathId` (`:80`),
`queryInt` (`:88`), `today` (`:100`). Bounds are parameters (`{ min, max }`), so the limits
live at the route call sites rather than here. Two normalisation decisions are encoded:
`optionalString` collapses `undefined`, `null` and empty-after-trim all to `null` (`:23-39`),
and `requiredNumber` rounds to two decimals with `Math.round(num * 100) / 100`, the comment
citing `2.5000000000000004`-style noise (`:66-67`). Both `requiredInt` and `requiredNumber`
accept a non-empty numeric string as well as a number.

**`transpile.ts` (1.5 KB)** — one module-level `new Bun.Transpiler({ loader: "ts", target: "browser" })`
(`backend/src/transpile.ts:15`) reused across requests, and `transpileModule(path)` (`:21-37`),
which reads the file, calls `transformSync`, and returns the result as
`text/javascript;charset=utf-8` with `Cache-Control: no-cache`. A transpile failure is logged
with the path and answered **500** with `Could not transpile <basename>` (`:27-32`); the
comment explains that a syntax error would otherwise reach the browser as a blank view, and
that this lets `gz-app`'s failed-import path put it in a toast. The header comment (`:3-14`)
records the property the no-build-step frontend rests on: Bun's transpiler only erases types
and does not rewrite import specifiers, so `import "./format.ts"` reaches the browser
unchanged and asks for the file that exists on disk. It also states that types are erased,
not checked — `bun run typecheck` is the gate.

**`seed.ts` (3.5 KB)** — `bun run seed`. Data lives in three module constants: six `EXERCISES`
(`backend/src/seed.ts:9-16`), three day `TEMPLATES` with starting weight, weekly step and rep
scheme (`:19-39`), and a `SET_NOTES` rotation (`:41`). `main()` (`:49-108`) opens the default
database, returns early if `repo.countWorkouts() > 0`, then wraps the whole generation in one
`db.transaction()` (`:62-103`) — the comment noting a half-failed seeder should leave nothing
behind, and that `createWorkout` opens a transaction of its own which nests as a savepoint.
It walks six weeks backwards, applying `lift.start + (weeks - 1 - week) * lift.step` as the
progression, and finishes by printing `repo.summary()` counts. Unlike `server.ts` and
`migrate.ts`, the call to `main()` at `:110` is unconditional rather than guarded by
`import.meta.main`.

### `repo/` — all SQL

Six files. `index.ts` declares `Repo` (`backend/src/repo/index.ts:14`), whose constructor
(`:20-25`) takes a `DB` and eagerly builds four private repositories: `ExerciseRepo(db)`,
`WorkoutRepo(db)`, `SetRepo(db, this.workouts, this.exercises)` and `StatsRepo(db)`. The
surface is flat and renamed — `exercises.list()` is exposed as `listExercises()` — and every
body is a single delegating `return`. Line 12 re-exports the entity types as a barrel, so
route modules import `Repo` and its DTOs from the same specifier.

`sql.ts` executes nothing: it holds `EST_1RM_SQL` (the Epley formula
`s.weight * (1 + s.reps / 30.0)`), the shared `EXERCISE_COLUMNS` / `SET_COLUMNS` fragments,
`isUniqueViolation(err)`, and `buildUpdate(table, fields, patch)` — a dynamic `UPDATE`
builder that tests membership with `field in patch` rather than `!== undefined`, so an
explicit `null` still clears a column, and that takes column names only from a hard-coded
`fields` tuple, never from patch keys.

Recurring patterns across the entity repositories: a nullable `get(id)` paired with a
throwing `require(id)` that raises `notFound(...)`; the same five-step update idiom
(`require` → `buildUpdate` → skip if `null` → run → re-read through `require`); `db.query<Row, Params>()`
everywhere with SQL aliases written to match the interface field names, so there is no manual
row mapper; and `INSERT ... RETURNING` on creation. Exactly one transaction exists in the
layer — `WorkoutRepo.create` (`backend/src/repo/workouts.ts:70-97`), which commits the
workout and its copied sets together. `SetRepo` receives its sibling repositories through its
constructor rather than importing them, because `exercises.ts` already needs the `LiftSet`
type from `sets.ts`; a value import either way would close a cycle.

### `routes/` — one file per URL group

Six files. Five export a factory returning a `RouteTable`, all taking `repo` except the meta
module: `exerciseRoutes`, `workoutRoutes`, `setRoutes`, `statsRoutes`, and
`metaRoutes()` / `notFoundRoute()`. `shared.ts` (28 lines) holds the types `RouteTable`
(`Bun.Serve.Routes<undefined, string>`), `ParamRequest` (`Request & { params: ... }`) and
`Handler`; the `guard(handler)` try/catch that funnels a throw into `errorResponse`; the
`guardAll(handlers)` that maps a method map through it; and the two shared limits
`MAX_NAME = 120` and `MAX_NOTES = 2000`.

The full inventory the route tables produce:

| Pattern | Methods | File |
| --- | --- | --- |
| `/api/health` | GET | `meta.routes.ts:8` |
| `/api/stats/summary` | GET | `stats.routes.ts:8` |
| `/api/exercises` | GET, POST | `exercise.routes.ts:18-19` |
| `/api/exercises/:id` | GET, PATCH, DELETE | `exercise.routes.ts:23-44` |
| `/api/exercises/:id/progress` | GET | `exercise.routes.ts:47-56` |
| `/api/workouts` | GET, POST | `workout.routes.ts:19-32` |
| `/api/workouts/:id` | GET, PATCH, DELETE | `workout.routes.ts:36-60` |
| `/api/workouts/:id/sets` | GET, POST | `workout.routes.ts:64-73` |
| `/api/sets/:id` | GET, PATCH, DELETE | `set.routes.ts:21-48` |
| `/api/*` | any | `meta.routes.ts:16-18` |

There is no `POST /api/sets`; a set is created only through the workout-scoped route, which
is why `readSetBody` is exported from `set.routes.ts` and imported by `workout.routes.ts`.
`docs/backend.md:11-14` states the rule that produces that direction: a route belongs to the
file its URL prefix names.

## Code References

- `backend/src/server.ts:9-10` — `REPO_ROOT` / `FRONTEND_DIR`, derived from `import.meta.url`
- `backend/src/server.ts:18-20` — `VENDOR_FILES`, the one-entry node_modules allowlist
- `backend/src/server.ts:22-32` — `resolveVendorPath`, `Bun.resolveSync` in a try/catch
- `backend/src/server.ts:37-53` — `resolveStaticPath`, the decode/NUL/prefix escape guard
- `backend/src/server.ts:55-100` — `serveStatic`, the whole static half of the server
- `backend/src/server.ts:85-87` — the `.ts` branch that hands off to `transpileModule`
- `backend/src/server.ts:92-98` — the extension-less SPA fallback to `index.html`
- `backend/src/server.ts:102-111` — `GainzServeOptions` and why it is declared locally
- `backend/src/server.ts:114-120` — `serveOptions(repo)`, the only export
- `backend/src/server.ts:122-145` — the `import.meta.main` entry point and signal shutdown
- `backend/src/db.ts:13-28` — `openDatabase`, PRAGMAs, and the migrate-on-open call
- `backend/src/db.ts:30` — `DEFAULT_DB_PATH` and the `GAINZ_DB` override
- `backend/src/migrations.ts:121-169` — `migrate`, the foreign-key toggle and per-file transaction
- `backend/src/migrations.ts:99-118` — `assertConsistent`, the unbroken-prefix rule
- `backend/src/routes.ts:17-26` — `apiRoutes`, the six spreads in order
- `backend/src/http.ts:2-31` — `HttpError`, the constructors, `json`/`noContent`/`errorResponse`
- `backend/src/validate.ts:5-102` — the nine field parsers
- `backend/src/transpile.ts:15-37` — the shared transpiler and `transpileModule`
- `backend/src/seed.ts:49-110` — `main()`, the single wrapping transaction, the unguarded call
- `backend/src/repo/index.ts:14-25` — the `Repo` facade and its four sub-repositories
- `backend/src/routes/shared.ts:4-27` — `RouteTable`, `guard`, `guardAll`, `MAX_NAME`, `MAX_NOTES`
- `backend/test/helpers/server.ts:57-58` — `serveOptions` over an in-memory database on port 0
- `docs/backend.md:1-52` — the documented layering, transaction rule and static-serving policy

## Architecture Documentation

Patterns currently in force, as observed:

1. **One concern per file, in a stated order.** `docs/backend.md:3-9` names the layering and
   the files match it; no file under `src/` spans two layers. `server.ts` is the only place
   the database layer and the route layer meet.
2. **Dependency by parameter, never by module singleton.** `Repo` is constructed once at the
   entry point and threaded down through `serveOptions(repo)` → `apiRoutes(repo)` → each
   route factory. No module under `src/` holds a database at import time.
3. **Entry points behind `import.meta.main`.** `server.ts` and `migrate.ts` guard their
   `main`-equivalent so importing them is side-effect free; `seed.ts` calls `main()`
   unconditionally.
4. **Routing is data, static serving is code.** The API surface is an object literal built by
   `apiRoutes`; the static surface is the imperative `serveStatic` function reached only as
   `fetch`. The `/api/*` catch-all keeps the two from overlapping.
5. **Failures travel as thrown `HttpError`.** `guardAll` at the route boundary and
   `errorResponse` as `Bun.serve`'s `error` hook are the two translation points;
   `server.ts` installs the second one.
6. **Path handling is allowlist-first, then guarded.** Vendor files come from an explicit map;
   everything else must resolve inside `FRONTEND_DIR` after decoding and NUL rejection.
7. **The frontend is transformed, not built.** `.ts` is transpiled per request at the URL its
   source lives at, which is why `serveStatic` branches on extension rather than consulting a
   manifest or an output directory.
8. **Cache headers are chosen per class of asset.** `no-cache` for app files and transpiled
   modules; `public, max-age=3600` for the lockfile-versioned vendor stylesheet.

## Open Questions

- `serveStatic` answers `405` for verbs other than `GET`/`HEAD`, but `HEAD` is otherwise
  handled by returning the same `Response` a `GET` would produce; whether Bun strips the body
  is not stated anywhere in the repository.
- No `Content-Type` is set explicitly for non-`.ts` static files — it comes from `Bun.file`'s
  own type inference, and nothing documents the expected behaviour for extensions Bun does
  not recognise.
- The `error` hook and `guardAll` both call `errorResponse`, so the conditions under which a
  throw reaches the hook rather than the guard are not exercised by anything in
  `backend/test/`.
