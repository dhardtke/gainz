---
date: 2026-09-12T20:59:52.822331+00:00
git_commit: eb2e69d2cebe7214a5449b6477a63d37093317b8
branch: main
topic: "How data is validated"
tags: [research, codebase, validation, translators, controllers, repositories, sqlite, frontend-forms]
status: complete
---

# Research: How data is validated

## Research Question

How is data validated in gainz?

## Summary

Validation happens in four places, each catching a different kind of fault, and every failure on
the server ends up as an `HttpError` that `Bun.serve`'s `error` hook renders as a JSON `ErrorDto`.

1. **Request shape and field values** — hand-written, no schema library. Controllers read the body
   with `readJsonObject` (must be JSON, must be a plain object), then hand it to a feature's
   *translator*, which calls the field helpers in `src/backend/shared/validate.ts`
   (`requiredString`, `optionalString`, `requiredInt`, `requiredNumber`, `requiredDate`). Path ids go
   through `pathId`, query parameters through `queryInt`. Each helper throws a 400 on the first bad
   field and otherwise returns a normalised value (trimmed, null-for-empty, coerced from a numeric
   string, rounded to two decimals). The translator's return value is typed as the shared request DTO.
2. **Referential and uniqueness rules** — in the repositories and the SQLite schema. A path id that
   names nothing is a 404 (`require`), a duplicate exercise name is a 409 (unique index, caught by
   `isUniqueViolation`), an `exerciseId` that names nothing is a 400 (foreign key, caught by
   `isForeignKeyViolation`), and deleting an exercise that has sets is a 409 (explicit count).
3. **Browser-side form constraints** — HTML attributes (`required`, `maxlength`, `min`, `step`,
   `type="date"`/`"number"`) whose bounds mirror most of the server's, plus trimming in
   `GzElement.formData` and a couple of explicit checks in submit handlers. Responses from the
   server are *not* validated; `api.ts` asserts their type, and narrows only error bodies.
4. **Non-request inputs** — static file paths (`resolveStaticPath`, the vendor allowlist) and
   migration files (filename pattern, version ordering, `PRAGMA foreign_key_check`).

```
src/
├── backend/
│   ├── shared/
│   │   └── validate.ts               field helpers, MAX_NAME / MAX_NOTES, pathId, queryInt, today
│   ├── http/
│   │   ├── http.ts                   readJsonObject — JSON + plain-object check
│   │   ├── errors.ts                 HttpError, badRequest / notFound / conflict, errorResponse
│   │   └── server.ts                 Bun.serve({ error: errorResponse })
│   ├── db/
│   │   ├── db.ts                     PRAGMA foreign_keys = ON
│   │   ├── sql.ts                    isUniqueViolation, isForeignKeyViolation, buildUpdate
│   │   ├── migrations.ts             migration filename / ordering / FK checks
│   │   └── migrations/001-initial-schema.sql   NOT NULL, UNIQUE NOCASE, FKs
│   └── features/
│       ├── exercises/internal/
│       │   ├── exercise.controller.ts    readJsonObject → translator → mapper → facade
│       │   ├── exercise.translator.ts    body → CreateExerciseDto / EditExerciseDto
│       │   └── exercise.repository.ts    404, 409 duplicate name, 409 delete-in-use
│       ├── workouts/internal/
│       │   ├── workout.controller.ts     pathId, queryInt, translators
│       │   ├── set.controller.ts
│       │   ├── workout.translator.ts     body → CreateWorkoutDto / EditWorkoutDto
│       │   ├── set.translator.ts         body → CreateSetDto / EditSetDto
│       │   ├── workout.mapper.ts         defaults performed_on to today()
│       │   ├── workout.repository.ts     404, copyFrom existence inside a transaction
│       │   └── set.repository.ts         404 workout, 400 on FK violation
│       └── static/internal/paths.ts      path traversal / NUL / allowlist checks
├── shared/dto/                       types only — CreateXDto / EditXDto / ErrorDto
└── frontend/
    ├── api.ts                        ApiError, error-body narrowing, unchecked `data as T`
    ├── base.ts                       formData() trims every text value
    └── components/                   HTML constraint attributes + submit handlers
.oxlintrc.json                        routes may not import validate.ts / http.ts / errors.ts
```

```
POST /api/workouts/:id/sets
        │
        ▼
workout.routes.ts ── (req) => controller.addSet(req)
        │
        ▼
WorkoutController.addSet
  pathId(req.params.id, 'workout') ─────────────── 400 "Invalid workout id"
  readJsonObject(req) ──────────────────────────── 400 not JSON / not an object
  translateToCreateSetDto(body) ────────────────── 400 first bad field
  fromCreateSet(dto)            (camelCase DTO → snake_case SetInput, no checks)
        │
        ▼
SetFacade.create → SetRepository.create
  workouts.require(workoutId) ──────────────────── 404 "Workout not found"
  INSERT … (FK on exercise_id) ─────────────────── 400 "exerciseId must name an existing exercise"
        │
        ▼ thrown HttpError anywhere above
Bun.serve error hook → errorResponse(err) → { error, details? } with err.status
                                          (anything else → 500 "Internal server error")
```

## Detailed Findings

### The error type and how it reaches the client

- `HttpError` carries `status`, `message` and an optional `details` (`src/backend/http/errors.ts:5-14`).
- Three factories: `badRequest` (400), `notFound(what)` (404, "`<what>` not found"), `conflict` (409)
  (`src/backend/http/errors.ts:16-18`).
- `errorResponse` renders an `HttpError` as `ErrorDto { error, details }` with its status; any other
  thrown value is logged and becomes a 500 `{ error: 'Internal server error' }`
  (`src/backend/http/errors.ts:20-28`).
- It is installed once as `Bun.serve`'s `error` handler (`src/backend/http/server.ts:11`), so
  validation code throws rather than returning responses. Controllers contain no `try`/`catch`.
- Every `badRequest` call passes only a message; no call site passes `details`
  (grep of `badRequest(` across `src/`). `ErrorDto.details` is declared optional for that reason
  (`src/shared/dto/error.ts:1-9`).
- Each helper throws on the first failing field, so one response names one problem.

### Reading the body: `readJsonObject`

- `req.json()` failing → 400 "Request body must be valid JSON" (`src/backend/http/http.ts:21-26`).
- A parsed value that is `null`, an array, or a primitive → 400 "Request body must be a JSON object";
  the check is the type guard `isJsonObject` (`src/backend/http/http.ts:16-18`, `:27-29`).
- It returns `Record<string, unknown>`, which is the parameter type every translator accepts.

### Field helpers: `src/backend/shared/validate.ts`

| Helper | Accepts | Normalises to | Failure message (400) |
| --- | --- | --- | --- |
| `isPresent(body, field)` (`:9-11`) | own property whose value is not `undefined` | boolean | — |
| `requiredString(body, field, max = 200)` (`:13-23`) | non-blank string, trimmed length ≤ max | trimmed string | `"x" is required and must be a non-empty string` / `must be at most N characters` |
| `optionalString(body, field, max = 2000)` (`:26-42`) | `undefined`, `null`, or a string | `null` for missing / null / blank; else trimmed | `"x" must be a string` / `must be at most N characters` |
| `requiredInt(body, field, {min = 0, max = MAX_SAFE_INTEGER})` (`:44-58`) | integer number, or non-blank string that `Number()`s to one | number | `"x" must be a whole number` / `must be between min and max` |
| `requiredNumber(body, field, {min = 0, max = 100000})` (`:60-71`) | finite number, or non-blank numeric string | rounded to two decimals (`Math.round(n*100)/100`) | `"x" must be a number` / `must be between …` |
| `requiredDate(body, field)` (`:73-79`) | `requiredString` with max 10, matching `/^\d{4}-\d{2}-\d{2}$/` and `Date.parse` not NaN | the string as given | `"x" must be a date in YYYY-MM-DD format` |
| `pathId(raw, what)` (`:81-87`) | `Number(raw)` is an integer ≥ 1 | number | `Invalid <what> id` |
| `queryInt(params, key, fallback, {min = 0, max = 1000})` (`:89-99`) | absent or `''` → fallback; else integer in range | number | `"key" must be a whole number between min and max` |

- Shared length bounds: `MAX_NAME = 120`, `MAX_NOTES = 2000` (`:6-7`). The exercise `muscleGroup`
  bound of 60 is a literal in the translator rather than a constant.
- Length is measured after trimming, on the JavaScript string length.
- Range checks on numbers happen before the two-decimal rounding in `requiredNumber`.
- `today()` (`:101-103`) is not a validator; it lives here and is used by `workout.mapper.ts` to
  default a missing date (UTC date via `toISOString`).

### Translators: body → request DTO

A translator reads only the fields its DTO names, so unknown keys in a body are ignored. Create and
edit translators differ in how they treat absent fields.

**Exercises** — `src/backend/features/exercises/internal/exercise.translator.ts`
- Create (`:4-10`): `name` required, ≤ 120; `muscleGroup` optional, ≤ 60; `notes` optional, ≤ 2000.
- Edit (`:12-24`): each field validated only when `isPresent`; `name` present must still be
  non-blank; `muscleGroup` / `notes` present as `null` or `''` become `null` (clears the column).

**Workouts** — `src/backend/features/workouts/internal/workout.translator.ts`
- Create (`:4-11`): `performedOn` validated as a date only when present — so an explicit `null` or
  `''` is a 400, while a missing key is allowed; `title` ≤ 120 and `notes` ≤ 2000 optional;
  `copyFromWorkoutId` validated as integer ≥ 1 only when present (the string `'nope'` → 400,
  `workout.routes.test.ts:54-56`).
- Edit (`:13-25`): `performedOn`, `title`, `notes` each validated only when present. There is no
  `copyFromWorkoutId` on edit.
- The mapper then supplies `performed_on: dto.performedOn ?? today()` (`workout.mapper.ts:10-16`).

**Sets** — `src/backend/features/workouts/internal/set.translator.ts`
- Create (`:4-12`): `exerciseId` integer ≥ 1; `reps` integer 1–1000; `weight` number 0–100000
  (two decimals); `notes` optional ≤ 2000; `position` integer ≥ 0 only when present.
- Edit (`:14-32`): same rules, each only when present.
- When `position` is absent on create, `SetRepository.create` computes `MAX(position) + 1`
  (`set.repository.ts:61-64`).

The translators' return types are the shared DTOs (`src/shared/dto/set.ts:20-40`,
`src/shared/dto/workout.ts:40-57`), which are type declarations only. The mappers that follow
(`set.mapper.ts`, `workout.mapper.ts`, `exercise.mapper.ts`) rename fields to column names and fill
defaults; they perform no checks.

### Controllers: order of checks

All request-derived validation is invoked from the controllers:

- `WorkoutController` (`src/backend/features/workouts/internal/workout.controller.ts`)
  - `list` (`:18-23`): `limit` 1–200 default 50, `offset` 0–100000 default 0.
  - `create` (`:25-30`), `update` (`:37-41`), `addSet` (`:54-58`): `pathId` first (where there is
    an id), then `readJsonObject`, then the translator, then the facade.
  - `show`, `delete`, `listSets`: `pathId` then the facade.
- `SetController` (`set.controller.ts:12-25`) and `ExerciseController`
  (`exercise.controller.ts:16-39`) follow the same order.
- `StatsController.summary` takes no input (`stats.controller.ts:8-10`).

Because the translator runs before the facade, a request with both a bad body and an unknown path
id receives the 400 from the body, not the 404 from the repository.

The route files hand the request straight to the controller (e.g. `workout.routes.ts:5-23`), and
`.oxlintrc.json:129-153` forbids `*.routes.ts` from importing `shared/validate.ts`, `http/http.ts`,
`http/errors.ts`, `ports/`, repositories and non-controller `internal/` modules. Controllers are
forbidden from importing repositories (`.oxlintrc.json:154-169`).

### Repositories and the schema

Schema: `src/backend/db/migrations/001-initial-schema.sql`
- `exercises.name TEXT NOT NULL` with `UNIQUE INDEX … (name COLLATE NOCASE)` (`:1-9`).
- `workouts.performed_on TEXT NOT NULL` (`:11-17`).
- `sets.workout_id … REFERENCES workouts ON DELETE CASCADE`, `sets.exercise_id … REFERENCES
  exercises ON DELETE RESTRICT`, `reps INTEGER NOT NULL`, `weight REAL NOT NULL`,
  `position INTEGER NOT NULL DEFAULT 0` (`:21-30`).
- There are no `CHECK` constraints; value ranges live only in the translators.
- Foreign keys are enforced because `openDatabase` runs `PRAGMA foreign_keys = ON`
  (`src/backend/db/db.ts:20`).

Constraint predicates: `src/backend/db/sql.ts`
- `isUniqueViolation` matches the message `UNIQUE constraint failed` (`:8-10`).
- `isForeignKeyViolation` matches `err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY'` (`:13-15`).
- `buildUpdate` takes column names only from a hard-coded `FIELDS` tuple per repository, includes a
  column when the key is `in` the patch (so `null` clears it), returns `null` for an empty patch,
  and throws a `TypeError` (→ 500) if a value is not string / number / null (`:30-51`).

Per repository:
- `ExerciseRepository` (`src/backend/features/exercises/internal/exercise.repository.ts`)
  - `require` → 404 "Exercise not found" (`:41-47`).
  - `create` / `update` translate a unique violation into 409 "An exercise named "…" already
    exists" (`:49-67`, `:69-84`). Case-insensitive through the `NOCASE` index
    (`exercise.routes.test.ts:23-27`).
  - `delete` counts sets for the exercise and throws 409 before the `RESTRICT` foreign key would
    fire (`:86-93`).
- `WorkoutRepository` (`src/backend/features/workouts/internal/workout.repository.ts`)
  - `require` → 404 "Workout not found" (`:42-48`); `update` and `delete` call it first
    (`:86-99`).
  - `create` checks `copyFrom` with `require` inside the same transaction as the insert, so an
    unknown source workout is a 404 and no empty workout is left behind (`:55-84`).
- `SetRepository` (`src/backend/features/workouts/internal/set.repository.ts`)
  - `create` checks the path's workout with `workouts.require` (404), and maps a foreign-key
    violation on `exercise_id` to 400 "\"exerciseId\" must name an existing exercise"
    (`:58-84`). The comment at `:54-57` records the split: path id → 404, body id → 400.
  - `update` applies the same FK → 400 mapping (`:86-101`).
- An `update` with an empty patch runs no statement and returns the current row
  (`buildUpdate` returning `null`).

### Frontend

**Form constraints (browser validation)** — attributes in the component templates:

| Component | Field | Attributes | Server rule |
| --- | --- | --- | --- |
| `gz-exercise-list.ts:105-113`, `:165-173` | name | `required maxlength=120` | required, ≤ 120 |
| | muscleGroup | `maxlength=60` | ≤ 60 |
| | notes | `maxlength=2000` | ≤ 2000 |
| `gz-workout-list.ts:108-116`, `gz-workout-detail.ts:266-275` | performedOn | `type=date required` | YYYY-MM-DD |
| | title / notes | `maxlength=120` / `2000` | ≤ 120 / ≤ 2000 |
| `gz-workout-detail.ts:309-321`, `gz-set-row.ts:118-126` | newExercise | `maxlength=120` | ≤ 120 |
| | weight | `type=number step=0.25 min=0 required` | 0–100000, two decimals |
| | reps | `type=number step=1 min=1 required` | integer 1–1000 |
| | notes | `maxlength=2000` | ≤ 2000 |

The number inputs carry no `max`.

**Submit handling**
- `GzElement` prevents the native submit and calls `handleSubmit` (`src/frontend/base.ts:77-84`),
  after the browser's constraint validation has allowed the submit.
- `formData` keeps only string entries and trims each (`src/frontend/base.ts:162-170`).
- Handlers convert with `Number(...)` and send the result; they do not check for `NaN`
  (`gz-workout-detail.ts:178-183`, `gz-set-row.ts:92-97`). The server's `requiredInt` /
  `requiredNumber` are what reject such values.
- Explicit client checks: an empty "new exercise" name shows the toast "Give the new exercise a
  name" and returns (`gz-workout-detail.ts:169-173`); a cleared date on the new-workout form is
  replaced by `todayIso()` because the API rejects an empty date (`gz-workout-list.ts:50-52`).
  `gz-exercise-list.ts:33-35` notes that an empty name is left for the API to reject.
- Every `catch` calls `toastError`, which shows `error.message` (`gz-toast.ts:33-35`) — for an API
  failure that is the server's `ErrorDto.error` text.

**Responses** — `src/frontend/api.ts`
- A transport failure becomes `ApiError(…, 0, cause)` (`:58-67`).
- A non-JSON body parses to `null` (`:69-75`).
- For a non-2xx response the body is narrowed by hand: `error` is used only if it is a string,
  otherwise "Request failed (status)"; `details` is passed through (`:77-84`).
- A 2xx body is returned as `data as T` without checking; the comment at `:86-90` states that
  validating it would need a schema library, which the app does not have.

### Validation outside request handling

- **Static paths** — `resolveStaticPath` returns `null` for a path that fails
  `decodeURIComponent`, contains a NUL byte, or resolves outside `src/frontend/`
  (`src/backend/features/static/internal/paths.ts:34-50`). `/vendor/*` is an explicit single-file
  allowlist (`:15-29`).
- **Migrations** — `discover` requires filenames matching `<NNN>-<kebab-name>.sql`, versions ≥ 1
  and unique (`src/backend/db/migrations.ts:64-93`); `assertConsistent` requires applied versions to
  exist on disk and to form an unbroken prefix (`:99-118`); each migration runs
  `PRAGMA foreign_key_check` inside its transaction and rolls back on orphaned rows (`:144-155`).

### Tests that exercise validation

- `src/backend/http/http.test.ts:8-18` — invalid JSON and non-object body → 400.
- `src/backend/http/errors.test.ts:6-9` — `errorResponse` renders status, message, details.
- `src/backend/features/exercises/exercise.routes.test.ts:17-27`, `:43-46` — blank name 400,
  case-insensitive duplicate 409, delete-in-use 409.
- `src/backend/features/workouts/workout.routes.test.ts:14-16`, `:54-56`, `:71-72`, `:99-101` —
  bad date, non-integer `copyFromWorkoutId`, out-of-range `limit`, `reps: 0`, unknown `exerciseId`.
- `src/backend/features/workouts/set.routes.test.ts:26` — PATCH with unknown `exerciseId` → 400.
- There is no `validate.test.ts`; the helpers are covered through the route tests.

## Code References

- `src/backend/shared/validate.ts:6-7` — `MAX_NAME`, `MAX_NOTES`
- `src/backend/shared/validate.ts:13-99` — field, path and query helpers
- `src/backend/http/http.ts:20-31` — `readJsonObject`
- `src/backend/http/errors.ts:5-28` — `HttpError`, factories, `errorResponse`
- `src/backend/http/server.ts:11` — error hook
- `src/backend/features/exercises/internal/exercise.translator.ts:4-24` — exercise body rules
- `src/backend/features/workouts/internal/workout.translator.ts:4-25` — workout body rules
- `src/backend/features/workouts/internal/set.translator.ts:4-32` — set body rules
- `src/backend/features/workouts/internal/workout.controller.ts:18-58` — order of checks
- `src/backend/features/workouts/internal/workout.mapper.ts:10-16` — date default
- `src/backend/db/sql.ts:8-51` — constraint predicates, `buildUpdate`
- `src/backend/db/migrations/001-initial-schema.sql:1-34` — NOT NULL, UNIQUE, FKs
- `src/backend/features/exercises/internal/exercise.repository.ts:49-93` — 409s
- `src/backend/features/workouts/internal/set.repository.ts:58-101` — 404 / FK → 400
- `src/backend/features/workouts/internal/workout.repository.ts:55-84` — `copyFrom` check
- `src/frontend/base.ts:162-170` — `formData` trimming
- `src/frontend/api.ts:56-91` — error narrowing, unchecked success bodies
- `src/backend/features/static/internal/paths.ts:34-50` — static path checks
- `.oxlintrc.json:129-169` — import restrictions on routes and controllers

## Architecture Documentation

- **Parse, don't pass through.** A translator turns `Record<string, unknown>` into a typed DTO
  and is the only place a body's field values are checked; everything after it (mapper, facade,
  repository) works on typed values.
- **Throw, don't return.** Validation failures are `HttpError`s thrown from helpers, translators and
  repositories, and rendered centrally by the server's `error` hook.
- **Layer by knowledge.** Checks that need only the request live in the translator / `validate.ts`;
  checks that need the database (existence, uniqueness, usage) live in the repository, either as an
  explicit query (`require`, the set count) or by catching a SQLite constraint error.
- **Create vs. edit.** Create translators validate every field (optional ones becoming `null`);
  edit translators validate only keys that are present, and `buildUpdate` writes only those.
- **Normalisation is part of validation.** Strings are trimmed, blank optional strings become
  `null`, numeric strings are coerced, weights are rounded to two decimals.
- **No schema library** on either side; shared DTOs are compile-time types only.
- **Lint enforces placement**: route files cannot reach the validation helpers or error factories.

## Open Questions

- `requiredDate` relies on `Date.parse` to reject impossible dates; how Bun's JavaScriptCore
  parses strings such as `2026-02-31` was not verified here.
- `pathId` uses `Number(raw)`, so forms such as `1e2` or ` 5` would be accepted as ids; no test
  covers these inputs.
