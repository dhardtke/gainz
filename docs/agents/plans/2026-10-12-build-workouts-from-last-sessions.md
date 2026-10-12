---
date: 2026-10-12T11:54:26.168919+00:00
git_commit: d9a7f08dfd4a4b07f5c0ea9518291f07b846f742
branch: main
topic: 'Build workouts from exercises’ last sessions'
tags: [plan, workouts, exercises, sets, add-set-form, start-session]
status: ready
---

# PLAN: Build workouts from exercises’ last sessions

Make a new workout quick to fill from exercises already trained, keeping each exercise's set
configuration — reps, weight and notes, set by set — from the last session it was performed in.
Three pieces: a "last session" hint and prefill in the add-set form, a one-tap copy of an
exercise's last session into the open workout, and a picker on "Start session" that copies several
exercises at once.

## Acceptance Criteria

- `POST /api/workouts/:id/exercises` with `{ "exerciseIds": [...] }` copies, for each exercise in
  request order, the done sets of its last session into the workout after its current sets — reps,
  weight and notes kept, `done` 0 — appends the exercise to the workout's order, and answers the
  whole `WorkoutWithExercisesDto`, all in one transaction.
- An exercise's "last session" is the workout with the highest `(performed_on, id)` holding at
  least one done set of it.
- Nothing is written on any error, checked in this order: a missing, empty, non-array or
  duplicate-holding `exerciseIds`, or one with more than 200 ids or an element that is not a
  positive safe integer (numeric strings included), is a 400; an unknown workout is a 404; a done
  workout is a 409 (`Workout is done; reopen it before changing its sets`); then each id in request
  order — an unknown exercise is a 400, an exercise already in the workout or one without done sets
  is a 409 naming the exercise.
- `GET /api/exercises/:id/last-session?exceptWorkout=<id>` answers `{ "session": null }` or
  `{ "session": { workoutId, performedOn, sets } }` with that session's done sets in logged order,
  ignoring the given workout; an unknown exercise is a 404.
- The add-set form shows, under its fields, `Last · Oct 5: 5×100 · 5×100 · 5×105 · best 110 kg` for
  the selected exercise, or `No history yet`. Per-set weights are plain numbers (`5×0` for a
  bodyweight set); "best" is the exercise list's all-time `bestWeight` and is left out when it is
  null or 0.
- For an exercise not yet in the workout, the form prefills reps and weight from the last
  session's first set — on a selection change, and on first render when the workout has no sets —
  and offers "Add last session's N sets", which copies them and opens that exercise's group; for
  one already in the workout, prefill works as today and there is no button.
- "Start session" opens a dialog listing exercises with history, most recently performed first;
  "Start with N" creates today's workout, copies the ticked exercises in the order they were
  ticked, and opens it; "Start empty" behaves as the button does today; Cancel creates nothing;
  with no exercise history at all the dialog is skipped and an empty session starts.
- `docs/backend.md` and `docs/frontend.md` describe the two endpoints, the hint and the picker.

## Technical Key Decisions and Tradeoffs

1. **One batch endpoint:** `POST /api/workouts/:id/exercises` with `{ exerciseIds }`.
   - Why: one transaction serves both the form's single exercise and the picker's several.
   - Impact: `SetRepository.copyLastSessions`, beside `create`, reusing `#requireOpen` and
     `WorkoutExerciseRepository.append`; validation in `SetFacade`.
2. **All or nothing:** every id is checked inside the transaction before its insert; any failure
   throws and rolls the whole request back.
   - Why: a double-tap or a stale tab cannot duplicate sets or half-fill a workout.
   - Impact: the per-id 409s name the exercise, so the toast says which one; precedence is body
     shape, workout, done lock, then ids in request order, as `SetRepository.create` checks the
     workout before its exercise.
3. **Done sets only, notes included, as not done:** the copy mirrors Repeat's columns.
   - Why: "same sets as last session"; a skipped set is not part of the configuration.
   - Impact: the last-session lookup is one SQL fragment in `workouts/ports/sql.ts`, shared by the
     copy and by the exercises feature's `lastSession`.
4. **`exceptWorkout` on the lookup:** the hint is for the open workout, which becomes the latest
   session for an exercise as soon as one of its sets there is done.
   - Why: otherwise the hint would show the current workout to itself.
   - Impact: the shared fragment binds the excluded workout id; the copy passes the target workout,
     where it is moot because an exercise in it is already refused.
5. **Hint, prefill and copy button live in `gz-add-set-form`:** the lookup runs when the selection
   changes and is cached per exercise for the page's life; the best weight comes from the
   `bestWeight` the page's exercise list already carries, loaded once per page, so it is all-time
   and may include this workout's done sets.
   - Why: one form and one exercise select, no second "add exercise" section.
   - Impact: `gz-workout-detail` types its exercises as `ExerciseWithStatsDto`; a resolved lookup
     renders from the cache inside `template()`, so the hint survives the re-render every logged
     set triggers; only a pending lookup fills it in place, so typed values are not lost.
6. **The exercises feature maps sets itself:** `exercise.translator.ts` gets its own set mapper.
   - Why: a translator never imports another feature's `internal/` (docs/backend.md), which rules
     out `translateToLiftSetDto`.
   - Impact: `translateToBestSetDto` reuses the new mapper.
7. **Verb naming follows the existing set facades:** `SetFacade.addExercises` on both sides, the
   frontend one posting through `WorkoutApi` as `SetFacade.create` does.
   - Why: docs/frontend.md has frontend facades use the backend's verbs.
   - Impact: `SetRepository.copyLastSessions` keeps the descriptive repository name.
8. **The picker is a dialog modeled on `gz-confirm-dialog`, without a new endpoint:** it filters
   and sorts the unpaged exercise list on `lastPerformedOn`.
   - Why: the data is already served; a dialog keeps starting a session one step.
   - Impact: `gz-start-session-dialog` and a `pickExercises()` promise helper in
     `features/workouts/internal/`; the workout list fetches exercises on click, not on load.
9. **Create, then copy:** the picker creates the workout and then posts the ids.
   - Why: reuses decision 1 instead of a second copy path in `CreateWorkoutDto`.
   - Impact: if the copy fails, the error toasts and the (empty) workout still opens — no worse
     than "Start session" today.

## Current State

```
Start session ──POST /api/workouts {performedOn}──▶ empty workout ──▶ /workouts/:id
Repeat (card) ──POST /api/workouts {copyFromWorkoutId}──▶ every set of one workout, done=0

/workouts/:id  (gz-workout-detail)
 ├─ exercise groups (accordion, order from workout_exercises)
 └─ gz-add-set-form
     select: whole catalog ─┐  prefill = last set of THIS workout only
     reps / weight / notes  ├─▶ POST /api/workouts/:id/sets ─▶ SetRepository.create
     [Log set]              ┘      inserts the set + WorkoutExerciseRepository.append
```

- `WorkoutRepository.create` copies a whole workout in one transaction
  (`src/backend/features/workouts/internal/workout.repository.ts:58-95`).
- `SetRepository.create` checks the workout is open, inserts at `MAX(position) + 1` and appends the
  exercise to `workout_exercises` (`src/backend/features/workouts/internal/set.repository.ts:64-93`);
  a `workout_exercises` row exists exactly while the workout has a set of that exercise
  (`workout-exercise.repository.ts:9`).
- `ExerciseRepository` already queries sets for history: `list` (with `last_performed_on`,
  `best_weight`), `progress`, `bestSet` (`src/backend/features/exercises/internal/exercise.repository.ts:33-168`),
  using `SET_COLUMNS` from `workouts/ports/sql.ts`.
- `gz-add-set-form` prefills only from the current workout's sets
  (`src/frontend/features/workouts/internal/gz-add-set-form.component.ts:58-78`, `:92-115`).
- `gz-workout-detail` loads the unpaged exercise list once and passes it to the form typed as
  `ExerciseDto[]`, though the items are `ExerciseWithStatsDto`
  (`src/frontend/features/workouts/gz-workout-detail.component.ts:33-36`, `:101-112`, `:268-274`).
- "Start session" creates an empty workout dated today
  (`src/frontend/features/workouts/gz-workout-list.component.ts:39-49`).

## Desired End State

```
Start session ─▶ gz-start-session-dialog (exercises with history, newest first)
   ├─ Cancel ───────────▶ nothing
   ├─ Start empty ──────▶ POST /api/workouts ─▶ /workouts/:id
   └─ Start with N ─────▶ POST /api/workouts ─▶ POST /api/workouts/:id/exercises {exerciseIds} ─▶ /workouts/:id

gz-add-set-form, on select change
   └─ GET /api/exercises/:id/last-session?exceptWorkout=:workoutId   (cached per exercise)
        ├─ hint: "Last · Oct 5: 5×100 · 5×100 · 5×105 · best 110 kg" | "No history yet"
        └─ exercise not in workout and session found:
             prefill reps/weight from session.sets[0]
             [Add last session's 3 sets] ─▶ POST /api/workouts/:id/exercises {exerciseIds:[id]}
```

The add-set form, an exercise not in the workout selected:

```
Add a set
┌───────────────────────────────────────────────────────────────┐
│ Exercise [Squat ▾]        Reps [5]  Weight (kg) [100]         │
│ Notes [                         ]               [Log set]     │
│ Last · Oct 5: 5×100 · 5×100 · 5×105 · best 110 kg             │
│ [Add last session's 3 sets]                                   │
└───────────────────────────────────────────────────────────────┘
```

An exercise already in the workout: the same hint, no button, prefill from this workout's last set
of it. An exercise never done: `No history yet` in muted text, no button.

The start-session dialog:

```
┌ Start session ─────────────────────────────────────┐
│ Pick exercises to copy from their last session.    │
│                                                    │
│ ☑ 🦵 Squat              last Oct 5                 │
│ ☑ 💪 Bench Press        last Oct 5                 │
│ ☐ 🔙 Barbell Row        last Oct 3                 │
│ ☐ 💪 Overhead Press     last Sep 28                │
│ …                                                  │
│                                                    │
│ [Cancel]          [Start empty]  [Start with 2]    │
└────────────────────────────────────────────────────┘
```

"Start with N" is disabled while nothing is ticked; its label counts the ticked exercises.

## Abstractions and Code Reuse

- `src/shared/dto/`
  - `exercise.ts` - add `LastSessionDto { workoutId; performedOn; sets: LiftSetDto[] }` and
    `ExerciseLastSessionDto { session: LastSessionDto | null }`
  - `workout.ts` - add `AddWorkoutExercisesDto { exerciseIds: ExerciseId[] }`
- `src/backend/shared/validate.ts` - add `requiredIds(dto, field, { max })`: a non-empty array of
  distinct positive safe integers (JSON numbers only), at most `max` long
- `src/backend/features/workouts/`
  - `ports/sql.ts` - add `LAST_SESSION_WORKOUT_SQL`, binding the exercise id and the excluded
    workout id
  - `internal/set.repository.ts` - `SetRepository.copyLastSessions(workoutId, exerciseIds)`
  - `workouts.facade.ts` - `SetFacade.addExercises(workoutId, dto)` validating with
    `requiredIds`
  - `internal/workout.controller.ts` - `WorkoutController.addExercises`
  - `internal/workout.translator.ts` - `translateToAddWorkoutExercisesDto`
  - `workout.routes.ts` - `'/api/workouts/:id/exercises': { POST }`
- `src/backend/features/exercises/`
  - `ports/exercise.ts` - `LastSession { workout_id; performed_on; sets: LiftSet[] }`
  - `internal/exercise.repository.ts` - `ExerciseRepository.lastSession(id, exceptWorkout)`
  - `internal/exercise.translator.ts` - its own set mapper, `translateToExerciseLastSessionDto`;
    `translateToBestSetDto` reuses the mapper
  - `exercises.facade.ts`, `internal/exercise.controller.ts`, `exercise.routes.ts` -
    `GET /api/exercises/:id/last-session`
- `src/frontend/features/exercises/`
  - `internal/exercise.api.ts`, `exercises.facade.ts` - `lastSession(id, exceptWorkout)`
- `src/frontend/features/workouts/`
  - `internal/workout.api.ts`, `workouts.facade.ts` - `WorkoutApi.addExercises(id, dto)`,
    `SetFacade.addExercises(workoutId, exerciseIds)`
  - `internal/gz-add-set-form.component.ts` (+ `.css`) - hint, prefill, `add-last-session` action
  - `gz-workout-detail.component.ts` - exercises typed `ExerciseWithStatsDto[]`
  - `internal/gz-start-session-dialog.component.ts` (+ `.css`) - new, modeled on `gz-confirm-dialog`
  - `internal/start-session.ts` - new `pickExercises()` helper, modeled on `confirmAction()`
  - `gz-workout-list.component.ts` - `start-session` opens the picker

Reused as they are: `WorkoutExerciseRepository.append`, `SetRepository#requireOpen`,
`SET_COLUMNS`, `translateToWorkoutWithExercisesDto`, the `set-logged` event (it opens the
exercise's group and refocuses reps), `gz-muscle-group-icon`, `formatShortDate`, `formatNumber`,
`formatWeight`, `plural`, `toastError`. `start-session.ts` imports the dialog module statically, as
`confirm.ts` does.

## Logging & Observability

No new logging. Both endpoints go through the existing request logging; their 400/404/409s carry
the same `{ error }` bodies as the other routes.

## Implementation

### Phase 1: Last-session hint and prefill

Dependencies: None

Serve an exercise's last session and show it in the add-set form, prefilling reps and weight from
it for an exercise not yet in the workout.

**Tasks**:

- [ ] `src/backend/features/workouts/ports/sql.ts`: add the shared fragment (the file's header
      comment already says the exercises feature queries sets too)
      ```ts
      /** Binds the exercise id, then a workout id to skip (or null). */
      export const LAST_SESSION_WORKOUT_SQL = `SELECT w.id FROM workouts w JOIN sets s ON s.workout_id = w.id
         WHERE s.exercise_id = ? AND s.done = 1 AND w.id IS NOT ?
         ORDER BY w.performed_on DESC, w.id DESC LIMIT 1`;
      ```
- [ ] `src/backend/features/exercises/ports/exercise.ts`: add `LastSession { workout_id: WorkoutId; performed_on: Iso8601Date; sets: LiftSet[] }`
- [ ] `ExerciseRepository.lastSession(id, exceptWorkout: WorkoutId | null): LastSession | null` —
      `require(id)`, find the workout with `LAST_SESSION_WORKOUT_SQL`, return `null` without one,
      otherwise its `performed_on` and its done sets of the exercise (`SET_COLUMNS`, `ORDER BY s.position, s.id`)
- [ ] `ExerciseFacade.lastSession(id, exceptWorkout)` delegating
- [ ] `src/shared/dto/exercise.ts`: `LastSessionDto`, `ExerciseLastSessionDto`
- [ ] `exercise.translator.ts`: a local set mapper (`LiftSet` → `LiftSetDto`, never importing
      `workouts/internal/`), reused by `translateToBestSetDto`, and
      `translateToExerciseLastSessionDto(session | null)`
- [ ] `ExerciseController.lastSession(req)`: `pathId` for the exercise,
      `optionalQueryInt(params, 'exceptWorkout', { min: 1, max: Number.MAX_SAFE_INTEGER })` — the
      helper's default `max` is 1000
- [ ] `exercise.routes.ts`: `'/api/exercises/:id/last-session': { GET }`
- [ ] Frontend `ExerciseApi.lastSession(id, exceptWorkout?)` and `ExerciseFacade.lastSession`
- [ ] `gz-workout-detail.component.ts`: type `WorkoutDetailData.exercises` and `#exercises` as
      `ExerciseWithStatsDto[]`, and pass them on as before
- [ ] `gz-add-set-form.component.ts`:
  - `exercises` setter typed `ExerciseWithStatsDto[]`
  - two caches: `#lastSessions = new Map<ExerciseId, ExerciseLastSessionDto>()` for resolved
    lookups and `#pending = new Map<ExerciseId, Promise<ExerciseLastSessionDto>>()`; a rejected
    lookup is dropped and shows no hint, without a toast
  - `template()` renders `<p class="last-session text-light" data-testid="last-session">` from
    `#lastSessions` when the selected exercise is resolved, empty otherwise, so the re-render after
    every logged set keeps it
  - `#showLastSession(exerciseId)`, called from `afterRender()` for the selected exercise and from
    the select's `change` listener: for an unresolved exercise, awaits the lookup, stores it, and —
    if that exercise is still selected — fills the hint in place:
    `Last · ${formatShortDate(performedOn)}: ${sets.map((s) => `${s.reps}×${formatNumber(s.weight)}`).join(' · ')}`
    plus ` · best ${formatWeight(bestWeight)}` when the list's `bestWeight` is neither null nor 0,
    or `No history yet`
  - prefill: an exercise with sets in this workout keeps today's `#prefillFrom`; otherwise reps and
    weight come from `session.sets[0]` on a selection change, and on first render when the workout
    has no sets yet (the reps and weight fields are then empty); never after the re-render that
    follows a logged set
- [ ] `gz-add-set-form.component.css`: spacing for `.last-session` only, no colors or font sizes
- [ ] `docs/backend.md`: the last-session endpoint beside the history aggregates, including that it
      counts done sets only and what `exceptWorkout` is for
- [ ] `docs/frontend.md`: the form's hint and prefill sources, in the paragraph on `gz-add-set-form`

**Automated Verification**:

- [ ] `exercise.routes.test.ts`: `last-session` answers the latest session's done sets in logged
      order; ignores skipped sets; picks the higher id between two sessions on the same date;
      `exceptWorkout` skips that workout and falls back to the one before; an `exceptWorkout` above
      1000 is accepted; `{ session: null }` without done sets; 404 for an unknown exercise; 400 for
      a non-numeric `exceptWorkout`
- [ ] `exercise.routes.test.ts`: the progress endpoint's `bestSet` is unchanged after
      `translateToBestSetDto` moves to the local mapper
- [ ] `exercises.facade.test.ts` (frontend): `lastSession` calls `/exercises/:id/last-session?exceptWorkout=:id`
- [ ] `gz-add-set-form.component.test.ts` (expected dates built with `formatShortDate`, which is
      locale-dependent): the hint renders `Last · …: 5×100 · … · best 110 kg`; no "best" part for a
      `bestWeight` of 0 or null; `No history yet` without a session; selecting an exercise not in the
      workout prefills from `sets[0]`; an empty workout prefills on first render; one already in it
      still prefills from this workout; the hint survives the re-render after a logged set; a late
      lookup for a deselected exercise does not overwrite the hint
- [ ] `bun test --parallel`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run fmt:check`

### Phase 2: Copy an exercise's last session

Dependencies: Phase 1

Add the batch copy endpoint and the form's "Add last session's N sets" button.

**Tasks**:

- [ ] `src/backend/shared/validate.ts`: `requiredIds(dto, field, { max = 200 })` — 400 unless a
      non-empty array, at most `max` long, of distinct JSON numbers that are safe integers ≥ 1
      (unlike `requiredInt`, numeric strings are refused); 200 matches the list endpoints' cap and
      bounds the picker
- [ ] `src/shared/dto/workout.ts`: `AddWorkoutExercisesDto { exerciseIds: ExerciseId[] }`
- [ ] `workout.translator.ts`: `translateToAddWorkoutExercisesDto(body)`
- [ ] `SetRepository.copyLastSessions(workoutId, exerciseIds)` in one `db.transaction()`:
      `#requireOpen(workoutId)` (404, then 409), then per id in order —
  - look up the exercise's name; missing → `badRequest('"exerciseIds" must name existing exercises')`
  - a `workout_exercises` row for it → `conflict('"<name>" is already in this workout')`
  - `LAST_SESSION_WORKOUT_SQL` with the target workout excluded; none → `conflict('"<name>" has no done sets to copy')`
  - read the target's current max position (`COALESCE(MAX(position), 0)` — not `create`'s
    `+ 1` query, since `ROW_NUMBER()` starts at 1), then
    ```sql
    INSERT INTO sets (workout_id, exercise_id, reps, weight, notes, position)
    SELECT ?1, exercise_id, reps, weight, notes, ?4 + ROW_NUMBER() OVER (ORDER BY position, id)
      FROM sets WHERE workout_id = ?2 AND exercise_id = ?3 AND done = 1
    ```
  - `this.#workoutExercises.append(workoutId, exerciseId)`
- [ ] `SetFacade.addExercises(workoutId, dto)`: validate with `requiredIds(dto, 'exerciseIds')`
      before touching the repository, so a malformed body is a 400 even on an unknown workout; an
      unknown exercise is only found per id, after the workout checks
- [ ] `WorkoutController.addExercises(req)`: answer the `WorkoutWithExercisesDto`, 200, like `moveExercise`
- [ ] `workout.routes.ts`: `'/api/workouts/:id/exercises': { POST }`
- [ ] Frontend `WorkoutApi.addExercises(id, dto)` and `SetFacade.addExercises(workoutId, exerciseIds)`
      posting through `WorkoutApi`, as `SetFacade.create` does
- [ ] `gz-add-set-form.component.ts`: when the selected exercise has no sets in this workout and its
      session is found, render below the `<form>` (outside the submit flow), after the hint,
      `<button type="button" class="outline" data-action="add-last-session" data-testid="add-last-session">Add last session's ${plural(n, 'set')}</button>`
      (Oat's outline variant); it is rendered or filled in place under the same rules as the hint.
      `handleAction('add-last-session')` reads the exercise id from the select at click time, posts
      `[exerciseId]`, and emits `set-logged` with `{ exerciseId }`, or toasts the error. A
      `#adding` flag, read by `template()`, keeps the button disabled across re-renders and ignores
      clicks while the request runs
- [ ] `docs/backend.md`: the endpoint after the move paragraph — what is copied, the order checks,
      the status codes, and that it is a fourth way `workout_exercises` rows appear (update the
      paragraph listing them)
- [ ] `docs/frontend.md`: the button in the `gz-add-set-form` paragraph

**Automated Verification**:

- [ ] `workout.routes.test.ts`: copies reps, weight and notes of the last session's done sets, in
      logged order, as not done, positioned after existing sets; several ids append exercises in
      request order; skipped sets are not copied; 400 for a missing, empty, non-array, numeric-string
      or duplicate-holding `exerciseIds` and for an unknown exercise; 404 for an unknown workout;
      409 for a done workout, an exercise already in it and one without done sets — each leaving
      the workout's sets and order unchanged (including when only the second id fails)
- [ ] `workout.routes.test.ts`, precedence: a malformed body on an unknown workout is a 400; an
      unknown exercise on an unknown workout is a 404; `[alreadyInWorkout, unknown]` is the 409
- [ ] `src/backend/shared/validate.test.ts`: `requiredIds` accepts distinct positive integers and
      refuses an empty array, a non-array, more than `max`, duplicates, 0, fractions, unsafe
      integers and numeric strings
- [ ] `workouts.facade.test.ts` (frontend): `setFacade.addExercises` posts `{ exerciseIds }` to `/workouts/:id/exercises`
- [ ] `gz-add-set-form.component.test.ts`: the button shows for an exercise not in the workout with
      a session, not for one in it or one without history; clicking it posts the selected id and
      emits `set-logged`; a second click while the request runs posts nothing
- [ ] `bun test --parallel`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run fmt:check`

### Phase 3: Start-session picker

Dependencies: Phase 2

Let "Start session" build a workout from several exercises' last sessions.

**Tasks**:

- [ ] `internal/gz-start-session-dialog.component.ts` (+ `.css`), modeled on `gz-confirm-dialog`:
  - `exercises: ExerciseWithStatsDto[]` set before it is appended
  - one checkbox per exercise, `<gz-muscle-group-icon>`, the name, and `last ${formatShortDate(lastPerformedOn)}`
  - records tick order in `#picked: ExerciseId[]` from `change` events (unticking removes)
  - footer: outline Cancel, outline "Start empty", primary "Start with N" (disabled at 0)
  - closes on Escape and backdrop like the confirm dialog, and dispatches a non-bubbling
    `start-session-closed` event with `null` (cancel), `[]` (start empty) or the picked ids
- [ ] `internal/start-session.ts`: `pickExercises(exercises): Promise<ExerciseId[] | null>`, as
      `confirmAction()` does for its dialog
- [ ] `gz-workout-list.component.ts`, `start-session` action:
  - `exerciseFacade.list()`, keep those with `lastPerformedOn !== null`, sort by `lastPerformedOn`
    descending, then name
  - none → create as today; otherwise `pickExercises`; `null` → stop
  - `workoutFacade.create({ performedOn: todayIso() })`, then, for a non-empty pick,
    `setFacade.addExercises(id, picked)`; a failed copy toasts and still navigates to the new workout
  - the button disables while this runs, so a double click does not start two sessions
- [ ] `docs/frontend.md`: the picker, next to the paragraph on the workout list and Repeat

**Automated Verification**:

- [ ] `gz-start-session-dialog.component.test.ts`: lists the given exercises; "Start with N" counts
      ticks and is disabled at 0; resolves the ids in tick order; unticking removes one; "Start
      empty" resolves `[]`; Cancel and Escape resolve `null`
- [ ] `gz-workout-list.component.test.ts`: with history, clicking Start session opens the dialog
      with only exercises that have history, newest first; picking creates the workout, posts the
      ids and navigates; Cancel creates nothing; without history it creates and navigates directly;
      a failed copy still navigates
- [ ] `bun test --parallel`
- [ ] `bun run typecheck`
- [ ] `bun run lint`
- [ ] `bun run fmt:check`

**Manual Verification**:

- [ ] With `bun run seed` data, Start session → tick two exercises → the new workout opens with
      their last sessions' sets in tick order, all unchecked
- [ ] In that workout, select an exercise not in it: the hint and prefill appear, "Add last
      session's N sets" adds them and opens its group; selecting an exercise already in it shows
      the hint without the button
- [ ] The dialog and the hint read well on a phone-width screen and in both themes

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `src/backend/features/workouts/internal/workout.repository.ts:58-95` — Repeat's copy, the model for `copyLastSessions`
- `src/backend/features/workouts/internal/set.repository.ts:64-93` — set creation and `#requireOpen`
- `src/backend/features/workouts/internal/workout-exercise.repository.ts:29-38` — `append`
- `src/backend/features/exercises/internal/exercise.repository.ts:137-168` — history queries over done sets
- `src/frontend/features/workouts/internal/gz-add-set-form.component.ts` — the form being extended
- `src/frontend/ui/confirm/` — the dialog and promise-helper pattern the picker follows
- `docs/backend.md:163-240` — transactions, `workout_exercises`, the done locks, history counts done sets only
- `docs/frontend.md:75-114` — facades across features, the card's Repeat, the detail page's form
