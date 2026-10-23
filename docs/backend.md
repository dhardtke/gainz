# Backend (`src/backend/`)

The rules every change follows, then the domain rules and gotchas the code does not make obvious.

## Layout

Organized by feature, not by layer: `features/` holds `exercises/`, `workouts/` (sets included),
`stats/`, `weight/`, `auth/`, `meta/`, `static/` and `dev/`. Outside `features/` sits only what
belongs to no feature:

- `db/` — `db.ts` (connection, PRAGMAs, `clearDatabase`), `migrations.ts` and `migrations/`, and
  `sql.ts` with the table-agnostic helpers `buildUpdate`, `isUniqueViolation`,
  `isForeignKeyViolation`
- `http/` — `routing.ts` (`RouteTable`, `ParamRequest`, `wrapHandlers`), `routes.ts` (the registry,
  no handler code), `http.ts` (request readers: `pathId`, `pathDate`, `queryInt`,
  `optionalQueryInt`, `optionalQueryDate`, `optionalQueryString`, `readJsonObject`, `json()`,
  `noContent()`), `errors.ts`, `access-log.ts`, `security-headers.ts`, `same-origin.ts`, `server.ts`
- `shared/` — `validate.ts` (field rules and length bounds, `requiredOneOf`/`optionalOneOf`),
  `log.ts`, `embedded.ts`
- `main.ts` — entry point; `testing.ts` — test hooks

There is no `fetch` fallback: every URL the server answers is a declared route. Operator scripts
live in `src/scripts/`, not here.

### Inside a feature

- `<feature>.facade.ts` at the root — the only way another feature reaches it.
- `*.routes.ts` at the root, one per URL prefix: a route belongs to the file its prefix names, so
  `/api/workouts/:id/sets` is in `workout.routes.ts`.
- `<feature>.fixtures.ts` at the root (test-only) when other tests need its data.
- `ports/` — public row types and SQL fragments other features may read (e.g. `SET_COLUMNS`,
  `EST_1RM_SQL`, `VOLUME_SQL`, `effectiveVolumeSql()` in `workouts/ports/sql.ts`;
  `bodyWeightOnSql()` in `weight/ports/sql.ts`). Never anything that builds DTOs.
- `internal/` — private: the repository with its `Create<Entity>`/`Edit<Entity>` (a `Partial`)
  inputs, `<entity>.translator.ts`, and one `<x>.controller.ts` per route file.

No module may import another feature's `internal/`.

## A request's path

A route handler is one line passing the request to its controller. The controller reads the request,
then runs `body → translateTo<X>Dto → facade → row → translateTo<X>Dto → json()`. A facade write runs
`#validateCreate/#validateEdit → translateDtoTo<Create|Edit><Entity> → repository`. The body-to-DTO
translation only casts; validation and normalization happen in the facade before anything touches
the database. Composition across facades (e.g. a workout with its exercises and sets) lives in the
controller.

There is no composition root: each route factory takes `db` and calls the facade factories it needs
(`createWorkoutFacades(db)`, `createExerciseFacade(db)`, ...). `allRoutes(db, auth)` builds the one
`AuthFacade` (it holds the login throttle) and wraps the data tables in `auth.guard()`.
`src/scripts/seed.ts` uses the same facades, so seeded data passes API validation.

### Translators

A controller answers with a DTO, never a row. DTOs live in `src/shared/dto/` (camelCase, type-only,
shared with the frontend). Each translator function names every field it maps — never spread a row,
it would leak `workout_id`/`created_at`. Spreading another translator's DTO is fine. A translator
never imports another feature's `internal/`.

Ids and dates are flavored (`src/shared/flavors.ts`: `WorkoutId`, `ExerciseId`, `LiftSetId`,
`Iso8601Date`, `Iso8601DateTime`) in rows, repository signatures, `db.query` parameter tuples and
DTOs. A plain value assigns into a flavor without a cast; one flavor cannot stand in for another.
`pathId` returns a plain `number`; name the flavor at the binding
(`const id: WorkoutId = pathId(req.params.id, 'workout')`).

### Facades

Every data feature publishes `<Entity>Facade`s from its facade module; `static`, `dev` and `auth`
publish one too. A repository is named and constructed only by its own feature's facade. Facades
take request DTOs and return rows. `meta` has a controller but no facade.

All SQL lives in a feature's `internal/` (or `ports/` fragments). Repositories reference each other
only with `import type` and receive dependencies through their constructor
(`SetRepository(db, workouts, workoutExercises)`), so there are no runtime cycles.

### What the linter holds

`.oxlintrc.json` `overrides`: a `*.controller.ts` may not import a `*.repository.ts` or anything
under `ports/` (type imports included); `ports/` may not import `shared/dto`; `*.translator.ts` is
exempt from `typescript/no-unsafe-type-assertion`.

## Errors

Throw, don't answer: controllers, facades and repositories throw `HttpError` via `http/errors.ts`
(`badRequest` 400, `unauthorized` 401, `forbidden` 403, `notFound` 404, `conflict` 409,
`unsupportedMediaType` 415). The access log, the outermost wrapper but `securityHeaders()`, catches
every throw, answers `{ error }` and logs it. A new route needs nothing to get this. The login
lockout's 429 with `Retry-After` is the only refusal answered directly. Bodies over 1 MiB get 413
from Bun.

A missing id in the path is 404; a missing id in the body (e.g. `exerciseId`) is 400 — not
pre-checked, the `ON DELETE RESTRICT` foreign key refuses and `isForeignKeyViolation` maps it.

## Transactions

A write of more than one statement is one repository method inside `db.transaction()` (e.g.
`WorkoutRepository.create(input, { copyFrom })`, set create/delete,
`SetRepository.copyLastSessions`). Controllers and route files never open a transaction.

## Migrations

One numbered `.sql` file per change in `src/backend/db/migrations/`, applied by `openDatabase()` on
every start, each in its own transaction, recorded in `schema_migrations`. Foreign keys are off
during the run (for table rebuilds) and each migration must pass `PRAGMA foreign_key_check`. To change
the schema, add a file numbered above the current one; never edit an applied one. A table rebuild
copies the ids and the `AUTOINCREMENT` sequence. The runner refuses to start when files and database
disagree. A built file reads migrations from `EMBEDDED.migrations` instead of disk.

## Tests

- End-to-end over HTTP. `useServer({ auth? })` from `src/backend/testing.ts` starts a server on port
  0 with an in-memory database per test and returns `api`, `post`, `patch`, `put`, `del` and `logs`.
  Auth is off unless the file passes a password hash (and optionally a clock).
- Route tests live beside the routes file that declares the route: `POST /api/workouts/:id/sets`
  is tested in `workout.routes.test.ts`.
- Fixtures (`createExercise`, `createWorkout`, `createSet`, `putWeighIn`) live in the owning
  feature's `<feature>.fixtures.ts`, take `post`/`put` first, and may be imported across features.
- Unit tests only where HTTP can't reach or would hide a failure (migration runner, facade
  validation, field helpers, logger, ...). No repository unit tests.
- `features/static/internal/paths.test.ts` pins the web root, derived by counting directories up from
  that module's URL — moving the file breaks every asset.
- The suite prints nothing: `useLogs()` captures log lines as `{ level, text }`. Filter `logs()` by
  topic or use `toContainEqual`.
- Child-process tests: `src/scripts/build.test.ts` (the built file), `src/backend/main.test.ts`,
  `src/scripts/hash-password.test.ts`, `src/scripts/build-bundle.test.ts` (bundle under happy-dom).

## Data model

`exercises ──< sets >── workouts` and `exercises ──< workout_exercises >── workouts`; `weigh_ins
(measured_on PK, weight CHECK > 0)` stands alone.

- `sets`: `reps`, `weight`, `notes`, `done` (0/1, boolean on the wire), `position`.
  `workout_id` is `ON DELETE CASCADE`; `exercise_id` is `ON DELETE RESTRICT`.
- `workout_exercises (workout_id, exercise_id, position)`: the exercise order. A row exists exactly
  while the workout has a set of that exercise — `SetRepository` creates it with the first set and
  removes it with the last.
- `workouts.done` is stored and independent of the sets.
- `exercises.muscle_group` is one of `MUSCLE_GROUPS` or null (`CHECK`); `exercises.kind` is
  `weighted`, `bodyweight` or `assisted` (`CHECK`). Names are unique under `NOCASE`.

### Plans and history

A set not done is a plan (what "Repeat" copies); a done set is history. New and copied sets start
not done. History aggregates (exercise list stats, progress, best set, stats summary sets/reps/volume,
calendar, last session) count **done sets only**, with `s.done = 1` in the `JOIN ... ON` so entities
without done sets still list. A workout's own totals, the exercise delete guard and workout counts
count every set/workout.

### Rules

- `position` is server-owned and never changes; sets list by `position, id`. A set's exercise is
  fixed at creation (`exerciseId`/`position` in a PATCH are ignored).
- Weight by kind: required for weighted and assisted (assisted stores the assistance, less is
  better); bodyweight stores 0 and any other weight is a 400. Decided inside the transaction by
  `SetRepository#weightFor`. Copies store bodyweight weights as 0 (`COPIED_WEIGHT_SQL`).
- Kind changes freely; views reinterpret stored weights.
- **Done locks** (checked from stored state): a PATCH to a done set may hold only `done`, else 409;
  deleting a done set is 409. A done workout locks all its sets (log, PATCH incl. `done`, delete →
  409), checked first; its details, exercise order, delete and Repeat stay open. `done: true` on a
  workout without sets is 409.
- Volume (`VOLUME_SQL`) counts done sets of weighted exercises only. Effective volume for assisted
  is Σ reps × (body weight − assistance), using the latest weigh-in on or before the date; `NULL`
  without one.
- Progression (stats) = volume / previous session's volume − 1 (bodyweight: total reps; assisted:
  effective volume); not compared when either side is 0/`NULL`. Averaged per exercise, not per
  workout. `sessionChange()` in `stats.repository.ts` is the one place the rule is written.
- Dates come from the browser (`since`, `month` are required) because the server's `date('now')` is
  UTC. `isRealDate` rejects `2026-02-30`.
- Paged lists take `limit` 1–200 and `offset` 0–100000 and answer `{ items, total, limit, offset }`;
  `GET /api/exercises` without `limit` returns all with `limit: null`.

## Static files (`features/static/`)

- Serves `src/frontend/` with a path-escape guard, plus `VENDOR_FILES` in `internal/paths.ts`, an
  allowlist of single files from `node_modules` (`/vendor/oat.css`, `/vendor/oat.js`). Serving
  anything else from a package means adding it there.
- `.ts` modules are transpiled per request (`internal/transpile.ts`). `StaticController` reads
  through the `WebFiles` interface: `DiskWebFiles` from source, `EmbeddedWebFiles` in a built file.
- Extension-less paths fall back to `index.html`; a directory without trailing slash is a 404.
- `/*` is a bare handler (not a method map) so it can answer 405 for the whole server.
- Every URL a page names is versioned `?v=<contentTag>` via an import map that `internal/page.ts`
  inserts; a matching `v` gets `immutable` caching, anything else `no-cache`. ETags and 304s are
  hand-rolled (Bun does neither).
- `securityHeaders()` sets the headers; HTML pages get a CSP from `internal/csp.ts` that hashes the
  page's inline scripts, so no hashes are maintained by hand. Inline styles are allowed (charts use
  `style` attributes).
- The page gets the auth status (`#auth-status` JSON) and, in dev, the hot-reload script injected
  at serve time, before hashing.

## Logging (`shared/log.ts`)

`log.info(topic, message, payload?)`, `log.warn(topic, message)`,
`log.error(topic, message, err?, payload?)`. Topics: `http`, `auth`, `server`, `db`, `static`,
`dev`. Log only at the edges (`main.ts`, `http/`, auth, transpile/bundle, the dev hub) — never in a
repository or data facade. The access log logs every `/api` request and other routes from 500 up,
with write bodies redacted (`password` keys) and truncated. Never log cookies, headers or passwords.

## Authentication (`features/auth/`)

- `GAINZ_PASSWORD_HASH` (from `bun run hash-password`) enables auth; unset means auth off, so the
  seed and route tests need no cookie. `main.ts` refuses a value that isn't an argon2/bcrypt hash.
- The session cookie `gainz_session=<expiresAt>.<hmac>` is signed with the password hash itself (no
  sessions table); changing the password logs out everywhere. It lives 90 days and slides at most
  once a day.
- `AuthFacade.guard(table)` wraps the data tables in `allRoutes()`; a static `Response` value in a
  table is a startup error. Public: `/api/health`, `/api` 404s, login/logout, `/dev/ws`, the
  frontend.
- CSRF: `SameSite=Lax`, `sameOriginWrites()` (403 on cross-site `Sec-Fetch-Site`), and
  `readJsonObject`'s 415 for non-JSON bodies.
- `internal/login-throttle.ts` backs off per client (`internal/client-address.ts`, trusting
  `X-Forwarded-For` only from loopback) and globally. Tests inject `now()` through `AuthOptions`.

## Hot reload (`features/dev/`)

Only with `GAINZ_DEV=1` (`bun run start:dev`), never in a built file. `internal/hub.ts` watches the
web root while a browser is connected; `internal/changes.ts` maps a saved `.css` to a swap and
`.ts`/`.html`/manifest/icons to a reload. `websocket` is always passed to `Bun.serve` (only the
route is gated) to keep its options type stable.

## Single-file build (`src/scripts/build.ts`)

`bun run build` writes `dist/gainz.js` (+ map). `src/backend/shared/embedded.ts` is a committed stub
(`EMBEDDED = null` = read from disk); the build replaces it with the embedded web root and
migrations. `StaticFacade.embed()` embeds `src/frontend/` minus `dev/**`, `testing.ts`, `*.test.ts`
and `*.fixtures.ts`; all modules are bundled into `/main.ts` (`internal/bundle.ts`) and all
stylesheets into `/main.css` plus `ui/inline-styles.ts`. Only modules the bundle reaches are
shipped or checked. The built server answers any other `.ts` with 404, and `index.html` is stamped
with the commit and build time.
