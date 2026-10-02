---
date: 2026-10-02T11:39:44.167920+00:00
git_commit: 3102860ae44a991eb40a008d0c33f3d3ff765665
branch: main
topic: 'Group sets by exercise'
tags: [plan, workouts, sets, workout-exercises, gz-workout-detail, gz-set-row, accordion, migration]
status: ready
---

# PLAN: Group sets by exercise

Show a workout's sets grouped by exercise in Oat's accordion, one exercise open at a time. Clicking
an exercise's header toggles it, and an "Exercise" link button in the header opens the exercise page,
which is what clicking the exercise name in a set row does today. The order of the exercises is
stored in a new `workout_exercises` table and changed by moving a whole exercise up or down. Sets no
longer move, and a set's exercise can no longer be changed once it is saved.

## Acceptance Criteria

- The workout page lists its sets grouped by exercise in Oat's accordion (native
  `<details name="exercises">`). At most one exercise is open at a time, and all may be collapsed.
- Clicking an exercise's header (`<summary>`) toggles it. Clicks on the header's ▲▼ and "Exercise"
  never toggle it, and neither does a click on a disabled arrow.
- The "Exercise" button is a link (`<a class="button outline" href="/exercises/:id">`): `gz-app`
  routes it, and Ctrl-click opens a tab.
- The header shows the exercise name, one outline badge `N sets · x/y done · <volume>` (or
  `N sets · ✓ Done · <volume>` once every set of that exercise is done), the ▲▼ pair and "Exercise".
- ▲ is disabled on the first exercise and ▼ on the last. Moving an exercise reorders the groups, and
  focus returns to the same arrow on the moved exercise, or the other one once it is at that edge.
- Which exercise is open:
  - first load: the exercise of the first set not done (in group order), otherwise the last exercise;
  - after ✓, +1, Edit/Save, × on a set: unchanged;
  - after "Log set": the logged set's exercise, including a newly created one;
  - after moving an exercise: unchanged;
  - if the open exercise loses its last set: all collapsed;
  - a user may collapse the open exercise, leaving all collapsed.
- A set row no longer shows the exercise name or ▲▼; its number counts within its exercise (1, 2, 3).
- A set's edit form has reps, weight and notes only. `exerciseId` is gone from `EditSetDto`, and a
  PATCH carrying it is ignored like any unknown key.
- `POST /api/sets/:id/move`, `MoveSetDto`, `SetDirection`, `SetRepository.move` and the
  `set-moved` event are gone.
- A `workout_exercises (workout_id, exercise_id, position)` table holds each workout's exercise
  order. Migration `003-workout-exercises.sql` creates it and backfills it from existing sets in
  first-appearance order (`position, id`).
- Logging the first set of an exercise in a workout appends a `workout_exercises` row, and deleting
  the last one removes it, each in the same transaction as the set write. "Repeat" copies the rows;
  deleting a workout cascades.
- `POST /api/workouts/:id/exercises/:exerciseId/move { "direction": "up" | "down" }` swaps the
  exercise with its neighbor in one transaction, renumbers the workout's exercises 1..n, and answers
  `200` with the `WorkoutWithExercisesDto`. An edge move is a 200 with the order unchanged. An
  unknown workout is a 404, an exercise not in the workout is a 404, a non-numeric id is a 400, and
  a missing or invalid direction is a 400.
- `GET /api/workouts/:id` and `POST /api/workouts` answer `WorkoutWithExercisesDto { …WorkoutDto,
  exercises: WorkoutExerciseDto[], done }`. `WorkoutWithSetsDto` and its flat `sets` are gone.
- `docs/backend.md` and `docs/frontend.md` describe all of the above.

## Technical Key Decisions and Tradeoffs

1. **An explicit order table, `workout_exercises`:** primary key `(workout_id, exercise_id)`,
   `position INTEGER NOT NULL`, `workout_id … ON DELETE CASCADE`, `exercise_id … ON DELETE RESTRICT`.
   - Why: the user chose to store the order rather than derive it from set positions.
   - Impact: a new `WorkoutExerciseRepository` in `workouts/internal/`, built in
     `createWorkoutFacades` and injected into `SetRepository` (which keeps it in sync) and
     `WorkoutFacade` (which lists and moves). `WorkoutRepository.create` copies the rows for
     "Repeat" with one more statement in its existing transaction.
2. **A set's exercise is fixed once it is saved:** `exerciseId` leaves `EditSetDto`,
   `translateToEditSetDto`, `translateDtoToEditSet`, `SetFacade.#validateEdit`, `EditSet` and the
   repository's `FIELDS`.
   - Why: user decision. A set can then never change groups, so only creating a set, deleting a
     set, "Repeat" and deleting a workout touch `workout_exercises`.
   - Impact: `EditSet` becomes its own written-out type (`reps`, `weight`, `notes`, `done`) instead
     of `Partial<CreateSet>`, and the FK-violation branch in `SetRepository.update` goes away. The
     row's edit form drops its select, and `gz-set-row` no longer needs `exercises`.
3. **An exercise without sets disappears from the workout:** `SetRepository.delete` removes the
   `workout_exercises` row when it deletes that exercise's last set in the workout.
   - Why: user decision. The table then holds exactly the exercises that have sets, so every
     accordion item has at least one set and no empty-group UI is needed.
   - Impact: set create and set delete each run in `db.transaction()`. A new exercise appends at
     `MAX(position) + 1`.
4. **Set moving is removed entirely:** the endpoint, `SetRepository.move`, the facades' `move`,
   `SetApi.move`, `MoveSetDto`, `SetDirection`, the row's ▲▼, `last`, `focusMove` and `set-moved`.
   - Why: user decision. Within an exercise, sets stay in the order they were logged (`position, id`).
   - Impact: `sets.position` remains, written only on create and copied by "Repeat".
     `requiredOneOf` stays, now used by the exercise move.
5. **The exercise move lives on the workout:** `POST /api/workouts/:id/exercises/:exerciseId/move`
   with `MoveWorkoutExerciseDto { direction: MoveDirection }`, in `workout.routes.ts` because the URL
   starts with `/api/workouts`. It answers the whole `WorkoutWithExercisesDto`.
   - Why: the exercise's place belongs to the workout. Answering with the whole workout matches
     what the view reloads anyway.
   - Impact: `WorkoutExerciseRepository.move(workoutId, exerciseId, direction)` mirrors the removed
     `SetRepository.move` (read ids in `position, exercise_id` order, splice, renumber 1..n) inside
     one transaction. The repository keeps its own `MoveDirection = 'up' | 'down'` so it does not
     import the wire type. Validation runs first, so a bad direction on an unknown workout is a 400.
6. **Grouped wire shape:** `WorkoutWithExercisesDto { …WorkoutDto, exercises: WorkoutExerciseDto[],
   done }` with `WorkoutExerciseDto { exerciseId, exerciseName, position, sets }`, where `sets` is in
   `position, id` order.
   - Why: user decision. The wire says what the screen shows.
   - Impact: `translateToWorkoutWithExercisesDto(workout, exercises, sets)` groups the flat set list
     under the exercise rows. The add-set form and the "Repeat" toast flatten it with
     `exercises.flatMap((group) => group.sets)`. `GET /api/workouts/:id/sets` keeps answering the flat
     `LiftSetDto[]`.
7. **The accordion is Oat's `<details>`/`<summary>`, rendered in `gz-workout-detail`'s own shadow
   root:** no per-exercise component.
   - Why: Oat already styles it (`node_modules/@knadh/oat/css/accordion.css`: joined borders,
     hover, chevron), and `name` exclusivity only groups `<details>` in one tree.
   - Impact: the view keeps `#openExerciseId: ExerciseId | null | undefined`, where `undefined`
     means "not decided yet; use the first-load rule". A `toggle` listener on each `<details>`
     (`toggle` does not bubble) records the open one and clears the id when that one closes. The
     header's ▲▼ are the view's own `data-action`s, so no event is needed for them.
8. **Header controls inside `<summary>`, in a `<span class="actions">`** (a `<summary>` takes only
   phrasing content, so not a `<div>`): a click on an `<a>` or an enabled `<button>` activates
   that element, not the summary, so it does not toggle. A click listener on each header's `.actions`
   also calls `preventDefault()` unless the click came through an `<a>`, which covers disabled
   arrows and the gaps between buttons.
   - Why: preventing the default on the link would make `gz-app`'s `linkPath` treat the click as
     handled elsewhere (`router.ts:85`) and stop routing it.
   - Tradeoff, accepted by the user: buttons inside `<summary>` are nested interactive content,
     which some screen readers announce awkwardly. Oat's `fieldset.group` for ▲▼ (phase 3) is
     likewise not phrasing content; browsers render it fine, and it is kept for Oat's joined look.
9. **`set-logged` carries `{ exerciseId }`:** `gz-add-set-form` emits the id the set was logged
   against (the created exercise's id for a new exercise), and the view opens it before reloading.
   The view checks the detail with a small `isSetLogged` type guard, the way it checks `set-moved` today.

## Current State

```
gz-workout-detail ── <div class="sets"> ── <gz-set-row data-id data-index data-last> × every set
        ▲                                     │ toggle-done / edit / duplicate / delete / move-up|down
        │                                     ▼
        ├── 'sets-changed' → reload ── setFacade ─> PATCH / POST / DELETE /api/sets/:id
        └── 'set-moved' {id, direction} → reload → row.focusMove()     POST /api/sets/:id/move

GET /api/workouts/:id ─> WorkoutWithSetsDto { …, sets: LiftSetDto[] (position, id order), done }
tables: exercises ──< sets >── workouts      (no exercise order besides set positions)
```

```
Sets
[✓]  1  Bench Press   80 kg × 5   felt heavy   400  [▲̶|▼] [+1]
[ ]  2  Bench Press   82.5 kg × 5              413  [▲|▼]  [Edit] [+1] [×]
[ ]  3  Back Squat    100 kg × 5               500  [▲|▼̶]  [Edit] [+1] [×]
             └ <a href="/exercises/:id">

Edit form: [Exercise ▾] [Reps] [Weight] [Notes] [Save] [Cancel]
```

- `gz-workout-detail.component.ts:197-208` renders one flat list. `afterRender` (`:102-126`) hands
  each row `exercises`, `index`, `last` and `set`.
- `gz-set-row.component.ts:144-171` edits the exercise through a select. `:193` links the
  exercise name. `:198-201` holds ▲▼.
- `set.repository.ts:122-141` (`move`), `set.routes.ts:14-16`, `set.controller.ts:24-28`,
  `set.translator.ts:25-29`, `workouts.facade.ts:104-107` (backend) and `workouts.facade.ts:54-57`,
  `set.api.ts:10-12` (frontend) implement set moving.
- `workout.repository.ts:80-88` copies sets for "Repeat". `workout.translator.ts:85-91` builds
  `WorkoutWithSetsDto`.

## Desired End State

```
gz-workout-detail
 ├── <details name="exercises" data-exercise-id> × exercises        (Oat accordion)
 │     ├── <summary> name · badge · [▲|▼] (data-action move-exercise-up|down) · <a.button> Exercise
 │     └── <div class="sets"> <gz-set-row data-id data-index> × that exercise's sets
 ├── #openExerciseId ← 'toggle' listeners / first-load rule / set-logged {exerciseId}
 └── move-exercise-* → workoutFacade.moveExercise() → reload → focus same arrow

POST /api/workouts/:id/exercises/:exerciseId/move ─> WorkoutFacade.moveExercise
   ─> WorkoutExerciseRepository.move (one transaction: splice, renumber 1..n)
GET  /api/workouts/:id ─> WorkoutWithExercisesDto { …, exercises: [{ exerciseId, exerciseName, position, sets }], done }

tables: exercises ──< sets >── workouts
        exercises ──< workout_exercises >── workouts   (exists iff the workout has a set of it)
```

```
Sets
┌────────────────────────────────────────────────────────────────────┐
│ Bench Press  [3 sets · 2/3 done · 1,200 kg]  [▲̶|▼] [Exercise]   ˄ │  ← click = toggle
├────────────────────────────────────────────────────────────────────┤
│ [✓] 1  80 kg × 5     felt heavy          400        [+1]           │
│ [✓] 2  82.5 kg × 5                       413        [+1]           │
│ [ ] 3  82.5 kg × 5                       413  [Edit] [+1] [×]      │
├────────────────────────────────────────────────────────────────────┤
│ Back Squat   [2 sets · ✓ Done · 1,000 kg]    [▲|▼̶] [Exercise]   ˅ │  ← collapsed
└────────────────────────────────────────────────────────────────────┘

≤720px:
│ Bench Press                                                    ˄ │
│ [3 sets · 2/3 done · 1,200 kg]                                    │
│ [▲|▼] [Exercise]                                                  │

Edit form: [Reps] [Weight] [Notes] [Save] [Cancel]
```

## Abstractions and Code Reuse

- `src/backend/db/migrations/003-workout-exercises.sql` — new: table and backfill
- `src/shared/dto/set.ts` — drop `exerciseId` from `EditSetDto`; drop `SetDirection`, `MoveSetDto`
- `src/shared/dto/workout.ts` — `WorkoutWithSetsDto` → `WorkoutWithExercisesDto`; new
  `WorkoutExerciseDto`, `MoveDirection`, `MoveWorkoutExerciseDto`
- `src/backend/features/workouts/`
  - `ports/workout-exercise.ts` — new `WorkoutExercise` row (`workout_id`, `exercise_id`,
    `exercise_name`, `position`)
  - `internal/workout-exercise.repository.ts` — new `WorkoutExerciseRepository`: `list`, `append`,
    `removeIfUnused`, `move`, plus its own `MoveDirection`
  - `internal/set.repository.ts` — `EditSet` written out; `FIELDS` without `exercise_id`; `create`
    and `delete` in transactions that keep `workout_exercises` in sync; `move` removed
  - `internal/workout.repository.ts` — `create` also copies `workout_exercises`
  - `internal/set.translator.ts` — drop `exerciseId` from edit translators; drop `translateToMoveSetDto`
  - `internal/workout.translator.ts` — `translateToWorkoutWithExercisesDto`,
    `translateToMoveWorkoutExerciseDto`, `translateToWorkoutExerciseDto`
  - `workouts.facade.ts` — `WorkoutFacade.exercises`, `WorkoutFacade.moveExercise`; `SetFacade.move` removed
  - `internal/workout.controller.ts` — `show`/`create` answer the grouped DTO; new `moveExercise`
  - `internal/set.controller.ts`, `set.routes.ts` — `move` removed
  - `workout.routes.ts` — `/api/workouts/:id/exercises/:exerciseId/move`
  - `workouts.fixtures.ts` — `createWorkout` typed `WorkoutWithExercisesDto`
- `src/frontend/features/workouts/`
  - `internal/workout.api.ts` — grouped types; `moveExercise`
  - `internal/set.api.ts` — `move` removed
  - `workouts.facade.ts` — grouped types; `WorkoutFacade.moveExercise`; `SetFacade.move` removed
  - `internal/gz-set-row.component.ts` + `.css` — no exercise link, select, ▲▼, `last`,
    `focusMove` or `exercises`
  - `internal/gz-add-set-form.component.ts` — `set-logged` detail `{ exerciseId }`
  - `gz-workout-detail.component.ts` + `.css` — accordion, open-state rules, exercise move, focus restore
  - `gz-workout-list.component.ts` — "Repeat" toast counts the flattened sets
  - `workouts.fixtures.ts` — new `group()` fixture building a `WorkoutExerciseDto`

Reused as is: `db.transaction()`, `requiredOneOf`, `pathId`, `json`, `readJsonObject`, `notFound`,
`GzElement.emit`/`handleAction`/`$`/`$$`, `plural`, `formatVolume`, the `useServer`/`useFetch`/
`mount`/`settle`/`collect` test helpers, and the `set()`/`exercise()` fixtures. Oat's accordion,
`a.button`, `fieldset.group` and `.badge` supply all styling; only layout CSS is added.

## Logging & Observability

None. The server has no request logging yet (see `TODO.md`).

## Implementation

### Phase 1: Sets keep their exercise and no longer move

Dependencies: None

Remove the two set features the grouping makes wrong: changing a set's exercise and moving a set.

**Tasks**:

- [x] `src/shared/dto/set.ts`: remove `exerciseId` from `EditSetDto`; remove `SetDirection` and `MoveSetDto`.
- [x] `internal/set.repository.ts`: write `EditSet` out as
      `{ reps?: number; weight?: number; notes?: string | null; done?: 0 | 1 }`; drop
      `'exercise_id'` from `FIELDS`; drop the `try`/`isForeignKeyViolation` around the update in
      `update` (no foreign key is written any more); remove `MoveDirection` and `move`.
- [x] `internal/set.translator.ts`: drop `exerciseId` from `translateToEditSetDto` and
      `translateDtoToEditSet`; remove `translateToMoveSetDto`.
- [x] `workouts.facade.ts` (backend): drop the `exerciseId` branch from `SetFacade.#validateEdit`;
      remove `SetFacade.move`; drop now-unused imports (`requiredOneOf` stays imported only if
      still used; it returns in phase 3).
- [x] `internal/set.controller.ts`: remove `move`. `set.routes.ts`: remove `/api/sets/:id/move`.
- [x] `set.routes.test.ts`: remove `describe('move')` and every other test that calls `/move`;
      replace "rejects a patch naming an exercise that does not exist" (`:24-30`, which expects a
      400 for `PATCH { exerciseId: 4242 }`) with a test that `PATCH { exerciseId: <other>, reps: 6 }`
      answers 200 with `reps: 6` and the original `exerciseId`; add a test that
      `POST /api/sets/:id/move` no longer answers 200.
- [x] `workouts.facade.test.ts` (backend): remove `describe('SetFacade.move')`; add a test that
      `update` with an `exerciseId` keeps the set's exercise.
- [x] `src/frontend/features/workouts/internal/set.api.ts`: remove `move`, its `MoveSetDto` import
      and the now-unused `post` import.
      `workouts.facade.ts` (frontend): remove `SetFacade.move` and the `SetDirection` import.
- [x] `workouts.facade.test.ts` (frontend): remove the `move()` row and the body test.
- [x] `internal/gz-set-row.component.ts`: remove `#last`, `set last`, `focusMove`, the `move-up` /
      `move-down` branch, the ▲▼ `fieldset`, `#exercises`/`set exercises` and the edit form's
      exercise field; `handleSubmit` sends `{ reps, weight, notes }`. Update the class doc comment.
- [x] `internal/gz-set-row.component.css`: remove `.move` and `form.edit .field-exercise` (and the
      `.field-exercise` part of its narrow rule).
- [x] `gz-workout-detail.component.ts`: remove `isSetMoved`, the `set-moved` listener, `data-last`,
      `row.last`, `row.exercises` and the `SetDirection` import. `exercises` stays in the loaded
      data for the add-set form.
- [x] `internal/gz-set-row.component.test.ts`: drop `last` from `mountRow` and the move/focus
      tests; the action lists become `['toggle-done', 'duplicate']` and
      `['toggle-done', 'edit', 'duplicate', 'delete']`; add a test that the edit form has no
      `select` and saving sends exactly `{ reps, weight, notes }`.
- [x] `gz-workout-detail.component.test.ts`: remove the arrow/move tests and their helpers
      (`arrow`, `moveRow`, `movedRow`, and `workoutLoads` if now unused).
- [x] `docs/backend.md`: replace the `position` paragraph (`:160-166`): `position` is server-owned,
      appended on create and copied by "Repeat", and nothing changes it. A set's exercise is fixed
      at creation, and an `exerciseId` in a PATCH is ignored like any unknown key. In the done-lock
      paragraph (`:179-181`), remove the moving sentences.
- [x] `docs/frontend.md`: remove the ▲▼ paragraph (`:79-88`), and say the row's edit form edits
      reps, weight and notes only.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/workouts/set.routes.test.ts` passes
- [x] `bun test --parallel src/backend/features/workouts/workouts.facade.test.ts` passes
- [x] `bun test --parallel src/frontend/features/workouts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

### Phase 2: Group sets by exercise in an accordion

Dependencies: Phase 1

Add the `workout_exercises` table, keep it in sync, answer the grouped DTO, and render it as an
accordion with the "Exercise" button and the open-state rules.

**Tasks**:

- [x] `src/backend/db/migrations/003-workout-exercises.sql`:

  ```sql
  CREATE TABLE workout_exercises (
    workout_id   INTEGER NOT NULL REFERENCES workouts (id)  ON DELETE CASCADE,
    exercise_id  INTEGER NOT NULL REFERENCES exercises (id) ON DELETE RESTRICT,
    position     INTEGER NOT NULL,
    PRIMARY KEY (workout_id, exercise_id)
  );

  -- Each workout's exercises, in the order their first set appears.
  INSERT INTO workout_exercises (workout_id, exercise_id, position)
  SELECT workout_id, exercise_id,
         ROW_NUMBER() OVER (PARTITION BY workout_id ORDER BY MIN(position), MIN(id))
    FROM sets
   GROUP BY workout_id, exercise_id;
  ```

- [x] `src/backend/db/migrations.test.ts`: following the legacy-database test at `:183-197`, run
      the raw `001` SQL, insert a workout with interleaved sets (Row at position 1, Bench at 2, Row
      at 3) and another with none, then `migrate()` (applying `002` and `003` over that data): the
      first workout's rows are Row → 1, Bench → 2, and the second has none.
- [x] `src/backend/db/migrations.test.ts:175-176`: the real migrations now apply `[1, 2, 3]` and
      end at version `3`. `src/backend/db/db.test.ts:18`: `schemaVersion(real)` is `3`.
- [x] `src/shared/dto/workout.ts`: replace `WorkoutWithSetsDto` with

  ```ts
  /** One exercise of a workout, in the workout's order, with its sets. */
  export interface WorkoutExerciseDto {
    exerciseId: ExerciseId;
    exerciseName: string;
    /** 1-based place of the exercise in the workout. */
    position: number;
    /** Oldest first. */
    sets: LiftSetDto[];
  }

  export interface WorkoutWithExercisesDto extends WorkoutDto {
    exercises: WorkoutExerciseDto[];
    /** At least one set, and every one of them done. */
    done: boolean;
  }
  ```

- [x] `ports/workout-exercise.ts`: `WorkoutExercise { workout_id: WorkoutId; exercise_id: ExerciseId;
      exercise_name: string; position: number }`.
- [x] `internal/workout-exercise.repository.ts`: `WorkoutExerciseRepository(db)` with
  - `list(workoutId): WorkoutExercise[]`: joined to `exercises` for the name, `ORDER BY position, exercise_id`
  - `append(workoutId, exerciseId): void`. The `WHERE` is required: without it, SQLite cannot parse
    `ON CONFLICT` after `INSERT … SELECT … FROM` (`near "DO": syntax error`).

    ```sql
    INSERT INTO workout_exercises (workout_id, exercise_id, position)
    SELECT ?1, ?2, COALESCE(MAX(position), 0) + 1 FROM workout_exercises WHERE workout_id = ?1
    ON CONFLICT (workout_id, exercise_id) DO NOTHING
    ```

  - `removeIfUnused(workoutId, exerciseId): void`: `DELETE FROM workout_exercises WHERE workout_id = ?
    AND exercise_id = ? AND NOT EXISTS (SELECT 1 FROM sets WHERE workout_id = ? AND exercise_id = ?)`

  Doc comment: a row exists exactly while the workout has a set of that exercise, and both
  methods are called inside `SetRepository`'s transactions.
- [x] `internal/set.repository.ts`: take `WorkoutExerciseRepository` as a third constructor argument.
      Wrap `create` in `this.#db.transaction(…)()`: insert the set, then
      `append(workoutId, input.exercise_id)` (after the insert, so an unknown exercise is still the
      FK 400 from the set insert). Wrap `delete` likewise: keep the done check, delete, then
      `removeIfUnused(set.workout_id, set.exercise_id)`.
- [x] `internal/workout.repository.ts`: in `create`'s copy branch, also run
      `INSERT INTO workout_exercises (workout_id, exercise_id, position) SELECT ?, exercise_id, position
      FROM workout_exercises WHERE workout_id = ?`; update the doc comment.
- [x] `workouts.facade.ts` (backend): `createWorkoutFacades` builds one `WorkoutExerciseRepository`
      and passes it to `SetRepository` and to `WorkoutFacade`; add
      `WorkoutFacade.exercises(id: WorkoutId): WorkoutExercise[]`.
- [x] `internal/workout.translator.ts`: replace `translateToWorkoutWithSetsDto` with
      `translateToWorkoutWithExercisesDto(row: Workout, exercises: WorkoutExercise[], sets: LiftSet[])`,
      which maps each exercise row to `{ exerciseId, exerciseName, position, sets }` with that
      exercise's sets in list order; `done` stays `isDone` over all sets.
- [x] `internal/workout.controller.ts`: `show` and `create` answer
      `translateToWorkoutWithExercisesDto(workout, this.#workouts.exercises(id), this.#sets.list(id))`.
- [x] `workouts.fixtures.ts` (backend): `createWorkout` returns `WorkoutWithExercisesDto`.
- [x] `workout.routes.test.ts`: change the detail and "Repeat" assertions to the grouped shape
      (`copy.exercises.flatMap((e) => e.sets)`); add tests:
  - interleaved sets (Bench, Row, Bench) come back as two groups, Bench then Row, Bench holding
    its two sets in logged order
  - "Repeat" copies the exercise order
- [x] `set.routes.test.ts`: change the `WorkoutWithSetsDto` reads to the grouped shape; add tests:
  - deleting an exercise's last set removes its group, while deleting one of two keeps it
  - logging a set of an exercise already in the workout does not add a group or move it
- [x] `workouts.facade.test.ts` (backend): through `setup()`'s `db` (`:8-11`), deleting a workout
      leaves no `workout_exercises` rows for it.
- [x] `src/frontend/features/workouts/internal/workout.api.ts` and `workouts.facade.ts`:
      `get`/`create` return `Promise<WorkoutWithExercisesDto>`; the `update` comments say the
      response carries no `exercises`.
- [x] `gz-workout-list.component.ts`: the "Repeat" toast counts
      `workout.exercises.flatMap((group) => group.sets).length`.
- [x] `workouts.fixtures.ts` (frontend): add `group(overrides)` building a `WorkoutExerciseDto`
      (defaults: exercise 1, "Bench Press", position 1, no sets).
- [x] `internal/gz-add-set-form.component.ts`: emit `this.emit('set-logged', { exerciseId: Number(exerciseId) })`;
      document the detail in the class comment.
- [x] `gz-workout-detail.component.ts`:
  - `WorkoutDetailData.workout` becomes `WorkoutWithExercisesDto`
  - add `#openExerciseId: ExerciseId | null | undefined = undefined` with a doc comment (why the
    view owns it: every reload re-renders, the same reason as `#edits`)
  - add a module-level `isSetLogged(detail): detail is { exerciseId: number }` guard; the
    `set-logged` listener sets `#openExerciseId` from the detail before reloading, then focuses reps
  - add `#openFor(exercises)`: when `#openExerciseId` is `undefined`, decide once: the first group
    containing a set not done, otherwise the last group, otherwise `null`. A remembered id no
    longer among the groups (its last set deleted) becomes `null`
  - `readyTemplate`: totals unchanged, computed over `exercises.flatMap(…)`; the empty message
    unchanged; otherwise one `<details name="exercises" data-exercise-id="…" ${open}>` per group:

    ```ts
    html`
      <details name="exercises" data-exercise-id="${group.exerciseId}" ${group.exerciseId === open ? 'open' : ''}>
        <summary>
          <span class="exercise-name">${group.exerciseName}</span>
          <span class="badge outline">${this.#groupSummary(group)}</span>
          <span class="actions">
            <a class="button outline" href="/exercises/${group.exerciseId}">Exercise</a>
          </span>
        </summary>
        <div class="sets">
          ${group.sets.map((set, index) => html`<gz-set-row data-id="${set.id}" data-index="${index + 1}"></gz-set-row>`)}
        </div>
      </details>
    `
    ```

  - `#groupSummary(group)`: `${plural(n, 'set')} · ${allDone ? '✓ Done' : `${doneCount}/${n} done`} · ${formatVolume(volume)}`
  - `afterRender`: look sets up in the flattened list; hand `gz-add-set-form` the flattened sets
    sorted back into logged order (`position`, then `id`), because the form prefills from the last
    one it is given and its `sets` setter documents "oldest first" — group order would make it
    prefill from the last exercise instead of the last logged set;
    on each `details`, a `toggle` listener: when open, `#openExerciseId = id`; when closed and it was
    the open one, `#openExerciseId = null`. On each `summary .actions`, a click listener that calls
    `event.preventDefault()` unless `event.composedPath()` holds an `HTMLAnchorElement`
- [x] `gz-workout-detail.component.css`: lay out `summary` (name grows and truncates, badge, then
      `.actions` as a flex row with Oat's spacing, the chevron last); under 720px let the summary
      wrap so the badge and `.actions` take their own lines. `.sets` keeps its column gap. No
      colors, no font sizes.
- [x] `internal/gz-set-row.component.ts`: remove the exercise link from the read view.
      `gz-set-row.component.css`: remove `.exercise` and its grid column (desktop becomes
      `auto 2.2rem auto minmax(0, 1.6fr) auto`); at 720px change the columns to `auto 2rem 1fr`
      and the areas to `"t i l" / ". . n" / ". . a"`, and drop the `.exercise` grid-area rule;
      keep `.load` muted on done rows.
- [x] `internal/gz-set-row.component.test.ts`: assert no `a[href^='/exercises/']` in a row.
- [x] `internal/gz-add-set-form.component.test.ts`: logging a set emits `set-logged` with
      `{ exerciseId }`, including the created exercise's id for a new one (use `collect`).
- [x] `gz-workout-detail.component.test.ts`: build `WORKOUT` from `group()`s (Bench 11, 12; Squat 13)
      and add tests:
  - renders one `details[name='exercises']` per exercise in order, with the right rows inside
    each and row numbers restarting at 1
  - the summary badge reads `2 sets · 0/2 done · …`, and `✓ Done` once all of a group is done
  - the "Exercise" link points at `/exercises/1`
  - first load opens the group of the first set not done; with every set done, the last group;
    with no sets, the empty message and no `details`
  - after `sets-changed`, the group the user opened stays open (open the second group by setting
    `open` and dispatching `toggle`, then dispatch `sets-changed` from a row)
  - after logging a set of exercise 2 while exercise 1 is open, exercise 2 is open
  - collapsing the open group and reloading leaves all collapsed
  - when the reload no longer contains the open group, all are collapsed
  - a click on a header button's surroundings inside `.actions` is default-prevented, and a click
    on the "Exercise" link is not (dispatch cancelable clicks and read `defaultPrevented`)
  - totals still count across groups (existing totals tests, adapted)
- [x] `docs/backend.md`: in the data model, four tables, adding `exercises ──< workout_exercises >──
      workouts`; describe the table (order of a workout's exercises, row exists exactly while the
      workout has a set of that exercise, appended by set create, removed by deleting the last
      set, copied by "Repeat", cascaded by workout delete, backfilled by `003` in first-appearance
      order) and `GET /api/workouts/:id`'s grouped `WorkoutWithExercisesDto`. Mention set create and
      delete as further `db.transaction()` examples beside `WorkoutRepository.create`.
- [x] `docs/frontend.md`: describe the accordion in `gz-workout-detail` (Oat `<details name>` in the
      view's own shadow root and why, `#openExerciseId` and its rules, the `toggle` listeners, the
      `.actions` preventDefault that spares links, the "Exercise" link button, `set-logged`'s
      `{ exerciseId }`, the add-set form getting the sets back in logged order); update the
      `gz-set-row` description (no exercise name, numbered within its exercise).
- [x] `docs/backend.md:113`: `GET /api/workouts/:id` composes a workout, its exercises and its sets.

**Automated Verification**:

- [x] `bun test --parallel src/backend/db/migrations.test.ts` passes
- [x] `bun test --parallel src/backend/features/workouts` passes
- [x] `bun test --parallel src/frontend/features/workouts` passes
- [x] `bun test --parallel` passes
- [x] `bun run migrate` applies `003-workout-exercises` to the local `data/gainz.sqlite`
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [ ] On a seeded workout (`bun run seed`, `bun run start:dev`), the sets show as a joined Oat
      accordion in light and dark themes, and opening one exercise closes the open one.
- [ ] Clicking anywhere on a header toggles it. "Exercise" opens the exercise page; Ctrl-click
      opens it in a new tab without toggling.
- [ ] Logging, +1, ✓, Edit and × keep the open exercise open; logging a set of another exercise
      opens that one.
- [ ] At ≤720px the header wraps without overflowing.

### Phase 3: Move exercises

Dependencies: Phase 2

Add the exercise move endpoint and the ▲▼ pair in each header.

**Tasks**:

- [x] `src/shared/dto/workout.ts`: add

  ```ts
  export type MoveDirection = 'up' | 'down';

  export interface MoveWorkoutExerciseDto {
    /** Toward the start (`up`) or the end (`down`) of the workout. */
    direction: MoveDirection;
  }
  ```

- [x] `internal/workout-exercise.repository.ts`: export `type MoveDirection = 'up' | 'down'` and
      add `move(workoutId, exerciseId, direction): void` in `db.transaction()`: read
      `exercise_id`s `ORDER BY position, exercise_id`; if `exerciseId` is not among them, throw
      `notFound('Exercise in this workout')`; splice it one place up or down when that place
      exists; renumber all rows 1..n. Doc comment: ties and gaps vanish on first touch, an edge move
      only renumbers, and the done lock does not apply because order is not performed history.
- [x] `internal/workout.translator.ts`: `translateToMoveWorkoutExerciseDto(body)` returning
      `{ direction: body.direction as MoveDirection }`.
- [x] `workouts.facade.ts` (backend): `WorkoutFacade.moveExercise(id, exerciseId, dto)`: validate
      `requiredOneOf(dto, 'direction', ['up', 'down'] as const)` first, then
      `this.#workouts.require(id)`, then the repository move.
- [x] `internal/workout.controller.ts`: `moveExercise(req)`: `pathId(req.params.id, 'workout')`,
      `pathId(req.params.exerciseId, 'exercise')`, translate the body, move, then answer
      `translateToWorkoutWithExercisesDto(…)` like `show`.
- [x] `workout.routes.ts`: `'/api/workouts/:id/exercises/:exerciseId/move': { POST: (req) => controller.moveExercise(req) }`.
- [x] `workout.routes.test.ts`: `describe('move exercise')`:
  - three exercises; move the last up, then the first down; the response's `exercises` order and
    positions `1, 2, 3` match, and sets stay inside their groups
  - an edge move answers 200 with the order unchanged
  - an exercise with done sets moves
  - an unknown workout is a 404; an exercise not in the workout is a 404; a non-numeric workout
    or exercise id is a 400
  - a missing direction, `'sideways'` and `1` are each a 400
  - `GET /api/workouts/:id` returns the moved order afterwards, and a set logged afterwards for
    an existing exercise keeps that order
- [x] `workouts.facade.test.ts` (backend): tied positions (force with `UPDATE workout_exercises SET
      position = 0 WHERE workout_id = ?`) keep `exercise_id` order on an edge move and then swap
      correctly; gaps (`5, 9, 40`) renumber `1, 2, 3`.
- [x] `src/frontend/features/workouts/internal/workout.api.ts`: `moveExercise(id: WorkoutId,
      exerciseId: ExerciseId, dto: MoveWorkoutExerciseDto): Promise<WorkoutWithExercisesDto>`
      posting to `/workouts/${id}/exercises/${exerciseId}/move`.
- [x] `workouts.facade.ts` (frontend): `WorkoutFacade.moveExercise(id, exerciseId, direction: MoveDirection)`.
      `workouts.facade.test.ts`: add the URL row and a body test `{ direction: 'up' }`.
- [x] `gz-workout-detail.component.ts`:
  - in each summary's `.actions`, before the link:

    ```ts
    <fieldset class="group move">
      <button class="outline" data-action="move-exercise-up" data-exercise-id="${id}" aria-label="Move ${name} up" ${index === 0 ? 'disabled' : ''}>▲</button>
      <button class="outline" data-action="move-exercise-down" data-exercise-id="${id}" aria-label="Move ${name} down" ${last ? 'disabled' : ''}>▼</button>
    </fieldset>
    ```

  - `handleAction(action, element)`: for `move-exercise-up|down`, call
    `workoutFacade.moveExercise(workoutId, Number(element.dataset.exerciseId), direction)`, then
    `await this.reload()` and `#focusMove(exerciseId, direction)`; `toastError` on failure. Keep the
    `delete-workout` branch
  - `#focusMove(exerciseId, direction)`: focus that exercise's arrow for `direction`, or the other
    one when it is disabled (as `GzSetRowComponent.focusMove` did)
- [x] `gz-workout-detail.component.css`: move the `.move` rule removed from `gz-set-row.component.css`
      in phase 1 here (reset the `fieldset` margin, hide ▲'s inline-end border).
- [x] `gz-workout-detail.component.test.ts`:
  - ▲ is disabled on the first exercise and ▼ on the last
  - clicking the second exercise's ▲ posts `{ direction: 'up' }` to
    `/api/workouts/3/exercises/2/move`, reloads, renders the groups in the new order, keeps the
    open exercise open, and leaves focus on its ▼ (now first, so ▲ is disabled)
  - clicking an arrow does not toggle its `details`, and clicking it is default-prevented
  - a failed move shows the error toast and does not reload
- [x] `docs/backend.md`: describe `POST /api/workouts/:id/exercises/:exerciseId/move` (one
      transaction, renumber 1..n, edge move a 200, answers the workout, the 404s and 400s), and
      that order is not part of the done lock.
- [x] `docs/frontend.md`: describe the header's ▲▼ (`fieldset.group`, disabled at the edges, the
      view's own actions, reload and focus restore on the moved exercise's arrow).

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/workouts` passes
- [x] `bun test --parallel src/frontend/features/workouts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [ ] ▲▼ sit in each header as a joined pair beside "Exercise", look right in both themes, and
      clicking them (or a disabled one) never toggles the accordion.
- [ ] Pressing Enter on ▼ repeatedly with the keyboard walks an exercise to the bottom without
      re-tabbing, then focus lands on its ▲.
- [ ] "Repeat" on a reordered workout produces a session with the same exercise order.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- The accordion's `<details>` sit in a `<div class="exercises">` rather than directly in the
  section: the section is a `vstack` with a gap, which would pull Oat's joined accordion apart.
- `bun run migrate` found `003` already applied to `data/gainz.sqlite`, by the running dev server;
  its backfill holds one row per (workout, exercise) pair of the existing sets (35 = 35).
- The ≤720px header wrap orders the badge and `.actions` after the chevron, so the name and chevron
  share the first line and the badge and actions take a line each.
## References

- `docs/agents/plans/2026-10-02-move-sets-up-and-down.md`: the set move this plan removes, and the
  pattern the exercise move follows
- `docs/agents/plans/2026-10-02-mark-sets-as-done.md`: the done lock
- `docs/agents/plans/2026-09-22-open-workouts-and-exercises-by-clicking-the-card.md`: why links
  stay real anchors
- `node_modules/@knadh/oat/css/accordion.css`: Oat's `<details>` accordion
- `node_modules/@knadh/oat/css/button.css:2`: `a.button`
- `src/frontend/app/router.ts:84-88`: `linkPath` skips default-prevented clicks
- `src/backend/features/workouts/internal/set.repository.ts`,
  `internal/workout.repository.ts`, `workouts.facade.ts`
- `src/frontend/features/workouts/gz-workout-detail.component.ts`,
  `internal/gz-set-row.component.ts`, `internal/gz-add-set-form.component.ts`
- `docs/backend.md:147-196`, `docs/frontend.md:56-88`
