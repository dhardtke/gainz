---
date: 2026-09-12T21:13:18.824894+00:00
git_commit: eb2e69d2cebe7214a5449b6477a63d37093317b8
branch: main
topic: 'Move request validation from translators into facades'
tags: [plan, validation, facades, translators, controllers, mappers, seed, lint]
status: ready
---

# PLAN: Move request validation from translators into facades

Request bodies are currently validated by the translators, which the controllers call before the
facade (see `docs/agents/research/2026-09-12-data-validation.md`). This plan moves that validation
into each feature's facade. The controller still turns the body into a request DTO by calling the
translator, but the translator only casts the body's fields to the DTO's types — no checks, no
normalisation. The facade's write methods receive that DTO, validate and normalise it with their
own private methods first, and only then map and process it. Path ids and query parameters remain
the controller's job.

## Acceptance Criteria

- Translators do no validation: each maps `Record<string, unknown>` to its shared request DTO with
  explicit `as` casts per field, and imports nothing from `shared/validate.ts`.
- Every facade write method (`ExerciseFacade.create/update`, `WorkoutFacade.create/update`,
  `SetFacade.create/update`) accepts the shared request DTO (`CreateExerciseDto`, `EditExerciseDto`,
  `CreateWorkoutDto`, `EditWorkoutDto`, `CreateSetDto`, `EditSetDto`), validates it with a private
  method of that facade first, then maps it with the `from*` mapper and calls the repository.
- No new types and no new validator modules are introduced.
- Controllers call `pathId` / `queryInt` / `readJsonObject` from `http/http.ts`, the translator, and
  the facade; they no longer import `from*` mappers or `shared/validate.ts`.
- `WorkoutFacade.create` reads `copyFromWorkoutId` from the validated DTO itself; the controller no
  longer passes `{ copyFrom }`.
- HTTP behaviour is unchanged: same statuses, messages, trimming, null-for-blank, numeric-string
  coercion and two-decimal rounding.
- A body that fails validation on an unknown path id is still answered with 400, not 404 — true
  today because the translator runs first — and a route test and facade tests now pin it.
- `src/scripts/seed.ts` passes camelCase DTOs and goes through validation.
- Unit tests cover `shared/validate.ts` and each facade's validation; `docs/backend.md` and
  `AGENTS.md` describe the new flow.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **Facades take the shared request DTOs** and run `validate → DTO → from* → Input → repository`
   themselves.
   - Why: validation runs before anything is processed, the facade's signature says what a request
     contains, and error messages keep naming camelCase wire fields.
   - Impact: the `from*` mappers move behind the facade; `seed.ts` switches from snake_case inputs to
     camelCase DTOs, which the compiler checks.
2. **Translators cast, they do not convert:** `reps: body.reps as number`.
   - Why: user decision — the translation layer maps the body onto the DTO type and nothing more.
   - Impact: between the translator and the facade's validation, a DTO's static types claim more
     than has been checked (a `reps` typed `number` may hold `'5'`, `null` or an object at runtime).
     The facade validation therefore reads every field as `unknown`, exactly as today's helpers do,
     and its return value is the first point at which the types are true.
3. **Translators are exempt from `typescript/no-unsafe-type-assertion`** through one new
   `.oxlintrc.json` override on `src/backend/features/**/*.translator.ts`.
   - Why: the rule rejects every cast from `unknown` to a narrower type ("type 'number' is more
     narrow than the original type", verified), and the casts are the point of the translator.
   - Impact: the rule stays on everywhere else; the import-restriction overrides are unchanged.
4. **Validation lives in private methods of the facade class** (`validateCreate`, `validateEdit`).
   - Why: user decision — no separate validator modules.
   - Impact: the facade modules import the field helpers from `shared/validate.ts`; validation is
     tested through the public facade methods.
5. **The field helpers take a DTO and a field name of it:**
   `requiredInt<T extends object>(dto: T, field: keyof T & string, …)`, reading
   `const value: unknown = dto[field]`.
   - Why: an interface such as `CreateSetDto` is not assignable to `Record<string, unknown>`; the
     generic signature accepts it (verified with typecheck and lint) and checks field names at
     compile time.
   - Impact: the helpers' runtime logic, including numeric-string coercion, is unchanged, because a
     cast does not change the value that arrives.
6. **`pathId` / `queryInt` stay in the controller**, moved from `shared/validate.ts` to
   `http/http.ts` beside `readJsonObject`.
   - Why: they parse the URL, not the request data; facades keep taking plain numbers.
   - Impact: `shared/validate.ts` holds only body-field rules and `today()`. The route lint rule
     already forbids `http/http.ts`.
7. **Tests:** `shared/validate.ts` unit tests, facade tests for validation, and one 400-before-404
   route test.
   - Why: normalisation edge cases are cheaper to pin directly than over HTTP.
   - Impact: `docs/backend.md`'s list of exceptions to "tests are end-to-end over HTTP" grows. Inputs
     whose runtime type contradicts the DTO (`reps: '5'`, `copyFromWorkoutId: 'nope'`) are covered
     by `validate.test.ts` and the existing route tests, because a facade test would need a cast the
     lint rule forbids outside translators.

## Current State

```
Controller (internal/*.controller.ts)
  pathId / queryInt ─────────────────── 400 bad id / query        (shared/validate.ts)
  readJsonObject(req) ───────────────── 400 not JSON / not object  (http/http.ts)
  translateTo<X>Dto(body) ───────────── 400 first bad field  ◄── checks, trims, coerces, rounds
      → CreateSetDto (checked, normalised)
  from<X>(dto) ──────────────────────── rename to snake_case, defaults (today())
      → SetInput
        │
        ▼
Facade (<feature>.facade.ts) ─────────── pure delegation, takes *Input
        │
        ▼
Repository ─────────────────────────── 404 require, 409 unique/in-use, 400 FK
```

- Translators: `exercise.translator.ts:4-24`, `workout.translator.ts:4-25`, `set.translator.ts:4-32`.
- Facades take `ExerciseInput` / `WorkoutInput` / `SetInput`: `exercises.facade.ts:22-28`,
  `workouts.facade.ts:27-33`, `:56-62`.
- `WorkoutController.create` passes `{ copyFrom: dto.copyFromWorkoutId }` separately
  (`workout.controller.ts:25-30`).
- `seed.ts:65`, `:78`, `:92` call the facades with snake_case inputs and bypass validation.
- Field helpers take `body: Record<string, unknown>, field: string` (`shared/validate.ts:9-79`).

## Desired End State

```
Controller (internal/*.controller.ts)
  pathId / queryInt ─────────────────── 400 bad id / query        (http/http.ts)
  readJsonObject(req) ───────────────── 400 not JSON / not object  (http/http.ts)
  translateTo<X>Dto(body) ───────────── explicit casts, no checks
      → CreateSetDto (typed, unchecked)
        │
        ▼
Facade (<feature>.facade.ts)
  this.validateCreate(dto) ──────────── 400 first bad field    (private method, shared/validate.ts helpers)
      → CreateSetDto (checked, normalised)
  from<X>(dto) → SetInput
        │
        ▼
Repository ─────────────────────────── 404 require, 409 unique/in-use, 400 FK
```

`set.translator.ts` afterwards:

```ts
export function translateToCreateSetDto(body: Record<string, unknown>): CreateSetDto {
  return {
    exerciseId: body.exerciseId as number,
    reps: body.reps as number,
    weight: body.weight as number,
    notes: body.notes as string | null | undefined,
    position: body.position as number | undefined,
  };
}
```

`SetController.update` and `SetFacade` afterwards:

```ts
async update(req: ParamRequest): Promise<Response> {
  const id = pathId(req.params.id, 'set');
  return json(toLiftSet(this.sets.update(id, translateToEditSetDto(await readJsonObject(req)))));
}
```

```ts
update(id: number, dto: EditSetDto): LiftSet {
  return this.sets.update(id, fromEditSet(this.validateEdit(dto)));
}

private validateEdit(dto: EditSetDto): EditSetDto {
  const valid: EditSetDto = {};
  if (isPresent(dto, 'reps')) {
    valid.reps = requiredInt(dto, 'reps', { min: 1, max: 1000 });
  }
  // … the remaining fields, as in today's translateToEditSetDto
  return valid;
}
```

## Abstractions and Code Reuse

The field helpers in `shared/validate.ts` keep their logic and messages; only their parameter types
become generic over the DTO. The private validation methods are today's translator bodies. The
`from*` mappers and the shared DTOs are reused unchanged; only the mappers' caller moves from
controller to facade. The translator function names stay (`translateTo<X>Dto`). No types or modules
are added apart from test files.

- `.oxlintrc.json` - new override: `typescript/no-unsafe-type-assertion` off for
  `src/backend/features/**/*.translator.ts`
- `src/backend/shared/`
  - `validate.ts` - generic `isPresent`, `requiredString`, `optionalString`, `requiredInt`,
    `requiredNumber`, `requiredDate`; remove `pathId`, `queryInt`; `MAX_NAME` doc comment names the
    facades
  - `validate.test.ts` - new: unit tests of the field helpers
- `src/backend/http/http.ts` - receives `pathId`, `queryInt` unchanged (still covered by the route
  tests)
- `src/backend/features/exercises/`
  - `exercises.facade.ts` - `create(dto)` / `update(id, dto)`; private `validateCreate`,
    `validateEdit`
  - `exercises.facade.test.ts` - new
  - `internal/exercise.translator.ts` - casts only
  - `internal/exercise.controller.ts` - drop the mapper import
- `src/backend/features/workouts/`
  - `workouts.facade.ts` - `WorkoutFacade` and `SetFacade` take DTOs and each gets private
    `validateCreate`, `validateEdit`
  - `workouts.facade.test.ts` - new
  - `internal/workout.translator.ts`, `internal/set.translator.ts` - casts only
  - `internal/workout.mapper.ts` - doc comment names `WorkoutFacade.create`
  - `internal/workout.controller.ts`, `internal/set.controller.ts` - simplified
  - `set.routes.test.ts` - 400-before-404 test
- `src/scripts/seed.ts` - camelCase DTOs
- `docs/backend.md`, `AGENTS.md` - new flow, facade role, lint override, test exceptions

## Logging & Observability

No changes. Validation failures remain `HttpError`s rendered by the server's `error` hook.

## Implementation

### Phase 1: Exercises validate in their facade

Dependencies: None

Make the field helpers accept DTOs, move the URL helpers to `http/http.ts`, exempt translators from
the assertion rule, and move exercise validation into `ExerciseFacade`. The workout and set
translators keep validating until Phase 2; the generic helpers accept their `Record<string, unknown>`
bodies unchanged.

**Tasks**:

- [ ] `src/backend/shared/validate.ts`: change `isPresent`, `requiredString`, `optionalString`,
      `requiredInt`, `requiredNumber` and `requiredDate` to
      `<T extends object>(dto: T, field: keyof T & string, …)` reading
      `const value: unknown = dto[field]`; keep their logic and messages. Remove `pathId` and
      `queryInt`. The `MAX_NAME` doc comment says the facades share the bounds.
- [ ] `src/backend/http/http.ts`: add `pathId` and `queryInt` unchanged; `badRequest` is already
      imported.
- [ ] Update the `pathId` / `queryInt` imports in `exercise.controller.ts`,
      `workout.controller.ts` and `set.controller.ts` to `http/http.ts`.
- [ ] `.oxlintrc.json`: add an override for `src/backend/features/**/*.translator.ts` setting
      `"typescript/no-unsafe-type-assertion": "off"`.
- [ ] `exercises.facade.ts`: add private
      `validateCreate(dto: CreateExerciseDto): CreateExerciseDto` and
      `validateEdit(dto: EditExerciseDto): EditExerciseDto`, holding today's translator bodies.
- [ ] `exercises.facade.ts`: `create(dto: CreateExerciseDto): Exercise` runs
      `this.exercises.create(fromCreateExercise(this.validateCreate(dto)))`;
      `update(id: number, dto: EditExerciseDto): Exercise` runs
      `this.exercises.update(id, fromEditExercise(this.validateEdit(dto)))`. Drop the
      `ExerciseInput` import if unused.
- [ ] `exercise.translator.ts`: replace the bodies with casts and remove the `shared/validate.ts`
      import:
      ```ts
      export function translateToCreateExerciseDto(body: Record<string, unknown>): CreateExerciseDto {
        return {
          name: body.name as string,
          muscleGroup: body.muscleGroup as string | null | undefined,
          notes: body.notes as string | null | undefined,
        };
      }
      ```
      `translateToEditExerciseDto` casts the same three fields, `name` as `string | undefined`.
- [ ] `exercise.controller.ts`: `create` passes `translateToCreateExerciseDto(await readJsonObject(req))`
      and `update` passes `translateToEditExerciseDto(...)` to the facade; remove the mapper import.
- [ ] `src/scripts/seed.ts`: `EXERCISES` entries use `muscleGroup` instead of `muscle_group`.
- [ ] New `src/backend/shared/validate.test.ts`, calling the helpers with plain object literals:
      `requiredString` (trims, rejects blank and non-string, max length after trim),
      `optionalString` (`undefined` / `null` / `''` → `null`, rejects a number), `requiredInt`
      (`'5'` → 5, rejects `1.5` and `'nope'`, range message), `requiredNumber` (rounds `62.555` to
      two decimals, rejects `NaN` / `Infinity`), `requiredDate` (accepts `2026-09-12`, rejects
      `12.09.2026`), and `isPresent` (an `undefined` value is absent).
- [ ] New `src/backend/features/exercises/exercises.facade.test.ts` over
      `createExerciseFacade(openDatabase(':memory:'))`:
      `create({ name: '  Squat ', muscleGroup: '' })` returns a row with `name: 'Squat'` and
      `muscle_group: null`; `create({ name: '' })` throws the `"name" is required…` 400;
      `update(id, { notes: null })` clears `notes` and leaves `name`; `update(id, { name: '' })`
      throws 400; `update(999999, { name: '' })` throws 400 rather than 404.

**Automated Verification**:

- [ ] `bun test src/backend/shared/validate.test.ts` passes
- [ ] `bun test src/backend/features/exercises` passes, including the new facade tests and the
      existing blank-name 400 and duplicate-name 409 route tests
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `$env:GAINZ_DB = ':memory:'; bun run seed; Remove-Item Env:GAINZ_DB` completes and prints the
      seeded counts

### Phase 2: Workouts and sets validate in their facades

Dependencies: Phase 1

Move workout and set validation into `WorkoutFacade` and `SetFacade`, finish `seed.ts`, pin the
validation order, and document the new flow.

**Tasks**:

- [ ] `workouts.facade.ts` `WorkoutFacade`: private `validateCreate(dto: CreateWorkoutDto): CreateWorkoutDto`
      and `validateEdit(dto: EditWorkoutDto): EditWorkoutDto` holding today's workout translator
      bodies, and:
      ```ts
      create(dto: CreateWorkoutDto): Workout {
        const valid = this.validateCreate(dto);
        return this.workouts.create(fromCreateWorkout(valid), { copyFrom: valid.copyFromWorkoutId });
      }

      update(id: number, dto: EditWorkoutDto): Workout {
        return this.workouts.update(id, fromEditWorkout(this.validateEdit(dto)));
      }
      ```
      Remove the `copyFrom` doc comment on `create`.
- [ ] `workouts.facade.ts` `SetFacade`: private `validateCreate(dto: CreateSetDto): CreateSetDto` and
      `validateEdit(dto: EditSetDto): EditSetDto` holding today's set translator bodies;
      `create(workoutId: number, dto: CreateSetDto)` and `update(id: number, dto: EditSetDto)`
      validate, map, then call the repository. Drop the `SetInput` / `WorkoutInput` imports if unused.
- [ ] `workout.translator.ts`: casts only. `translateToCreateWorkoutDto` casts `performedOn` as
      `string | undefined`, `title` and `notes` as `string | null | undefined`, and
      `copyFromWorkoutId` as `number | undefined`. `translateToEditWorkoutDto` casts `performedOn`,
      `title` and `notes` the same way. Remove the `shared/validate.ts` import.
- [ ] `set.translator.ts`: casts only, as in Desired End State; `translateToEditSetDto` casts every
      field with `| undefined`. Remove the `shared/validate.ts` import.
- [ ] `workout.mapper.ts`: the doc comment says `WorkoutFacade.create` passes `copyFromWorkoutId`
      on, not `WorkoutController.create`.
- [ ] `workout.controller.ts`: `create`, `update` and `addSet` pass the translator result to the
      facade; remove the mapper imports and the `copyFromWorkoutId` comment.
- [ ] `set.controller.ts`: `update` passes `translateToEditSetDto(await readJsonObject(req))`; remove
      the mapper import.
- [ ] `src/scripts/seed.ts`: `workouts.create({ performedOn, title, notes })` and
      `sets.create(workout.id, { exerciseId, reps, weight, notes })`.
- [ ] New `src/backend/features/workouts/workouts.facade.test.ts` over
      `createWorkoutFacades(openDatabase(':memory:'))`:
  - `workouts.create({})` returns a row dated today; `create({ performedOn: '05.01.2026' })` throws
    400; `create({ copyFromWorkoutId: sourceId })` copies that workout's sets.
  - `workouts.update(999999, { performedOn: 'x' })` throws 400 rather than 404.
  - `sets.create(workoutId, { exerciseId, reps: 5, weight: 62.555, notes: '  ' })` stores
    `weight: 62.56`, `notes: null` and the next `position`;
    `sets.create(workoutId, { exerciseId, reps: 0, weight: 60 })` throws 400;
    `sets.update(id, { notes: '' })` clears `notes` and leaves `reps`.
- [ ] `set.routes.test.ts`: add `test('validates the body before looking up the set', …)` —
      `PATCH /api/sets/999999` with `{ reps: 0 }` returns 400.
- [ ] `docs/backend.md`:
  - Line 5: the mapping is reached through the feature's controllers and facade.
  - Line 9: `shared/validate.ts` holds the request-field rules, and `http/http.ts` holds `pathId` /
    `queryInt` beside `readJsonObject`.
  - Lines 15-17: `internal/` holds the translator, which casts a body onto its request DTO.
  - Lines 24-30: the controller reads the request with `pathId`, `queryInt` and `readJsonObject`
    and runs `body → translateTo<X>Dto → <X>Dto → facade → row → to<X> → DTO`, and the facade runs
    `validate → <X>Dto → from<X> → <Entity>Input → repository`. The translator only casts, so a DTO
    is unchecked until the facade has validated and normalised it, which happens before anything
    touches the database. The mapper renames.
  - Line 34: the `from*` mappers are called by the facade.
  - Lines 63-67: the `overrides` block holds three rules, including the one exempting
    `*.translator.ts` from `no-unsafe-type-assertion`, since casting is a translator's whole job.
  - Line 67: the facades are no longer pure delegation. They validate and map requests with their
    own private methods, and composition across facades stays in the controller.
  - Lines 71-72: the facades take request DTOs and publish rows.
  - Line 75: `seed.ts` calls the facades with camelCase DTOs and so is validated like the API.
  - Lines 84-85: controllers throw through the facades' validation, not through the translators
    and validators.
  - Lines 123-128: change "four exceptions" to "seven exceptions" and add `shared/validate.test.ts`
    and the two `*.facade.test.ts` files.
- [ ] `AGENTS.md` lines 31-35: the translator casts a body onto its request DTO, and the facade
      validates that DTO before handing it to the repository.

**Automated Verification**:

- [ ] `bun test src/backend/features/workouts` passes, including the new facade tests, the
      `validates the body before looking up the set` route test, and the existing bad-date,
      `copyFromWorkoutId: 'nope'`, `reps: 0` and unknown-`exerciseId` route tests
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `$env:GAINZ_DB = ':memory:'; bun run seed; Remove-Item Env:GAINZ_DB` completes and prints the
      seeded counts
- [ ] `git grep -n "shared/validate" -- "src/backend/features/*.translator.ts"` finds nothing
- [ ] `git grep -nE "shared/validate|mapper" -- "src/backend/features/*.controller.ts"` finds nothing

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-12-data-validation.md`
- `src/backend/shared/validate.ts`
- `src/backend/features/exercises/exercises.facade.ts`
- `src/backend/features/workouts/workouts.facade.ts`
- `src/backend/features/*/internal/*.translator.ts`, `*.mapper.ts`, `*.controller.ts`
- `src/scripts/seed.ts`
- `.oxlintrc.json`
- `docs/backend.md`, `AGENTS.md`
