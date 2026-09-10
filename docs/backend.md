# Backend (`backend/src/`)

A strict layering, one concern per file: `db.ts` (connection + PRAGMAs) → `migrations.ts` (schema) →
`repo/` (**all** SQL, one method per operation, returns typed rows) → `routes.ts` (the registry that
spreads the route files into one `Bun.serve` table) and `routes/` (one file per URL group:
`meta.routes.ts`, `stats.routes.ts`, `exercise.routes.ts`, `workout.routes.ts`, `set.routes.ts`,
over the shared plumbing in `routes/shared.ts`) → `server.ts` (the `Bun.serve` options) →
`main.ts` (entry point). The static half hangs off `server.ts` as its `fetch` fallback:
`static.ts` (serves `frontend/` and the vendor allowlist) over `paths.ts` (the only place a URL
becomes a filesystem path). `validate.ts` parses and bounds every request field; `http.ts`
defines `HttpError` plus `badRequest`/`notFound`/`conflict`.

A route belongs to the file its URL prefix names, with no exceptions to remember — so
`/api/workouts/:id/sets` is a workout route, and `workout.routes.ts` imports `readSetBody` from
`set.routes.ts` rather than the other way round. `routes.ts` holds no handler code at all; the
`/api/*` catch-all is spread last so every named pattern is matched before it.

`repo/index.ts` is a facade: it owns no SQL, and delegates each method to one repository per entity
(`exercises.ts`, `workouts.ts`, `sets.ts`, `stats.ts`), which share their fragments and the single
dynamic-`UPDATE` builder through `repo/sql.ts`. The flat surface is deliberate — callers say
`repo.listSets(id)` and never reach a sub-repository. SQL lives under `repo/` and nowhere else.
The entity modules reference each other only with `import type`; `SetRepo` takes the siblings it
needs through its constructor, so there is no runtime cycle to trip over.

Error handling is by throwing: handlers throw `HttpError` and `guardAll()` in `routes/shared.ts`
turns it into a JSON `{ error }` body with the right status. New routes must be wrapped in
`guardAll` in whichever route file owns them.

A write that needs more than one statement belongs in a single `Repo` method wrapped in
`db.transaction()` — `createWorkout(input, { copyFrom })` is the example, where the workout and its
copied sets commit together or not at all. The route files never open a transaction; if a handler
finds itself sequencing two writes, the sequence belongs in the repository instead.

The schema lives in `backend/migrations/`, one numbered `.sql` file per change. `openDatabase()`
applies whatever is pending on every start: each file runs in its own transaction and is recorded in
`schema_migrations`, so a half-applied migration cannot exist. Foreign keys are switched off for the
duration of the run — SQLite's table-rebuild procedure needs that, and `PRAGMA foreign_keys` is a
silent no-op inside a transaction — and each migration must pass `PRAGMA foreign_key_check` before
it commits. Changing the schema means adding a file numbered above the current version; nothing
else. The runner refuses to start rather than guess when the files and the database disagree.

`serveOptions(repo)` is exported so the test suite can start a real server on port 0 against an
in-memory DB. `backend/src/testing.ts` wraps that in `useServer()`, which registers the
`beforeEach`/`afterEach` pair from inside the function — so each test file gets its own hooks and
its own database rather than sharing one through the module cache. Every `*.test.ts` sits beside
the module it exercises, and each one covers the module declaring the routes it drives, which is
why the two tests for `POST /api/workouts/:id/sets` are in `workout.routes.test.ts` and not beside
`set.routes.ts`. Tests are end-to-end over HTTP, with one exception:
`backend/src/migrations.test.ts` unit-tests the migration runner against throwaway fixture
directories. There are no unit tests of `Repo`.

Static serving is deliberately narrow: `frontend/` with a path-escape guard, plus `VENDOR_FILES`
in `paths.ts` — a one-file allowlist into `node_modules` (`/vendor/pico.css`). Serving anything
else from a package means adding it to that map.

Two things `static.ts` deliberately does not do. It sets no `Content-Type` except on the vendor
stylesheet: `new Response(Bun.file(x))` already carries the type Bun infers from the extension,
off a complete MIME database (`.svg` → `image/svg+xml`, `.woff2` → `font/woff2`, `.png` →
`image/png`, `.webp` → `image/webp`, no extension → `application/octet-stream`, all measured on
Bun 1.4.2), so a hand-written map would be a subset that drifts. And it does not special-case
HEAD beyond letting it past the method check — Bun strips the body itself and leaves the headers
alone, which `backend/src/static.test.ts:39` holds in place.
