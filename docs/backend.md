# Backend (`src/backend/`)

The backend is organised by feature, not by layer. `features/` holds one directory per thing the
app is about — `exercises/`, `workouts/`, `stats/`, `meta/`, `static/` — and each owns its routes,
its SQL and its mapping end to end, the mapping reached through its controllers and its facade. What is left outside `features/` is only what belongs to no
feature: `db/` (the connection and its PRAGMAs in `db.ts`, the schema in `migrations.ts` and
`migrations/`, and the table-agnostic statement helpers in `db/sql.ts`), `http/` (`routing.ts` for
the `RouteTable` and `ParamRequest` types, `routes.ts` for the registry,
`http.ts`, `errors.ts` and `server.ts`, with `http.ts` holding `pathId` and `queryInt` beside
`readJsonObject`), `shared/validate.ts` for the request-field rules and their length bounds, and
`main.ts`, the entry point that opens the database and starts the server
through `startServer`. There is no `fetch` fallback — every URL the server answers is a declared pattern.

**Inside a feature, `ports/` is public and `internal/` is private.** `ports/` declares the row
types other features may read and the `to*` mappers that turn them into DTOs; `internal/` holds
everything about how the feature talks to its own table — the repository, its `Create<Entity>` and `Edit<Entity>` (a `Partial` of it), the
translator, which casts a body onto its request DTO and translates a DTO into that input — and the controllers, one `<x>.controller.ts` per route file and
named after it. No module under `features/<a>/` may import from `features/<b>/internal/`, and the
arrows in production code that do cross a feature line all land on a `ports/`: the exercises
repository queries the sets table, so it takes `SET_COLUMNS` and `EST_1RM_SQL` from
`features/workouts/ports/sql.ts` and `LiftSet` from `features/workouts/ports/set.ts`. The third place
a feature keeps code is its root, beside those two directories: the `*.routes.ts` files named after
the URL groups they answer, the `<feature>.facade.ts` named after the feature itself — the front
door described below — and, for a feature whose data other tests need, a test-only
`<feature>.fixtures.ts`.

A route file is only a table: each handler is one line that passes the request to its controller
and returns what comes back. The controller does the rest. It takes the
request and returns a `Response`, reading it with `pathId`, `queryInt` and `readJsonObject` and
answering with `json()` or `noContent()` and the status code, and in between it runs
`body → translateTo<X>Dto → <X>Dto → facade → row → to<X> → DTO`. The facade's write methods in
turn run `validate → <X>Dto → translateDtoTo<Create|Edit><Entity> → <Create|Edit><Entity> → repository`. The
translator's body-to-DTO half only casts, so a request DTO is unchecked until the facade has
validated and normalised it, which happens before anything touches the database; its DTO-to-input
half is where renaming happens. Neither half, nor the facade, does another's job.

**A controller answers with a DTO, never a row.** The wire format is declared once in `src/shared/dto/` —
camelCase, type-only, imported by the frontend as well — and each feature holds one function per
shape in each direction (the `toLiftSet(row)` mapper in `ports/`, called by the controller, and
`translateDtoToCreateSet(dto)` in `internal/set.translator.ts`, called by the facade). Those
functions are the only place that reads a row's fields outside the repository that produced it, and
each one names every field it maps: a spread would compile and would ship `workout_id` and
`created_at` to the browser with nothing to catch it. The camelCase rename is what keeps that
honest — a row is not structurally assignable to its own DTO.

Ids and dates are flavored on both sides of that rename. `src/shared/flavors.ts` declares
`WorkoutId`, `ExerciseId`, `LiftSetId`, `Iso8601Date` (`YYYY-MM-DD`) and `Iso8601DateTime` (what
SQLite writes into `created_at`), and the rows, the repository signatures, the bound-parameter
tuples on `db.query` and the DTOs all name the one they carry. A plain `number` or `string` still
flows into a flavor, so nothing needs a cast; what the compiler refuses is one flavor standing in
for another, which is why a workout id can no longer be handed to `exercises.require()` and a
`created_at` can no longer be formatted as a calendar date. `pathId` deliberately still returns a
plain `number` — a path segment has no flavor of its own, and the controller names it as it binds
the local (`const id: WorkoutId = pathId(req.params.id, 'workout')`).

`testing.ts` stays at the top of `src/backend/` because it belongs to no feature: it is test-only
plumbing every feature's tests use, and it holds only technical hooks — `useServer()`, `useTempDir()`,
`body()` and `at()`. The fixtures that create a feature's data over HTTP — `createExercise` in
`exercises/exercises.fixtures.ts` and `createWorkout` in `workouts/workouts.fixtures.ts` — live in
the feature that owns the endpoint and take `post` from `useServer()` as their first argument.
Other features' route tests import them directly, the one cross-feature import that does not go
through `ports/`. The static feature keeps its own private modules where the rule
says they go — `features/static/internal/paths.ts` (the only place a URL becomes a filesystem path)
and `internal/transpile.ts` — and calls them from `internal/static.controller.ts`. The two operator entry points — `bun run migrate` and `bun run seed` —
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
holding a `<Entity>Facade` per repository. A route handler holds its controller, and the controller
holds the facades. A repository is named only by its own feature's facade, and constructed only by
that facade's factory, so `features/workouts/internal/` is the whole world in which `SetRepository`
exists as a name. That is what a facade buys: a published surface narrower than the repository
behind it (no `get()`, which only `require()` ever called), one place a repository is built, and a
boundary a linter can check. The `overrides` block in `.oxlintrc.json` holds three rules. Two
restrict imports, type imports included: no `*.routes.ts` — `static.routes.ts` among them — may
import anything under `internal/` except its controller, anything under `ports/`, a
`*.repository.ts`, or the request and response helpers (`http/http.ts`, `http/errors.ts`,
`shared/validate.ts`), which is what keeps its handlers one line long; and no `*.controller.ts` may
import a `*.repository.ts`. The third exempts `*.translator.ts` from
`typescript/no-unsafe-type-assertion`, since casting a body onto a DTO is half of a translator's job.
The facades are not pure delegation: their write methods validate and map the request with the
facade's own private `validateCreate` / `validateEdit` methods before calling the repository.
Composition across facades, like `GET /api/workouts/:id` reading a workout and its sets, still
lives in the controller, and the facade is where it goes if it ever needs to move further down.

The facades take request DTOs and publish rows, so the rule above it is unchanged: the controller
maps what the facade returns through a `to*` mapper, and the camelCase rename is still what the
compiler checks.
`features/facades.ts` is the single composition root — it declares `Facades` (a parameter object
with no methods of its own) and `createFacades(db)` over the three per-feature factories, and it is
what `http/server.ts` and `src/scripts/seed.ts` each call. `seed.ts` hands the facades camelCase
DTOs, so seeded data passes the same validation as the API.
`allRoutes` then hands each route factory only the facades it uses: `workoutRoutes(workouts, sets)`,
`exerciseRoutes(exercises)`, and so on, and each factory builds its own controller from them. `meta`
and `static` have controllers but no facade: there is no table behind either. All SQL lives in a feature's `internal/`; `db/sql.ts` keeps
only what names no table — `buildUpdate`, `isUniqueViolation` and `isForeignKeyViolation`.
Repositories reference each other only with `import type` and take what they need through their
constructor — `SetRepository(db, workouts)`, wired in `createWorkoutFacades` — so there is no
runtime cycle to trip over.

Error handling is by throwing: controllers throw `HttpError`, directly or through the facades they
call — the facades' validation and the repositories behind them — and the `error` hook in `http/server.ts` turns any throw from any
route into a JSON `{ error }` body with the right status. It is the one error path, for the API and
the static route alike, so a new route needs nothing to get it — Bun hands the hook a throw from a
synchronous or async method map and from a bare-function route (measured on 1.4.2). Three statuses cover everything the API refuses —
400 for bad input, 404 for something missing, 409 for a conflict — which is why `http/errors.ts`
exports exactly `badRequest`, `notFound` and `conflict`. Which of the three a broken reference earns
depends on where the id came from: a workout id in the path that names nothing is a 404, while an
`exerciseId` in the body that names nothing is a 400. Nothing pre-checks the latter — the
`ON DELETE RESTRICT` foreign key refuses the write and `isForeignKeyViolation` turns the refusal
into the 400.

A write that needs more than one statement belongs in a single repository method wrapped in
`db.transaction()` — `WorkoutRepository.create(input, { copyFrom })` is the example, where the
workout and its copied sets commit together or not at all. Neither the route files nor the
controllers ever open a transaction; if a controller finds itself sequencing two writes, the
sequence belongs in the repository instead.

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

`startServer(db, port)` in `http/server.ts` is the one place `Bun.serve` is called: `main.ts` passes
`PORT`, and `useServer()` in `src/backend/testing.ts` passes port 0 and an in-memory database.
`useServer()` registers the `beforeEach`/`afterEach` pair from inside the function — so each test file gets its own hooks and
its own database rather than sharing one through the module cache. Every `*.test.ts` sits beside
the module it exercises, and each one covers the module declaring the routes it drives, which is
why the two tests for `POST /api/workouts/:id/sets` are in `workout.routes.test.ts` and not beside
`set.routes.ts`. Tests are end-to-end over HTTP, with seven exceptions: `db/db.test.ts` checks the real
migrations; `db/migrations.test.ts` unit-tests the migration runner against throwaway fixture
directories; `features/static/internal/paths.test.ts` pins the web root, which is derived by
counting directories up from that module's own URL and would otherwise 404 every asset in silence
if the file were moved; `http/errors.test.ts` covers `errorResponse`, whose 500 branch cannot be
provoked over HTTP; `shared/validate.test.ts` pins the field helpers' normalisation edge cases; and
`features/exercises/exercises.facade.test.ts` and `features/workouts/workouts.facade.test.ts` drive
each facade's validation directly, including that a bad body on an unknown id is a 400 rather than
a 404. There are no unit tests of the repositories.

Static serving is deliberately narrow: `src/frontend/` with a path-escape guard, plus `VENDOR_FILES`
in `internal/paths.ts` — a one-file allowlist into `node_modules` (`/vendor/pico.css`). Serving anything
else from a package means adding it to that map. A trailing slash asks for `index.html` in that
directory, and a directory without one is a 404 rather than the single-page app — otherwise the
extension-less fallback would mask a real miss, which is the thing it exists to avoid. All of
that — the path-escape guard, the vendor allowlist, the directory index, the single-page fallback
and transpiling — lives in `internal/static.controller.ts`, and `static.routes.ts` only declares
the URLs that reach it.

Two things the static feature deliberately does not do. It sets a `Content-Type` only on responses
whose body is not a file on disk with a telling extension — the vendor stylesheet and transpiled
modules — and otherwise leaves it to `new Response(Bun.file(x))`, which already carries the type Bun infers from the extension,
off a complete MIME database (`.svg` → `image/svg+xml`, `.woff2` → `font/woff2`, `.png` →
`image/png`, `.webp` → `image/webp`, no extension → `application/octet-stream`, all measured on
Bun 1.4.2), so a hand-written map would be a subset that drifts. And it does not special-case
HEAD beyond letting it past the method check — Bun strips the body itself and leaves the headers
alone, which `src/backend/features/static/static.routes.test.ts:39` holds in place. What it does do is
own the `405 Method not allowed` for the whole server, answered by `StaticController.frontend`: `/*` is declared as a bare handler function
rather than a `{ GET, HEAD }` map, because a map answers an unmatched verb with an empty-bodied 404
and there is no `fetch` behind it to say otherwise. An unmatched verb on a vendor route falls
through to `/*` and is answered there.
