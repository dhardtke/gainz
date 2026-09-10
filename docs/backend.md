### Backend (`src/`)

A strict layering, one concern per file: `db.ts` (connection + PRAGMAs) → `migrations.ts` (schema) →
`repo/` (**all** SQL, one method per operation, returns typed rows) → `routes.ts` (the `Bun.serve`
route table) → `server.ts` (entry point, static files). `validate.ts` parses and bounds every request
field; `http.ts` defines `HttpError` plus `badRequest`/`notFound`/`conflict`.

`repo/index.ts` is a facade: it owns no SQL, and delegates each method to one repository per entity
(`exercises.ts`, `workouts.ts`, `sets.ts`, `stats.ts`), which share their fragments and the single
dynamic-`UPDATE` builder through `repo/sql.ts`. The flat surface is deliberate — callers say
`repo.listSets(id)` and never reach a sub-repository. SQL lives under `repo/` and nowhere else.
The entity modules reference each other only with `import type`; `SetRepo` takes the siblings it
needs through its constructor, so there is no runtime cycle to trip over.

Error handling is by throwing: handlers throw `HttpError` and `guardAll()` in `routes.ts` turns
it into a JSON `{ error }` body with the right status. New routes must be wrapped in `guardAll`.

A write that needs more than one statement belongs in a single `Repo` method wrapped in
`db.transaction()` — `createWorkout(input, { copyFrom })` is the example, where the workout and its
copied sets commit together or not at all. `routes.ts` never opens a transaction; if a handler finds
itself sequencing two writes, the sequence belongs in the repository instead.

The schema lives in `migrations/`, one numbered `.sql` file per change. `openDatabase()` applies
whatever is pending on every start: each file runs in its own transaction and is recorded in
`schema_migrations`, so a half-applied migration cannot exist. Foreign keys are switched off for the
duration of the run — SQLite's table-rebuild procedure needs that, and `PRAGMA foreign_keys` is a
silent no-op inside a transaction — and each migration must pass `PRAGMA foreign_key_check` before
it commits. Changing the schema means adding a file numbered above the current version; nothing
else. The runner refuses to start rather than guess when the files and the database disagree.

`serveOptions(repo)` is exported so the test suite can start a real server on port 0 against an
in-memory DB. Tests are end-to-end over HTTP, with one exception: `test/migrate.test.ts` unit-tests
the migration runner against throwaway fixture directories. There are no unit tests of `Repo`.

Static serving is deliberately narrow: `public/` with a path-escape guard, plus `VENDOR_FILES`
in `server.ts` — a one-file allowlist into `node_modules` (`/vendor/pico.css`). Serving anything
else from a package means adding it to that map.
