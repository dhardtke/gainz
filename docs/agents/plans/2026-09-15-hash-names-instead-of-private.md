---
date: 2026-09-15T21:05:37.415011+00:00
git_commit: 0d1744d67ceb7c5d02c1207a207ca96cc613f39b
branch: main
topic: 'Use # names instead of the private modifier'
tags: [plan, typescript, oxlint, backend, frontend, coding-guidelines]
status: ready
---

# PLAN: Use # names instead of the private modifier

Make ECMAScript `#` names the only way to declare a private class member, replacing every
TypeScript `private` modifier, and have `bun run lint` enforce as much of that as built-in rules
allow.

The components already use `#` throughout; `private` survives only in backend classes and the
three frontend facades, mostly as `constructor(private readonly x: X)` parameter properties. `#`
is private at runtime rather than only to the type checker, and a `#` name can never collide with
an inherited member — converting the components the other way was tried during planning and
failed `tsc` on exactly that (`get #id()` against `HTMLElement.id`, `#stopThemeSync` in both
`GzElement` and `GzThemeToggleComponent`, `#series` against the public `series` setter).

## Acceptance Criteria

- No `private` modifier remains in `src/`: the 19 private parameter properties become
  `readonly #name` fields assigned in the constructor, and the 7 private methods become `#name`.
- The 3 public parameter properties (`HttpError.status`, `HttpError.details`, `RawHtml.value`)
  become explicit public `readonly` class fields, with behaviour unchanged.
- `.oxlintrc.json` sets `typescript/parameter-properties` to `"prefer": "class-property"`, so
  `bun run lint` rejects any new parameter property, private or not.
- No custom lint rule or source-scanning test is added; a new `private` method is caught in
  review.
- `docs/coding-guidelines.md` states the rule (use `#`, never `private`), why, and which part of
  it lint enforces. `docs/backend.md` names `#validateCreate` / `#validateEdit`.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test` pass.

## Technical Key Decisions and Tradeoffs

1. **Direction:** ECMAScript `#` names, not the TypeScript `private` modifier.
   - Why: all 13 components already use `#`; `#` is enforced at runtime and cannot clash with
     `HTMLElement` or base-class members.
   - Impact: only backend classes and the frontend facades change; components are untouched.
2. **Enforcement:** built-in rules only — `typescript/parameter-properties` flipped to
   `"prefer": "class-property"`.
   - Why: oxlint has no rule banning `private` (`explicit-member-accessibility` can only require
     modifiers, and `no-restricted-syntax` does not exist in oxlint), and a custom JS plugin rule
     was ruled out. `erasableSyntaxOnly` bans parameter properties but still allows `private`.
   - Impact: `#` cannot be a parameter property, so every affected constructor gains an explicit
     field and an assignment. Lint catches a new `private` parameter property but not a new
     `private` method or field declared in the class body; the guideline covers those.
3. **Public parameter properties:** converted too.
   - Why: the flipped rule reports every parameter property regardless of accessibility.
   - Impact: `HttpError` and `RawHtml` spell out their fields; their public API is unchanged.
4. **Migration:** the rule change and every conversion land together.
   - Why: `bun run lint` is never red on `main`.
   - Impact: a single phase.

## Current State

```
private parameter properties (19)          private methods (7)
  backend                                    backend
    exercises.facade.ts        exercises       exercises.facade.ts   validateCreate, validateEdit
    workouts.facade.ts         workouts, sets  workouts.facade.ts    validateCreate, validateEdit ×2
    stats.facade.ts            stats           (WorkoutFacade and SetFacade)
    exercise.repository.ts     db              static.controller.ts  module
    workout.repository.ts      db
    set.repository.ts          db, workouts  public parameter properties (3)
    stats.repository.ts        db              backend/http/errors.ts  HttpError.status, .details
    exercise.controller.ts     exercises       frontend/ui/html.ts     RawHtml.value
    workout.controller.ts      workouts, sets
    set.controller.ts          sets
    stats.controller.ts        stats
  frontend
    exercises.facade.ts        api
    workouts.facade.ts         api; workouts, sets
    stats.facade.ts            api

# names: every GzElement component and ui/base.ts — already in the target style
```

`.oxlintrc.json` sets `typescript/parameter-properties` to `"prefer": "parameter-property"`, which
is what made the parameter-property form the house style. `no-unused-private-class-members` is
active (as a warning, from oxlint's default correctness category) and already covers `#` names.

Verified during planning against commit `0d1744d`: running oxlint with the option flipped to
`class-property` reports exactly the 22 parameter properties above and nothing else. No test
reaches a private member by bracket access or spies on one, so nothing depends on `private` being
a soft boundary.

## Desired End State

```ts
export class SetRepository {
  readonly #db: DB;

  readonly #workouts: WorkoutRepository;

  /** …existing doc comment… */
  constructor(db: DB, workouts: WorkoutRepository) {
    this.#db = db;
    this.#workouts = workouts;
  }

  list(workoutId: WorkoutId): LiftSet[] {
    return this.#db.query<LiftSet, [WorkoutId]>(…);
  }
}

export class ExerciseFacade {
  …
  create(dto: CreateExerciseDto): ExerciseDto {
    return this.#exercises.create(translateDtoToCreateExercise(this.#validateCreate(dto)));
  }

  #validateCreate(dto: CreateExerciseDto): CreateExerciseDto { … }
}

export class HttpError extends Error {
  readonly status: number;

  readonly details: unknown;

  constructor(status: number, message: string, details?: unknown) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.details = details;
  }
}

export class RawHtml {
  readonly value: string;

  constructor(value: string) {
    this.value = value;
  }
}
```

`.oxlintrc.json`:

```json
"typescript/parameter-properties": [
  "error",
  {
    "prefer": "class-property"
  }
],
```

Field blocks follow the components' existing spacing (a blank line between fields). A class whose
constructor previously had a doc comment keeps it above the constructor.

## Abstractions and Code Reuse

No new abstractions: a lint option, a mechanical rewrite of existing members, and documentation.

- `.oxlintrc.json` - `typescript/parameter-properties` → `"prefer": "class-property"`
- `src/backend/http/errors.ts` - `HttpError`: `status`, `details` become public `readonly` fields
- `src/backend/features/exercises/`
  - `exercises.facade.ts` - `ExerciseFacade`: `#exercises`; `#validateCreate`, `#validateEdit`
  - `internal/exercise.repository.ts` - `ExerciseRepository`: `#db`
  - `internal/exercise.controller.ts` - `ExerciseController`: `#exercises`
- `src/backend/features/workouts/`
  - `workouts.facade.ts` - `WorkoutFacade`: `#workouts`; `SetFacade`: `#sets`; both
    `#validateCreate`, `#validateEdit`
  - `internal/workout.repository.ts` - `WorkoutRepository`: `#db`
  - `internal/set.repository.ts` - `SetRepository`: `#db`, `#workouts`
  - `internal/workout.controller.ts` - `WorkoutController`: `#workouts`, `#sets`
  - `internal/set.controller.ts` - `SetController`: `#sets`
- `src/backend/features/stats/`
  - `stats.facade.ts` - `StatsFacade`: `#stats`
  - `internal/stats.repository.ts` - `StatsRepository`: `#db`
  - `internal/stats.controller.ts` - `StatsController`: `#stats`
- `src/backend/features/static/internal/static.controller.ts` - `StaticController`: `#module`
- `src/frontend/ui/html.ts` - `RawHtml`: `value` becomes a public `readonly` field
- `src/frontend/features/`
  - `exercises/exercises.facade.ts` - `ExerciseFacade`: `#api`
  - `workouts/workouts.facade.ts` - `WorkoutFacade`: `#api`; `SetFacade`: `#workouts`, `#sets`
  - `stats/stats.facade.ts` - `StatsFacade`: `#api`
- `docs/coding-guidelines.md` - new paragraph stating the rule
- `docs/backend.md` - line 101 names `#validateCreate` / `#validateEdit`

Class names above are as read from the files at planning time; the lint and compiler output is the
authority if a name differs.

## Logging & Observability

None.

## Implementation

Dependencies: None.

Flip the rule, convert every `private` and parameter property, and record the convention.

**Tasks**:

- [ ] `.oxlintrc.json`: change `typescript/parameter-properties` to `"prefer": "class-property"`.
- [ ] Run `bun run lint` and confirm it reports exactly the 22 `parameter-properties` errors listed
      under Current State, and no other new errors.
- [ ] `src/backend/http/errors.ts` and `src/frontend/ui/html.ts`: replace the public parameter
      properties with public `readonly` fields assigned in the constructor. In `HttpError`, assign
      the fields after `super(message)`.
- [ ] `src/backend/features/exercises/`: in `exercises.facade.ts`,
      `internal/exercise.repository.ts` and `internal/exercise.controller.ts`, replace each
      `private readonly` parameter property with a `readonly #name` field assigned in the
      constructor, rename `validateCreate` / `validateEdit` to `#validateCreate` /
      `#validateEdit`, and update every `this.name` use to `this.#name`.
- [ ] `src/backend/features/workouts/`: the same in `workouts.facade.ts` (both classes),
      `internal/workout.repository.ts`, `internal/set.repository.ts` (keeping the constructor doc
      comment), `internal/workout.controller.ts` and `internal/set.controller.ts`.
- [ ] `src/backend/features/stats/`: the same in `stats.facade.ts`,
      `internal/stats.repository.ts` and `internal/stats.controller.ts`.
- [ ] `src/backend/features/static/internal/static.controller.ts`: `private async module` →
      `async #module`, and `this.module(candidate)` → `this.#module(candidate)`.
- [ ] `src/frontend/features/`: the same parameter-property conversion in
      `exercises/exercises.facade.ts`, `workouts/workouts.facade.ts` (both classes) and
      `stats/stats.facade.ts`.
- [ ] `docs/coding-guidelines.md`: after the `override` paragraph, add a paragraph along the lines
      of: "Private class members use `#` names, never TypeScript's `private` modifier. A `#` name
      is private at runtime as well as to the compiler, and it cannot collide with a member a
      class inherits — which matters for components, whose base is `HTMLElement`. Since a `#`
      name cannot be a parameter property, `bun run lint` bans parameter properties altogether
      (`typescript/parameter-properties`); a `private` method or field in a class body is not
      caught by any rule."
- [ ] `docs/backend.md:101`: "the facade's own private `validateCreate` / `validateEdit` methods"
      → "the facade's own `#validateCreate` / `#validateEdit` methods".

**Automated Verification**:

- [ ] `bun run lint` passes.
- [ ] `bun run typecheck` passes.
- [ ] `bun run fmt:check` passes.
- [ ] `bun test` passes, including the backend route tests that exercise every controller,
      facade and repository, and `src/backend/features/static/static.routes.test.ts` for
      `#module`.
- [ ] `(Get-ChildItem src -Recurse -Filter *.ts | Select-String '\bprivate\s').Count` is 1 — the
      prose comment in `src/backend/features/exercises/internal/exercise.translator.ts`.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `.oxlintrc.json` - `typescript/parameter-properties`
- typescript-eslint `parameter-properties`: https://typescript-eslint.io/rules/parameter-properties/
- MDN, private elements: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Classes/Private_elements
- `src/frontend/ui/base.ts` - `GzElement`, the `HTMLElement` subclass whose components already use `#`
- `docs/coding-guidelines.md` - where the rule is recorded
- `docs/agents/plans/2026-09-15-enforce-override-modifier.md` - the preceding convention change
