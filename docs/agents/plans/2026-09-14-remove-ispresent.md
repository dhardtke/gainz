---
date: 2026-09-14T17:20:51.613369+00:00
git_commit: d1c5ce7391fa5377dec24e227d8d08f858c043f2
branch: main
topic: 'Remove isPresent() and inline its calls'
tags: [plan, validate, facades]
status: complete
---

# PLAN: Remove isPresent() and inline its calls

`isPresent(dto, field)` in `src/backend/shared/validate.ts` is a one-line helper whose 14 callers
all sit in the facades' `validateCreate` / `validateEdit`. Replace every call with a plain
`dto.<field> !== undefined` check and delete the function and its test.

## Acceptance Criteria

- `isPresent` no longer exists anywhere under `src/`.
- All 14 call sites in `WorkoutFacade`, `SetFacade` and `ExerciseFacade` check
  `dto.<field> !== undefined` instead.
- Behaviour is unchanged: a `null` field still counts as sent (required validators throw 400,
  `optionalString` fields clear the column), while an `undefined` or missing key still counts as not
  sent (the key never reaches the validated DTO).
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **Check `dto.f !== undefined` without an own-property test:** drop the `hasOwnProperty` half of
   `isPresent`.
   - Why: DTOs are plain object literals, from `translateTo*Dto` or from test literals, so they
     never carry inherited keys. For them the own-property half adds nothing.
   - Impact: the call sites get the same result, and the check matches the `!== undefined` that
     `translateDtoToEdit*` already uses.
2. **Delete the `isPresent` describe block in `validate.test.ts` without replacing it.**
   - Why: there is no function left to test. The null-versus-absent behaviour is already covered by
     `exercises.facade.test.ts:31-35`, `workouts.facade.test.ts:67-72`, `set.routes.test.ts` and
     `exercise.routes.test.ts`.
   - Impact: the only test change is removing the block and its import.
3. **Leave validators, translators and `buildUpdate` unchanged.**
   - Why: the task is only to inline `isPresent`. `buildUpdate`'s `in` check is deliberate: it is
     what lets an explicit `null` clear a column.
   - Impact: the change touches only four files.

## Current State

```
PATCH/POST body ─► translateTo*Dto (writes every key; value may be undefined)
                    └─► Facade.validateCreate / validateEdit
                          ├─ create: ...(isPresent(dto, 'f') ? { f: required*(dto, 'f') } : {})   3 calls
                          └─ edit:   if (isPresent(dto, 'f')) { valid.f = …(dto, 'f') }           11 calls
                                └─► translateDtoToEdit*  (dto.f !== undefined)
                                      └─► buildUpdate    (f in patch)
```

- `src/backend/shared/validate.ts:10-13` defines `isPresent`, which is
  `hasOwnProperty(dto, field) && dto[field] !== undefined`.
- `src/backend/features/workouts/workouts.facade.ts` calls it at `:46`, `:49` and `:102` (create)
  and at `:55`, `:58`, `:61`, `:108`, `:111`, `:114` and `:120` (edit).
- `src/backend/features/exercises/exercises.facade.ts` calls it at `:56`, `:59` and `:62` (edit).
- `src/backend/shared/validate.test.ts:65-70` is its only direct test.

## Desired End State

The data flow is the same; only the facade expression changes:

```ts
...(dto.performedOn !== undefined ? { performedOn: requiredDate(dto, 'performedOn') } : {}),

if (dto.name !== undefined) {
  valid.name = requiredString(dto, 'name', MAX_NAME);
}
```

## Abstractions and Code Reuse

- `src/backend/shared/`
  - `validate.ts` - delete `isPresent`
  - `validate.test.ts` - delete the `isPresent` describe block and drop it from the import
- `src/backend/features/workouts/workouts.facade.ts` - inline the calls and drop `isPresent` from the import
  - `WorkoutFacade.validateCreate` - `performedOn`, `copyFromWorkoutId`
  - `WorkoutFacade.validateEdit` - `performedOn`, `title`, `notes`
  - `SetFacade.validateCreate` - `position`
  - `SetFacade.validateEdit` - `exerciseId`, `reps`, `weight`, `notes`, `position`
- `src/backend/features/exercises/exercises.facade.ts` - inline the calls and drop `isPresent` from the import
  - `ExerciseFacade.validateEdit` - `name`, `muscleGroup`, `notes`

No documentation outside `docs/agents/` mentions `isPresent`, so no guide needs updating.

## Logging & Observability

No changes.

## Implementation

Dependencies: None

This is a single phase because the export can only be removed once no caller imports it.

**Tasks**:

- [x] In `workouts.facade.ts`, `WorkoutFacade.validateCreate`, replace
      `isPresent(dto, 'performedOn')` with `dto.performedOn !== undefined` and
      `isPresent(dto, 'copyFromWorkoutId')` with `dto.copyFromWorkoutId !== undefined`
- [x] In `workouts.facade.ts`, `WorkoutFacade.validateEdit`, replace the three `isPresent` checks
      (`performedOn`, `title`, `notes`) with `dto.<field> !== undefined`
- [x] In `workouts.facade.ts`, `SetFacade.validateCreate`, replace `isPresent(dto, 'position')` with
      `dto.position !== undefined`
- [x] In `workouts.facade.ts`, `SetFacade.validateEdit`, replace the five `isPresent` checks
      (`exerciseId`, `reps`, `weight`, `notes`, `position`) with `dto.<field> !== undefined`
- [x] Remove `isPresent` from the `validate.ts` import in `workouts.facade.ts`
- [x] In `exercises.facade.ts`, `ExerciseFacade.validateEdit`, replace the three `isPresent` checks
      (`name`, `muscleGroup`, `notes`) with `dto.<field> !== undefined`, and remove `isPresent` from
      the import
- [x] Delete `isPresent` from `src/backend/shared/validate.ts`
- [x] Delete the `describe('isPresent', …)` block from `src/backend/shared/validate.test.ts` and
      remove `isPresent` from its import

**Automated Verification**:

- [x] `git grep isPresent -- src` returns no matches
- [x] `bun test src/backend/features/exercises/exercises.facade.test.ts` passes, including the case
      where `null` clears `notes` and the omitted `name` is kept
- [x] `bun test src/backend/features/workouts/workouts.facade.test.ts` passes, including the cases
      where an omitted `performedOn` means today, an omitted `position` appends the set, and a
      blank `notes` clears the field
- [x] `bun test src/backend/features/workouts/set.routes.test.ts src/backend/features/exercises/exercise.routes.test.ts` passes (partial PATCH bodies over HTTP)
- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-14-ispresent-usage.md`
- `docs/agents/plans/2026-09-12-validation-in-facades.md`
