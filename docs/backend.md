# Backend (`src/backend/`)

The first half of this document holds the rules every change follows: the layout, how a request
travels, errors, transactions, migrations and tests. The second half describes what each feature
does, for the change that touches it.

## Layout

The backend is organized by feature, not by layer. `features/` holds one directory per thing the
app is about — `exercises/`, `workouts/`, `stats/`, `weight/`, `auth/`, `meta/`, `static/`, `dev/` — and each
owns its routes, its SQL and its mapping end to end, the mapping reached through its controllers
and its facade. What is left outside `features/` is only what belongs to no feature:

- `db/` — the connection and its PRAGMAs in `db.ts`, the schema in `migrations.ts` and
  `migrations/`, and the table-agnostic statement helpers in `db/sql.ts`
- `http/` — `routing.ts` for the `RouteTable` and `ParamRequest` types, `routes.ts` for the
  registry, `http.ts` with the request readers (`pathId`, `pathDate`, `queryInt`,
  `optionalQueryDate`, `readJsonObject` and the rest), `errors.ts`, `access-log.ts` and `server.ts`
- `shared/` — `validate.ts` for the request-field rules and their length bounds (`requiredOneOf`
  and `optionalOneOf` for a field limited to a fixed list), `log.ts`, the logger, and
  `embedded.ts` (see "Single-file build")
- `main.ts` — the entry point that opens the database and starts the server through
  `startServer`
- `testing.ts` — test-only plumbing (see "Tests")

There is no `fetch` fallback — every URL the server answers is a declared pattern. The operator
entry points — `bun run migrate`, `seed`, `build`, `hash-password` and `screenshots` — live outside
the backend entirely, in `src/scripts/`, so that `src/backend/` holds the running server and
nothing else.

### Inside a feature

**`ports/` is public and `internal/` is private.** `ports/` declares the row types other features
may read, and nothing that turns them into DTOs; `internal/` holds everything about how the feature
talks to its own table — the repository, its `Create<Entity>` and `Edit<Entity>` (a `Partial` of
it), the translator, which translates in both directions (a body onto its request DTO, a request
DTO into that input, and a row into its response DTO) — and the controllers, one
`<x>.controller.ts` per route file and named after it. No module under `features/<a>/` may import
from `features/<b>/internal/`, and the arrows in production code that do cross a feature line land
on a `ports/` or on a facade. For example, `meta` takes the `AuthFacade` to report whether auth is
on, and the exercises repository queries the sets table, so it takes `SET_COLUMNS` and
`EST_1RM_SQL` from `features/workouts/ports/sql.ts`, and both it and `exercise.translator.ts` take
`LiftSet` from `features/workouts/ports/set.ts`.

The third place a feature keeps code is its root, beside those two directories: the `*.routes.ts`
files named after the URL groups they answer, the `<feature>.facade.ts` named after the feature
itself — the front door described below — and, for a feature whose data other tests need, a
test-only `<feature>.fixtures.ts`.

A route belongs to the file its URL prefix names, with no exceptions to remember — so
`/api/workouts/:id/sets` is a workout route and lives in `workout.routes.ts`. Sets are part of the
workouts feature rather than a feature of their own, which is what makes that rule free of
exceptions: the schema already says so, and both route files sit side by side over the same
`internal/`. `http/routes.ts` holds no handler code at all. Its spread order is for readers rather
than for correctness: Bun matches by specificity (measured on 1.4.2), so `/api/health` wins over
`/api/*` and `/api/*` over `/*` wherever they are declared — but declaring the catch-alls last
reads the way the router dispatches.

## A request's path

A route file is only a table: each handler is one line that passes the request to its controller
and returns what comes back. The controller does the rest. It takes the request and returns a
`Response`, reading it with `pathId`, `queryInt` (or `optionalQueryInt`, null where a missing value
has no default) and `readJsonObject` and answering with `json()` or `noContent()` and the status
code, and in between it runs
`body → translateTo<X>Dto → <X>Dto → facade → row → translateTo<X>Dto → DTO`. The facade's write
methods in turn run
`validate → <X>Dto → translateDtoTo<Create|Edit><Entity> → <Create|Edit><Entity> → repository`.
The translator has three parts. Its body-to-DTO part only casts, so a request DTO is unchecked
until the facade has validated and normalized it, which happens before anything touches the
database; its DTO-to-input part and its row-to-DTO part are where renaming happens. No part, nor
the facade, does another's job.

### Translators

**A controller answers with a DTO, never a row.** The wire format is declared once in
`src/shared/dto/` — camelCase, type-only, imported by the frontend as well — and each feature holds
one function per shape in each direction, both in `internal/<entity>.translator.ts`
(`translateToLiftSetDto(row)`, called by the controller, and `translateDtoToCreateSet(dto)`, called
by the facade). A translator never imports another feature's `internal/`, which is why
`exercise.translator.ts` names `BestSetDto`'s fields itself rather than reusing the workouts
feature's set translation. Those functions are the only place that reads a row's fields outside the
repository that produced it, and each one names every field it maps: a spread would compile and
would ship `workout_id` and `created_at` to the browser with nothing to catch it. The camelCase
rename is what keeps that honest — a row is not structurally assignable to its own DTO.

Ids and dates are flavored on both sides of that rename. `src/shared/flavors.ts` declares
`WorkoutId`, `ExerciseId`, `LiftSetId`, `Iso8601Date` (`YYYY-MM-DD`) and `Iso8601DateTime` (what
SQLite writes into `created_at`), and the rows, the repository signatures, the bound-parameter
tuples on `db.query` and the DTOs all name the one they carry. A plain `number` or `string` still
flows into a flavor, so nothing needs a cast; what the compiler refuses is one flavor standing in
for another, which is why a workout id can no longer be handed to `exercises.require()` and a
`created_at` can no longer be formatted as a calendar date. `pathId` deliberately still returns a
plain `number` — a path segment has no flavor of its own, and the controller names it as it binds
the local (`const id: WorkoutId = pathId(req.params.id, 'workout')`).

### Facades

**Every data-owning feature has a front door.** Each publishes exactly one facade module at its
root — `exercises/exercises.facade.ts`, `workouts/workouts.facade.ts`, `stats/stats.facade.ts`,
`weight/weight.facade.ts` —
holding a `<Entity>Facade` per repository. A facade is not reserved for data, though: `static`,
`dev` and `auth` publish one too, with no table behind any of them, because another feature needs
something from them and the house rule is that a feature is reached through its facade. A route
handler holds its controller, and the controller holds the facades. A repository is named only by
its own feature's facade, and constructed only by that facade's factory, so
`features/workouts/internal/` is the whole world in which `SetRepository` exists as a name. That is
what a facade buys: a published surface narrower than the repository behind it (no `get()`, which
only `require()` ever called), one place a repository is built, and a boundary a linter can check.

The facades are not pure delegation: their write methods validate and map the request with the
facade's own `#validateCreate` / `#validateEdit` methods before calling the repository. Composition
across facades, like `GET /api/workouts/:id` reading a workout, its exercises and its sets, still
lives in the controller, and the facade is where it goes if it ever needs to move further down. The
facades take request DTOs and publish rows, so the controller translates what the facade returns
through its feature's translator, and the camelCase rename is still what the compiler checks.

There is no composition root. Each route factory takes the database and builds what it uses:
`workoutRoutes(db)` and `setRoutes(db)` each call `createWorkoutFacades(db)`, `exerciseRoutes(db)`
calls `createExerciseFacade(db)`, `statsRoutes(db)` calls `createStatsFacade(db)`, and
`weightRoutes(db)` calls `createWeighInFacade(db)`, then each
builds its controller from those facades. `allRoutes(db, auth)` passes the database along and
builds the one `AuthFacade` the server has, handing it to `metaRoutes(auth)` and `authRoutes(auth)`
and wrapping the data tables in `auth.guard()`; one instance, because it holds the login throttle.
Building the workouts facades twice costs nothing, because a repository holds only its connection.
`src/scripts/seed.ts` calls the same factories and hands the facades camelCase DTOs, so seeded data
passes the same validation as the API. `meta` has a controller but no facade, since nothing else
needs it. `static.facade.ts` publishes `webRoot()`, so the dev feature can watch `src/frontend/`
without importing `static/internal/paths.ts`, and `embed()`, so the build can carry the web root
without reaching into `static/internal/`; `createDevFacade()` builds it, and `staticRoutes()` builds
a dev facade in turn, to inject the hot-reload client.

All SQL lives in a feature's `internal/`; `db/sql.ts` keeps only what names no table —
`buildUpdate`, `isUniqueViolation` and `isForeignKeyViolation`. Repositories reference each other
only with `import type` and take what they need through their constructor —
`SetRepository(db, workouts, workoutExercises)`, wired in `createWorkoutFacades` — so there is no
runtime cycle to trip over.

### What the linter holds

The `overrides` block in `.oxlintrc.json` holds the backend's rules; the frontend's own import
boundaries follow them there and are described in `docs/frontend.md`. No `*.controller.ts` may
import a `*.repository.ts` or anything under `ports/`, type imports included, so a controller
cannot even name a row type and has to translate through its translator; nothing under `ports/` may
import `shared/dto`, so a DTO is never built there; and `*.translator.ts` is exempt from
`typescript/no-unsafe-type-assertion`, since casting a body onto a DTO is part of a translator's
job.

## Errors

Error handling is by throwing: controllers throw `HttpError`, directly or through the facades they
call — the facades' validation and the repositories behind them — and the access log in
`http/access-log.ts`, the outermost wrapper around every handler, catches any throw from any route,
answers it through `errorResponse` as a JSON `{ error }` body with the right status, and logs it
with the request that caused it. It is the one error path, for the API and the static route alike,
so a new route needs nothing to get it. The `error` hook in `http/server.ts` is only a safety net
for an error outside a route, since Bun hands it the error but never the request.

Four statuses cover everything the API refuses — 400 for bad input, 401 for a missing session or a
wrong password, 404 for something missing, 409 for a conflict — which is why `http/errors.ts`
exports exactly `badRequest`, `unauthorized`, `notFound` and `conflict`. The one other refusal, the
login lockout's 429 with `Retry-After`, is not thrown: the auth controller answers it itself, since
it carries a header. Which status a broken reference earns depends on where the id came from: a
workout id in the path that names nothing is a 404, while an `exerciseId` in the body that names
nothing is a 400. Nothing pre-checks the latter — the `ON DELETE RESTRICT` foreign key refuses the
write and `isForeignKeyViolation` turns the refusal into the 400.

## Transactions

A write that needs more than one statement belongs in a single repository method wrapped in
`db.transaction()` — `WorkoutRepository.create(input, { copyFrom })` is the example, where the
workout, its copied sets and its copied exercise order commit together or not at all. Set create,
set delete and `SetRepository.copyLastSessions` are others. Neither the route files nor the
controllers ever open a transaction; if a controller finds itself sequencing two writes, the
sequence belongs in the repository instead.

## Migrations

The schema lives in `src/backend/db/migrations`, one numbered `.sql` file per change.
`openDatabase()` applies whatever is pending on every start: each file runs in its own transaction
and is recorded in `schema_migrations`, so a half-applied migration cannot exist. Foreign keys are
switched off for the duration of the run — SQLite's table-rebuild procedure needs that, and
`PRAGMA foreign_keys` is a silent no-op inside a transaction — and each migration must pass
`PRAGMA foreign_key_check` before it commits. Changing the schema means adding a file numbered
above the current version; nothing else. The runner refuses to start rather than guess when the
files and the database disagree. It validates a list of `{ filename, sql }` sources rather than a
directory: `readMigrations` reads them from that directory, and a built file takes them from
`EMBEDDED.migrations` instead (see "Single-file build") — the same naming, numbering and ordering
rules hold for both.

## Tests

`startServer(db, port, auth)` in `http/server.ts` is the one place `Bun.serve` is called:
`main.ts` passes `PORT` and `GAINZ_PASSWORD_HASH`, and `useServer({ auth })` in
`src/backend/testing.ts` passes port 0, an in-memory database and, only in a file that asks for
one, a password hash and a clock — auth is off otherwise, so no other test needs a cookie.
`useServer()` registers the `beforeEach`/`afterEach` pair from inside the function — so each test
file gets its own hooks and its own database rather than sharing one through the module cache.

`testing.ts` stays at the top of `src/backend/` because it belongs to no feature: it holds only
technical hooks such as `useServer()`, `useTempDir()` and `useLogs()`. The fixtures that create a
feature's data over HTTP — `createExercise` in `exercises/exercises.fixtures.ts`, `createWorkout`
and `createSet` in `workouts/workouts.fixtures.ts`, `putWeighIn` in `weight/weight.fixtures.ts` — live
in the feature that owns the endpoint and take `post` (or `put`) from `useServer()` as their first
argument. Other features' route tests import them
directly, the one cross-feature import that does not go through `ports/`.

Every `*.test.ts` sits beside the module it exercises, and each route test covers the module
declaring the routes it drives, which is why the tests for `POST /api/workouts/:id/sets` are in
`workout.routes.test.ts` and not beside `set.routes.ts`. Tests are end-to-end over HTTP. A module
gets a test of its own only where HTTP cannot reach it or would hide a failure: the migration
runner against throwaway fixture directories, the facades' validation (including that a bad body
on an unknown id is a 400 rather than a 404), the field helpers', request readers' and logger's
edge cases, and how a watched path becomes a URL and a change. Two of them guard something that
would otherwise break in silence: `features/static/internal/paths.test.ts` pins the web root, which
is derived by counting directories up from that module's own URL and would 404 every asset if the
file were moved; and `http/errors.test.ts` pins that `errorResponse` renders an error and does not
log it, while its 500 branch is covered over HTTP by `http/access-log.test.ts` through a hand-made
route table. There are no unit tests of the repositories.

Some tests run code in a child process. `src/scripts/build.test.ts` is end-to-end over HTTP like
the route tests, but against the built file, copied alone into a temporary directory; it runs it a
second time with `GAINZ_PASSWORD_HASH` set, to see the guard survive the build.
`src/backend/main.test.ts` runs the entry point, to check the banner, the startup failures and the
shutdown line. `src/scripts/hash-password.test.ts` runs its script, piping the password in.
`features/static/internal/bundle.test.ts` pins what the build's bundle of the frontend carries and
that a module that does not parse fails it, naming the file, and `src/scripts/build-bundle.test.ts`
runs that bundle under happy-dom in `build-bundle.probe.ts`, so it gets a window no other test file
has defined components in.

The suite prints nothing. `useLogs()` swaps the logger's sink for one that captures each line as
`{ level, text }` around every test, and `useServer()` calls it and returns `logs` beside `api`,
`post`, `patch`, `put` and `del`, so a route test can assert what the server logged. Since one test sees every
topic, a test that checks one feature's lines filters `logs()` by topic or uses `toContainEqual`.

## Data model

`exercises ──< sets >── workouts` and `exercises ──< workout_exercises >── workouts`, and `sets` is
the fact table: one row per set performed, carrying `reps`, `weight`, free-text `notes`, `done` and
a `position` that preserves the order within a session. Its two foreign keys are deliberately
asymmetric. `workout_id` is `ON DELETE CASCADE`, so deleting a workout takes its sets with it;
`exercise_id` is `ON DELETE RESTRICT`, so deleting an exercise is refused while any set still
points at it. History can be thrown away deliberately, but it cannot silently lose its meaning.

`workout_exercises (workout_id, exercise_id, position)` holds the order of a workout's exercises,
keyed by the pair, with `workout_id` cascading and `exercise_id` restricting like the set's. A row
exists exactly while the workout has a set of that exercise: `SetRepository.create` appends one at
`MAX(position) + 1` when it logs the first set of an exercise, `SetRepository.delete` removes it
with the exercise's last set, "Repeat" copies the source's rows, copying an exercise's last session
appends one the same way as a logged set, and deleting a workout cascades.
`003-workout-exercises.sql` created the table and backfilled it from the sets already there, in the
order each exercise first appears (`position, id`).

`weigh_ins (measured_on, weight)` stands apart from the rest: one row per date, keyed by the date
itself, with `CHECK (weight > 0)`. It references nothing and nothing references it, and its primary
key is the index the range query uses. `007-weigh-ins.sql` created it.

### Plans and history

A set carries `done`, an integer held to 0 or 1 that the API turns into a boolean: a set not done
is a plan — what "Repeat" copies into a new session — and a done set is history. New sets,
including copied ones, start at 0. `002-set-done.sql` added the column and marked every set that
existed before it as done, since each of those was really performed.

Because a set not done is a plan, the history aggregates count done sets only — and a done
workout's unchecked sets stay plans, skipped rather than performed, so they are not counted either:
the exercise list's `setCount`, `workoutCount`, `lastPerformedOn`, `bestWeight` and `bestReps` (its
join carries `s.done = 1` in the `ON` clause, so an exercise without done sets still lists, with
zero counts), the progress points with their `topReps`, the best set, the stats summary's
`setCount`, `totalReps`, `totalVolume` and `volumeSince`, the training calendar's days and
progression, the recent exercises' sessions and the last session. The rest counts every set or
workout: a workout's own totals, on its card and its page, describe the whole session, planned sets
included; the exercise delete guard refuses while any set uses the exercise, done or not; and the
summary's `workoutCount`, `workoutsSince` and `lastPerformedOn` count workouts, so a freshly
repeated session counts on its date before anything in it is checked.

## Workouts and sets

### Sets

`position` is server-owned: a new set is appended after the workout's last one, "Repeat" copies the
source's positions as they are, and nothing changes it afterwards, so sets list in the order they
were logged (`position, id`). A set's exercise is likewise fixed at creation: `PATCH /api/sets/:id`
does not take `exerciseId`, and one in the body is ignored like any unknown key, as is a
`position`.

A set's weight follows its exercise's `bodyweight` flag. `weight` on
`POST /api/workouts/:id/sets` is required for a weighted exercise, a 400 without it, and optional
for a bodyweight one, stored as 0; any other weight there, on create or on `PATCH /api/sets/:id`,
is a 400. `SetRepository#weightFor` decides inside the write's transaction, reading the flag as it
stands, so the unknown-exercise 400 comes from that lookup before the foreign key could fail.

`PATCH /api/sets/:id` with `{ "done": true | false }` toggles `done`; nothing but a JSON boolean is
accepted.

### The done locks

A done set is locked. `SetRepository` decides by the stored state, not by the request, so a stale
tab or a hand-written request cannot get around it: a PATCH to a done set may hold `done` and
nothing else — any other field, even alongside `"done": false`, is a 409 — and a DELETE of a done
set is a 409. Unchecking and editing are therefore two requests, while a set not done may be edited
and marked done in one. Validation still runs first, so a malformed body is a 400 whatever the
set's state, and deleting a workout still cascades to its done sets.

A done workout locks its sets as well, and that lock is checked first, also from the stored state:
while the workout is done, logging a set into it, any PATCH of one of its sets (`done` included)
and deleting one are all 409s. Its details are not locked — date, title and notes still change,
since notes are often written afterwards — and moving its exercises, deleting it and "Repeat" stay
open.

A workout's `done` is stored too, in `workouts.done`, and is independent of its sets: checking
every set does not finish a workout, and unchecking one does not reopen it.
`PATCH /api/workouts/:id` with `{ "done": true | false }`, alone or with the other fields, marks it
done or reopens it; only a JSON boolean is accepted, and `done: true` on a workout without sets is
a 409. `004-workout-done.sql` added the column and marked done every workout that then had at least
one set with all of them done, so nothing that showed as done changed. The list still ships
`doneSetCount`, from its one aggregate, beside `done`.

### A workout and its exercises

`GET /api/workouts/:id`, like the answer to `POST /api/workouts`, is a `WorkoutWithExercisesDto`:
the workout, with the `done` every workout DTO carries, and `exercises` in their order, each
`{ exerciseId, exerciseName, muscleGroup, bodyweight, position, sets }` with its sets in logged
order. `GET /api/workouts/:id/sets` still answers the flat list.

`POST /api/workouts/:id/exercises/:exerciseId/move` with `{ "direction": "up" | "down" }` swaps an
exercise with its neighbor. `WorkoutExerciseRepository.move` does it in one transaction: it
renumbers the workout's exercises 1..n in their current `position, exercise_id` order with the two
swapped, so ties and gaps vanish on first touch, and a move at an edge is a 200 with the order
unchanged. It answers the whole `WorkoutWithExercisesDto`, since that is what the page reloads
anyway. The direction is validated first, so a missing or unknown one is a 400 even on an unknown
workout; then an unknown workout is a 404, as is an exercise the workout has no row for, and a
non-numeric id in the path is a 400. Order is not part of the done lock: an exercise whose sets are
all done still moves, because the order a session is listed in is not performed history.

`POST /api/workouts/:id/exercises` with `{ "exerciseIds": [...] }` builds a workout from exercises
already trained. For each id in request order, `SetRepository.copyLastSessions` copies the done
sets of the exercise's last session — the one `GET /api/exercises/:id/last-session` describes —
after the workout's current sets, keeping reps, weight and notes in logged order with `done` 0, as
"Repeat" does, and appends the exercise to the workout's order. It answers the whole
`WorkoutWithExercisesDto`, 200. It is all or nothing, in one transaction, and the checks run in
this order: `exerciseIds` must be a non-empty list of at most 200 distinct JSON numbers that are
safe integers of at least 1 (`requiredIds`, which unlike `requiredInt` refuses numeric strings),
else a 400, even on an unknown workout; then an unknown workout is a 404 and a done one the done
lock's 409; then, id by id, an unknown exercise is a 400, and an exercise already in the workout or
one without done sets is a 409 that names it. A failing id rolls back the ids before it.

## Exercises

### Paged lists

Both list endpoints page. `GET /api/workouts` and `GET /api/exercises` take `limit` (1–200) and
`offset` (0–100000), answer `{ items, total, limit, offset }` with `total` counting every row, and
refuse a value outside those bounds with a 400. `GET /api/workouts` defaults `limit` to 50;
`GET /api/exercises` without a `limit` returns every exercise with `limit: null`, which is what the
workout detail's exercise select asks for.

`GET /api/exercises` also takes an optional `muscleGroup`, one of the muscle groups or `none` for
exercises without one, and answers 400 for any other value; an empty one is the same as none
given. It takes an optional `type` the same way, `bodyweight` or `weighted`, for the exercises with
or without the `bodyweight` flag, and the two combine. With either, `items` and `total` cover only
the matching exercises, while `all`, on the exercise page alone, still counts every exercise. The
controller reads both into an `ExerciseFilterDto`, which the translator turns into the repository's
`ExerciseFilter`.

`GET /api/exercises/:id/position` answers `{ index }`, the exercise's 0-based place in that list's
name order, so the frontend can open the page a new exercise landed on without the API knowing its
page size; it takes the same `muscleGroup` and `type` and then counts within them. The index is a
`COUNT` of the names that sort before it, which is exact because `idx_exercises_name` makes names
unique under `NOCASE`, the same collation the list orders by, so no two exercises tie — within a
group as much as overall. The filter is one `muscle_group IS ?`, since SQLite's `IS` treats two
`NULL`s as equal, and is left out entirely when no `muscleGroup` is given.

### Muscle groups

An exercise's muscle group is one of `Chest`, `Back`, `Shoulders`, `Arms`, `Legs`, `Core`,
`Full body`, or none. A `CHECK` on `exercises.muscle_group` refuses anything else, and `POST` and
`PATCH /api/exercises` answer 400 for any other value, matching exactly, case included; `null` or
`''` clears it. The list is `MUSCLE_GROUPS` in `exercises.facade.ts`, typed against `MuscleGroup`
in `src/shared/muscle-group.ts`. `005-fixed-muscle-groups.sql` rebuilt the table with the `CHECK`,
keeping each stored value that matched a group after trimming, ignoring case, and clearing the
rest; it copies the ids and the `AUTOINCREMENT` sequence, so sets keep their exercise and a deleted
exercise's id is not handed out again.

### Bodyweight exercises

An exercise is weighted or bodyweight: `bodyweight` on `ExerciseDto`, `false` unless `POST` or
`PATCH /api/exercises` sets it, a boolean or a 400. A bodyweight exercise is logged in reps alone,
its sets at weight 0 (see "Sets"); a loaded variant, such as a belted pull-up, is a separate
weighted exercise. Turning an exercise bodyweight is a 409 while any of its sets has a weight, so
no history is rewritten; turning it weighted is always allowed, since its old sets read as 0 kg.
`006-bodyweight-exercises.sql` added `exercises.bodyweight` (0 or 1) and marked bodyweight every
exercise with at least one set, all of them at weight 0; an exercise mixing 0 kg and loaded sets
stayed weighted.

### Last session

`GET /api/exercises/:id/last-session` is the add-set form's hint: `{ "session": null }`, or
`{ "session": { workoutId, performedOn, sets } }` with the done sets of the latest workout holding
at least one done set of the exercise — latest by `performed_on, id` — in logged order.
`?exceptWorkout=<id>` leaves that workout out: the form asks with the open workout, which becomes
the latest session as soon as one of its sets of the exercise is checked, so the hint would
otherwise describe the session to itself. An unknown exercise is a 404; the workout id is not
checked, since skipping one that does not exist skips nothing. The query is
`LAST_SESSION_WORKOUT_SQL` in `workouts/ports/sql.ts`, shared with `copyLastSessions`.

## Statistics

`GET /api/stats/summary?since=YYYY-MM-DD` is the dashboard's tiles: all-time totals, plus
`workoutsSince` and `volumeSince` over the workouts dated on or after `since`. The dashboard sends
the date `RECENT_DAYS` days before the browser's today, since the server's `date('now')` is UTC and
would shift the window by a day for anyone far from it; a missing or malformed `since` is a 400.

`GET /api/stats/calendar?month=YYYY-MM` is the Statistics page's month: `{ month, days }`, where
`days` holds only the dates with a workout holding at least one done set, oldest first, each with
its workouts by `performed_on, id`. `month` is required, since the server does not know the user's
timezone and "this month" is the browser's; a missing or malformed one is a 400. Each workout and
day also carries a `progression` and a `comparedExerciseCount`. An exercise's progression in a
workout is its done-set volume (reps × weight) divided by that of its previous session, minus one;
the previous session is the latest earlier workout by `performed_on, id` with a done set of the
exercise. A bodyweight exercise, by its `bodyweight` flag, compares its total done reps instead,
since its volume is always 0. A weighted exercise is not compared when either session's volume is
0, so a first loaded session after 0 kg work never reads as +∞ nor the reverse as −100%. The
sessions CTE joins `exercises` for the flag as it stands now. An exercise without a previous
session is not compared. A workout's progression is the mean of its compared exercises', and a
day's the mean over every compared exercise of its workouts, not of the workouts' means, so each
exercise counts equally; with nothing compared it is `null`. The values are raw fractions
(`0.041`); where "progressed" begins is the frontend's call. `StatsRepository.calendar()` runs one
query over the whole history of the exercises trained that month, since a previous session may lie
in any earlier month: a CTE of per-(workout, exercise) done reps and volume, `LAG()` over each
exercise's sessions, then the month filter, with the grouping into workouts and days in TypeScript.

`GET /api/stats/exercises?since=YYYY-MM-DD` is the page's progress section: `{ since, exercises }`
with every exercise holding a done set in a workout dated on or after `since`. Like `month`,
`since` is required and comes from the browser's date; a missing or malformed one is a 400. Each
exercise carries its three most recent sessions over all history, oldest first, so one trained
every other week still shows a trend even when the older two lie before `since`. A session's
`progression` is the calendar's per-exercise value against the session before it, which may be
older than the three shown; the exercise's `progression` compares the newest shown session against
the oldest shown one the same rule compares, so a 0 kg first session does not hide the trend after
it, and `progressionSince` is that session's date. Both are `null` with one session or when the
rule compares none. Exercises come biggest regression first, `null` last, ties by name in SQLite's
`NOCASE` collation like the other lists, so the order is part of the answer and does not depend on
the server's locale. `comparedSessionsSql()` in `stats.repository.ts` builds the sessions CTE with
its `LAG()` and a `ROW_NUMBER()` newest first for the exercises trained in a window of dates, and
serves both this query and the calendar's, so neither computes windows over exercises it then
throws away; `sessionChange()` is the one place the comparison rule is written.

## Weight (`features/weight/`)

The body weight log holds one weigh-in per date, keyed by the date, with no id:

- `PUT /api/weigh-ins/:date` with `{ "weight": 82.4 }` creates that date's weigh-in (201) or
  replaces it (200), and answers the `WeighInDto`. `WeighInRepository.put` decides which in one
  transaction, a `SELECT` and then an `INSERT … ON CONFLICT (measured_on) DO UPDATE`, so the last
  reading of a day wins. The weight is `requiredNumber` between 20 and 500, a numeric string
  included, rounded to 0.01; anything else is a 400.
- `GET /api/weigh-ins/:date` answers that date's `WeighInDto`, or 404.
- `DELETE /api/weigh-ins/:date` answers 204, or 404 for a date without a weigh-in.
- `GET /api/weigh-ins?since=YYYY-MM-DD` answers `{ since, items, latest }`: `items` from `since` on,
  oldest first, and `latest` the newest weigh-in overall, in the range or not, or `null`. Without
  `since` it answers every weigh-in with `since: null`. There is no paging, since ten years of daily
  weigh-ins is under 4,000 small rows.
- `POST /api/weigh-ins/import` with `{ "items": [{ "measuredOn": "2026-10-13", "weight": 82.4 }] }`
  creates or replaces each date's weigh-in and answers `{ created, replaced }`. The facade checks
  every item before anything is written — 1 to 10,000 of them, each a real date and a number between
  20 and 500 (no numeric string), no date twice — and a 400 names the first bad one, such as
  `"items[3].weight" on 2026-06-04 must be a number between 20 and 500`. `WeighInRepository.putAll`
  then upserts them all in one transaction, so an import lands whole or not at all. The body is
  format-neutral: reading a scale's export is the frontend's job (see "Importing from EufyLife" in
  `docs/frontend.md`). Bun matches the static `/import` before `/:date`.

The date in the path is read by `pathDate` and `since` by `optionalQueryDate`, both of which call
`isRealDate`: `isIsoDate` plus a round trip through `Date.UTC`, so `2026-02-30` is a 400 rather than
a key that aliases March 2. A malformed date is a 400 before anything is looked up. Changing a
weigh-in's date is a delete and a new `PUT`. The routes sit behind the auth guard like every data
route, and the API is shaped so a later scale listener can simply `PUT` today's date.

## Static files (`features/static/`)

Static serving is deliberately narrow: `src/frontend/` with a path-escape guard, plus
`VENDOR_FILES` in `internal/paths.ts` — an allowlist of single files into `node_modules`, of any
type (`/vendor/oat.css`, `/vendor/oat.js`). Serving anything else from a package means adding it to
that map. A trailing slash asks for `index.html` in that directory, and a directory without one is
a 404 rather than the single-page app — otherwise the extension-less fallback would mask a real
miss, which is the thing it exists to avoid.

The feature keeps its private modules where the rule says they go — `internal/paths.ts` (the only
place a URL becomes a filesystem path) and `internal/transpile.ts` — and reaches them through
`internal/web-files.ts`; the build's `internal/embed.ts` and `internal/bundle.ts` it reaches
through the facade's `embed()`.

`internal/static.controller.ts` does not know where bytes come from: it reads through the
`WebFiles` interface in `internal/web-files.ts`. Under `bun start` and in the tests that is
`DiskWebFiles` — `paths.ts` for the path-escape guard and the vendor allowlist, `transpile.ts` for
modules, re-read on every request. In a built file it is `EmbeddedWebFiles`, lookups in the maps
the build carries (made by `embed.ts`, the modules bundled by `bundle.ts`), behind the same
decoding, NUL and escape guards. A `WebFile` is a `file`, a `missing` one (eligible for the
single-page fallback), an `invalid` path (a 404, never the fallback) or an `error` (a 500), and the
controller keeps the method check, the directory index, the fallback, the auth status and
hot-reload client injections and the ETag for both sources. Vendor files sit in their own map, so
they stay reachable only at their literal URL, exactly as on disk. `static.routes.ts` only declares
the URLs that reach the controller.

### Pages

`internal/page.ts` prepares an HTML page in one `HTMLRewriter` pass: it versions the files the page
loads. It announces no module graph: a deployed build is one bundle, and served from source the
graph arrives a level of imports at a time over localhost (see "Loading" in `docs/frontend.md`).

Every module, stylesheet and vendor file is named `<url>?v=<tag>`, where the tag is `contentTag()`
in `internal/content-tag.ts`, the same hash the ETag carries (see "Caching"). The page's own `src`
and `href` attributes are rewritten to those URLs, all but the icon's and the manifest's, which
have no tag. An import map from every plain URL to its versioned one goes right before the first
module script, ahead of anything that loads a module, which the browser requires. The page can only
name what it links itself, and the map versions everything else: a module's relative imports
resolve to plain URLs, which the map rewrites, and `ui/styles.ts` looks a component's stylesheet up
in it. A built page has no map: its bundle imports nothing by URL and carries every sheet. A `<` in
the map's JSON is escaped as `\u003c`, so no URL could end the element early.

A page reads the web root through a `PageSource`: the tag of every versioned file. `DiskWebFiles`
reads them through its own `page()` and `vendor()`, each file at most once per page, so a tag is
the one that file's response carries; that transpiles the whole frontend on every request for the
page, a few milliseconds. The build tags the strings it embeds, which `EmbeddedWebFiles` serves as
they are. `static.routes.test.ts` holds that the page announces no module graph, and that every
version is the tag its plain URL's ETag carries.

### Content types and methods

The static feature keeps no map of content types. Transpiled modules get a fixed `Content-Type`,
and every plain file — vendor files included — takes `Bun.file(x).type` — the same lookup
`new Response(Bun.file(x))` uses, off a complete MIME database (`.svg` → `image/svg+xml`, `.woff2`
→ `font/woff2`, `.png` → `image/png`, `.webp` → `image/webp`, `.webmanifest` →
`application/manifest+json`, no extension → `application/octet-stream`, all measured on Bun 1.4.2),
so a hand-written map would be a subset that drifts. It also does not special-case HEAD beyond
letting it past the method check — Bun strips the body itself and leaves the headers alone, which
`static.routes.test.ts` holds in place. What it does do is own the `405 Method not allowed` for the
whole server, answered by `StaticController.frontend`: `/*` is declared as a bare handler function
rather than a `{ GET, HEAD }` map, because a map answers an unmatched verb with an empty-bodied 404
and there is no `fetch` behind it to say otherwise. An unmatched verb on a vendor route falls
through to `/*` and is answered there.

### Caching

Every static `200` — files, transpiled modules, the index page and the vendor files alike — is sent
a strong `ETag` hashed from the exact body by `contentTag()`, with `Bun.hash`. A request whose `v`
query parameter is that tag, as every versioned URL a page names is, gets
`Cache-Control: public, max-age=31536000, immutable`: those bytes can never change under that URL,
so a browser keeps them a year and does not even revalidate them on a reload. Anything else gets
`no-cache`: a plain URL, the index page, which is what names the current versions, and a `v` that
is not the current tag. That last case is a page loaded before a file changed, such as an open tab
during a deploy or a stylesheet hot reload swapped in place; it gets the current bytes, and they
are not cached for good under a version they do not match. A `304` keeps the caching its `200`
would have had. A `GET` or `HEAD` whose `If-None-Match` matches (in a comma-separated list, as `*`,
or with a `W/` prefix, per RFC 9110 weak comparison) gets an empty `304`. Bun does neither of these
itself: measured on 1.4.2, a `Bun.file` response has no validator, and a response that sets `ETag`
is still a full `200` when the tag matches. The tag is a content hash rather than mtime and size
because it changes exactly when the bytes do, it covers transpiler output that depends on the Bun
version, and hashing files of this app's size costs well under a millisecond. A `304` still reads
or transpiles the file; only the transfer is saved. Vendor files used to be cached for an hour,
which let a browser keep a stale vendor file (Pico, at the time) after `bun install`; a version now
changes with the file, and the plain URL is revalidated. Error responses carry no `ETag`.

## Logging (`shared/log.ts`)

Everything the server logs goes through `log.info(topic, message, payload?)`,
`log.warn(topic, message)` or `log.error(topic, message, err?, payload?)`, each of which writes
`<topic> <message>`. The topic is one short word for where the line comes from (`http`, `auth`,
`server`, `db`, `static`, `dev`). A payload, the data the line is about (today only the access
log's request body), follows the message on the same line; it is passed apart from the message so
the colored format can tell the two apart. An error is appended below the line as `Bun.inspect`
renders it — the stack, a `cause` and an `AggregateError`'s inner errors, which is where a
transpile failure and a failed migration keep their reasons and which `err.stack` does not show.
There is no level filter, no JSON format and no setting; journald adds the timestamps.

Under systemd, journald reads a leading `<N>` as the line's syslog priority, so each line goes out
with `<6>` (info), `<4>` (warn) or `<3>` (error), and every line of a multi-line entry carries it, a
stack included, because journald stores each line as its own entry. That is what makes
`journalctl -p warning` and `-p err` filter. The logger takes this mode only when `JOURNAL_STREAM`,
which systemd sets, names stdout's own `dev:ino`, not merely when it is set: a terminal opened from
a systemd user unit inherits the variable, and `bun start` there must still print the terminal
format. In journald mode every level goes to stdout, so related lines stay in order in one stream.
In a terminal each line starts with `HH:MM:SS`, warn and error lines say `WARN` or `ERROR` after
the time, and info goes to stdout, warn and error to stderr. Output Bun writes itself before
`main()` runs, such as a failed top-level import, stays unprefixed.

`bun run start:dev` (`GAINZ_DEV=1`) colors the terminal format: the time gray, the level in green,
yellow or red, the topic magenta and the payload cyan, with info named as `INFO` so every level has
its color, and the error rendered by `Bun.inspect` with its own colors. It does so only where
`Bun.enableANSIColors` holds, so `NO_COLOR` turns it off, and never in journald mode. `bun start`
prints no colors.

`setLogSink(sink)` replaces where entries go and returns a function that restores the previous
sink; the tests use it through `useLogs()`, which is why the suite prints nothing. Logging happens
at the edges — `main.ts`, `http/`, the auth facade and its throttle, `transpile.ts`, `bundle.ts`
and the dev hub — never in a repository or a data facade; the migration runner reports through its
`onMigration` callback, and `main.ts` logs what it reports.

| topic    | level | text                                                                    | source                       |
| -------- | ----- | ----------------------------------------------------------------------- | ---------------------------- |
| `http`   | info  | `<METHOD> <path+query> <status> <ms>ms[ <body>]`                        | access log, `/api` and < 500 |
| `http`   | error | same, then the stack when a throw caused it                             | access log, any route ≥ 500  |
| `http`   | error | `unhandled error outside a route` + stack                               | `Bun.serve` `error` hook     |
| `auth`   | info  | `login`                                                                 | `AuthFacade.login()`         |
| `auth`   | warn  | `wrong password`                                                        | `AuthFacade.login()`         |
| `auth`   | warn  | `login locked for <n> s after <m> failed attempts`                      | `LoginThrottle.failed()`     |
| `server` | info  | `gainz is running on <url>`, `database: …`, `auth: …`, `hot reload: on` | `main.ts` banner             |
| `server` | info  | `stopping (SIGTERM)` / `stopping (SIGINT)`                              | `main.ts` shutdown           |
| `server` | error | `GAINZ_PASSWORD_HASH is not an argon2 or bcrypt hash; …`                | `main.ts`, exit 1            |
| `server` | error | `failed to start` + stack                                               | `main.ts`, exit 1            |
| `server` | error | `uncaught exception` / `unhandled rejection` + stack                    | `main.ts`, exit 1            |
| `db`     | info  | `applied <migration>`                                                   | `main.ts` `onMigration`      |
| `static` | error | `could not transpile <path>` + cause                                    | `transpile.ts`               |
| `static` | error | `could not bundle <file>: <message>`                                    | `bundle.ts`                  |
| `dev`    | info  | `hot reload watching <dir>/` / `hot reload idle`                        | `hub.ts`                     |

The access log in `http/access-log.ts` writes one `http` line for every request under `/api`, and
for any other route only from 500 up: one page load fetches dozens of modules, and their lines
would bury the API calls. A `POST`, `PUT`, `PATCH` or `DELETE` adds its body after the line when
there is one, read from a `req.clone()` taken before the handler runs and only once the line is
known to be logged, so the handler sees the request untouched. The body is shown as compact JSON
with the value of every key named exactly `password`, at any depth, replaced by `"[redacted]"`, and
cut at 1024 characters with `…(+<n> more)`; a body that is not JSON shows only as
`[<n> bytes, not JSON]`, so a malformed login cannot leak a password. A line from 500 up is logged
at error, followed by the error when a throw caused it; a WebSocket upgrade, which returns no
response, is not logged.

Never logged: cookies, headers, `password` values, and the text of a body that is not JSON.

## Authentication (`features/auth/`)

One password guards the API, and a long-lived cookie remembers it, so a phone logs in once rather
than answering a Basic Auth prompt on every launch. `GAINZ_PASSWORD_HASH` holds a `Bun.password`
hash (argon2id from `bun run hash-password`; bcrypt is accepted too), and `main.ts` refuses to
start when the variable holds anything else. Unset or empty, auth is off: the guard hands the
tables back untouched, `POST /api/auth/login` validates its body and answers 204 without a cookie,
the health check reports `"auth": false`, the index page embeds `{ "enabled": false }` (the
frontend's cue to hide Log out and skip its login page; see below) and the startup log says
`auth: off`. That is why `bun start`, the seed and every route test other than
`auth.routes.test.ts` need no cookie. Production cannot fall into that state unnoticed: the unit
file requires the env file that sets the hash, and `gainz-deploy` rolls back a release whose health
check reports `"auth": false` (see `docs/deployment.md`).

The status cannot change while the server runs, so the server writes it into the page, and there
is no endpoint for it: `StaticController` passes every HTML page through `embedAuthStatus()` in
`static/internal/page.ts`, which adds `<script type="application/json" id="auth-status">` holding
the same `AuthStatusDto` to the end of `<head>`. That happens at serve time, not at build time,
because a built file is configured with the password hash only when it starts. Like the hot-reload
client, it is added before the page is hashed, so the ETag covers it.

`POST /api/auth/login` with `{ "password": "…" }` answers 204 and sets
`gainz_session=<expiresAt>.<signature>; Path=/; Max-Age=7776000; Secure; HttpOnly; SameSite=Lax`.
`expiresAt` is epoch milliseconds and the signature a base64url HMAC-SHA256 over
`gainz_session.<expiresAt>`, keyed by the password hash itself (`internal/session-cookie.ts`).
There is no sessions table and no second secret: changing the password invalidates every cookie,
which is the "log out everywhere" for a lost phone. `POST /api/auth/logout` answers 204 with the
cookie expired; it only clears that browser, and a copied cookie stays valid until it expires or
the password changes. The cookie is always `Secure` — HTTPS ends at the reverse proxy in
production, and browsers accept `Secure` cookies from `http://localhost` — and `SameSite=Lax` plus
JSON request bodies is the CSRF protection: a cross-site form cannot send `application/json`, and a
cross-site `fetch` does not carry a Lax cookie.

Each accepted password is logged as `auth login` and each rejected one as `auth wrong password`;
the password itself never is, because the access log redacts it from the login's body. A locked
attempt checks no password and logs nothing of its own; its 429 shows in the access log.

Sessions slide. A cookie lives 90 days, and a guarded response re-sets a fresh one once the cookie
it was sent was issued (`expiresAt` − 90 days) more than a day ago, so an app used now and then
stays logged in while renewing at most once a day.

The guard is `AuthFacade.guard(table)`, applied in `allRoutes()` to the data tables. It wraps every
handler — a bare function or each verb of a method map — and throws `unauthorized()`
(`401 { "error": "Not logged in" }`) for a missing, malformed, tampered, expired or old-password
cookie. A static `Response` value would bypass the wrapper, so meeting one is a startup error. The
table walk is `wrapHandlers()` in `http/routing.ts`, which the access log is built on too.
Everything outside those tables stays public: `/api/health`, the `/api` 404s, login and logout,
`/dev/ws`, and the whole frontend, whose code is public in the repository anyway — guarding it
would only need an allowlist of the modules the login page imports.

`internal/login-throttle.ts` backs off wrong passwords for every client at once, since behind the
proxy every client is `127.0.0.1` and `X-Forwarded-For` is not trusted. From the fifth consecutive
failure on, each failure locks the login for `60 · 2^(failures − 5)` seconds, up to an hour, and a
locked login answers `429` with `Retry-After` before any hashing. `begin()` counts an attempt as a
failure before `Bun.password.verify` runs, so concurrent guesses cannot all slip past the check;
`succeeded()` resets the count, as does a restart. Each lockout is logged with `log.warn`, once the
failure that started it is confirmed. Someone hammering the login can delay your next login, but
never a device that already holds a cookie. The facade and the throttle read an injectable `now()`
from `AuthOptions`, which is how `auth.routes.test.ts` tests expiry and backoff without waiting.

## Hot reload (`features/dev/`)

`bun run start:dev` sets `GAINZ_DEV=1`, and only then does the dev feature do anything:
`devRoutes()` registers `/dev/ws`, `StaticController` injects
`<script type="module" src="/dev/hot.ts">` into the index page, and `main.ts` prints
`hot reload: on`. Without the variable `devRoutes()` is `{}` and the page is byte-for-byte what
`bun start` has always served. The switch is that one variable rather than `NODE_ENV`, whose
non-production default would give plain `bun start` a watcher and a socket. A built file never
enables the dev feature, whatever `GAINZ_DEV` says: it has no source tree to watch, and
`dev/hot.ts` is not embedded. `DevFacade.enabled()` is static, so `main.ts` can ask without
building a facade, and reads it on every call, so `dev.routes.test.ts` can flip it around a server.

The injection runs before the page is hashed, so the ETag covers the injected bytes. It is reached
from both places the index page is served — the plain-file branch, for `/` and `/index.html`, and
the single-page fallback for every client route.

The watcher follows the connections, not the process. `internal/hub.ts` starts one recursive
`fs.watch` over the web root when the first browser connects and closes it when the last one
leaves, so `main.ts`'s shutdown has nothing to stop and no test leaves a watcher behind. Each path
is debounced for 25 ms, because one save reports several events, and `internal/changes.ts` turns
it into `{ swap }` for a `.css` or `{ reload }` for a `.ts`, `.html`, `.webmanifest`, `.svg` or
`.png` (the manifest and the icons); anything else — including the bare directory names the watcher
also reports — is dropped. The connection set is module state rather than a facade's field, because
`devRoutes()` and `staticRoutes()` each build their own facade.

`websocket` is passed to `Bun.serve` unconditionally and only the route is gated. Spreading the
option in conditionally flips `Bun.serve`'s options type between its with- and without-WebSocket
variants, which is also why `RouteTable` is `Bun.Serve.RoutesWithUpgrade`: a route that upgrades
returns `undefined`. Production therefore carries a socket handler no route can reach.

## Single-file build (`src/scripts/build.ts`)

`bun run build` writes `dist/gainz.js` and a linked `dist/gainz.js.map`, and a deployment is that
one file run with `bun`. `src/backend/shared/embedded.ts` is a committed stub exporting
`EMBEDDED = null`, which means "read from disk" — the state under `bun start` and in every test.
The build replaces that module through `Bun.build`'s `files` option with one that exports the
embedded web root, the vendor files and the migrations; `bun:sqlite` stays external. It sits
outside `features/` because both `db/` and the static feature read it.

What is embedded comes from `StaticFacade.embed()`: every file under `src/frontend/` except
`dev/**`, `testing.ts`, `*.test.ts` and `*.fixtures.ts`, keyed by its URL, except the modules.
Those `internal/bundle.ts` bundles into one fully minified ES module served at `/main.ts`, beside
its linked source map at `/main.ts.map`, which carries the sources, so DevTools shows the
TypeScript and maps a trace back to it; a toast still shows the minified names an error message
contains. No other module is embedded, so the built server answers every other `.ts` with a 404.
Its `Bun.build` plugin rewrites each module's `import.meta.url` to that module's own URL path,
which keeps the `.ts` → `.css` lookup in `ui/styles.ts` working, and fills `ui/inline-styles.ts`
with the text of every stylesheet under `src/frontend/` and Oat's, the way the build fills
`embedded.ts`, so a sheet arrives with the bundle rather than a round trip after the module before
it. The plugin also puts an import of Oat's script first in `main.ts`, so it runs before any
component as its deferred script did. `embed()` then rewrites the index page: its first stylesheet
link becomes `/main.css`, the stylesheets it linked joined in their order, and the other links, the
`fetch` preloads, the `oat.js` script and the comments in its `<head>` go. Bun wraps a dynamically
imported module, so a view still runs only on its first `import()`. A module the bundle reaches
that does not parse fails the build, naming the file; one it does not reach is not shipped, and
not checked.

A file that is not text (the icons) is embedded as base64 and flagged `base64: true`, because
`JSON.stringify` cannot carry raw bytes; `EmbeddedWebFiles` decodes it once at startup, so it is
served, and hashed, byte-identically to disk. Text files stay strings, so the stamp below can still
edit the index page, which is rendered (see "Pages") once every file is embedded. The migrations
come from `readMigrations`. The embedded `index.html` is stamped with an HTML comment right below
its doctype naming the commit (`git rev-parse HEAD`, suffixed `-dirty` when the working tree has
uncommitted changes, or `unknown` outside a git checkout), the build time as an ISO 8601 UTC
timestamp and, when `GITHUB_RUN_ID` is set (as it is in GitHub Actions), the workflow run ID.

The server itself is built with `target: 'bun'` and `minify: true`; Bun reads the linked source map
for stack traces. `GAINZ_DEV` is ignored in a built file. `dist/` is git-ignored, which is also
what keeps oxlint and oxfmt out of it.
