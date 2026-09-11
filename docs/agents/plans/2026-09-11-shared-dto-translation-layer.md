---
date: 2026-09-11T11:28:11+00:00
git_commit: 5d3ed743cbf30e5f9ade3a5effcf27ce826614df
branch: main
topic: 'A shared DTO translation layer between backend and frontend'
tags: [plan, types, dto, backend, frontend, shared, api]
status: ready
---

# PLAN: A shared DTO translation layer in `src/shared`

Today the REST API hands repository rows straight to `Response.json`, and the frontend restates
those same shapes by hand in `src/frontend/types.ts`. The database schema and the wire format are
therefore the same thing under two names, kept in agreement by review alone — and a third copy of
the composite responses lives in `src/backend/testing.ts`.

This plan introduces `src/shared/dto/` as the single declaration of the wire format, and
`src/backend/http/dto/` as the translation between it and the repository row types. The row types
stay exactly as they are — they remain the dedicated types for the database models — but they stop
being what the API returns. `src/frontend/types.ts` is deleted.

Built on the research in `docs/agents/research/2026-09-11-data-type-declarations.md`.

## Acceptance Criteria

- `src/frontend/types.ts` no longer exists, and no module under `src/frontend/` imports anything
  from `src/backend/`.
- Every `/api` response body is produced by a mapper in `src/backend/http/dto/`. No route handler
  passes a repository row, a `Summary`, or any other `Repo` return value to `json()`.
- Every wire field — response and request alike — is camelCase. No DTO property name contains `_`.
- `src/backend/db/repos/` keeps its type names and shapes exactly as they are today, and
  `src/scripts/seed.ts` is unchanged.
- Every declaration file under `src/shared/dto/` contains only `export type` / `export interface`
  and transpiles to the empty string, so a frontend `import type` is erased and the browser never
  requests the module. (`index.test.ts` is the one runtime module in the directory; it exercises
  this rule and excludes itself from it.)
- `src/backend/testing.ts` declares no response shapes of its own: `WorkoutDetail`, `WorkoutPage`,
  `Progress` and `ErrorBody` are gone, replaced by the shared DTOs.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass.
- `docs/backend.md`, `docs/frontend.md` and the architecture list in `CLAUDE.md` describe
  `src/shared/` and the DTO boundary, replacing the paragraphs that currently record the opposite
  decision.

## Technical Key Decisions and Tradeoffs

1. **`src/shared/` is a type-only contract; the mappers are backend runtime code.**
   - Why: only `src/frontend/` is web-served — `resolveStaticPath` in `src/backend/paths.ts:42-58`
     refuses anything that resolves outside it. A type-only import is erased whole by
     `Bun.Transpiler`, so the browser never asks for the module; a value import would be a runtime
     404.
   - Impact: `paths.ts` and `static.routes.ts` are untouched. Any future runtime helper in
     `src/shared/` would need a new static route, so the plan adds a test that pins the module to
     types only.

2. **DTOs carry a `…Dto` suffix; `src/backend/db/repos/` keeps the clean names.**
   - Why: the database layer needs no churn, and the suffix tells a reader which side of the wire a
     value is on without opening the import.
   - Impact: 18 DTOs. `api.ts` and the six components that consume API shapes gain the suffix.

3. **The wire moves to camelCase, requests included.**
   - Why: with identical names the mapper would be an identity function and the layer would buy
     nothing but indirection. camelCase makes the wire a deliberate API rather than a transcript of
     the SQL schema, and — usefully — makes a row structurally unassignable to its own DTO.
   - Impact: roughly 125 occurrences of the renamed identifiers across the six components
     (`gz-workout-detail` 46, `gz-exercise-detail` 26, `gz-exercise-list` 15, `gz-workout-list` 15,
     `gz-dashboard` 14, `gz-set-row` 9), 36 lines of backend route tests, the `readXBody` key
     strings, and the 400-message texts that name a field. `shared/validate.ts` itself is
     untouched: it takes the key as a string argument.

4. **Request DTOs are written out in full as `CreateXDto` / `EditXDto`.**
   - Why: the contract reads straight off the file without the reader computing `Partial<>`, and
     each field can carry its own doc comment. `Partial<>` remains on the backend side, where it
     describes a repository argument rather than a shape that travels.
   - Impact: `readXBody` returns the DTO, so its return-type annotation catches a renamed DTO field
     — but only on the **object-literal key** it builds. The inbound wire key is still the string
     argument handed to `requiredInt` / `optionalString` / `isPresent`, and that string is
     unchecked: renaming `'performedOn'` there alone compiles cleanly and silently 400s or falls
     back to a default. The annotation narrows the gap; it does not close it, and the manual
     verification steps below exist because of the part it leaves open.
   - Impact: a separate mapper converts the DTO to `WorkoutInput` / `Partial<WorkoutInput>`, which
     means the field-by-field `if` chain appears twice for every edit endpoint — once in the route
     reading the untyped body, once in the mapper.

5. **Both sides split per entity, mirroring `db/repos/`.**
   - Why: the repository already establishes "one file per entity plus an index that re-exports",
     and 18 interfaces plus 17 mappers is enough material to warrant it.
   - Impact: `src/shared/dto/{exercise,workout,set,stats,error,index}.ts` and
     `src/backend/http/dto/{exercise,workout,set,stats,index}.ts`.

6. **`ErrorDto` joins the shared module.**
   - Why: the error body is a wire shape like any other, currently declared nowhere on the backend,
     narrowed by hand in `api.ts:66-68` and duplicated as `ErrorBody` in `testing.ts:37`.
   - Impact: `errorResponse()` gains a typed body and the last hand-duplicated shape disappears.

7. **No type-level or test-level leak guard.**
   - Why: explicitly decided against. A `ResponseDto` union on `json()` would make a raw row a
     compile error, and key-set assertions in the route tests would catch a mapper that spreads the
     row — both were considered and declined in favour of keeping `json(data: unknown)` decoupled
     and the test diff small.
   - Impact: the explicit field-by-field mappers plus review are the whole discipline. A mapper
     written as `{ ...row, workoutId: row.workout_id }` would leak internal columns and nothing
     would catch it, so **every mapper names every field**. `/api/health` keeps its ad-hoc
     `{ status, app }` object and needs no DTO.

8. **`copyFromWorkoutId` is passed through by the route, not by the mapper.**
   - Why: it belongs to `CreateWorkoutDto` but not to `WorkoutInput` — the repository takes it as a
     separate `options` argument.
   - Impact: `fromCreateWorkout` stays uniform with its siblings and the handler reads the field
     itself.

9. **Form field `name` attributes become camelCase too.**
   - Why: `GzElement.formData(form)` (`src/frontend/base.ts:162-170`) returns
     `Record<string, string>` keyed by the `name` attribute, and those values are passed straight
     into API calls. A form named `muscle_group` feeding a DTO field `muscleGroup` would silently
     send `undefined` — and `Record<string, string>` is not typechecked against the DTO, so nothing
     would report it.
   - Impact: `name`, `id` and `for` attributes in the touched components are renamed alongside the
     DTO fields, including the form-only `new_exercise` field, and the query selector
     `select[name='exercise_id']` in `gz-workout-detail.ts:212`. The four call sites are
     `gz-exercise-list.ts:32`, `gz-set-row.ts:90`, `gz-workout-detail.ts:149` and
     `gz-workout-list.ts:47`, each binding the result to a local `values`. This is also why the
     phases below carry real manual verification steps.

10. **Import specifiers follow each side's existing convention, but mind the depth.**
    - Why: the backend already imports `'../../db/repos'` as a directory; the frontend's rule is
      that a module's URL is its path.
    - Impact: from `src/backend/http/dto/` and `src/backend/http/routes/` the specifier is
      `'../../../shared/dto'` — **not** `'../../shared/dto'`, which resolves to the existing
      `src/backend/shared/` (home of `validate.ts`) and would fail in a confusing way rather than a
      loud one. From `src/frontend/api.ts` it is `'../shared/dto/index.ts'`; from a component under
      `src/frontend/components/<tag>/` it is `'../../../shared/dto/index.ts'`.

## Current State

```
SQLite columns  (db/migrations/001-initial-schema.sql)
      │
      ▼
src/backend/db/repos/*.ts        Exercise, ExerciseWithStats, SessionPoint, ExerciseInput
      │                          Workout, WorkoutWithStats, WorkoutInput
      │                          LiftSet, SetInput, Summary
      │                          └─ one re-export line, repos/index.ts:12
      ▼
src/backend/http/routes/*.ts     json(repo.requireSet(id))        ← the row IS the response
      │                          json({ ...workout, sets: … })    ← composites built inline,
      │                          json({ items, total, limit, offset })  with no named type
      ╎
      ╎──────────── HTTP, snake_case ────────────────────────────┐
      ▼                                                           ▼
src/frontend/types.ts (13 ifaces)                    src/backend/testing.ts:17,22,30
      │  ← imported by api.ts + 6 components           WorkoutDetail, WorkoutPage, Progress
      ▼                                                (the same three composites, third copy)
components/*.ts
```

The inbound direction is the only one with a translation today: `readXBody` in each route file
turns `Record<string, unknown>` into the repository's `…Input` through the per-field parsers in
`src/backend/shared/validate.ts`.

Facts that constrain the design:

| Constraint                                                            | Where                                              |
| --------------------------------------------------------------------- | -------------------------------------------------- |
| Only `src/frontend/` is web-served; anything outside it is a 404       | `src/backend/paths.ts:42-58`                       |
| The transpiler erases types and resolves no specifiers                 | `src/backend/transpile.ts:3-14`                    |
| `verbatimModuleSyntax` + `consistent-type-imports`                     | `tsconfig.json:15`, `.oxlintrc.json:21,43`         |
| `include: ["src"]`, so a new `src/shared/` typechecks for free         | `tsconfig.json:17`                                 |
| `json()` accepts `unknown`                                             | `src/backend/http/http.ts:3`                       |
| Backend `…Input` uses `string \| null`; frontend used `field?: …`      | `repos/exercises.ts:31` vs `frontend/types.ts:111` |
| There are **no frontend tests**; `bun run typecheck` is the only gate  | `docs/frontend.md:49-51`                           |
| `formData(form)` returns an untyped `Record<string, string>`           | `src/frontend/base.ts:162-170`                     |
| `transpile.test.ts` asserts `/types.ts` erases to the empty string     | `src/backend/transpile.test.ts:36-46`              |

## Desired End State

```
SQLite columns
      │
      ▼
src/backend/db/repos/*.ts     Exercise, Workout, LiftSet, Summary, …Input
      │                       unchanged — the database models, snake_case, mirroring SQL
      ▼
src/backend/http/dto/*.ts     toExercise(row): ExerciseDto        ← field by field, no spread
      │                       fromCreateExercise(dto): ExerciseInput
      ▼
src/backend/http/routes/*.ts  json(toLiftSet(repo.requireSet(id)))
      │
      ╎──────────── HTTP, camelCase ─────────────────────────────┐
      ▼                                                          │
src/shared/dto/*.ts   ◀───────────────── import type ────────────┘
      │   the single declaration of the wire format
      │   (type-only: erased by the transpiler, never fetched)
      ▼
src/frontend/api.ts + components/*.ts
src/backend/testing.ts        ← the third copy is gone; tests name the DTOs
```

Field renames the wire undergoes:

| Row / request field       | DTO field             |
| ------------------------- | --------------------- |
| `muscle_group`            | `muscleGroup`         |
| `created_at`              | `createdAt`           |
| `performed_on`            | `performedOn`         |
| `workout_id`              | `workoutId`           |
| `exercise_id`             | `exerciseId`          |
| `exercise_name`           | `exerciseName`        |
| `set_count`               | `setCount`            |
| `workout_count`           | `workoutCount`        |
| `exercise_count`          | `exerciseCount`       |
| `total_reps`              | `totalReps`           |
| `total_volume`            | `totalVolume`         |
| `top_weight`              | `topWeight`           |
| `best_weight`             | `bestWeight`          |
| `last_performed_on`       | `lastPerformedOn`     |
| `est_one_rep_max`         | `estOneRepMax`        |
| `workouts_last_30_days`   | `workoutsLast30Days`  |
| `volume_last_30_days`     | `volumeLast30Days`    |
| `best_set`                | `bestSet`             |
| `copy_from_workout_id`    | `copyFromWorkoutId`   |

`items`, `total`, `limit`, `offset`, `id`, `name`, `title`, `notes`, `reps`, `weight`, `position`,
`sessions` and `exercise` are already single words and do not change. The `limit` and `offset`
**query parameters** are likewise unchanged.

## Abstractions and Code Reuse

Reused as-is: `shared/validate.ts` (the parsers take the key as a string, so only the strings
change), `isPresent` for distinguishing absent from explicitly-null, `guardAll`, `HttpError`, the
`body<T>(res)` helper in `testing.ts`, and the whole of `db/repos/`.

New: two parallel per-entity directories, laid out the way `db/repos/` already is.

- `src/shared/dto/` — **types only, no runtime statement**
  - `set.ts` — `LiftSetDto`, `BestSetDto`, `CreateSetDto`, `EditSetDto`
  - `exercise.ts` — `ExerciseDto`, `ExerciseWithStatsDto`, `SessionPointDto`,
    `ExerciseProgressDto`, `CreateExerciseDto`, `EditExerciseDto`
  - `workout.ts` — `WorkoutDto`, `WorkoutWithStatsDto`, `WorkoutWithSetsDto`, `WorkoutPageDto`,
    `CreateWorkoutDto`, `EditWorkoutDto`
  - `stats.ts` — `SummaryDto`
  - `error.ts` — `ErrorDto`
  - `index.ts` — one `export type { … }` line per entity file
  - `index.test.ts` — asserts every file in the directory transpiles to nothing
- `src/backend/http/dto/`
  - `set.ts` — `toLiftSet`, `toBestSet`, `fromCreateSet`, `fromEditSet`
  - `exercise.ts` — `toExercise`, `toExerciseWithStats`, `toSessionPoint`, `toExerciseProgress`,
    `fromCreateExercise`, `fromEditExercise`
  - `workout.ts` — `toWorkout`, `toWorkoutWithStats`, `toWorkoutWithSets`, `toWorkoutPage`,
    `fromCreateWorkout`, `fromEditWorkout`
  - `stats.ts` — `toSummary`
  - `index.ts` — the re-export point route files import from

Modified:

- `src/backend/http/routes/`
  - `set.routes.ts` — `readSetBody` returns `CreateSetDto`; new `readEditSetBody` returns
    `EditSetDto`; handlers wrap through `toLiftSet`
  - `workout.routes.ts` — `readWorkoutBody` returns `CreateWorkoutDto`; new `readEditWorkoutBody`;
    the three inline composites become `toWorkoutWithSets` / `toWorkoutPage`
  - `exercise.routes.ts` — same shape; the inline progress object becomes `toExerciseProgress`
  - `stats.routes.ts` — `json(toSummary(repo.summary()))`
- `src/backend/http/errors.ts` — `errorResponse` body annotated `ErrorDto`
- `src/backend/testing.ts` — local response interfaces deleted, DTOs imported instead, and
  `createWorkout` posts a camelCase body (line 101) — untyped today, so nothing would flag it
- `src/backend/transpile.test.ts` — the two tests built on `src/frontend/types.ts` (lines 36-46)
  lose their subject when it is deleted
- every `*.routes.test.ts` — these claim response bodies as **repository row types** imported from
  `'../../db/repos'` (`set.routes.test.ts:2`, `workout.routes.test.ts:2`,
  `exercise.routes.test.ts:2`, `stats.routes.test.ts:2`). Left alone they would assert snake_case
  shapes against camelCase bodies with no compile error — precisely the drift this plan exists to
  remove — so each is re-pointed at the DTO in the phase that converts its endpoint
- `src/frontend/api.ts` — every return type and body parameter renamed to its DTO
- `src/frontend/components/{gz-set-row,gz-exercise-list,gz-exercise-detail,gz-workout-list,gz-workout-detail,gz-dashboard}/*.ts`
  — DTO imports, camelCase field reads, camelCase form `name`/`id`/`for` attributes
- `docs/backend.md`, `docs/frontend.md`, `CLAUDE.md`

Deleted: `src/frontend/types.ts`.

**The mapper house style**, to be followed by all 17 — every field named, nothing spread:

```ts
// src/backend/http/dto/set.ts
import type { LiftSet, SetInput } from '../../db/repos';
import type { CreateSetDto, EditSetDto, LiftSetDto } from '../../../shared/dto';

export function toLiftSet(row: LiftSet): LiftSetDto {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
  };
}

export function fromCreateSet(dto: CreateSetDto): SetInput {
  return {
    exercise_id: dto.exerciseId,
    reps: dto.reps,
    weight: dto.weight,
    notes: dto.notes ?? null,
    ...(dto.position === undefined ? {} : { position: dto.position }),
  };
}

export function fromEditSet(dto: EditSetDto): Partial<SetInput> {
  const patch: Partial<SetInput> = {};
  if (dto.exerciseId !== undefined) {
    patch.exercise_id = dto.exerciseId;
  }
  // … one branch per field
  return patch;
}
```

A spread would defeat the point: it compiles, and it ships `workout_id`, `exercise_id` and
`created_at` to the browser alongside the camelCase fields.

## Logging & Observability

No change. The mappers are pure functions with no failure mode of their own — a shape that does not
match is a compile error, not a runtime event. The existing `console.error` in
`errorResponse` (`src/backend/http/errors.ts:23`) and in `transpileModule` are untouched, and no
new log line is warranted.

## Implementation

### Phase 1: Sets, and the DTO scaffolding

Dependencies: None.

Stands up both `dto/` directories and takes the set endpoints across first, because `LiftSetDto` is
nested inside both `ExerciseProgressDto` (as `BestSetDto`) and `WorkoutWithSetsDto`, so the later
phases build on it.

Note the transitional state this leaves behind: `GET /api/workouts/:id` returns a snake_case
workout header with a camelCase `sets` array until Phase 3. The app works and the suite is green
throughout; the mixture is expected, not a defect.

**Tasks**:

- [ ] Create `src/shared/dto/set.ts` with `LiftSetDto`, `BestSetDto extends LiftSetDto`
      (`performedOn`), `CreateSetDto` and `EditSetDto`, each field carrying the doc comment its
      counterpart has in `src/frontend/types.ts` today. `CreateSetDto.position` is optional and
      documented as "appended to the workout when left out"; `EditSetDto` lists all five fields as
      optional, written out rather than derived.
- [ ] Create `src/shared/dto/index.ts` re-exporting `./set.ts` with a single `export type { … }`
      line, and a header comment stating that the module is type-only on purpose — the frontend
      reaches it with `import type`, which the transpiler erases, and `src/shared/` is not served.
- [ ] Create `src/shared/dto/index.test.ts`: read every `.ts` file in the directory that is not a
      test, run it through `new Bun.Transpiler({ loader: 'ts' })`, and assert the output trims to
      the empty string. This is what keeps decision 1 true as the module grows.
- [ ] Create `src/backend/http/dto/set.ts` with `toLiftSet`, `toBestSet`, `fromCreateSet` and
      `fromEditSet` in the house style above.
- [ ] Create `src/backend/http/dto/index.ts` re-exporting the set mappers.
- [ ] `src/backend/http/routes/set.routes.ts`: change `readSetBody` to return `CreateSetDto`
      reading `exerciseId`, `reps`, `weight`, `notes`, `position`; add `readEditSetBody` returning
      `EditSetDto`, replacing the inline `Partial<SetInput>` assembly in `PATCH`; wrap both
      responses in `toLiftSet` and the repository calls in `fromCreateSet` / `fromEditSet`.
- [ ] `src/backend/http/routes/workout.routes.ts`: map the two set endpoints
      (`GET`/`POST /api/workouts/:id/sets`) through `toLiftSet`, and the inline
      `{ ...workout, sets }` composites' `sets` array likewise. **Also wrap the input**: line 72
      calls `repo.createSet(id, readSetBody(...))`, and `readSetBody` now returns `CreateSetDto`,
      so it becomes `repo.createSet(id, fromCreateSet(readSetBody(...)))`. The workout half of the
      response stays as it is until Phase 3.
- [ ] `src/backend/testing.ts`: `WorkoutDetail.sets` becomes `LiftSetDto[]`, imported from
      `../shared/dto`.
- [ ] `src/frontend/types.ts`: delete `SetInput`; re-point `WorkoutWithSets.sets` at `LiftSetDto`
      via a type-only import. **`LiftSet` cannot simply go**: `ExerciseProgress.best_set` at line
      104 is `(LiftSet & { performed_on: string }) | null`, and that endpoint still returns
      snake_case until Phase 2. Rename the interface to an unexported `ProgressLiftSet` used only
      by `ExerciseProgress`, so the type keeps telling the truth and
      `gz-exercise-detail.ts:134` (`bestSet.performed_on`) keeps compiling. Phase 2 deletes it.
      Note in the header comment that the file is being dismantled.
- [ ] `src/frontend/api.ts`: `sets.update(id, patchBody: EditSetDto): Promise<LiftSetDto>`,
      `sets.remove`, and `workouts.addSet(id, input: CreateSetDto): Promise<LiftSetDto>`.
- [ ] `src/frontend/components/gz-set-row/gz-set-row.ts`: import `LiftSetDto`; rename the field
      reads at lines 59-60, 93, 112, 146; rename the form field `exercise_id` → `exerciseId` in the
      `name` attribute, the `values` read and the `<select>` markup.
- [ ] `src/frontend/components/gz-workout-detail/gz-workout-detail.ts`: the set-typed parts only —
      `#breakdown(sets: LiftSetDto[])`, the `#draft.exercise_id` → `#draft.exerciseId` rename, the
      add-set form's `name="exercise_id"`/`name="new_exercise"` attributes and their `id`/`for`
      partners, and the `select[name='exerciseId']` query at line 212.
- [ ] Update **every** test that posts a set body — the wire key becomes `exerciseId`, so a missed
      one gets a 400 rather than a type error:
      - `set.routes.test.ts:12`, and re-point its `body<LiftSet>` claims (lines 2, 12) at
        `LiftSetDto`
      - `workout.routes.test.ts` lines 23, 32, 33, 64, 65, 85, 90, 102, 103 — nine sites across
        five tests — plus the `exercise_name: 'Bench Press'` assertion at line 94, and the
        `LiftSet` import at line 2
      - `exercise.routes.test.ts:44, 66, 67`
      - `stats.routes.test.ts:11`
- [ ] `docs/backend.md`: extend the layering paragraph so the chain reads
      `db/repos/` → `http/dto/` → `http/routes/`, and state that a route returns a DTO rather than
      a row, with the mappers being the only place a row's fields are read outside `db/`.

**Automated Verification**:

- [ ] `bun test src/backend/http/routes/set.routes.test.ts` passes
- [ ] `bun test src/backend/http/routes/workout.routes.test.ts` passes
- [ ] `bun test src/backend/http/routes/exercise.routes.test.ts` passes — it posts sets too
- [ ] `bun test src/backend/http/routes/stats.routes.test.ts` passes — it posts a set too
- [ ] `bun test src/shared/dto/index.test.ts` passes — every declaration file erases to nothing
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] `bun start`, open a workout, log a set through the add-set form, and confirm it appears with
      the right exercise name, weight and reps — `formData(form)` is untyped, so a stale `name`
      attribute would send `undefined` and typecheck would not report it
- [ ] Edit that set's weight and reps inline and confirm the change persists across a reload
- [ ] Use the set row's "repeat" action and confirm the copied set carries the same exercise

### Phase 2: Exercises

Dependencies: Phase 1 (`BestSetDto` is nested in `ExerciseProgressDto`).

**Tasks**:

- [ ] Create `src/shared/dto/exercise.ts` with `ExerciseDto`, `ExerciseWithStatsDto extends
      ExerciseDto`, `SessionPointDto`, `ExerciseProgressDto`
      (`{ exercise, sessions, bestSet: BestSetDto | null }`), `CreateExerciseDto` and
      `EditExerciseDto`, carrying over today's doc comments.
- [ ] Create `src/backend/http/dto/exercise.ts` with `toExercise`, `toExerciseWithStats`,
      `toSessionPoint`, `toExerciseProgress`, `fromCreateExercise` and `fromEditExercise`.
- [ ] Extend both `index.ts` files with the exercise re-exports.
- [ ] `src/backend/http/routes/exercise.routes.ts`: `readExerciseBody` returns `CreateExerciseDto`
      reading `muscleGroup`; add `readEditExerciseBody` returning `EditExerciseDto`; map all four
      responses through `toExercise` / `toExerciseWithStats`; replace the inline progress object at
      lines 50-54 with `toExerciseProgress`.
- [ ] `src/frontend/api.ts`: the five `exercises.*` methods take and return the exercise DTOs.
- [ ] `src/frontend/components/gz-exercise-list/gz-exercise-list.ts`: `ExerciseWithStatsDto`;
      rename the `muscle_group` form field and its `id`/`for`/`name` attributes at lines 109,
      168-169; rename the field reads at lines 41, 57, 130-133.
- [ ] `src/frontend/components/gz-exercise-detail/gz-exercise-detail.ts`: `ExerciseProgressDto`,
      `SessionPointDto`; retype `MetricKey` as `'estOneRepMax' | 'topWeight' | 'totalVolume'` and
      update the `METRICS` tuple at lines 29-38; the `best_set: bestSet` destructure at line 117
      becomes a plain `bestSet`; rename the ~26 field reads across the template.
- [ ] `src/frontend/components/gz-set-row/gz-set-row.ts` and
      `gz-workout-detail/gz-workout-detail.ts`: swap the `Exercise` import for `ExerciseDto`.
- [ ] `src/frontend/types.ts`: delete `Exercise`, `ExerciseWithStats`, `SessionPoint`,
      `ExerciseProgress`, `ExerciseInput` and the `ProgressLiftSet` placeholder Phase 1 left behind.
- [ ] `src/backend/testing.ts`: `createExercise` returns `ExerciseDto`; delete the local `Progress`
      interface and point its users at `ExerciseProgressDto`.
- [ ] Update `src/backend/http/routes/exercise.routes.test.ts` to post and expect camelCase, and
      re-point its `ExerciseWithStats` import (line 2) at `ExerciseWithStatsDto`.

**Automated Verification**:

- [ ] `bun test src/backend/http/routes/exercise.routes.test.ts` passes
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] Create an exercise with a muscle group set, and confirm the group shows in the list rather
      than the `–` placeholder
- [ ] Edit that exercise's muscle group and notes, and confirm both persist across a reload
- [ ] Open an exercise with logged history and confirm the chart, the metric switcher (all three
      metrics) and the session table render real numbers rather than blanks

### Phase 3: Workouts, stats, and the removal of `types.ts`

Dependencies: Phases 1 and 2 (`WorkoutWithSetsDto` nests `LiftSetDto`; the dashboard renders both
workout and summary shapes).

The milestone: after this phase the wire is camelCase end to end and the frontend has no
hand-written copy of it.

**Tasks**:

- [ ] Create `src/shared/dto/workout.ts` with `WorkoutDto`, `WorkoutWithStatsDto`,
      `WorkoutWithSetsDto`, `WorkoutPageDto`, `CreateWorkoutDto` (including `copyFromWorkoutId`)
      and `EditWorkoutDto` (which has no `copyFromWorkoutId`).
- [ ] Create `src/shared/dto/stats.ts` with `SummaryDto`, including `workoutsLast30Days` and
      `volumeLast30Days`.
- [ ] Create `src/backend/http/dto/workout.ts` (`toWorkout`, `toWorkoutWithStats`,
      `toWorkoutWithSets`, `toWorkoutPage`, `fromCreateWorkout`, `fromEditWorkout`) and
      `src/backend/http/dto/stats.ts` (`toSummary`).
- [ ] Extend both `index.ts` files with the workout and stats re-exports.
- [ ] `src/backend/http/routes/workout.routes.ts`: `readWorkoutBody` returns `CreateWorkoutDto`
      and `fromCreateWorkout` converts it; add `readEditWorkoutBody` + `fromEditWorkout`; the
      handler reads `dto.copyFromWorkoutId` itself and passes it as `{ copyFrom }`; the inline page
      object at line 23 becomes `toWorkoutPage`, and the two `{ ...workout, sets }` composites
      become `toWorkoutWithSets`. **Do not miss line 54** — `PATCH /api/workouts/:id` returns
      `json(repo.updateWorkout(id, patch))`, a bare row, and it is the only call site of
      `toWorkout`. Left as is, the acceptance criterion above is violated and
      `api.workouts.update` — retyped to `WorkoutDto` in this phase — silently receives
      `performed_on`, breaking the workout-detail save path with no compile error.
- [ ] `src/backend/http/routes/stats.routes.ts`: `json(toSummary(repo.summary()))`.
- [ ] `src/frontend/api.ts`: `summary()` and the six `workouts.*` methods take and return the new
      DTOs; delete the now-empty import from `./types.ts`.
- [ ] `src/frontend/components/gz-workout-list/gz-workout-list.ts`: `WorkoutWithStatsDto`; rename
      the `performed_on` form field and its attributes at lines 107-108, the
      `copy_from_workout_id` body at line 75, and the field reads at lines 52, 73, 149-153, 169.
- [ ] `src/frontend/components/gz-dashboard/gz-dashboard.ts`: `SummaryDto`, `WorkoutWithStatsDto`;
      rename the create body at line 37 and the 13 field reads at lines 60-88.
- [ ] `src/frontend/components/gz-workout-detail/gz-workout-detail.ts`: `WorkoutWithSetsDto`; the
      remaining workout-header reads and the `performed_on` edit form at lines 154, 252-253,
      269-270.
- [ ] **Delete `src/frontend/types.ts`** and confirm nothing references it.
- [ ] `src/backend/transpile.test.ts`: both tests at lines 36-46 are built on that file. The first
      asserts `/types.ts` transpiles to `''` and would now get a 404 body — `extname('/types.ts')`
      is `.ts`, so the single-page-app fallback is skipped and `static.routes.ts:78` answers
      `Not found`. Delete it; `src/shared/dto/index.test.ts` covers the same property directly, and
      no type-only module remains under `src/frontend/`. Re-point the second — "strips type-only
      imports" — to assert that the transpiled `gz-set-row.ts` does not contain `shared/dto`.
- [ ] `src/backend/testing.ts`: delete `WorkoutDetail` and `WorkoutPage`; `createWorkout` returns
      `WorkoutWithSetsDto`. **And change the body it posts** at line 101 from `{ performed_on }` to
      `{ performedOn }` — `post(path, body: unknown)` is untyped, so a stale key compiles, the
      server falls back to today's date, and every fixture workout silently loses its
      `2026-01-05`, breaking `stats.routes.test.ts:20` and `exercise.routes.test.ts:73`.
- [ ] Update `workout.routes.test.ts` and `stats.routes.test.ts` to post and expect camelCase, and
      re-point their row-type imports (`LiftSet`, `Workout` at `workout.routes.test.ts:2`;
      `Summary` at `stats.routes.test.ts:2`) at the corresponding DTOs.
- [ ] `docs/frontend.md`: replace the paragraph at lines 27-33 — the one stating that the wire
      shapes are written out by hand on purpose and must not be shared — with the new arrangement:
      `src/shared/dto/` is the single declaration of the wire format, imported type-only by both
      halves; it is not served, which is why it must stay free of runtime code; and the backend
      translates its rows into it rather than returning them.
- [ ] `CLAUDE.md`: add `src/shared/` to the architecture list beside `src/backend/` and
      `src/frontend/`, describing it as the type-only wire contract both halves import.

**Automated Verification**:

- [ ] `bun test src/backend/http/routes/workout.routes.test.ts` passes
- [ ] `bun test src/backend/http/routes/stats.routes.test.ts` passes
- [ ] `bun test src/backend/transpile.test.ts` passes
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `src/frontend/types.ts` does not exist, and a repository-wide search for `types.ts` finds no
      reference to it
- [ ] A repository-wide search finds no `_` in any property name under `src/shared/dto/`

**Manual Verification**:

- [ ] Load the dashboard and confirm all four stat tiles show numbers, the "last session" line
      shows a relative day, and the recent-workout list renders titles and volumes
- [ ] Use "start today's session" on the dashboard and confirm it lands on a new workout
- [ ] From the workout list, create a workout with an explicit date, and use "repeat" on an
      existing one — confirm the copy carries the original's sets
- [ ] Open a workout, change its date and title, reload, and confirm both stuck
- [ ] Page through the workout list and confirm the totals and paging still behave

### Phase 4: The error body

Dependencies: Phase 3 (`testing.ts` should be down to its last local shape).

**Tasks**:

- [ ] Create `src/shared/dto/error.ts` with `ErrorDto` (`error: string`, `details?: unknown`),
      documenting that `details` is only present on a 400 raised with one.
- [ ] Extend `src/shared/dto/index.ts` with the re-export.
- [ ] `src/backend/http/errors.ts`: annotate the two bodies `errorResponse` builds as `ErrorDto`.
- [ ] `src/frontend/api.ts`: name `ErrorDto` in the comment at lines 64-65 as the shape being
      narrowed toward, keeping the hand-narrowing itself — the server's error body is the one
      response the client cannot assume arrived well-formed.
- [ ] `src/backend/testing.ts`: delete `ErrorBody` and point its users at `ErrorDto` — they are
      `src/backend/http/routes/meta.routes.test.ts:2,17,23` and
      `src/backend/http/routes/exercise.routes.test.ts:3,21`.

**Automated Verification**:

- [ ] `bun test src/backend/http/routes/meta.routes.test.ts` passes
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `src/backend/testing.ts` declares no interface describing a response body — only `TestServer`
      remains
- [ ] No `*.test.ts` under `src/backend/` imports a type from `'../../db/repos'` to claim a
      response body; every `body<T>()` call names a DTO

**Manual Verification**:

- [ ] Trigger a refused action in the UI — deleting an exercise that still has logged sets — and
      confirm the toast shows the server's message rather than a generic failure

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-11-data-type-declarations.md` — the research this plan is built on
- `src/frontend/types.ts:1-14` — the header comment recording the decision this plan reverses
- `docs/frontend.md:27-33` — the same decision, stated in the docs
- `src/backend/paths.ts:42-58` — `resolveStaticPath`, why `src/shared/` must stay type-only
- `src/backend/transpile.ts:1-15` — types erased, specifiers untouched, no build step
- `src/backend/db/repos/index.ts:12` — the pattern the two new `index.ts` files follow
- `src/backend/testing.ts:17-39` — the third copy of the composite response shapes
- `src/backend/testing.ts:100-101` — `createWorkout`'s untyped snake_case request body
- `src/frontend/base.ts:162-170` — `formData(form)`, the untyped seam behind decision 9
- `src/backend/transpile.test.ts:36-46` — the two tests that outlive their subject in Phase 3
- `src/backend/http/routes/workout.routes.ts:54` — the bare-row `PATCH` response, easy to miss
- `.oxlintrc.json:21,43` — `consistent-type-imports` and `no-import-type-side-effects`
