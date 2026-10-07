---
date: 2026-10-07T11:45:54.586590+00:00
git_commit: 69f24e78bf1aa6d3624b4de2ab559aceb6fd8ad6
branch: main
topic: 'Mark whole workouts as done'
tags: [plan, backend, frontend, workouts, sets, migrations]
status: done
---

# PLAN: Mark whole workouts as done

Today a workout is done exactly when it has at least one set and every set is done. That state is
derived and never stored. This plan makes a workout's done state its own stored flag, set and
cleared explicitly with "Mark workout done" and "Reopen workout". If some exercises still have
sets not done, a confirmation names them first. Sets left unchecked stay not done (skipped), so the
history aggregates keep counting only what was performed. While a workout is done, its sets are
locked.

This reverses the "derived, never stored" decision of
`docs/agents/plans/2026-10-02-mark-sets-as-done.md`.

## Acceptance Criteria

- A workout has a stored done state, separate from its sets. Checking every set does not make it
  done, and unchecking a set does not undo it.
- `PATCH /api/workouts/:id` accepts `{ "done": true | false }`, alone or with the other detail
  fields. Only a JSON boolean is accepted (otherwise 400).
- `done: true` on a workout with no sets is a 409.
- While a workout is done, the server refuses with 409 to:
  - add a set to it (`POST /api/workouts/:id/sets`)
  - change any of its sets (`PATCH /api/sets/:id`, including `done`)
  - delete one of its sets (`DELETE /api/sets/:id`)
- On a done workout these stay allowed:
  - editing date, title and notes
  - moving exercises
  - deleting the workout
  - "Repeat", whose copy is not done
- Migration `004-workout-done.sql` adds `workouts.done` and marks as done every existing workout
  that has at least one set with all of them done.
- History aggregates are unchanged: they still count done sets only. A done workout's skipped sets
  stay not done.
- `done` is on `WorkoutDto`, so the list items, the detail, the create answer and the PATCH answer
  all carry it. The list keeps `doneSetCount`.
- The seed marks its past workouts done.
- On the workout page, "Mark workout done" sits below the add-set form while the workout has sets
  and is not done:
  - If every set is done, one click marks the workout done.
  - Otherwise a `confirm()` names each incomplete exercise with its done/total sets. Cancel changes
    nothing.
- On a done workout's page:
  - the add-set form is not rendered
  - every set row's toggle, fields, × and +1 are disabled
  - "Reopen workout" replaces the button and reopens without a confirmation
- Badges:
  - The summary line shows the set progress as an outline `x/y done` badge, also at `y/y`, plus a
    success "✓ Done" badge when the workout is done.
  - Exercise header badges are unchanged.
  - The card's "✓ Done" badge and border follow the stored flag.

## Technical Key Decisions and Tradeoffs

1. **A stored `workouts.done` flag, separate from the sets:** `INTEGER NOT NULL DEFAULT 0 CHECK
   (done IN (0, 1))`, mirroring `sets.done`.
   - Why: a session can be finished with sets skipped, and the stats stay honest because skipped
     sets are never recorded as performed.
   - Impact: `isDone()` in `workout.translator.ts` goes. `done` moves from `WorkoutWithStatsDto` and
     `WorkoutWithExercisesDto` onto `WorkoutDto`.
2. **A workout is done only when marked explicitly:** checking the last set changes nothing at the
   workout level.
   - Why: one source of truth and predictable behavior. Unchecking a set never "un-finishes" a
     workout.
   - Impact: the route test "is done once every set is, and not done again when one is unchecked"
     is replaced.
3. **The migration backfills the derived state.**
   - Why: workouts that show "✓ Done" today keep it.
   - Impact: one `UPDATE … WHERE EXISTS … AND NOT EXISTS …` in `004-workout-done.sql`.
4. **A done workout locks its sets, not its details.**
   - Why: a finished session is history, but notes ("How did it feel?") are often written
     afterwards. Order already isn't part of the set lock.
   - Impact: `SetRepository.create/update/delete` check the workout's stored flag before the set's
     own lock. The check runs on the server, so a stale tab cannot get around it.
5. **`PATCH /api/workouts/:id { done }` rather than a dedicated endpoint.**
   - Why: it mirrors `PATCH /api/sets/:id { done }`.
   - Impact: `EditWorkoutDto.done?` is validated with `requiredBoolean`, and
     `WorkoutRepository.update` refuses `done = 1` on a workout without sets, inside the same
     transaction as the write.
6. **A native `confirm()` that names the incomplete exercises.**
   - Why: it matches the app's three existing confirmations.
   - Impact: the message is built in `gz-workout-detail` from the groups it already has. Tests stub
     the global `confirm` through `useGlobals()`, in the test body or a `beforeEach`, since it
     restores in `afterEach`. That stub replaces happy-dom's `confirm` installed by `useDom()`.
7. **The button goes below the add-set form, and "Reopen workout" takes the same spot.**
   - Why: it is the end of the logging flow and away from the title.
   - Impact: the view renders it between `gz-add-set-form` and "Details & notes". `gz-set-row` gets
     a `locked` input from the view.
8. **At the workout level, the green "✓ Done" means the workout.**
   - Why: one badge should not carry two meanings.
   - Impact: the summary gets an outline `x/y done` set-progress badge that is always outline, plus
     a separate workout badge. `#progressBadge` stays as it is for the exercise headers.

## Current State

```
sets.done (0/1, stored)                    workouts: id, performed_on, title, notes, created_at
        │
        ▼
WorkoutRepository.list ── SUM(s.done) AS done_set_count
        │
        ▼
workout.translator.ts:77  isDone(setCount, doneSetCount) = setCount > 0 && done === count
        │
        ├── WorkoutWithStatsDto.done   ──► gz-workout-card: "✓ Done" badge + .done border
        └── WorkoutWithExercisesDto.done   (computed from the sets returned)

gz-workout-detail summary: #progressBadge(doneCount, setCount)  → "x/y done" | "✓ Done" (derived again)
SetRepository: lock only on the set's own `done` (update: only `done` allowed; delete: 409)
```

Current workout page:

```
Push day
Sun, Sep 20, 2026 · today
3 sets · 2 exercises · 15 reps · 1,245 kg          [1/3 done]
Sets
 ▾ Bench Press      2 sets · 652.5 kg              [1/2 done]
     ✓ 1  80 kg × 5   …                       +1  ×
     ✓ 2  82.5 kg × 5 …                       +1  ×
     [▲][▼]                       Exercise history →
 ▸ Back Squat       1 set · 500 kg                 [0/1 done]
[ add-set form ]
▸ Details & notes
```

## Desired End State

```
workouts.done (0/1, stored) ──────────────────────────► WorkoutDto.done (every workout DTO)
        ▲                                                       │
PATCH /api/workouts/:id { done }                               ├── gz-workout-card badge + border
  done:true on a workout without sets → 409                    └── gz-workout-detail: workout badge,
                                                                    button, locked rows, add-set form hidden
SetRepository.create/update/delete:
  workout.done = 1 → 409 "Workout is done; reopen it before changing its sets"
  then the existing set lock
```

Workout not done, some sets open:

```
Push day
Sun, Sep 20, 2026 · today
3 sets · 2 exercises · 15 reps · 1,245 kg          [1/3 done]
Sets
 ▸ Bench Press      2 sets · 652.5 kg              [1/2 done]
 ▸ Back Squat       1 set · 500 kg                 [0/1 done]
[ add-set form ]
[ Mark workout done ]
▸ Details & notes

          ┌──────────────────────────────────────────────────┐
  click → │ 2 exercises are not complete:                    │
          │ Bench Press (1/2 sets), Back Squat (0/1 sets).   │
          │ Mark the workout done anyway?                    │
          │                               [Cancel]  [OK]     │
          └──────────────────────────────────────────────────┘
```

Workout done:

```
Push day
Sun, Sep 20, 2026 · today
3 sets · 2 exercises · 15 reps · 1,245 kg  [1/3 done] [✓ Done]
Sets
 ▾ Bench Press      2 sets · 652.5 kg              [1/2 done]
     ✓ 1  80 kg × 5   …   (toggle, fields, +1, × disabled)
     ✓ 2  82.5 kg × 5 …   (toggle, fields, +1, × disabled)
     [▲][▼]                       Exercise history →
 ▸ Back Squat       1 set · 500 kg                 [0/1 done]
[ Reopen workout ]
▸ Details & notes
```

## Abstractions and Code Reuse

- `src/backend/db/migrations/004-workout-done.sql` - new: the column and the backfill
- `src/backend/features/workouts/`
  - `ports/workout.ts` - `Workout.done: 0 | 1`
  - `internal/workout.repository.ts`
    - `EditWorkout` - gains `done?: 0 | 1`, not part of `CreateWorkout`
    - `FIELDS` - adds `done`
    - `list`, `get`, `create … RETURNING` - select `done`
    - `update` - transaction plus a 409 on `done = 1` without sets
  - `internal/workout.translator.ts`
    - `translateToEditWorkoutDto` - reads `done`
    - `translateDtoToEditWorkout` - turns it into 1/0
    - `translateToWorkoutDto` - `done: row.done === 1`
    - `isDone` - removed
  - `internal/set.repository.ts` - `#requireOpen(workoutId)`, called by `create`, `update` and
    `delete`
  - `workouts.facade.ts` - `WorkoutFacade.#validateEdit` validates `done` with `requiredBoolean`
    (already imported)
  - `workouts.fixtures.ts` - `markWorkoutDone(patch, workoutId)` beside `markDone`
- `src/shared/dto/workout.ts` - `WorkoutDto.done` and `EditWorkoutDto.done?`; `done` comes off the
  two subtypes
- `src/scripts/seed.ts` - past workouts are marked done after their sets, through
  `workouts.update(id, { done: true })`
- `src/frontend/features/workouts/`
  - `gz-workout-detail.component.ts`
    - `handleAction` - `finish-workout`, `reopen-workout`
    - `#incompleteMessage` - new
    - `#finishTemplate` - new
    - `#setProgressBadge` - new, for the summary
    - `afterRender` - passes `row.locked`
    - `readyTemplate` - hides `gz-add-set-form` when done
  - `internal/gz-set-row.component.ts` - `locked` setter; `template` disables the toggle, fields, +1
    and × when locked
  - `gz-workout-card.component.ts` - unchanged; it already reads `workout.done`

Reused as they are: `conflict()` from `http/errors.ts`, `buildUpdate`, `requiredBoolean`,
`#progressBadge` for the exercise headers, the delegated `data-action` dispatch in `ui/base.ts`,
`toast`/`toastError`, and `useGlobals()` from `src/frontend/testing.ts` to stub `confirm`.

## Logging & Observability

No changes. The access log already records `PATCH /api/workouts/:id` with its body and status, so
marking a workout done, reopening it and a 409 from the lock all show there.

## Implementation

### Phase 1: Stored workout done, the set lock and the migration

Dependencies: None

The backend stores and serves the workout's done state, refuses changes to the sets of a done
workout, and backfills the existing data. The frontend keeps working unchanged: the card reads
`done`, and the detail page still derives its summary badge from the sets until Phase 2.

**Tasks**:

- [x] Add `src/backend/db/migrations/004-workout-done.sql`:
  ```sql
  ALTER TABLE workouts ADD COLUMN done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1));

  -- Keeps every workout that showed as done, its sets all checked, done.
  UPDATE workouts SET done = 1
   WHERE EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = workouts.id)
     AND NOT EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = workouts.id AND s.done = 0);
  ```
- [x] `ports/workout.ts`: add `done: 0 | 1` to `Workout`, which `WorkoutWithStats` inherits.
- [x] `workout.repository.ts`:
  - [x] `EditWorkout = Partial<CreateWorkout> & { done?: 0 | 1 }`; add `'done'` to `FIELDS`.
  - [x] Add `w.done` to the `list` query and `done` to `get`'s column list and to `create`'s
        `RETURNING`.
  - [x] Wrap `update` in `this.#db.transaction(…)()`. If `patch.done === 1` and the workout has no
        sets (`SELECT EXISTS(SELECT 1 FROM sets WHERE workout_id = ?)`), throw
        `conflict('Workout has no sets; log one before marking it done')`.
  - [x] "Repeat" needs no change: the new row takes the column default 0.
- [x] `src/shared/dto/workout.ts`:
  - [x] add `done: boolean` to `WorkoutDto`
  - [x] remove `done` and its doc comment from `WorkoutWithStatsDto` and `WorkoutWithExercisesDto`
  - [x] add `done?: boolean` to `EditWorkoutDto`
- [x] `workout.translator.ts`:
  - [x] `translateToEditWorkoutDto` reads `done: body.done as boolean | undefined`
  - [x] `translateDtoToEditWorkout` sets `patch.done = dto.done ? 1 : 0` when it is defined
  - [x] `translateToWorkoutDto` adds `done: row.done === 1`
  - [x] `translateToWorkoutWithStatsDto` takes `done: row.done === 1` and keeps `doneSetCount`
  - [x] `translateToWorkoutWithExercisesDto` drops its own `done`, since it now comes from
        `translateToWorkoutDto`
  - [x] delete `isDone`
- [x] `workouts.facade.ts`: in `WorkoutFacade.#validateEdit`, add
      `if (dto.done !== undefined) { valid.done = requiredBoolean(dto, 'done'); }`.
- [x] `set.repository.ts`: add a private `#requireOpen(workoutId: WorkoutId): void` that calls
      `this.#workouts.require(workoutId)` and throws
      `conflict('Workout is done; reopen it before changing its sets')` when `done === 1`.
  - [x] `create`: call it in place of the bare `this.#workouts.require(workoutId)`. An unknown
        workout is still a 404.
  - [x] `update`: call it with `current.workout_id` right after `this.require(id)`, before the
        set's own lock. Wrap the method in a transaction like `delete`.
  - [x] `delete`: call it with `set.workout_id` before the set's own lock.
- [x] `src/scripts/seed.ts`: after a past workout's lifts loop (`daysAgo > 0`), call
      `workouts.update(workout.id, { done: true })`.
- [x] `workouts.fixtures.ts` (backend): add `markWorkoutDone(patch, workoutId)`, which PATCHes
      `{ done: true }`, expects 200 and returns the `WorkoutDto`.
- [x] `workout.routes.test.ts`: replace `describe("a workout's done state")` with tests that it:
  - [x] is not done when created, without sets or with them, in both the detail and the list
  - [x] stays not done when every set is checked, and becomes done only on `PATCH { done: true }`,
        in the detail, the list and the PATCH answer, with `doneSetCount` still counting the
        checked sets
  - [x] can be marked done with sets left unchecked; those sets stay not done
  - [x] reopens with `PATCH { done: false }`
  - [x] answers 409 to `done: true` on a workout without sets, and leaves it not done
  - [x] answers 400 to a `done` that is not a boolean (`'yes'`, `1`, `null`)
  - [x] lets a done workout's title, date and notes change, in a request on its own and together
        with `done`
  - [x] answers 409 to logging a set while the workout is done, and 201 once it is reopened
  - [x] "Repeat" of a done workout creates a workout that is not done
  - [x] moves an exercise of a done workout
  - [x] deletes a done workout, with its sets
- [x] `set.routes.test.ts`: add `describe('a done workout')`, which checks that:
  - [x] PATCH `{ done: true }`, PATCH `{ done: false }`, PATCH `{ reps }` and DELETE on its sets
        are all 409 and leave the set unchanged
  - [x] the same requests succeed again after `PATCH /api/workouts/:id { done: false }`
  - [x] a malformed body is still a 400 on a done workout's set, since validation comes first
- [x] `workouts.facade.test.ts`: add `WorkoutFacade.update` cases for a `done` that is not a
      boolean (400) and for `done: true` without sets (409).
- [x] `src/backend/db/db.test.ts:17`: expect `schemaVersion(real)` to be `4`.
- [x] `src/backend/db/migrations.test.ts:166-167`: the "adopt a database … no ledger" test expects
      applied `[1, 2, 3, 4]` and version `4`.
- [x] `migrations.test.ts`, `describe('the real migrations')`: add a backfill test. Running `001` by
      hand doesn't work here, because `002` marks every earlier set done.
  - [x] Copy `001`–`003` from `MIGRATIONS_DIR` into a `tempDir()` with `write()`, then
        `migrate(legacy, { dir })` to reach version 3.
  - [x] Insert one exercise and three workouts: one whose sets are all `done = 1`, one with a
        `done = 0` set, and one without sets.
  - [x] `migrate(legacy)` against the real directory applies only `[4]`.
  - [x] `SELECT done FROM workouts ORDER BY id` is `[1, 0, 0]`.
  - [x] `UPDATE workouts SET done = 2` throws, as in the `002` test.
- [x] `docs/backend.md`:
  - [x] rewrite the paragraph at lines 210-213: a workout's `done` is stored, set with
        `PATCH /api/workouts/:id { done }`, independent of its sets; `done: true` without sets is a
        409; `004-workout-done.sql` added it and backfilled the derived state; the list still ships
        `doneSetCount`
  - [x] add the workout lock beside the set lock (lines 202-208): it is checked first, from the
        stored state, covers create, update (including `done`) and delete of its sets, and leaves
        details, order, delete and Repeat open
  - [x] in lines 215-223, say that a done workout's unchecked sets stay plans, so the aggregates
        don't count them
  - [x] line 182 wording: `done` is now part of every workout DTO

**Automated Verification**:

- [x] `bun test --parallel src/backend` passes, including the new and rewritten tests above
- [x] `bun test --parallel` passes (the frontend tests still compile against the moved `done`)
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `bun run migrate` against a copy of `data/gainz.sqlite` applies `004` and exits 0

### Phase 2: Finishing and reopening a workout in the UI

Dependencies: Phase 1

The workout page gets "Mark workout done", with a confirmation naming incomplete exercises, and
"Reopen workout". It shows a done workout locked, and splits the summary badge into set progress
and workout state.

**Tasks**:

- [x] `gz-set-row.component.ts`:
  - [x] add `#locked = false` and a `set locked(value: boolean)` setter that only stores the value,
        like `index`. The view sets it before `set`, which renders, so a row renders once.
  - [x] `#toggleTemplate(set)` reads `#locked` and adds `disabled`. In `template()`, +1 is disabled
        when `#locked`, and the fields and × when `set.done || #locked`.
- [x] `gz-workout-detail.component.ts`:
  - [x] in `afterRender()`, set `row.locked = workout.done` before `row.set`
  - [x] render `<gz-add-set-form>` only when `!workout.done`; `afterRender` already tolerates its
        absence
  - [x] add `#finishTemplate(workout, setCount)`:
    - nothing when `setCount === 0`
    - when `workout.done`: `<button class="outline" data-action="reopen-workout"
      data-testid="reopen-workout">Reopen workout</button>`
    - otherwise: `<button data-action="finish-workout" data-testid="finish-workout">Mark workout
      done</button>`
    - render it after the add-set form's spot and before `#detailsTemplate`, wrapped in a `<div>`
      like the delete button
  - [x] add `#incompleteMessage(exercises): string | null`. It returns `null` when every group's
        sets are done, otherwise:
    ```
    1 exercise is not complete:            /  N exercises are not complete:
    Bench Press (1/2 sets).                   Bench Press (1/2 sets), Back Squat (0/1 sets).
    Mark the workout done anyway?
    ```
    joined with `\n`, using `plural()` for "exercise", in the workout's exercise order. The counts
    always read "(x/y sets)", even "(0/1 sets)", to match the badges' fraction form.
  - [x] restructure `handleAction` into branches per action. For `finish-workout`:
    1. compute the message
    2. if it is not `null` and `!confirm(message)`, return
    3. `workoutFacade.update(id, { done: true })`
    4. `toast('Workout done', 'success')`
    5. `await this.reload()`

    `reopen-workout` calls `workoutFacade.update(id, { done: false })` and reloads without a toast.
    Both `toastError` on failure without reloading. `delete-workout` keeps its `confirm`.
  - [x] add `#setProgressBadge(doneCount, setCount)` for the summary line: nothing when
        `setCount === 0`, otherwise
        `<span class="badge outline" data-testid="progress">x/y done</span>`. Then add
        `${workout.done ? html`<span class="badge" data-variant="success"
        data-testid="workout-done">✓ Done</span>` : ''}`. The exercise headers keep
        `#progressBadge`.
- [x] `gz-workout-detail.component.test.ts`:
  - [x] rewrite "shows a done workout as done": the summary shows `['3/3 done']` as an outline badge
        and a success `workout-done` "✓ Done"
  - [x] add: a workout with every set done but `done: false` shows `3/3 done` and no `workout-done`
        badge
  - [x] keep "counts the sets done so far" and "shows no done badge for a workout without sets",
        the latter also asserting no `workout-done`, `finish-workout` or `reopen-workout`
  - [x] "Mark workout done" sits after the add-set form and before "Details & notes", and is absent
        without sets
  - [x] with every set done, a click PATCHes `{ done: true }` without calling `confirm` (stub that
        records calls), toasts "Workout done" and reloads
  - [x] with incomplete exercises, `confirm` receives the message naming
        `Bench Press (0/2 sets), Back Squat (0/1 sets)`. When it returns `true`, the view PATCHes;
        when it returns `false`, nothing is sent
  - [x] the message names only incomplete exercises, in workout order, and says "1 exercise is" for
        one
  - [x] a done workout renders no add-set form, shows "Reopen workout", and every set row is
        `locked`. Check the add-set form with `querySelector(testId('add-set-form'))` returning
        `null`, not `addSetForm()`, which throws when it is missing. Assert on the row's shadow
        toggle, +1, × and fields being disabled
  - [x] "Reopen workout" PATCHes `{ done: false }` without `confirm` and reloads
  - [x] a failed PATCH toasts the error and sends no reload `GET`
- [x] `internal/gz-set-row.component.test.ts`: a `locked` row disables the toggle, +1, × and fields
      for a set that is not done and for a done set. An unlocked row is unchanged (existing tests).
- [x] `gz-workout-card.component.test.ts`: confirm the done and not-done cases still pass with
      `done` now coming from `WorkoutDto`. Add a case for a done card with `doneSetCount <
      setCount`, which still shows "✓ Done".
- [x] `docs/frontend.md`:
  - [x] lines 84-87: the card's badge and border follow the workout's stored `done`
  - [x] line 90-94: the page order now has the finish/reopen button between `gz-add-set-form` and
        "Details & notes", and the add-set form is not rendered on a done workout
  - [x] lines 154-158: the summary line's badge is now an outline "x/y done" for the sets, plus a
        success "✓ Done" from the workout's own flag; a done workout locks every row (toggle,
        fields, +1, ×) through `gz-set-row`'s `locked`, mirroring the backend's workout lock
  - [x] describe the finish confirmation: a native `confirm()` naming incomplete exercises, skipped
        when all sets are done; Reopen asks nothing
  - [x] if the testing section needs it, note that tests stub `confirm` through `useGlobals()`

**Automated Verification**:

- [x] `bun test --parallel src/frontend` passes, including the new tests above
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] With `bun run start:dev`, on a workout with some sets unchecked, "Mark workout done" shows the
      browser confirmation naming the incomplete exercises with counts. Cancel leaves the workout
      unchanged; OK shows "✓ Done" next to the progress badge.
- [x] On a workout with every set checked, "Mark workout done" finishes it without a confirmation.
- [x] On a done workout:
  - the add-set form is gone
  - set rows can't be toggled, edited, duplicated or deleted
  - date, title and notes in "Details & notes" still save
  - the exercise arrows still move exercises
- [x] "Reopen workout" restores the add-set form and the editable rows. The list card shows or
      hides "✓ Done" to match.
- [x] On a phone-width window, the button and the summary badges wrap cleanly.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- One full `bun test --parallel` run during Phase 1 reported a single failure that did not recur in
  five reruns; the failing test was not captured.
- `WorkoutRepository.update` checks for sets through a private `#hasSets(id)`.

## References

- `docs/agents/plans/2026-10-02-mark-sets-as-done.md` - the derived workout done this reverses
- `docs/agents/plans/2026-10-05-done-sets-and-exercise-hierarchy.md` - the current progress badges
- `docs/backend.md` lines 196-223 - the set done state, the set lock, the derived workout done, the
  aggregates
- `docs/frontend.md` lines 84-158 - the card, the workout page, the set rows
- `src/backend/features/workouts/internal/workout.translator.ts:76-112` - `isDone` and the DTO
  translation
- `src/backend/features/workouts/internal/set.repository.ts:95-118` - the existing set lock
- `src/frontend/features/workouts/gz-workout-detail.component.ts:75-100,249-257,307-342` - actions,
  badge, layout
- `src/frontend/features/workouts/internal/gz-set-row.component.ts:143-209` - the row template
