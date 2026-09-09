### Backend (`src/`)

A strict layering, one concern per file: `db.ts` (connection + schema DDL) → `repo.ts`
(**all** SQL, one method per operation, returns typed rows) → `routes.ts` (the `Bun.serve` route
table) → `server.ts` (entry point, static files). `validate.ts` parses and bounds every request
field; `http.ts` defines `HttpError` plus `badRequest`/`notFound`/`conflict`.

Error handling is by throwing: handlers throw `HttpError` and `guardAll()` in `routes.ts` turns
it into a JSON `{ error }` body with the right status. New routes must be wrapped in `guardAll`.

There are no migrations — `openDatabase()` applies idempotent `CREATE TABLE IF NOT EXISTS` DDL on
every start. A schema change to an existing column needs a hand-written path, not just an edit
to `SCHEMA`.

`serveOptions(repo)` is exported so the test suite can start a real server on port 0 against an
in-memory DB. Tests are end-to-end over HTTP; there are no unit tests of `Repo`.

Static serving is deliberately narrow: `public/` with a path-escape guard, plus `VENDOR_FILES`
in `server.ts` — a one-file allowlist into `node_modules` (`/vendor/pico.css`). Serving anything
else from a package means adding it to that map.
