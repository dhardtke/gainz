---
date: 2026-09-13T17:05:26.496807+00:00
git_commit: 20d31ca19fc1b573c09778de8a9546f8d81d4ce7
branch: main
topic: 'Migrate DTOs and internal types onto the flavored ids and dates in src/shared/flavors.ts'
tags: [plan, types, flavors, dto, backend, frontend, shared]
status: complete
---

# PLAN: Flavored ids and dates across the DTOs and the internal types

`src/shared/flavors.ts` is new and applied to nothing. It declares `WorkoutId`, `ExerciseId`,
`LiftSetId` and `Iso8601Date` as flavored primitives, but every id in the repository is still a bare
`number` and every date a bare `string`, so nothing stops a workout id being handed to
`sets.require()` or an exercise id being interpolated into `/api/workouts/:id`. This plan applies
the flavors everywhere an entity id or a date is declared: the shared DTOs, the backend's
snake_case row types in `ports/`, the repository input types and signatures in `internal/`, and the
frontend's own declarations in `api.ts`, `format.ts` and the two components that hold ids.

Flavoring — `T & { _type?: FlavorT }` with an **optional** marker — is deliberately one-way. This
was verified against the repository's own TypeScript (7.0.2) before planning:

| assignment                                  | result                                    |
| ------------------------------------------- | ----------------------------------------- |
| `const id: WorkoutId = 5` / `= plainNumber` | allowed                                   |
| `const n: number = workoutId`               | allowed                                   |
| `takesExerciseId(workoutId)`                | **error** — `_type` types are incompatible |
| `takesIso8601Date(createdAt)`               | **error** once `Iso8601DateTime` exists   |
| arithmetic, template literals, `Map` values, array indexing | all unchanged             |

So plain values flow *into* a flavor freely and only a flavor-to-flavor mismatch fails. Nothing in
this migration needs a cast, a type assertion or a runtime change: `pathId()` may keep returning
`number`, `Number(element.dataset.id)` keeps working, and a parsed JSON body still lands in a
flavored field. The whole change is type-level, which is why `bun test` passing unchanged is the
safety net.

## Acceptance Criteria

- `src/shared/flavors.ts` declares five flavors: `WorkoutId`, `ExerciseId`, `LiftSetId`,
  `Iso8601Date` (over `string`, `YYYY-MM-DD`) and a new `Iso8601DateTime` (over `string`, what
  SQLite writes into `created_at`). `Flavoring` and `Flavor` stay unexported.
- Every entity id and every date names its flavor in all four places such a type is declared: the
  shared DTOs under `src/shared/dto/`, the row types in each feature's `ports/`, the
  `Create<Entity>` inputs and the method signatures in each feature's `internal/`, and the
  frontend's `api.ts`, `format.ts` and component state.
- Numbers that are not entity ids stay `number`: `limit`, `offset`, `total`, `reps`, `weight`,
  `position`, every `*_count` / `*Count`, `total_reps`, `total_volume`, `top_weight`,
  `est_one_rep_max`, `best_weight`, `workouts_last_30_days`, `volume_last_30_days`, and
  `gz-toast`'s dismissal counter.
- `created_at` / `createdAt` is `Iso8601DateTime`; `performed_on` / `performedOn` and
  `last_performed_on` / `lastPerformedOn` are `Iso8601Date`. Handing one to a function expecting
  the other fails `bun run typecheck`.
- No type assertion, `as` cast or runtime statement is added anywhere by this migration. The
  translators' existing body-to-DTO casts change only which type they name.
- `src/shared/shared.test.ts` asserts that every non-test `.ts` file under `src/shared/`,
  recursively, transpiles to nothing. It replaces `src/shared/dto/index.test.ts`, which covered
  `dto/` only.
- `bun test` passes with no test file edited other than that relocation, and with the same number
  of tests as before.
- `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass at the end of every phase.
- `docs/backend.md`, `docs/frontend.md` and the `src/shared/` line in `CLAUDE.md` describe the
  flavored vocabulary.

## Technical Key Decisions and Tradeoffs

1. **`Iso8601Date` is retyped over `string`, and `Iso8601DateTime` is added:** the file declares
   `Flavor<number, 'Iso8601Date'>` today, with a comment saying `YYYY-MM-DD`.
   - Why: every date in the repository is a `string` — `performed_on`, the `^\d{4}-\d{2}-\d{2}$`
     regex in `shared/validate.ts:3`, `today()`, `todayIso()`. As declared, the flavor cannot be
     applied to a single field. `created_at` is a different thing again: a SQLite datetime, not a
     calendar date, and `formatDate()` would mangle it by appending `T00:00:00`.
   - Impact: two date flavors rather than one. Verified that `Iso8601DateTime` does not satisfy
     `Iso8601Date`, and that all fifteen `formatDate` / `formatShortDate` / `relativeDay` call sites
     pass a `performedOn` or `lastPerformedOn` today, so nothing has to change to keep compiling.

2. **A path id takes its flavor in the controller, by annotating the local:** `pathId` keeps
   returning `number` and `http/http.ts` is untouched.
   - Why: a plain `number` assigns into any flavor silently, so without an annotation the flavor
     never gets named on the way in. The controller is the one place a path segment becomes an id,
     and `WorkoutController.show` hands a single `id` to two different facades. Making `pathId`
     generic (`pathId<WorkoutId>(…)`) was rejected: the type parameter would appear only in the
     return type, which `typescript/no-unnecessary-type-parameters` is set to `error` on.
   - Impact: seven `const id: <Flavor> = pathId(…)` annotations. The five handlers that inline the
     call into a single flavored parameter (`delete` in all three controllers, `show` in
     `SetController` and `ExerciseController`) keep doing so — there is no local to bind and the
     parameter is already flavored.

3. **The frontend flavors its own declarations too:** `api.ts`, `format.ts` and the id-shaped
   component state, not just the DTOs it receives.
   - Why: the DTOs carry flavors across the wire for free, but `api.ts`'s `id: number | string`
     parameters are exactly where a view could pass the wrong entity's id.
   - Impact: ten `api.ts` signatures become `WorkoutId` / `ExerciseId` / `LiftSetId`. Verified that
     `api.workouts.get(exercise.id)` then fails to compile while `api.workouts.get(7)` still passes.

4. **The `| string` arm of those ten signatures is dropped, not flavored:** the parameter becomes
   `WorkoutId`, not `WorkoutId | string`.
   - Why: `| string` exists only because `GzWorkoutDetail` and `GzExerciseDetail` hold their route
     param as a raw attribute and hand `this.#id` straight to the client. Keeping it would leave a
     hole exactly where the confusion happens: both views have a private `#id: string`, so
     `api.workouts.get(this.#id)` inside the *exercise* view would still compile. Dropping it is
     what makes the flavor mean anything on this side of the wire.
   - Impact: the two `get #id()` getters return `WorkoutId` / `ExerciseId` and convert with
     `Number()`. Safe because `router.ts:21,23` match `(\d+)` only, so the attribute is always
     digits; and free, because every one of the six uses of `#id` across the two views is an API
     call — neither treats it as a string. `Number("12")` builds the identical request URL, so
     there is no behavioural change. Every other call site already passes either a flavored DTO
     field or a `Number(element.dataset.id)`.

5. **Bound-parameter tuples on `db.query<Row, Params>` are flavored in their id positions:**
   `query<LiftSet, [LiftSetId]>`, not `query<LiftSet, [number]>`.
   - Why: the tuple is the statement's own record of what it binds, and it sits next to the SQL that
     uses it.
   - Impact: eleven of the seventeen `db.query` generics across the four repositories gain flavors,
     in id positions only; `limit`, `offset`, `reps`, `weight` and `position` positions stay
     `number`, and the six generics that bind no id at all are left alone.

6. **Consumers import `'…/shared/flavors.ts'` directly; the flavors are not re-exported from
   `dto/index.ts`:**
   - Why: the backend's row types and repository inputs use the flavors without touching the wire
     contract, so routing them through a barrel named `dto` would misname them. `flavors.ts` is a
     vocabulary both the wire format and the internals are written in, not part of the wire format.
   - Impact: one extra `import type` line in the modules that need both.

7. **One types-only test for the whole of `src/shared/`:** `src/shared/dto/index.test.ts` is
   replaced by `src/shared/shared.test.ts`, which walks the directory recursively.
   - Why: the rule is a property of the directory — `src/shared/` sits outside the web root, so a
     surviving specifier in a frontend `import type` would be a 404 — not a property of DTOs.
     `flavors.ts` sits one level above the existing test and is about to be imported by the
     frontend.
   - Impact: the existing test moves and grows a recursive walk; the assertion itself is unchanged.

8. **No test pins the flavor-mismatch behaviour; `bun run typecheck` is the gate:**
   - Why: the change is type-level only, so there is nothing to observe at runtime. A test that
     shells out to `tsc` against a fixture would be unlike anything else in this suite.
   - Impact: the only new test is the relocated types-only one. `docs/frontend.md` already records
     that the transpiler erases types without checking them and that `bun run typecheck` is the only
     gate.

9. **`gz-toast`'s `#items[].id` stays `number`:** it is a dismissal counter from `++nextId`, not an
   entity id.
   - Why: flavoring it would claim a relationship to the three tables that does not exist.
   - Impact: none, stated so the omission reads as deliberate.

## Current State

Ids and dates are declared in four places, all as bare primitives:

```
src/shared/flavors.ts            WorkoutId, ExerciseId, LiftSetId, Iso8601Date  ← applied nowhere
                                 Iso8601Date is Flavor<number, …> but every date is a string

src/shared/dto/                  the wire contract, both halves import it   (types only)
  workout.ts   WorkoutDto.id, performedOn, createdAt; CreateWorkoutDto.copyFromWorkoutId
  exercise.ts  ExerciseDto.id, createdAt; ExerciseWithStatsDto.lastPerformedOn;
               SessionPointDto.workoutId + performedOn
  set.ts       LiftSetDto.id + workoutId + exerciseId + createdAt; BestSetDto.performedOn;
               Create/EditSetDto.exerciseId
  stats.ts     SummaryDto.lastPerformedOn
  index.test.ts   asserts every file in THIS directory transpiles to nothing

src/backend/features/<f>/
  ports/*.ts        snake_case rows: id, workout_id, exercise_id, performed_on,
                    last_performed_on, created_at — plus the to* mappers
  internal/*.repository.ts    CreateWorkout.performed_on, CreateSet.exercise_id, and every
                              get/require/update/delete(id: number), list(workoutId: number),
                              plus db.query<Row, [number, …]> generics
  internal/*.translator.ts    body.exerciseId as number, body.performedOn as string | undefined
  internal/*.controller.ts    const id = pathId(req.params.id, 'workout')
  <f>.facade.ts               method signatures mirroring the repository
src/backend/shared/validate.ts  requiredDate(): string, today(): string
src/backend/http/http.ts        pathId(): number, queryInt(): number

src/frontend/
  api.ts        id: number | string  ×10
  format.ts     formatDate / formatShortDate / relativeDay(iso: string | null | undefined),
                todayIso(): string
  components/   gz-exercise-list   #editingId: number | null
                gz-workout-detail  get #id(): string, ExerciseTotals.id: number,
                                   #draft.exerciseId, #prefillFrom(exerciseId: number),
                                   Map<number, ExerciseTotals>
                gz-exercise-detail get #id(): string   ← the same shape, a different entity
                gz-toast           #items[].id: number  ← a counter, not an entity id
src/scripts/seed.ts   Map<string, number> of exercise ids, isoDaysAgo(): string
```

The path an id takes, and what names it at each step:

```
"12"  (path segment)
  │  pathId(req.params.id, 'workout')        http/http.ts:33     → number
  ▼
controller                                    const id = …        → number
  │
  ▼
facade.require(id: number)                    workouts.facade.ts:26
  │                                           ← nothing here distinguishes a workout id
  ▼                                             from an exercise id
repository.get(id: number)                    workout.repository.ts:40
  │  db.query<Workout, [number]>(…).get(id)
  ▼
Workout { id: number; performed_on: string }  ports/workout.ts:4
  │  toWorkout(row)
  ▼
WorkoutDto { id: number; performedOn: string } ── HTTP ──► frontend api.ts, components
```

## Desired End State

The same path, with every step naming what it carries:

```
"12"  (path segment)
  │  pathId(req.params.id, 'workout')        unchanged, still → number
  ▼
controller                const id: WorkoutId = …                ← the flavor is named once
  │
  ▼
facade.require(id: WorkoutId)
  │                                           ← exercises.require(id) is now a compile error
  ▼
repository.get(id: WorkoutId)
  │  db.query<Workout, [WorkoutId]>(…).get(id)
  ▼
Workout { id: WorkoutId; performed_on: Iso8601Date; created_at: Iso8601DateTime }
  │  toWorkout(row)
  ▼
WorkoutDto { id: WorkoutId; performedOn: Iso8601Date; createdAt: Iso8601DateTime }
  │
  ── HTTP ──► api.workouts.get(id: WorkoutId)
              api.workouts.get(exerciseDetailView.#id)   compile error
              formatDate(workout.performedOn)            ok
              formatDate(workout.createdAt)              compile error
```

`src/shared/` after the change:

```
src/shared/
  flavors.ts        WorkoutId, ExerciseId, LiftSetId, Iso8601Date, Iso8601DateTime
  shared.test.ts    walks src/shared/ recursively, asserts each file transpiles to ''
  dto/
    index.ts        header comment points at flavors.ts and at shared.test.ts
    error.ts  meta.ts                  unchanged — no ids, no dates
    workout.ts  exercise.ts  set.ts  stats.ts   flavored
    (index.test.ts deleted)
```

## Abstractions and Code Reuse

No new abstraction. `flavors.ts` already holds the only mechanism — the unexported `Flavoring`
interface and `Flavor` alias — and this plan adds one declaration to it and spends the rest of its
effort naming existing types. `buildUpdate<T>` in `db/sql.ts` needs no change: its
`typeof value !== 'string' && typeof value !== 'number'` guard narrows a flavored number the same
way it narrows a plain one, and a flavored number is assignable to the `(string | number | null)[]`
it pushes into. `shared/validate.ts`'s `requiredInt` keeps returning `number`, which flows into any
id flavor at its call sites.

- `src/shared/`
  - `flavors.ts` — retype `Iso8601Date` over `string`; add `Iso8601DateTime`; add a header comment
    stating the one-way rule
  - `shared.test.ts` — new; recursive walk replacing `dto/index.test.ts`
  - `dto/`
    - `index.ts` — header comment: name `flavors.ts` and `shared.test.ts`
    - `index.test.ts` — deleted
    - `workout.ts` — `WorkoutDto`, `CreateWorkoutDto`, `EditWorkoutDto`
    - `exercise.ts` — `ExerciseDto`, `ExerciseWithStatsDto`, `SessionPointDto`
    - `set.ts` — `LiftSetDto`, `BestSetDto`, `CreateSetDto`, `EditSetDto`
    - `stats.ts` — `SummaryDto.lastPerformedOn`
    - `error.ts`, `meta.ts` — unchanged
- `src/backend/`
  - `features/workouts/`
    - `ports/workout.ts` — `Workout`; the four `to*` mappers unchanged
    - `ports/set.ts` — `LiftSet`; `toBestSet`'s `& { performed_on }` intersection
    - `internal/workout.repository.ts` — `CreateWorkout`, five signatures, three of its five query
      generics
    - `internal/set.repository.ts` — `CreateSet`, six signatures, all four query generics
    - `internal/workout.translator.ts` — two casts
    - `internal/set.translator.ts` — two casts
    - `internal/workout.controller.ts` — four `const id: WorkoutId` annotations
    - `internal/set.controller.ts` — one `const id: LiftSetId` annotation
    - `workouts.facade.ts` — `WorkoutFacade` and `SetFacade` signatures
  - `features/exercises/`
    - `ports/exercise.ts` — `Exercise`, `ExerciseWithStats`, `SessionPoint`, `toExerciseProgress`
    - `internal/exercise.repository.ts` — six signatures, four of its six query generics
    - `internal/exercise.controller.ts` — two `const id: ExerciseId` annotations
    - `exercises.facade.ts` — five signatures
    - `internal/exercise.translator.ts` — unchanged; it maps no id and no date
  - `features/stats/`
    - `ports/stats.ts` — `Summary.last_performed_on`
    - `internal/stats.repository.ts` — `SummaryTotals.last_performed_on`
  - `shared/validate.ts` — `requiredDate` and `today` return `Iso8601Date`
  - `http/http.ts` — unchanged (decision 2)
- `src/frontend/`
  - `api.ts` — ten signatures
  - `format.ts` — `formatDate`, `formatShortDate`, `relativeDay`, `todayIso`
  - `components/gz-exercise-list/gz-exercise-list.ts` — `#editingId`
  - `components/gz-workout-detail/gz-workout-detail.ts` — `get #id()`, `ExerciseTotals.id`,
    `#draft.exerciseId`, `#prefillFrom`'s parameter, `#breakdown`'s `Map` key
  - `components/gz-exercise-detail/gz-exercise-detail.ts` — `get #id()`
  - `components/gz-toast/gz-toast.ts` — unchanged (decision 9)
- `src/scripts/seed.ts` — `idByName`, `isoDaysAgo`
- `docs/backend.md`, `docs/frontend.md`, `CLAUDE.md`

## Logging & Observability

None. The change is type-level and erased before anything runs.

## Implementation

### Phase 1: The flavored vocabulary and the wire contract

Dependencies: None

Fix the flavors module, apply it to the four DTO files that carry ids or dates, and move the
types-only guarantee up a directory so it covers `flavors.ts` as well. This phase compiles on its
own: the backend's `to*` mappers still build DTOs out of plain `number` and `string` row fields, and
plain values assign into a flavor.

**Tasks**:

- [x] `src/shared/flavors.ts`: change `Iso8601Date` to `Flavor<string, 'Iso8601Date'>`, add
      `export type Iso8601DateTime = Flavor<string, 'Iso8601DateTime'>;` and give the module a short
      header comment recording the one-way rule — a plain value flows into any flavor, one flavor
      never satisfies another — since that is the property the rest of the codebase relies on and
      the code cannot state it:
      ```ts
      /**
       * Flavored primitives: an id or a date carries the name of what it is.
       *
       * The marker is optional, so a plain `number` or `string` still flows into a flavor and
       * nothing here needs a cast — `pathId()`, `Number(dataset.id)` and a parsed JSON body all
       * assign straight in. What the marker refuses is one flavor standing in for another.
       */
      ```
- [x] `src/shared/dto/workout.ts`: import `Iso8601Date`, `Iso8601DateTime` and `WorkoutId` from
      `'../flavors.ts'`; `WorkoutDto.id: WorkoutId`, `performedOn: Iso8601Date`,
      `createdAt: Iso8601DateTime`; `CreateWorkoutDto.performedOn?: Iso8601Date` and
      `copyFromWorkoutId?: WorkoutId`; `EditWorkoutDto.performedOn?: Iso8601Date`. The counts on
      `WorkoutWithStatsDto` and the `total` / `limit` / `offset` on `WorkoutPageDto` stay `number`.
- [x] `src/shared/dto/exercise.ts`: `ExerciseDto.id: ExerciseId`, `createdAt: Iso8601DateTime`;
      `ExerciseWithStatsDto.lastPerformedOn: Iso8601Date | null`;
      `SessionPointDto.workoutId: WorkoutId`, `performedOn: Iso8601Date`. `bestWeight`,
      `estOneRepMax`, `topWeight` and the counts stay `number`.
- [x] `src/shared/dto/set.ts`: `LiftSetDto.id: LiftSetId`, `workoutId: WorkoutId`,
      `exerciseId: ExerciseId`, `createdAt: Iso8601DateTime`; `BestSetDto.performedOn: Iso8601Date`;
      `CreateSetDto.exerciseId: ExerciseId`; `EditSetDto.exerciseId?: ExerciseId`. `reps`, `weight`
      and `position` stay `number`.
- [x] `src/shared/dto/stats.ts`: `SummaryDto.lastPerformedOn: Iso8601Date | null`.
- [x] Create `src/shared/shared.test.ts`, walking the directory recursively and keeping the existing
      assertion and its reasoning:
      ```ts
      import { describe, expect, test } from 'bun:test';
      import { readdirSync } from 'node:fs';
      import { join, relative } from 'node:path';

      const transpiler = new Bun.Transpiler({ loader: 'ts' });

      /** Every declaration file under `src/shared/` — the tests themselves excluded. */
      function declarationFiles(dir: string = import.meta.dir): string[] {
        return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
          const path = join(dir, entry.name);
          if (entry.isDirectory()) {
            return declarationFiles(path);
          }
          return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
        });
      }
      ```
      The test body keeps `expect(files.length).toBeGreaterThan(0)` and asserts each file transpiles
      to the empty string, naming the file with `relative(import.meta.dir, path)` so a failure says
      which one. Carry over the comment explaining why: a runtime statement would make the
      frontend's `import type` a real fetch, and `src/shared/` is not served.
- [x] Delete `src/shared/dto/index.test.ts`.
- [x] `src/shared/dto/index.ts`: in the header comment, replace the sentence pinning the rule to
      `index.test.ts` with one naming `src/shared/shared.test.ts` and the whole of `src/shared/`,
      and add that the ids and dates in these shapes are the flavored primitives from
      `../flavors.ts`.
- [x] `docs/frontend.md`: in the paragraph at lines 27-33, change the last sentence so the rule
      covers everything under `src/shared/` — `flavors.ts` included — and name
      `src/shared/shared.test.ts` as what holds it in place.
- [x] `CLAUDE.md`: in the `src/shared/` line of the architecture list, add `flavors.ts` beside
      `dto/` — the flavored ids and dates both halves' types are written in, types only for the same
      reason.

**Automated Verification**:

- [x] `bun test` passes, with the same number of tests as before the change
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `src/shared/shared.test.ts` collects eight files — `flavors.ts` plus the seven modules under
      `dto/` — so the recursive walk demonstrably reaches outside `dto/`
- [x] A search for `index.test.ts` across `src/` and `docs/*.md` finds nothing

### Phase 2: The backend

Dependencies: Phase 1

Name the flavors through the whole server: the published row types, the repository inputs and
signatures, the query generics, the translators' casts, the controllers' path ids, the two
date-producing helpers in `shared/validate.ts`, and the seeder. `http/http.ts` is deliberately
untouched.

**Tasks**:

- [x] `src/backend/features/workouts/ports/workout.ts`: import the flavors from
      `'../../../../shared/flavors.ts'`; `Workout.id: WorkoutId`, `performed_on: Iso8601Date`,
      `created_at: Iso8601DateTime`. `WorkoutWithStats`'s four aggregates stay `number`, and all
      four `to*` mappers are unchanged — they name every field already and the types flow through.
- [x] `src/backend/features/workouts/ports/set.ts`: `LiftSet.id: LiftSetId`,
      `workout_id: WorkoutId`, `exercise_id: ExerciseId`, `created_at: Iso8601DateTime`; and
      `toBestSet(row: LiftSet & { performed_on: Iso8601Date })`.
- [x] `src/backend/features/exercises/ports/exercise.ts`: `Exercise.id: ExerciseId`,
      `created_at: Iso8601DateTime`; `ExerciseWithStats.last_performed_on: Iso8601Date | null`;
      `SessionPoint.workout_id: WorkoutId`, `performed_on: Iso8601Date`; and
      `toExerciseProgress`'s `bestSet: (LiftSet & { performed_on: Iso8601Date }) | null`.
- [x] `src/backend/features/stats/ports/stats.ts`: `Summary.last_performed_on: Iso8601Date | null`.
- [x] `src/backend/features/stats/internal/stats.repository.ts`:
      `SummaryTotals.last_performed_on: Iso8601Date | null`.
- [x] `src/backend/features/workouts/internal/workout.repository.ts`:
      `CreateWorkout.performed_on: Iso8601Date`; `get`, `require`, `update` and `delete` take
      `id: WorkoutId`; `create`'s options become `{ copyFrom?: WorkoutId }`. Query generics:
      `query<Workout, [WorkoutId]>` for `get`, `query<Workout, [Iso8601Date, string | null, string | null]>`
      for the insert, `query<unknown, [WorkoutId, WorkoutId]>` for the set copy. `list`'s
      `[number, number]` and `count`'s `[]` stay as they are.
- [x] `src/backend/features/workouts/internal/set.repository.ts`:
      `CreateSet.exercise_id: ExerciseId`; `list(workoutId: WorkoutId)`; `get`, `require`, `update`
      and `delete` take `id: LiftSetId`; `create(workoutId: WorkoutId, input: CreateSet)`. Query
      generics: `query<LiftSet, [WorkoutId]>`, `query<LiftSet, [LiftSetId]>`,
      `query<{ next: number }, [WorkoutId]>`, and
      `query<{ id: LiftSetId }, [WorkoutId, ExerciseId, number, number, string | null, number]>`
      for the insert.
- [x] `src/backend/features/exercises/internal/exercise.repository.ts`: `get`, `require`, `update`,
      `delete`, `progress` and `bestSet` take `id: ExerciseId`; `bestSet` returns
      `(LiftSet & { performed_on: Iso8601Date }) | null`. Query generics:
      `query<Exercise, [ExerciseId]>`, `query<{ n: number }, [ExerciseId]>`,
      `query<SessionPoint, [ExerciseId]>` and
      `query<LiftSet & { performed_on: Iso8601Date }, [ExerciseId]>`. `list`'s `[]` and `create`'s
      `[string, string | null, string | null]` bind no id and stay as they are, and
      `CreateExercise` is unchanged — it holds no id and no date.
- [x] `src/backend/features/workouts/internal/workout.translator.ts`: the two casts in
      `translateToCreateWorkoutDto` become `body.performedOn as Iso8601Date | undefined` and
      `body.copyFromWorkoutId as WorkoutId | undefined`, and the one in `translateToEditWorkoutDto`
      becomes `body.performedOn as Iso8601Date | undefined`. `translateDtoToCreateWorkout` needs no
      change: `dto.performedOn ?? today()` is `Iso8601Date` on both arms once `today()` is flavored.
- [x] `src/backend/features/workouts/internal/set.translator.ts`: `body.exerciseId as ExerciseId` in
      `translateToCreateSetDto` and `body.exerciseId as ExerciseId | undefined` in
      `translateToEditSetDto`.
- [x] `src/backend/features/exercises/internal/exercise.translator.ts`: no change — it maps `name`,
      `muscleGroup` and `notes` only.
- [x] `src/backend/shared/validate.ts`: `requiredDate(...): Iso8601Date` and `today(): Iso8601Date`,
      importing from `'../../shared/flavors.ts'`. Note the path crosses out of `src/backend/shared/`
      into `src/shared/` — two different directories with the same name. `requiredInt`,
      `requiredNumber`, `requiredString` and `optionalString` keep their primitive return types.
- [x] `src/backend/features/workouts/workouts.facade.ts`: `WorkoutFacade.require`, `.update` and
      `.delete` take `id: WorkoutId`; `SetFacade.list` takes `workoutId: WorkoutId`, `.require`,
      `.update` and `.delete` take `id: LiftSetId`, and `.create` takes
      `(workoutId: WorkoutId, dto: CreateSetDto)`. `validateCreate` and `validateEdit` are unchanged:
      `requiredDate` now returns `Iso8601Date` and `requiredInt`'s `number` flows into
      `copyFromWorkoutId` and `exerciseId`.
- [x] `src/backend/features/exercises/exercises.facade.ts`: `require`, `update`, `delete`,
      `progress` and `bestSet` take `id: ExerciseId`, and `bestSet` returns
      `(LiftSet & { performed_on: Iso8601Date }) | null`.
- [x] `src/backend/features/workouts/internal/workout.controller.ts`: annotate the four locals —
      `const id: WorkoutId = pathId(req.params.id, 'workout');` in `show`, `update`, `listSets` and
      `addSet`. `delete` keeps its inline `pathId` call.
- [x] `src/backend/features/workouts/internal/set.controller.ts`: annotate the one local in
      `update` — `const id: LiftSetId = pathId(req.params.id, 'set');`. `show` and `delete` keep
      their inline calls.
- [x] `src/backend/features/exercises/internal/exercise.controller.ts`: annotate the two locals in
      `update` and `progress` — `const id: ExerciseId = pathId(req.params.id, 'exercise');`. `show`
      and `delete` keep their inline calls.
- [x] `src/scripts/seed.ts`: `isoDaysAgo(days: number): Iso8601Date` and
      `const idByName = new Map<string, ExerciseId>()`, importing from `'../shared/flavors.ts'`.
- [x] `docs/backend.md`: in the paragraph at lines 37-44, after the sentence about the camelCase
      rename being what keeps the mapping honest, record that ids and dates are flavored on both
      sides of it — `WorkoutId`, `ExerciseId`, `LiftSetId`, `Iso8601Date` and `Iso8601DateTime` from
      `src/shared/flavors.ts` — so a workout id cannot be passed where an exercise id is wanted, and
      that `pathId` still returns a plain `number` with the controller naming the flavor as it binds
      the local.

**Automated Verification**:

- [x] `bun test` passes, with no test file modified in this phase
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `bun run seed` against a throwaway `GAINZ_DB` path fills a fresh database and prints its
      summary line
- [x] A search for `: number` in the four row-declaring `ports/*.ts` files — `workouts/ports/`'s
      `workout.ts` and `set.ts`, `exercises/ports/exercise.ts` and `stats/ports/stats.ts`, but not
      `workouts/ports/sql.ts`, which declares only SQL fragments — matches only aggregates and
      counts, no `id`, `workout_id` or `exercise_id` field
- [x] A search for `performed_on: string`, `created_at: string`, `last_performed_on: string` across
      `src/backend/` finds nothing

### Phase 3: The frontend

Dependencies: Phase 2

Name the flavors in the frontend's own declarations. The DTOs already arrive flavored, so this phase
is about the places the frontend writes a type itself: the API client's parameters, the date
formatters, and the id-shaped state in two components.

**Tasks**:

- [x] `src/frontend/api.ts`: import `ExerciseId`, `LiftSetId` and `WorkoutId` from
      `'../shared/flavors.ts'`; `exercises.get`, `.progress`, `.update` and `.remove` take
      `id: ExerciseId`; `workouts.get`, `.update`, `.remove` and `.addSet` take `id: WorkoutId`;
      `sets.update` and `.remove` take `id: LiftSetId`. The `| string` arm goes (decision 4) — do
      this task together with the one below, since the two detail views are what currently pass a
      string.
- [x] `src/frontend/components/gz-workout-detail/gz-workout-detail.ts` and
      `gz-exercise-detail/gz-exercise-detail.ts`: change each `get #id(): string` to return
      `WorkoutId` / `ExerciseId`, converting with `Number()`. The backing field stays
      `#workoutId: string | null` / `#exerciseId: string | null` — it mirrors the attribute, which
      is a string. Keep the existing `null` check and its error message, and extend the getter's doc
      comment to say why the conversion is safe here: `router.ts:21,23` match `(\d+)` only, so the
      attribute is always digits. All six uses of `#id` across the two views are API calls, so
      nothing else changes.
- [x] `src/frontend/format.ts`: import `Iso8601Date` from `'../shared/flavors.ts'`; `formatDate`,
      `formatShortDate` and `relativeDay` take `iso: Iso8601Date | null | undefined`, and
      `todayIso(): Iso8601Date`. No call site changes: it was verified by linting a probe module
      inside `src/frontend/` that `typescript/strict-boolean-expressions` (`allowNullableString`)
      still accepts the `if (!iso)` guards and the `lastPerformedOn ? … : …` ternaries in
      `gz-dashboard` and `gz-exercise-list`, and that `restrict-template-expressions` accepts both a
      flavored string and a flavored number in a template literal — which is also what the ten
      `` `/workouts/${id}` ``-style paths in `api.ts` depend on.
- [x] `src/frontend/components/gz-exercise-list/gz-exercise-list.ts`:
      `#editingId: ExerciseId | null = null`. The three `Number(element.dataset.id)` /
      `Number(form.dataset.id)` expressions stay as they are — a plain `number` assigns in.
- [x] `src/frontend/components/gz-workout-detail/gz-workout-detail.ts`: four declarations —
      `ExerciseTotals.id: ExerciseId`; `#draft`'s
      `exerciseId: ExerciseId | typeof NEW_EXERCISE | null`; `#prefillFrom(exerciseId: ExerciseId)`;
      and `#breakdown`'s `new Map<ExerciseId, ExerciseTotals>()`, which is keyed by
      `set.exerciseId`. The local `const exerciseId = Number(element.dataset.id)` and the
      `let exerciseId: string | number` used for the "new exercise" sentinel stay as they are — both
      are plain values on their way into a flavored position.
- [x] `src/frontend/components/gz-toast/gz-toast.ts`: no change — `#items[].id` is a dismissal
      counter.
- [x] `docs/frontend.md`: in the paragraph at lines 35-38, add that the wire format the frontend is
      pinned to now names its ids and dates — `WorkoutId`, `ExerciseId`, `LiftSetId`, `Iso8601Date`,
      `Iso8601DateTime` — so the API client cannot be handed the wrong entity's id and a `createdAt`
      cannot reach a `YYYY-MM-DD` formatter.

**Automated Verification**:

- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] A search for `| string` in `src/frontend/api.ts` finds nothing — no parameter still accepts a
      raw string id
- [x] A search for `from '../shared/flavors.ts'` and `from '../../../shared/flavors.ts'` across
      `src/frontend/` finds only `import type` statements, so nothing survives transpilation

**Manual Verification**:

- [x] `bun start` against a seeded database: the dashboard, the training log, a workout detail and
      an exercise detail all render, dates read as before, and adding, editing and deleting a set
      still works — the phase touches the modules that build every request URL, so a wrong-shaped
      call would show up here rather than in the type checker
- [x] Reloading directly on `#/workouts/3` and `#/exercises/2`, and navigating between two workouts
      without a reload, both still load the right record — these exercise the two `get #id()`
      getters that now convert the attribute with `Number()`

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `src/shared/flavors.ts`
- `src/shared/dto/index.ts`, `dto/index.test.ts`, `dto/workout.ts`, `dto/exercise.ts`, `dto/set.ts`, `dto/stats.ts`
- `src/backend/features/workouts/ports/workout.ts`, `ports/set.ts`
- `src/backend/features/exercises/ports/exercise.ts`
- `src/backend/features/stats/ports/stats.ts`
- `src/backend/features/workouts/internal/` — both repositories, both translators, both controllers
- `src/backend/features/exercises/internal/exercise.repository.ts`, `exercise.controller.ts`
- `src/backend/features/workouts/workouts.facade.ts`, `src/backend/features/exercises/exercises.facade.ts`
- `src/backend/shared/validate.ts`, `src/backend/http/http.ts`, `src/backend/db/sql.ts`
- `src/frontend/api.ts`, `src/frontend/format.ts`
- `src/frontend/components/gz-exercise-list/gz-exercise-list.ts`, `gz-workout-detail/gz-workout-detail.ts`
- `src/scripts/seed.ts`
- `docs/backend.md`, `docs/frontend.md`, `CLAUDE.md`
- `.oxlintrc.json` — `strict-boolean-expressions`, `no-unnecessary-type-parameters`, `no-unsafe-type-assertion`
- `docs/agents/research/2026-09-11-data-type-declarations.md` — how and where types are written (records the pre-restructure layout)
