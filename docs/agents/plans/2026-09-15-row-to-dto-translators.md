---
date: 2026-09-15T08:34:15.711147+00:00
git_commit: 6887a423b5c4d10028b7a6f112b632f855ee2298
branch: main
topic: 'Move row-to-DTO translation into *.translator.ts files'
tags: [plan, backend, ports, translators, controllers, dto, oxlint]
status: implemented
---

# PLAN: Move row-to-DTO translation into `*.translator.ts` files

Today a row becomes a DTO in one of eleven `to<X>` mappers declared in a feature's `ports/`, while
the reverse direction lives in `internal/<entity>.translator.ts`. This plan moves every outbound
mapper into the feature's private translator, so that translation in both directions happens only
inside `*.translator.ts` files, `ports/` declares nothing but row types (and the cross-feature SQL
fragments), and the linter keeps it that way.

Basis: `docs/agents/research/2026-09-15-row-to-dto-translation.md`.

## Acceptance Criteria

- No function translating a row into a DTO exists outside `src/backend/features/**/internal/*.translator.ts`.
- `ports/` holds only row types plus `workouts/ports/sql.ts`, and imports nothing from `src/shared/dto`.
- Controllers import no `ports/` module; every response is translated through their own feature's translator.
- No translator imports another feature's `internal/`.
- Every API response body is unchanged; `bun test` passes.
- `bun run lint` enforces both boundaries (`ports/**` ↛ `shared/dto`, `*.controller.ts` ↛ `ports/**`).
- `bun run typecheck` and `bun run fmt:check` pass.
- `docs/backend.md`, `docs/frontend.md` and the header of `src/shared/dto/index.ts` describe the new rule;
  nothing under `docs/agents/` is edited.

## Technical Key Decisions and Tradeoffs

1. **Location:** outbound translators go into the existing `internal/<entity>.translator.ts`; the
   stats feature gets a new `internal/stats.translator.ts`.
   - Why: one private home per entity for translation in both directions.
   - Impact: every `to<X>` is deleted from `ports/`; `ports/` becomes types-only (plus `sql.ts`).
2. **BestSet across features:** `exercise.translator.ts` builds `BestSetDto` itself, naming all ten
   fields.
   - Why: exercises may not import `workouts/internal/set.translator.ts`.
   - Impact: `toBestSet` and its DTO spread disappear; the nine `LiftSet` assignments are restated,
     in line with how `toExerciseWithStats` and `toWorkoutWithStats` already restate their bases.
     Exercises keeps depending on `workouts/ports/` only for the `LiftSet` row type and the SQL
     fragments, as today.
3. **Naming:** `translateTo<X>Dto(row)`, named by output like the existing body casts
   (`translateToCreateExerciseDto(body)`). The parameter type distinguishes the direction; request
   DTOs are always `Create…`/`Edit…`, so no name collides.
   - Impact: helpers called only inside their own translator — `translateToSessionPointDto`,
     `translateToBestSetDto`, `translateToWorkoutWithStatsDto` — are not exported.
4. **Enforcement:** two new `no-restricted-imports` overrides in `.oxlintrc.json`:
   `src/backend/features/**/ports/**/*.ts` may not import `**/shared/dto/**`, and
   `src/backend/features/**/*.controller.ts` may not import `**/ports/**`.
   - Why: the first stops a DTO being built in `ports/` again; the second leaves a controller
     unable to name a row type, so inline mapping loses its types.
   - Impact: the controller override gains a second pattern (a separate override would be
     shadowed — oxlint applies only the last matching override's `no-restricted-imports`); the
     "three rules" sentence in `docs/backend.md` becomes four.
   - Tradeoff: the `*.translator.ts` exemption from `no-unsafe-type-assertion` stays file-wide, so
     it now also covers the outbound functions, where a stray cast would go unflagged. Outbound
     translation needs no casts, and narrowing the exemption per function is not possible in
     `overrides`, so this is accepted.

## Current State

```
INBOUND   (internal/*.translator.ts)
  controller: body ─ translateTo<X>Dto ─▶ <X>Dto ─▶ facade
  facade:     validate ─ translateDtoTo<Create|Edit><Entity> ─▶ repository

OUTBOUND  (ports/*.ts)
  repository ─row─▶ facade ─row─▶ controller ─ to<X>(row) ─▶ json(dto)
                                                 ▲
                                      ports/<entity>.ts
```

| Mapper | Declared at | Called from |
| --- | --- | --- |
| `toExercise` | `exercises/ports/exercise.ts:30` | `exercise.controller.ts:17,21,27`, `toExerciseProgress` |
| `toExerciseWithStats` | `exercises/ports/exercise.ts:40` | `exercise.controller.ts:12` |
| `toSessionPoint` | `exercises/ports/exercise.ts:54` | `toExerciseProgress` |
| `toExerciseProgress` | `exercises/ports/exercise.ts:66` | `exercise.controller.ts:37` |
| `toLiftSet` | `workouts/ports/set.ts:16` | `workout.controller.ts:47,53`, `set.controller.ts:12,18`, `toBestSet`, `toWorkoutWithSets` |
| `toBestSet` | `workouts/ports/set.ts:35` | `toExerciseProgress` (**cross-feature**, `exercises/ports/exercise.ts:3`) |
| `toWorkout` | `workouts/ports/workout.ts:20` | `workout.controller.ts:36`, `toWorkoutWithSets` |
| `toWorkoutWithStats` | `workouts/ports/workout.ts:30` | `toWorkoutPage` |
| `toWorkoutWithSets` | `workouts/ports/workout.ts:44` | `workout.controller.ts:25,30` |
| `toWorkoutPage` | `workouts/ports/workout.ts:48` | `workout.controller.ts:20` |
| `toSummary` | `stats/ports/stats.ts:20` | `stats.controller.ts:9` |

No facade, repository, test or script calls a mapper.

## Desired End State

```
INBOUND + OUTBOUND   (internal/*.translator.ts, both directions)
  controller: body ─ translateTo<Create|Edit><X>Dto ─▶ <X>Dto ─▶ facade
  facade:     validate ─ translateDtoTo<Create|Edit><Entity> ─▶ repository
  controller: facade ─row─▶ translateTo<X>Dto(row) ─▶ json(dto)

ports/   rows only (+ workouts/ports/sql.ts); lint forbids shared/dto imports
controller ─✗─▶ ports/   (lint)
```

```
features/
├── exercises/
│   ├── ports/exercise.ts                 Exercise, ExerciseWithStats, SessionPoint (types only)
│   └── internal/exercise.translator.ts   translateToCreateExerciseDto, translateToEditExerciseDto,
│                                         translateDtoToCreateExercise, translateDtoToEditExercise,
│                                         translateToExerciseDto, translateToExerciseWithStatsDto,
│                                         translateToExerciseProgressDto
│                                         (private: translateToSessionPointDto, translateToBestSetDto)
├── workouts/
│   ├── ports/{workout,set,sql}.ts        Workout, WorkoutWithStats, LiftSet, SQL fragments
│   ├── internal/workout.translator.ts    … + translateToWorkoutDto, translateToWorkoutWithSetsDto,
│   │                                     translateToWorkoutPageDto (private: translateToWorkoutWithStatsDto)
│   └── internal/set.translator.ts        … + translateToLiftSetDto
└── stats/
    ├── ports/stats.ts                    Summary (types only)
    └── internal/stats.translator.ts      translateToSummaryDto   (new file)
```

## Abstractions and Code Reuse

No new abstraction. Each outbound function keeps the body of the mapper it replaces, field for
field; only the name and the file change. Composite translators call the ones they compose
(`translateToWorkoutWithSetsDto` spreads `translateToWorkoutDto(row)` and maps
`translateToLiftSetDto` from `set.translator.ts`, which is inside the same feature).

- `src/backend/features/exercises/`
  - `ports/exercise.ts` - drop the four mappers and both imports of runtime/DTO code; keep the three
    row interfaces
  - `internal/exercise.translator.ts` - add `translateToExerciseDto`, `translateToExerciseWithStatsDto`,
    `translateToExerciseProgressDto`, and unexported `translateToSessionPointDto`, `translateToBestSetDto`
  - `internal/exercise.controller.ts` - import from the translator only
  - `exercise.routes.test.ts` - pin the full `bestSet` shape
- `src/backend/features/workouts/`
  - `ports/set.ts` - drop `toLiftSet`, `toBestSet` and the DTO import
  - `ports/workout.ts` - drop the four mappers, the DTO import and the `toLiftSet` import
  - `internal/set.translator.ts` - add `translateToLiftSetDto`
  - `internal/workout.translator.ts` - add `translateToWorkoutDto`, `translateToWorkoutWithSetsDto`,
    `translateToWorkoutPageDto`, unexported `translateToWorkoutWithStatsDto`
  - `internal/workout.controller.ts`, `internal/set.controller.ts` - import from translators only
- `src/backend/features/stats/`
  - `ports/stats.ts` - drop `toSummary` and the DTO import; update the header comment's wording if it
    mentions mapping
  - `internal/stats.translator.ts` - new, `translateToSummaryDto`
  - `internal/stats.controller.ts` - import from the translator
- `.oxlintrc.json` - two override changes
- `docs/backend.md`, `docs/frontend.md`, `src/shared/dto/index.ts` - prose

## Logging & Observability

None; the refactor changes no runtime behaviour.

## Implementation

### Phase 1: Exercises translate their own rows

Dependencies: None

Move the four exercise mappers into `exercise.translator.ts`, build `BestSetDto` there without
`toBestSet`, and point `ExerciseController` at the translator. `workouts/ports/set.ts` is left
untouched in this phase (its `toBestSet` simply loses its last caller).

**Tasks**:

- [x] `src/backend/features/exercises/internal/exercise.translator.ts`: add the outbound functions,
      bodies copied from `ports/exercise.ts:30-76`, importing the row types from
      `../ports/exercise.ts`, `LiftSet` from `../../workouts/ports/set.ts`, `Iso8601Date` from
      `../../../../shared/flavors.ts`, and `ExerciseDto`, `ExerciseWithStatsDto`, `SessionPointDto`,
      `ExerciseProgressDto` plus `BestSetDto` from `shared/dto`:
      ```ts
      export function translateToExerciseDto(row: Exercise): ExerciseDto { /* 5 fields */ }
      export function translateToExerciseWithStatsDto(row: ExerciseWithStats): ExerciseWithStatsDto { /* 9 fields */ }
      function translateToSessionPointDto(row: SessionPoint): SessionPointDto { /* 7 fields */ }

      /**
       * The workouts feature owns `LiftSetDto`'s translation, but it is private to that feature, so
       * the best set is named here field by field — never spread from the row, which would ship
       * `workout_id`, `exercise_id` and `created_at` under their snake_case names.
       */
      function translateToBestSetDto(row: LiftSet & { performed_on: Iso8601Date }): BestSetDto {
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
          performedOn: row.performed_on,
        };
      }

      export function translateToExerciseProgressDto(
        exercise: Exercise,
        sessions: SessionPoint[],
        bestSet: (LiftSet & { performed_on: Iso8601Date }) | null,
      ): ExerciseProgressDto {
        return {
          exercise: translateToExerciseDto(exercise),
          sessions: sessions.map(translateToSessionPointDto),
          bestSet: bestSet === null ? null : translateToBestSetDto(bestSet),
        };
      }
      ```
- [x] `src/backend/features/exercises/ports/exercise.ts`: delete `toExercise`, `toExerciseWithStats`,
      `toSessionPoint`, `toExerciseProgress`, the `shared/dto` import and the `toBestSet`/`LiftSet`
      import; keep `Exercise`, `ExerciseWithStats`, `SessionPoint` and the flavor imports they need.
- [x] `src/backend/features/exercises/internal/exercise.controller.ts`: remove the
      `../ports/exercise.ts` import; import `translateToExerciseDto`, `translateToExerciseWithStatsDto`
      and `translateToExerciseProgressDto` from `./exercise.translator.ts` and replace the five call
      sites (`:12,17,21,27,37`).
- [x] `src/backend/features/exercises/exercise.routes.test.ts`, test "aggregates one line per session
      and reports the best set": replace `expect(progress.bestSet?.weight).toBe(65)` with an exact
      shape check, so the restated field list is pinned. The best set is 65×5 from the
      2026-01-12 workout (`exercise.repository.ts:127` orders by estimated 1RM), it is the first set
      posted to that workout so its `position` is `1` (`set.repository.ts:66`), and it was posted
      without notes:
      ```ts
      expect(progress.bestSet).toEqual({
        id: expect.any(Number),
        workoutId: expect.any(Number),
        exerciseId: exercise.id,
        exerciseName: 'Bench Press',
        reps: 5,
        weight: 65,
        notes: null,
        position: 1,
        createdAt: expect.any(String),
        performedOn: '2026-01-12',
      });
      ```

**Automated Verification**:

- [x] `bun test src/backend/features/exercises` passes, including the tightened progress test
- [x] `git grep -n "ports/" -- src/backend/features/exercises/internal/exercise.controller.ts` prints nothing (exit code 1 is the expected result)
- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

### Phase 2: Workouts and sets translate their own rows

Dependencies: Phase 1 (removes the last cross-feature caller of `toBestSet`)

**Tasks**:

- [x] `src/backend/features/workouts/internal/set.translator.ts`: add
      `export function translateToLiftSetDto(row: LiftSet): LiftSetDto`, body from `ports/set.ts:16-28`,
      importing `LiftSet` from `../ports/set.ts` and `LiftSetDto` from `shared/dto`.
- [x] `src/backend/features/workouts/ports/set.ts`: delete `toLiftSet`, `toBestSet` (with its doc
      comment) and the `shared/dto` import; drop `Iso8601Date` from the flavor import (nothing
      else in the file uses it, and neither `tsconfig.json` nor lint would flag it).
- [x] `src/backend/features/workouts/internal/workout.translator.ts`: add
      `translateToWorkoutDto(row: Workout): WorkoutDto`, unexported
      `translateToWorkoutWithStatsDto(row: WorkoutWithStats): WorkoutWithStatsDto`,
      `translateToWorkoutWithSetsDto(row: Workout, sets: LiftSet[]): WorkoutWithSetsDto` (spreading
      `translateToWorkoutDto(row)` and mapping `translateToLiftSetDto` from `./set.translator.ts`) and
      `translateToWorkoutPageDto(rows: WorkoutWithStats[], total: number, limit: number, offset: number): WorkoutPageDto`,
      bodies from `ports/workout.ts:20-50`. New imports: `Workout`, `WorkoutWithStats` from
      `../ports/workout.ts`; `LiftSet` from `../ports/set.ts`; `translateToLiftSetDto` from
      `./set.translator.ts`; `WorkoutDto`, `WorkoutWithStatsDto`, `WorkoutWithSetsDto`,
      `WorkoutPageDto` from `shared/dto` (added to the existing `shared/dto` import).
- [x] `src/backend/features/workouts/ports/workout.ts`: delete the four mappers, the `shared/dto`
      import and the whole `./set.ts` import.
- [x] `src/backend/features/workouts/internal/workout.controller.ts`: remove both `ports/` imports;
      import the workout translators from `./workout.translator.ts` and `translateToLiftSetDto`
      alongside `translateToCreateSetDto` from `./set.translator.ts`; replace call sites `:20,25,30,36,47,53`.
- [x] `src/backend/features/workouts/internal/set.controller.ts`: remove the `../ports/set.ts` import;
      import `translateToLiftSetDto` with `translateToEditSetDto`; replace call sites `:12,18`.

**Automated Verification**:

- [x] `bun test src/backend/features/workouts` passes
- [x] `bun test src/backend/features/exercises` passes
- [x] `git grep -n "shared/dto" -- src/backend/features/workouts/ports src/backend/features/exercises/ports` prints nothing (exit code 1 expected)
- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

### Phase 3: Stats translator, lint enforcement and documentation

Dependencies: Phases 1 and 2 (the lint overrides only pass once no controller imports `ports/`)

**Tasks**:

The lint overrides go in first, while stats is still unmigrated, so that the stats files prove both
patterns actually match the relative specifiers the backend uses (`**/ports/**` has never matched
anything so far — no route file imports `ports/`).

- [x] `.oxlintrc.json`: add a second pattern to the `src/backend/features/**/*.controller.ts` override:
      ```json
      {
        "group": ["**/ports/**"],
        "message": "Controllers translate rows through their feature's translator."
      }
      ```
- [x] `.oxlintrc.json`: add a new override after it:
      ```json
      {
        "files": ["src/backend/features/**/ports/**/*.ts"],
        "rules": {
          "no-restricted-imports": [
            "error",
            {
              "patterns": [
                {
                  "group": ["**/shared/dto/**", "**/shared/dto"],
                  "message": "ports/ declares rows; translating them into DTOs happens in a feature's *.translator.ts."
                }
              ]
            }
          ]
        }
      }
      ```
      The backend's imports are written `'../../../../shared/dto'` (the directory, no `index.ts`),
      which is why the group lists the bare directory specifier beside `**/shared/dto/**`.
- [x] Run `bun run lint` and confirm it fails with exactly two errors: the controller message on
      `stats/internal/stats.controller.ts:3` and the `ports/` message on `stats/ports/stats.ts:1`.
      If either is missing, adjust the pattern until it fires before continuing.
- [x] `src/backend/features/stats/internal/stats.translator.ts` (new): `export function
      translateToSummaryDto(row: Summary): SummaryDto`, body from `ports/stats.ts:20-31`, importing
      `Summary` from `../ports/stats.ts` and `SummaryDto` from `shared/dto`.
- [x] `src/backend/features/stats/ports/stats.ts`: delete `toSummary` and the `shared/dto` import;
      keep `Summary` and its header comment.
- [x] `src/backend/features/stats/internal/stats.controller.ts`: replace the `../ports/stats.ts`
      import with `translateToSummaryDto` from `./stats.translator.ts`.
- [x] `docs/backend.md`: rewrite the passages describing mappers in `ports/`:
      - `:14-18` — `ports/` declares the row types other features may read (no `to*` mappers);
        `internal/`'s translator translates in both directions: body → request DTO, request DTO →
        repository input, and row → response DTO.
      - `:18-21` — the arrows crossing a feature line still all land on `ports/`, but now name two
        importers of `LiftSet` from `features/workouts/ports/set.ts`: the exercises repository and
        `exercise.translator.ts`.
      - `:31` — the controller path becomes `body → translateTo<X>Dto → <X>Dto → facade → row → translateTo<X>Dto → DTO`.
      - `:32-35` — the translator has three parts, not two halves: the body-to-DTO part only casts,
        the DTO-to-input part and the row-to-DTO part are where renaming happens.
      - `:37-44` — each feature holds its translations for both directions in `internal/<entity>.translator.ts`
        (`translateToLiftSetDto(row)` called by the controller, `translateDtoToCreateSet(dto)` called
        by the facade); a translator never imports another feature's `internal/`, which is why
        `exercise.translator.ts` names `BestSetDto`'s fields itself.
      - `:84-92` — the backend overrides become four: routes, controllers (no repository, no
        `ports/`), `ports/` (no `shared/dto`), and the translator exemption; `:92` "casting a body
        onto a DTO is half of a translator's job" becomes "is part of a translator's job".
      - `:98-100` — the controller translates what the facade returns through its translator.
- [x] `docs/frontend.md:101`: "the backend translates its rows into these DTOs in each feature's
      translator" instead of "`ports/`".
- [x] `src/shared/dto/index.ts:15-16`: "The backend translates its repository rows into these shapes
      in each feature's `internal/*.translator.ts`; …".
- [x] `src/backend/features/workouts/ports/sql.ts` header needs no change (it already speaks only of
      SQL fragments); leave it.

**Automated Verification**:

- [x] `bun test src/backend/features/stats` passes
Run from the repository root in PowerShell; every `git grep` below must print nothing (exit code 1
is the expected result).

- [x] `git grep -n "shared/dto" -- "src/backend/features/*/ports/*"`
- [x] `git grep -n "ports/" -- "src/backend/features/*.controller.ts"`
- [x] `git grep -nE "function to[A-Z]" -- src/backend`
- [x] `bun run lint` passes
- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run fmt:check` passes
- [x] `git grep -nE "to\*|to(LiftSet|BestSet|Exercise|Workout|Summary)" -- docs/backend.md docs/frontend.md src/shared`
- [x] `git grep -n "ports/" -- docs/frontend.md src/shared/dto/index.ts`

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-15-row-to-dto-translation.md` — the current outbound path, every mapper and call site
- `docs/backend.md:14-44,84-100` — prose that states today's `ports/` rule
- `.oxlintrc.json:129-175` — existing backend overrides
- `src/backend/features/exercises/exercise.routes.test.ts:58-80` — the progress test tightened in Phase 1
