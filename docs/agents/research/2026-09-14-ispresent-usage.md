---
date: 2026-09-14T17:07:29.864155+00:00
git_commit: ae984fde4cdf27815335fa25af2564a75ad2fd1a
branch: main
topic: "How isPresent() in src/backend/shared/validate.ts is used"
tags: [research, codebase, validate, facades, translators, buildUpdate, partial-update]
status: complete
---

# Research: How isPresent() in src/backend/shared/validate.ts is used

## Research Question

How is `isPresent()` in `src/backend/shared/validate.ts` used?

## Summary

`isPresent(dto, field)` returns `true` when `field` is an own property of `dto` **and** its value is
not `undefined` (`validate.ts:10-13`). Its only production callers are the private `validateCreate`
and `validateEdit` methods of the three facades: `WorkoutFacade`, `SetFacade`
(`workouts.facade.ts`) and `ExerciseFacade` (`exercises.facade.ts`), 14 calls in total. No route,
controller, translator or repository imports it, and the lint config forbids `*.routes.ts` from
importing `validate.ts` at all (`.oxlintrc.json:145`).

The facades use it in two ways:

- **Optional create fields.** A conditional spread
  `...(isPresent(dto, f) ? { f: required*(dto, f) } : {})` validates a field only when the caller
  sent one, and otherwise leaves the key out of the validated DTO.
- **Every edit field.** An `if (isPresent(dto, f)) { valid.f = … }` block starts from `{}` and adds a
  key only for fields the caller sent.

After validation, the DTO-to-input translators check presence with `!== undefined`, and
`buildUpdate` checks with `in`. So "was this field sent?" is asked three times along the write path,
with three different expressions.

The DTOs that reach the facades over HTTP come from `translateTo*Dto`, which writes **every** key
whether or not the body had it (`body.x as …`). For those objects the own-property half of
`isPresent` is always true, and the `value !== undefined` half decides. The own-property half
matters only when a facade receives a DTO literal that omits keys, which is what the facade tests
do (`exercises.facade.test.ts:34`, `workouts.facade.test.ts:71`).

```
src/
├── backend/
│   ├── shared/
│   │   ├── validate.ts                 isPresent (:10-13) + required*/optionalString
│   │   └── validate.test.ts            isPresent test (:65-70)
│   ├── http/http.ts                    readJsonObject (:20-31)
│   ├── db/sql.ts                       buildUpdate — `field in patch` (:30-51)
│   └── features/
│       ├── exercises/
│       │   ├── exercises.facade.ts     ExerciseFacade.validateEdit — 3 calls (:56-64)
│       │   ├── exercises.facade.test.ts
│       │   └── internal/exercise.translator.ts   translateTo*Dto (:4-18), translateDtoToEdit (:28-40)
│       └── workouts/
│           ├── workouts.facade.ts      WorkoutFacade (:46,49,55-63), SetFacade (:102,108-122) — 11 calls
│           ├── workouts.facade.test.ts
│           └── internal/
│               ├── workout.translator.ts   translateTo*Dto (:6-21), translateDtoToEdit (:37-49)
│               └── set.translator.ts       translateTo*Dto (:5-23), translateDtoToEdit (:35-53)
└── shared/dto/                          Create*/Edit*Dto — optional `?` fields
    ├── exercise.ts  workout.ts  set.ts
```

## Detailed Findings

### The function

```ts
export function isPresent<T extends object>(dto: T, field: keyof T & string): boolean {
  const value: unknown = dto[field];
  return Object.prototype.hasOwnProperty.call(dto, field) && value !== undefined;
}
```

- `src/backend/shared/validate.ts:10-13`. `field` is typed `keyof T & string`, so a call site can
  only name a key the DTO type declares. The same signature is shared by `requiredString`,
  `optionalString`, `requiredInt`, `requiredNumber` and `requiredDate` in the same file.
- `null` counts as present and `undefined` counts as absent. `validate.test.ts:65-70` asserts exactly
  those two cases, and is the only direct test of the function.
- The function has no doc comment. Its neighbour `optionalString` (`:27-44`) treats `undefined` and
  `null` alike, as `null`, while `isPresent` separates them.

### Where the DTO comes from

```
PATCH/POST body ──► readJsonObject (http.ts:20)     Record<string, unknown>, JSON only (no undefined values)
                └─► translateTo<Create|Edit>*Dto    every DTO key written: `x: body.x as T | undefined`
                        └─► <Facade>.create/update(dto)
                                └─► validateCreate/validateEdit   ◄── isPresent(dto, f)
                                        └─► translateDtoTo<Create|Edit>*   `dto.f !== undefined`
                                                └─► repository.update(id, patch)
                                                        └─► buildUpdate(table, FIELDS, patch)   `f in patch`
```

- Controllers build DTOs via `translateToEditSetDto` (`set.controller.ts:17`),
  `translateToCreateWorkoutDto` / `translateToEditWorkoutDto` / `translateToCreateSetDto`
  (`workout.controller.ts:24,35,52`) and `translateToCreateExerciseDto` / `translateToEditExerciseDto`
  (`exercise.controller.ts:16,26`).
- Those translators list every DTO field explicitly (for example `exercise.translator.ts:12-18`), so
  a key missing from the JSON body shows up on the DTO as an own property whose value is `undefined`.
  JSON cannot encode `undefined`, so over HTTP the value seen for a field is either `undefined`
  (not sent) or an actual JSON value, including `null`.

### Call sites: create (conditional spread)

| Location | Field | Validator when present | When absent |
| --- | --- | --- | --- |
| `workouts.facade.ts:46` | `performedOn` | `requiredDate` | key omitted, so `translateDtoToCreateWorkout` falls back to `today()` (`workout.translator.ts:31`) |
| `workouts.facade.ts:49` | `copyFromWorkoutId` | `requiredInt({ min: 1 })` | key omitted, so `valid.copyFromWorkoutId` is `undefined` and goes to the repository as `{ copyFrom: undefined }` (`:33`), which `workout.repository.ts:61,75` test with `!== undefined` |
| `workouts.facade.ts:102` | `position` (set) | `requiredInt({ min: 0 })` | key omitted, so `translateDtoToCreateSet` spreads no `position` (`set.translator.ts:31`) and the set is appended (`workouts.facade.test.ts:52-58`) |

The other create fields don't go through `isPresent`: they always go through a validator.
`optionalString` handles `title`, `notes` and `muscleGroup`, and `required*` handles `name`,
`exerciseId`, `reps` and `weight` (`workouts.facade.ts:47-48,98-101`, `exercises.facade.ts:48-50`).

Because `null` counts as present, a create body with `performedOn: null`, `copyFromWorkoutId: null`
or `position: null` reaches `requiredDate` / `requiredInt`, which throw `badRequest`
(`validate.ts:17-18,53-54`).

### Call sites: edit (`if` per field)

| Facade method | Fields guarded | Validators |
| --- | --- | --- |
| `WorkoutFacade.validateEdit` (`workouts.facade.ts:53-65`) | `performedOn`, `title`, `notes` | `requiredDate`, `optionalString(MAX_NAME)`, `optionalString(MAX_NOTES)` |
| `SetFacade.validateEdit` (`workouts.facade.ts:106-124`) | `exerciseId`, `reps`, `weight`, `notes`, `position` | `requiredInt({min:1})`, `requiredInt({min:1,max:1000})`, `requiredNumber({min:0,max:100000})`, `optionalString(MAX_NOTES)`, `requiredInt({min:0})` |
| `ExerciseFacade.validateEdit` (`exercises.facade.ts:54-66`) | `name`, `muscleGroup`, `notes` | `requiredString(MAX_NAME)`, `optionalString(60)`, `optionalString(MAX_NOTES)` |

Every field of every `Edit*Dto` (`src/shared/dto/workout.ts:53-57`, `set.ts:35-41`,
`exercise.ts:51-55`) is guarded, so each `validateEdit` covers its whole DTO. Each method starts from
`const valid: Edit*Dto = {}` and returns only the keys that passed `isPresent`.

What a present field does next depends on its validator:

- **`optionalString` fields** (`title`, `notes`, `muscleGroup`): a present `null` or blank string
  becomes `null`. The translator copies it because `null !== undefined`. `buildUpdate` sees the key
  via `in` and binds `null`, which clears the column. This is exercised by
  `exercises.facade.test.ts:31-35` (`{ notes: null }`) and `workouts.facade.test.ts:67-72`
  (`{ notes: '' }`).
- **`required*` fields** (`performedOn`, `name`, `exerciseId`, `reps`, `weight`, `position`): a
  present `null`, blank or invalid value makes the validator throw, before the repository is asked
  for the row. This is exercised by `exercises.facade.test.ts:43-46`,
  `workouts.facade.test.ts:45-48` and `set.routes.test.ts:31-33` ("validates the body before looking
  up the …").
- **Absent fields**: the key never reaches `valid`, the translator never writes it to `patch`, and
  `buildUpdate` leaves the column out of the `SET` list (`sql.ts:34-45`). A patch with no keys makes
  `buildUpdate` return `null` (`sql.ts:47-49`).

### Downstream presence checks

- **Translators.** `translateDtoToEditWorkout` (`workout.translator.ts:37-49`),
  `translateDtoToEditSet` (`set.translator.ts:35-53`) and `translateDtoToEditExercise`
  (`exercise.translator.ts:28-40`) copy a field when `dto.f !== undefined`, renaming camelCase DTO
  keys to snake_case columns (`performedOn → performed_on`, `exerciseId → exercise_id`,
  `muscleGroup → muscle_group`). They receive the facade's `valid` object, whose keys are exactly
  the ones `isPresent` let through.
- **`buildUpdate`** (`src/backend/db/sql.ts:22-51`). This walks the repository's hard-coded `FIELDS`
  tuple and includes a column when `field in patch`. Its doc comment gives the reason:
  "Membership is tested with `in` rather than `!== undefined`, so an explicitly-null field still
  clears the column." Its callers are `workout.repository.ts:92`, `set.repository.ts:92` and
  `exercise.repository.ts:75`.
- **`copyFrom`.** `workout.repository.ts:61,75` check `copyFrom !== undefined`, which is the
  downstream end of the `isPresent` guard at `workouts.facade.ts:49`.

### Tests touching isPresent behaviour

| Test | Covers |
| --- | --- |
| `validate.test.ts:65-70` | `undefined` is absent, `null` is present |
| `exercises.facade.test.ts:31-35` | present `null` clears `notes`, absent `name` is kept |
| `exercises.facade.test.ts:37-46` | present blank `name` gives 400, including before lookup |
| `workouts.facade.test.ts:26-29` | absent `performedOn` on create means today |
| `workouts.facade.test.ts:31-34` | present bad `performedOn` on create gives 400 |
| `workouts.facade.test.ts:36-43` | present `copyFromWorkoutId` copies sets |
| `workouts.facade.test.ts:45-48` | present bad `performedOn` on update gives 400 before lookup |
| `workouts.facade.test.ts:52-58` | absent `position` on set create appends |
| `workouts.facade.test.ts:67-72` | present blank `notes` on set update clears it, absent `reps` is kept |
| `set.routes.test.ts:15-16,28,31-33` | PATCH over HTTP with partial bodies |
| `exercise.routes.test.ts:33-35` | PATCH `muscleGroup` only, `name` kept |

The facade tests pass DTO literals that omit keys (`{ notes: null }`), so there the own-property
check is what returns `false`. The route tests go through `translateTo*Dto`, which always writes the
key, so there the `undefined` check is what returns `false`.

## Code References

- `src/backend/shared/validate.ts:10-13` - `isPresent` definition
- `src/backend/shared/validate.ts:27-44` - `optionalString`, which folds `undefined` / `null` / blank into `null`
- `src/backend/shared/validate.test.ts:65-70` - the only direct `isPresent` test
- `src/backend/features/workouts/workouts.facade.ts:44-51` - `WorkoutFacade.validateCreate` (2 calls)
- `src/backend/features/workouts/workouts.facade.ts:53-65` - `WorkoutFacade.validateEdit` (3 calls)
- `src/backend/features/workouts/workouts.facade.ts:96-104` - `SetFacade.validateCreate` (1 call)
- `src/backend/features/workouts/workouts.facade.ts:106-124` - `SetFacade.validateEdit` (5 calls)
- `src/backend/features/exercises/exercises.facade.ts:54-66` - `ExerciseFacade.validateEdit` (3 calls)
- `src/backend/features/*/internal/*.translator.ts` - `translateTo*Dto` (writes every key) and `translateDtoToEdit*` (`!== undefined`)
- `src/backend/http/http.ts:20-31` - `readJsonObject`
- `src/backend/db/sql.ts:22-51` - `buildUpdate`, `in` membership
- `src/backend/features/workouts/internal/workout.repository.ts:61,75` - `copyFrom !== undefined`
- `.oxlintrc.json:129-153` - routes may not import `shared/validate.ts`

## Architecture Documentation

- **Partial updates are carried by key presence.** A PATCH field that isn't sent never becomes a key
  on the validated DTO, the repository input, or the `SET` list. A field sent as `null` stays a key
  all the way down and is written as SQL `NULL`. `docs/backend.md:32-34,91-92` describe the
  `validate → DTO → translateDtoTo… → repository` order and the facades' private
  `validateCreate` / `validateEdit`.
- **Validation lives in the facades.** Before `docs/agents/plans/2026-09-12-validation-in-facades.md`,
  the `isPresent` calls sat in the translators, which is where
  `docs/agents/research/2026-09-12-data-validation.md` and
  `docs/agents/research/2026-09-12-handler-construction-and-data-flow.md` record them (as of their
  commits).
- **Two call shapes.** Create methods return one object literal and use conditional spreads for
  optional non-string fields. Edit methods mutate an empty `valid` object with one `if` per field.

## Open Questions

None for the question as asked.
