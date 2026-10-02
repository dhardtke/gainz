# Backend (`src/backend/`)

The backend is organized by feature, not by layer. `features/` holds one directory per thing the
app is about — `exercises/`, `workouts/`, `stats/`, `meta/`, `static/`, `dev/` — and each owns its routes,
its SQL and its mapping end to end, the mapping reached through its controllers and its facade. What is left outside `features/` is only what belongs to no
feature: `db/` (the connection and its PRAGMAs in `db.ts`, the schema in `migrations.ts` and
`migrations/`, and the table-agnostic statement helpers in `db/sql.ts`), `http/` (`routing.ts` for
the `RouteTable` and `ParamRequest` types, `routes.ts` for the registry,
`http.ts`, `errors.ts` and `server.ts`, with `http.ts` holding `pathId`, `queryInt` and
`optionalQueryInt` beside `readJsonObject`), `shared/validate.ts` for the request-field rules and their length bounds, and
`main.ts`, the entry point that opens the database and starts the server
through `startServer`. There is no `fetch` fallback — every URL the server answers is a declared pattern.

**Inside a feature, `ports/` is public and `internal/` is private.** `ports/` declares the row
types other features may read, and nothing that turns them into DTOs; `internal/` holds
everything about how the feature talks to its own table — the repository, its `Create<Entity>` and `Edit<Entity>` (a `Partial` of it), the
translator, which translates in both directions (a body onto its request DTO, a request DTO into that
input, and a row into its response DTO) — and the controllers, one `<x>.controller.ts` per route file and
named after it. No module under `features/<a>/` may import from `features/<b>/internal/`, and the
arrows in production code that do cross a feature line all land on a `ports/`: the exercises
repository queries the sets table, so it takes `SET_COLUMNS` and `EST_1RM_SQL` from
`features/workouts/ports/sql.ts`, and both it and `exercise.translator.ts` take `LiftSet` from
`features/workouts/ports/set.ts`. The third place
a feature keeps code is its root, beside those two directories: the `*.routes.ts` files named after
the URL groups they answer, the `<feature>.facade.ts` named after the feature itself — the front
door described below — and, for a feature whose data other tests need, a test-only
`<feature>.fixtures.ts`.

A route file is only a table: each handler is one line that passes the request to its controller
and returns what comes back. The controller does the rest. It takes the
request and returns a `Response`, reading it with `pathId`, `queryInt` (or `optionalQueryInt`, null
where a missing value has no default) and `readJsonObject` and
answering with `json()` or `noContent()` and the status code, and in between it runs
`body → translateTo<X>Dto → <X>Dto → facade → row → translateTo<X>Dto → DTO`. The facade's write methods in
turn run `validate → <X>Dto → translateDtoTo<Create|Edit><Entity> → <Create|Edit><Entity> → repository`. The
translator has three parts. Its body-to-DTO part only casts, so a request DTO is unchecked until the
facade has validated and normalized it, which happens before anything touches the database; its
DTO-to-input part and its row-to-DTO part are where renaming happens. No part, nor the facade, does
another's job.

Both list endpoints page. `GET /api/workouts` and `GET /api/exercises` take `limit` (1–200) and
`offset` (0–100000), answer `{ items, total, limit, offset }` with `total` counting every row, and
refuse a value outside those bounds with a 400. `GET /api/workouts` defaults `limit` to 50;
`GET /api/exercises` without a `limit` returns every exercise with `limit: null`, which is what the
workout detail's exercise select asks for. `GET /api/exercises/:id/position` answers `{ index }`,
the exercise's 0-based place in that list's name order, so the frontend can open the page a new
exercise landed on without the API knowing its page size. The index is a `COUNT` of the names that
sort before it, which is exact because `idx_exercises_name` makes names unique under `NOCASE`, the
same collation the list orders by, so no two exercises tie.

**A controller answers with a DTO, never a row.** The wire format is declared once in `src/shared/dto/` —
camelCase, type-only, imported by the frontend as well — and each feature holds one function per
shape in each direction, both in `internal/<entity>.translator.ts` (`translateToLiftSetDto(row)`,
called by the controller, and `translateDtoToCreateSet(dto)`, called by the facade). A translator
never imports another feature's `internal/`, which is why `exercise.translator.ts` names
`BestSetDto`'s fields itself rather than reusing the workouts feature's set translation. Those
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
`body()`, `at()`, `tables()`, `thrown()` and `opens()`. The fixtures that create a feature's data over HTTP —
`createExercise` in `exercises/exercises.fixtures.ts`, `createWorkout` and `createSet` in
`workouts/workouts.fixtures.ts` — live in
the feature that owns the endpoint and take `post` from `useServer()` as their first argument.
Other features' route tests import them directly, the one cross-feature import that does not go
through `ports/`. The static feature keeps its own private modules where the rule
says they go — `features/static/internal/paths.ts` (the only place a URL becomes a filesystem path)
and `internal/transpile.ts` — and reaches them through `internal/web-files.ts`. The three operator entry points — `bun run migrate`, `bun run seed`
and `bun run build` — live outside the backend entirely, in `src/scripts/`, so that `src/backend/`
holds the running server and nothing else.

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
holding a `<Entity>Facade` per repository. A facade is not reserved for data, though: `static` and
`dev` publish one too, with no table behind either, because another feature needs something from
them and the house rule is that a feature is reached through its facade. A route handler holds its controller, and the controller
holds the facades. A repository is named only by its own feature's facade, and constructed only by
that facade's factory, so `features/workouts/internal/` is the whole world in which `SetRepository`
exists as a name. That is what a facade buys: a published surface narrower than the repository
behind it (no `get()`, which only `require()` ever called), one place a repository is built, and a
boundary a linter can check. The `overrides` block in `.oxlintrc.json` holds three rules for the
backend; the frontend's own import boundaries follow them there and are described in
`docs/frontend.md`. Two
restrict imports, type imports included: no `*.controller.ts` may
import a `*.repository.ts` or anything under `ports/`, so a controller cannot even name a row type
and has to translate through its translator; and nothing under `ports/` may import `shared/dto`, so
a DTO is never built there. The third exempts `*.translator.ts` from
`typescript/no-unsafe-type-assertion`, since casting a body onto a DTO is part of a translator's job.
The facades are not pure delegation: their write methods validate and map the request with the
facade's own `#validateCreate` / `#validateEdit` methods before calling the repository.
Composition across facades, like `GET /api/workouts/:id` reading a workout, its exercises and its sets, still
lives in the controller, and the facade is where it goes if it ever needs to move further down.

The facades take request DTOs and publish rows, so the rule above it is unchanged: the controller
translates what the facade returns through its feature's translator, and the camelCase rename is still what the
compiler checks.
There is no composition root. Each route factory takes the database and builds what it uses:
`workoutRoutes(db)` and `setRoutes(db)` each call `createWorkoutFacades(db)`, `exerciseRoutes(db)`
calls `createExerciseFacade(db)`, and `statsRoutes(db)` calls `createStatsFacade(db)`, then each
builds its controller from those facades. `allRoutes(db)` only passes the database along. Building
the workouts facades twice costs nothing, because a repository holds only its connection.
`src/scripts/seed.ts` calls the same three factories and hands the facades camelCase DTOs, so
seeded data passes the same validation as the API. `meta` has a controller but no facade, since
nothing else needs it. `static.facade.ts` publishes two methods: `webRoot()`, so the dev feature can
watch `src/frontend/` without importing `static/internal/paths.ts`, and `embed()`, so the build can
carry the web root without reaching into `static/internal/`; `createDevFacade()` builds it,
and `staticRoutes()` builds a dev facade in turn, to inject the hot-reload client. All SQL lives in a feature's `internal/`; `db/sql.ts` keeps
only what names no table — `buildUpdate`, `isUniqueViolation` and `isForeignKeyViolation`.
Repositories reference each other only with `import type` and take what they need through their
constructor — `SetRepository(db, workouts, workoutExercises)`, wired in `createWorkoutFacades` — so there is no
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
workout, its copied sets and its copied exercise order commit together or not at all. Set create
and set delete are two more, each keeping `workout_exercises` in step with the set it writes.
Neither the route files nor the controllers ever open a transaction; if a controller finds itself sequencing two writes, the
sequence belongs in the repository instead.

Four tables, `exercises ──< sets >── workouts` and `exercises ──< workout_exercises >── workouts`,
and `sets` is the fact table: one row per set
performed, carrying `reps`, `weight`, free-text `notes` and a `position` that preserves the order
within a session. Its two foreign keys are deliberately asymmetric. `workout_id` is
`ON DELETE CASCADE`, so deleting a workout takes its sets with it; `exercise_id` is
`ON DELETE RESTRICT`, so deleting an exercise is refused while any set still points at it. History
can be thrown away deliberately, but it cannot silently lose its meaning.

`position` is server-owned: a new set is appended after the workout's last one, "Repeat" copies the
source's positions as they are, and nothing changes it afterwards, so sets list in the order they
were logged (`position, id`). A set's exercise is likewise fixed at creation: `PATCH /api/sets/:id`
does not take `exerciseId`, and one in the body is ignored like any unknown key.

`workout_exercises (workout_id, exercise_id, position)` holds the order of a workout's exercises,
keyed by the pair, with `workout_id` cascading and `exercise_id` restricting like the set's. A row
exists exactly while the workout has a set of that exercise: `SetRepository.create` appends one at
`MAX(position) + 1` when it logs the first set of an exercise, `SetRepository.delete` removes it
with the exercise's last set, "Repeat" copies the source's rows, and deleting a workout cascades.
`003-workout-exercises.sql` created the table and backfilled it from the sets already there, in the
order each exercise first appears (`position, id`). `GET /api/workouts/:id`, like the answer to
`POST /api/workouts`, is therefore a `WorkoutWithExercisesDto`: the workout, its `done`, and
`exercises` in that order, each `{ exerciseId, exerciseName, position, sets }` with its sets in
logged order. `GET /api/workouts/:id/sets` still answers the flat list.

A set also carries `done`, an integer held to 0 or 1 that the API turns into a boolean: a set not
done is a plan — what "Repeat" copies into a new session — and a done set is history. New sets,
including copied ones, start at 0, and `PATCH /api/sets/:id` with `{ "done": true | false }`
toggles it; nothing but a JSON boolean is accepted. `002-set-done.sql` added the column and marked
every set that existed before it as done, since each of those was really performed.

A done set is locked. `SetRepository` decides by the stored state, not by the request, so a stale
tab or a hand-written request cannot get around it: a PATCH to a done set may hold `done` and
nothing else — any other field, even alongside `"done": false`, is a 409 — and a DELETE of a done
set is a 409. Unchecking and editing are therefore two requests, while a set not done may be edited
and marked done in one. Validation still runs first, so a malformed body is a 400 whatever the set's
state, and deleting a workout still cascades to its done sets. A `position` in a PATCH body is
ignored like any unknown key.

A workout is done when it has at least one set and every one of them is done. That is derived and
never stored, so it cannot drift from the sets: unchecking any set makes the workout not done
again. The list computes it from `done_set_count`, a column of its one aggregate, and ships both as
`done` and `doneSetCount`; `GET /api/workouts/:id` computes `done` from the sets it returns.

Because a set not done is a plan, the history aggregates count done sets only: the exercise list's
`setCount`, `workoutCount`, `lastPerformedOn` and `bestWeight` (its join carries `s.done = 1` in the
`ON` clause, so an exercise without done sets still lists, with zero counts), the progress points,
the best set, and the stats summary's `setCount`, `totalReps`, `totalVolume` and
`volumeLast30Days`. The rest counts every set or workout: a workout's own totals, on its card and
its page, describe the whole session, planned sets included; the exercise delete guard refuses
while any set uses the exercise, done or not; and the summary's `workoutCount`,
`workoutsLast30Days` and `lastPerformedOn` count workouts, so a freshly repeated session counts on
its date before anything in it is checked.

The schema lives in `src/backend/db/migrations`, one numbered `.sql` file per change. `openDatabase()`
applies whatever is pending on every start: each file runs in its own transaction and is recorded in
`schema_migrations`, so a half-applied migration cannot exist. Foreign keys are switched off for the
duration of the run — SQLite's table-rebuild procedure needs that, and `PRAGMA foreign_keys` is a
silent no-op inside a transaction — and each migration must pass `PRAGMA foreign_key_check` before
it commits. Changing the schema means adding a file numbered above the current version; nothing
else. The runner refuses to start rather than guess when the files and the database disagree.
It validates a list of `{ filename, sql }` sources rather than a directory: `readMigrations` reads
them from that directory, and a built file takes them from `EMBEDDED.migrations` instead (see
"Single-file build") — the same naming, numbering and ordering rules hold for both.

`startServer(db, port)` in `http/server.ts` is the one place `Bun.serve` is called: `main.ts` passes
`PORT`, and `useServer()` in `src/backend/testing.ts` passes port 0 and an in-memory database.
`useServer()` registers the `beforeEach`/`afterEach` pair from inside the function — so each test file gets its own hooks and
its own database rather than sharing one through the module cache. Every `*.test.ts` sits beside
the module it exercises, and each one covers the module declaring the routes it drives, which is
why the two tests for `POST /api/workouts/:id/sets` are in `workout.routes.test.ts` and not beside
`set.routes.ts`. Tests are end-to-end over HTTP, with eight exceptions: `db/db.test.ts` checks the real
migrations; `db/migrations.test.ts` unit-tests the migration runner against throwaway fixture
directories; `features/static/internal/paths.test.ts` pins the web root, which is derived by
counting directories up from that module's own URL and would otherwise 404 every asset in silence
if the file were moved; `http/errors.test.ts` covers `errorResponse`, whose 500 branch cannot be
provoked over HTTP; `shared/validate.test.ts` pins the field helpers' normalization edge cases;
`features/dev/internal/changes.test.ts` pins how a watched path becomes a URL and a change; and
`features/exercises/exercises.facade.test.ts` and `features/workouts/workouts.facade.test.ts` drive
each facade's validation directly, including that a bad body on an unknown id is a 400 rather than
a 404. There are no unit tests of the repositories. `src/scripts/build.test.ts` is end-to-end over
HTTP like the route tests, but against the built file, copied alone into a temporary directory and
run in a child process — so it sits beside the route tests rather than among the exceptions.

Static serving is deliberately narrow: `src/frontend/` with a path-escape guard, plus `VENDOR_FILES`
in `internal/paths.ts` — an allowlist of single files into `node_modules`, of any type (`/vendor/oat.css`,
`/vendor/oat.js`). Serving anything else from a package means adding it to that map. A trailing slash asks for `index.html` in that
directory, and a directory without one is a 404 rather than the single-page app — otherwise the
extension-less fallback would mask a real miss, which is the thing it exists to avoid.

`internal/static.controller.ts` does not know where bytes come from: it reads through the
`WebFiles` interface in `internal/web-files.ts`. Under `bun start` and in the tests that is
`DiskWebFiles` — `paths.ts` for the path-escape guard and the vendor allowlist, `transpile.ts` for
modules, re-read on every request. In a built file it is `EmbeddedWebFiles`, lookups in the maps
the build carries, behind the same decoding, NUL and escape guards. A `WebFile` is a `file`, a
`missing` one (eligible for the single-page fallback), an `invalid` path (a 404, never the fallback)
or an `error` (a 500), and the controller keeps the method check, the directory index, the
fallback, the client injection and the ETag for both sources. Vendor files sit in their own map, so
they stay reachable only at their literal URL, exactly as on disk. `static.routes.ts` only declares
the URLs that reach the controller.

The static feature keeps no map of content types. Transpiled modules get a fixed `Content-Type`,
and every plain file — vendor files included — takes `Bun.file(x).type` — the same lookup
`new Response(Bun.file(x))` uses, off a complete MIME database (`.svg` → `image/svg+xml`, `.woff2` →
`font/woff2`, `.png` → `image/png`, `.webp` → `image/webp`, no extension →
`application/octet-stream`, all measured on Bun 1.4.2), so a hand-written map would be a subset
that drifts. It also does not special-case HEAD beyond letting it past the method check — Bun strips the body itself and leaves the headers
alone, which `src/backend/features/static/static.routes.test.ts:53` holds in place. What it does do is
own the `405 Method not allowed` for the whole server, answered by `StaticController.frontend`: `/*` is declared as a bare handler function
rather than a `{ GET, HEAD }` map, because a map answers an unmatched verb with an empty-bodied 404
and there is no `fetch` behind it to say otherwise. An unmatched verb on a vendor route falls
through to `/*` and is answered there.

Assets carry hash-free URLs, so every static `200` — files, transpiled modules, the index page and
the vendor files alike — is sent `Cache-Control: no-cache` with a strong `ETag` hashed from the
exact body with `Bun.hash`. A `GET` or `HEAD` whose `If-None-Match` matches (in a comma-separated
list, as `*`, or with a `W/` prefix, per RFC 9110 weak comparison) gets an empty `304`. Bun does
neither of these itself: measured on 1.4.2, a `Bun.file` response has no validator, and a response
that sets `ETag` is still a full `200` when the tag matches. The tag is a content hash rather than
mtime and size because it changes exactly when the bytes do, it covers transpiler output that
depends on the Bun version, and hashing files of this app's size costs well under a millisecond.
A `304` still reads or transpiles the file; only the transfer is saved. Vendor files used to be
cached for an hour, which let a browser keep a stale vendor file (Pico, at the time) after
`bun install`; they are now revalidated like everything else. Error responses carry no `ETag`.

## Hot reload (`features/dev/`)

`bun run start:dev` sets `GAINZ_DEV=1`, and only then does the dev feature do anything: `devRoutes()`
registers `/dev/ws`, `StaticController` injects `<script type="module" src="/dev/hot.ts">` into the
index page, and `main.ts` prints `hot reload: on`. Without the variable `devRoutes()` is `{}` and the
page is byte-for-byte what `bun start` has always served. The switch is that one variable rather
than `NODE_ENV`, whose non-production default would give plain `bun start` a watcher and a socket.
A built file never enables the dev feature, whatever `GAINZ_DEV` says: it has no source tree to
watch, and `dev/hot.ts` is not embedded.
`DevFacade.enabled()` is static, so `main.ts` can ask without building a facade, and reads it on every call, so `dev.routes.test.ts` can flip it around a server.

The injection runs before the page is hashed, so the ETag covers the injected bytes. It is reached
from both places the index page is served — the plain-file branch, for `/` and `/index.html`, and
the single-page fallback for every client route.

The watcher follows the connections, not the process. `internal/hub.ts` starts one recursive
`fs.watch` over the web root when the first browser connects and closes it when the last one
leaves, so `main.ts`'s shutdown has nothing to stop and no test leaves a watcher behind. Each path
is debounced for 25 ms, because one save reports several events, and `internal/changes.ts` turns it
into `{ swap }` for a `.css` or `{ reload }` for a `.ts` or `.html`; anything else — including the
bare directory names the watcher also reports — is dropped. The connection set is module state
rather than a facade's field, because `devRoutes()` and `staticRoutes()` each build their own facade.

`websocket` is passed to `Bun.serve` unconditionally and only the route is gated. Spreading the
option in conditionally flips `Bun.serve`'s options type between its with- and without-WebSocket
variants, which is also why `RouteTable` is `Bun.Serve.RoutesWithUpgrade`: a route that upgrades
returns `undefined`. Production therefore carries a socket handler no route can reach.

## Single-file build (`src/scripts/build.ts`)

`bun run build` writes `dist/gainz.js` and a linked `dist/gainz.js.map`, and a deployment is that one
file run with `bun`. `src/backend/shared/embedded.ts` is a committed stub exporting `EMBEDDED = null`,
which means "read from disk" — the state under `bun start` and in every test. The build replaces
that module through `Bun.build`'s `files` option with one that exports the embedded web root, the
vendor files and the migrations; `bun:sqlite` stays external. It sits outside `features/` because
both `db/` and the static feature read it.

What is embedded comes from `StaticFacade.embed()`: every file under `src/frontend/` except
`dev/**`, `testing.ts`, `*.test.ts` and `*.fixtures.ts`, keyed by its URL, with each module transpiled ahead of time
with whitespace minified and no source map, so names and structure survive for browser devtools.
The frontend is embedded one module per URL rather than bundled, because bundling would change
`import.meta.url` and break the `.ts` → `.css` lookup in `ui/styles.ts` that lazy routes depend on.
A module that does not parse fails the build, naming the file. The migrations come from
`readMigrations`. The embedded `index.html` is stamped with an HTML comment right below its doctype
naming the commit (`git rev-parse HEAD`, suffixed `-dirty` when the working tree has uncommitted
changes, or `unknown` outside a git checkout) and the build time as an ISO 8601 UTC timestamp.

The server itself is built with `target: 'bun'` and `minify: true`; Bun reads the linked source map
for stack traces. `GAINZ_DEV` is ignored in a built file. `dist/` is git-ignored, which is also what
keeps oxlint and oxfmt out of it.
