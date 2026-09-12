# Backend (`src/backend/`)

The backend is organised by feature, not by layer. `features/` holds one directory per thing the
app is about — `exercises/`, `workouts/`, `stats/`, `meta/`, `static/` — and each owns its routes,
its SQL and its mapping end to end. What is left outside `features/` is only what belongs to no
feature: `db/` (the connection and its PRAGMAs in `db.ts`, the schema in `migrations.ts` and
`migrations/`, and the table-agnostic statement helpers in `db/sql.ts`), `http/` (`routing.ts` for
the `RouteTable`/`Handler` types and the `guard`/`guardAll` wrapper, `routes.ts` for the registry,
`http.ts`, `errors.ts` and `server.ts`), `shared/validate.ts` for the request-field parsers and
their length bounds, and `main.ts`, the entry point that builds the facades and starts the
server. There is no `fetch` fallback — every URL the server answers is a declared pattern.

**Inside a feature, `ports/` is public and `internal/` is private.** `ports/` declares the row
types other features may read and the `to*` mappers that turn them into DTOs; `internal/` holds
everything about how the feature talks to its own table — the repository, its `<Entity>Input`, the
`from*` mappers and the translator. No module under `features/<a>/` may import from
`features/<b>/internal/`, and the arrows that do cross a feature line all land on a `ports/`: the
exercises repository queries the sets table, so it takes `SET_COLUMNS` and `EST_1RM_SQL` from
`features/workouts/ports/sql.ts` and `LiftSet` from `features/workouts/ports/set.ts`. The third
place a feature keeps code is its root, beside those two directories: the `*.routes.ts` files named
after the URL groups they answer, and the `<feature>.facade.ts` named after the feature itself — the
front door described below.

A request runs `body → translateTo<X>Dto → <X>Dto → from<X> → <Entity>Input → repository → row`,
and the response comes back through a `to*` mapper in `ports/`. The translator is where validation
happens and the mapper is where renaming happens; neither does the other's job.

**A route returns a DTO, never a row.** The wire format is declared once in `src/shared/dto/` —
camelCase, type-only, imported by the frontend as well — and each feature holds one mapper per
shape in each direction (`toLiftSet(row)` in `ports/`, `fromCreateSet(dto)` in `internal/`). Those
mappers are the only place that reads a row's fields outside the repository that produced it, and
each one names every field it maps: a spread would compile and would ship `workout_id` and
`created_at` to the browser with nothing to catch it. The camelCase rename is what keeps that
honest — a row is not structurally assignable to its own DTO.

`testing.ts` stays at the top of `src/backend/` because it belongs to no feature: it is test-only
plumbing every feature's tests use. The static feature keeps its own private modules where the rule
says they go — `features/static/internal/paths.ts` (the only place a URL becomes a filesystem path)
and `internal/transpile.ts`. The two operator entry points — `bun run migrate` and `bun run seed` —
live outside the backend entirely, in `src/scripts/`, so that `src/backend/` holds the running
server and nothing else.

A route belongs to the file its URL prefix names, with no exceptions to remember — so
`/api/workouts/:id/sets` is a workout route and lives in `workout.routes.ts`. Sets are part of the
workouts feature rather than a feature of their own, which is what makes that rule free of
exceptions: the schema already says so, and both route files sit side by side over the same
`internal/`. `routes.ts` holds no handler code at all. Its spread order is for readers rather than
for correctness: Bun matches by specificity (measured on 1.4.2), so `/api/health` wins over
`/api/*` and `/api/*` over `/*` wherever they are declared — but declaring the catch-alls last
reads the way the router dispatches.

**Every data-owning feature has a front door.** Each publishes exactly one facade module at its
root — `exercises/exercises.facade.ts`, `workouts/workouts.facade.ts`, `stats/stats.facade.ts` —
holding a `<Entity>Facade` per repository, and a route handler holds a facade rather than a
repository. A repository is named only by its own feature's facade, and constructed only by that
facade's factory, so `features/workouts/internal/` is the whole world in which `SetRepository`
exists as a name. That is what a facade buys: a published surface narrower than the repository
behind it (no `get()`, which only `require()` ever called), one place a repository is built, and a
boundary a linter can check — the `overrides` block in `.oxlintrc.json` fails `bun run lint` if a
`*.routes.ts` imports a `*.repository.ts`, type imports included. The facades are otherwise pure
delegation, and deliberately so; if a composition like `GET /api/workouts/:id` ever wants pushing
down out of its handler, the facade is where it goes.

The facades publish rows, not DTOs, so the rule above it is unchanged: a handler still maps what
the facade returns through a `to*` mapper, and the camelCase rename is still what the compiler
checks. `features/facades.ts` is the single composition root — it declares `Facades` (a parameter
object with no methods of its own) and `createFacades(db)` over the three per-feature factories,
and it is what `main.ts`, `testing.ts`, `src/scripts/seed.ts` and `http/server.test.ts` each call.
`allRoutes` then hands each route factory only the facades it uses: `workoutRoutes(workouts, sets)`,
`exerciseRoutes(exercises)`, and so on. All SQL lives in a feature's `internal/`; `db/sql.ts` keeps
only what names no table — `buildUpdate`, `isUniqueViolation` and `isForeignKeyViolation`.
Repositories reference each other only with `import type` and take what they need through their
constructor — `SetRepository(db, workouts)`, wired in `createWorkoutFacades` — so there is no
runtime cycle to trip over.

Error handling is by throwing: handlers throw `HttpError` and `guardAll()` in `http/routing.ts`
turns it into a JSON `{ error }` body with the right status. New API routes must be wrapped in
`guardAll` in whichever route file owns them. The static route is the one exception: it answers
plain text, not JSON, so `guard` would give it the wrong body — a throw out of it belongs to the
`error` hook in `http/server.ts` instead. Three statuses cover everything the API refuses —
400 for bad input, 404 for something missing, 409 for a conflict — which is why `http/errors.ts`
exports exactly `badRequest`, `notFound` and `conflict`. Which of the three a broken reference earns
depends on where the id came from: a workout id in the path that names nothing is a 404, while an
`exerciseId` in the body that names nothing is a 400. Nothing pre-checks the latter — the
`ON DELETE RESTRICT` foreign key refuses the write and `isForeignKeyViolation` turns the refusal
into the 400.

A write that needs more than one statement belongs in a single repository method wrapped in
`db.transaction()` — `WorkoutRepository.create(input, { copyFrom })` is the example, where the
workout and its copied sets commit together or not at all. The route files never open a
transaction; if a handler finds itself sequencing two writes, the sequence belongs in the
repository instead.

Three tables, `exercises ──< sets >── workouts`, and `sets` is the fact table: one row per set
performed, carrying `reps`, `weight`, free-text `notes` and a `position` that preserves the order
within a session. Its two foreign keys are deliberately asymmetric. `workout_id` is
`ON DELETE CASCADE`, so deleting a workout takes its sets with it; `exercise_id` is
`ON DELETE RESTRICT`, so deleting an exercise is refused while any set still points at it. History
can be thrown away deliberately, but it cannot silently lose its meaning.

The schema lives in `src/backend/db/migrations`, one numbered `.sql` file per change. `openDatabase()`
applies whatever is pending on every start: each file runs in its own transaction and is recorded in
`schema_migrations`, so a half-applied migration cannot exist. Foreign keys are switched off for the
duration of the run — SQLite's table-rebuild procedure needs that, and `PRAGMA foreign_keys` is a
silent no-op inside a transaction — and each migration must pass `PRAGMA foreign_key_check` before
it commits. Changing the schema means adding a file numbered above the current version; nothing
else. The runner refuses to start rather than guess when the files and the database disagree.

`serveOptions(facades)` is exported so the test suite can start a real server on port 0 against an
in-memory DB. `src/backend/testing.ts` wraps that in `useServer()`, which registers the
`beforeEach`/`afterEach` pair from inside the function — so each test file gets its own hooks and
its own database rather than sharing one through the module cache. Every `*.test.ts` sits beside
the module it exercises, and each one covers the module declaring the routes it drives, which is
why the two tests for `POST /api/workouts/:id/sets` are in `workout.routes.test.ts` and not beside
`set.routes.ts`. Tests are end-to-end over HTTP, with one exception:
`src/backend/db/migrations.test.ts` unit-tests the migration runner against throwaway fixture
directories, and `features/static/internal/paths.test.ts` pins the web root, which is derived by
counting directories up from that module's own URL and would otherwise 404 every asset in silence
if the file were moved. There are no unit tests of the repositories.

Static serving is deliberately narrow: `src/frontend/` with a path-escape guard, plus `VENDOR_FILES`
in `internal/paths.ts` — a one-file allowlist into `node_modules` (`/vendor/pico.css`). Serving anything
else from a package means adding it to that map. A trailing slash asks for `index.html` in that
directory, and a directory without one is a 404 rather than the single-page app — otherwise the
extension-less fallback would mask a real miss, which is the thing it exists to avoid.

Two things `static.routes.ts` deliberately does not do. It sets no `Content-Type` except on the vendor
stylesheet: `new Response(Bun.file(x))` already carries the type Bun infers from the extension,
off a complete MIME database (`.svg` → `image/svg+xml`, `.woff2` → `font/woff2`, `.png` →
`image/png`, `.webp` → `image/webp`, no extension → `application/octet-stream`, all measured on
Bun 1.4.2), so a hand-written map would be a subset that drifts. And it does not special-case
HEAD beyond letting it past the method check — Bun strips the body itself and leaves the headers
alone, which `src/backend/features/static/static.routes.test.ts:39` holds in place. What it does do is
own the `405 Method not allowed` for the whole server: `/*` is declared as a bare handler function
rather than a `{ GET, HEAD }` map, because a map answers an unmatched verb with an empty-bodied 404
and there is no `fetch` behind it to say otherwise. An unmatched verb on a vendor route falls
through to `/*` and is answered there.
