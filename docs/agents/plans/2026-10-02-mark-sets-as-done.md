---
date: 2026-10-02T10:37:33.110304+00:00
git_commit: 4dc59e8d3862f3636ae8ff679991aaac03fca594
branch: main
topic: 'Mark sets as done'
tags: [plan, workouts, sets, exercises, stats, migrations, gz-set-row, gz-workout-detail, gz-workout-list]
status: implemented
---

# PLAN: Mark sets as done

Give every set a done state that a button in its row toggles, both ways, at any time. A done set is
frozen: its weight, reps, exercise and notes cannot change and it cannot be deleted until it is
marked as not done again. A workout is done once it has sets and all of them are done. Sets that are
not done are plans rather than history, so the exercise and stats aggregates stop counting them.

## Acceptance Criteria

- Each set row has a leading toggle button (`.outline` when not done, default filled when done,
  `aria-pressed`) that flips the set's done state, every time and in both directions.
- A done set is frozen in the UI: Edit and × are hidden, +1 stays, the row text is muted.
- The API enforces the lock: `PATCH /api/sets/:id` on a done set accepts only `{ done }`; any other
  field — even alongside `done: false` — is a 409; `DELETE /api/sets/:id` on a done set is a 409.
- A workout is done when it has at least one set and every set is done. This is computed, never
  stored, so unchecking a set makes the workout not done again.
- The workout detail totals show an "x/y done" badge, replaced by a success "✓ Done" badge once the
  workout is done; workout list cards show "✓ Done" for done workouts only.
- Migration `002-set-done.sql` adds `sets.done` (0/1, default 0) and marks every existing set done.
  New sets and sets copied by "Repeat" start not done.
- Best set, progress, the exercise list stats and the stats summary count only done sets. The
  workout totals (detail and list cards) and the exercise delete guard count every set.
- `bun run seed` marks every seeded set done except those of today's workout.
- `docs/backend.md` and `docs/frontend.md` describe the done state, the lock and which aggregates
  filter on it.

## Technical Key Decisions and Tradeoffs

1. **A workout's done state is derived, not stored:** `done` is computed from its sets.
   - Why: the set toggle works both ways, and a derived value can never drift out of sync with it.
   - Impact: no `workouts` column; `WorkoutWithStatsDto` gains `done` and `doneSetCount` from the
     list's aggregate, `WorkoutWithSetsDto` gains `done` from its sets. `WorkoutDto` (the PATCH
     response) stays as it is.
2. **A set's done state is a boolean column, backfilled to done:**
   `done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1))`, then `UPDATE sets SET done = 1`.
   - Why: the simplest representation of what was asked; existing sessions really happened.
   - Impact: `SET_COLUMNS`, `LiftSet` (`done: 0 | 1`), `LiftSetDto` (`done: boolean`), the edit
     whitelist and a new `requiredBoolean` validator. The DTO is a boolean; the 0/1 integer stays
     behind the translator.
3. **Done locks the whole set, and the server enforces it:** the stored state decides.
   - Why: one rule — the toggle is the only way to unlock — that a stale tab or `curl` cannot bypass.
   - Impact: `SetRepository.update` throws the existing `conflict()` (409) for a done set whose
     patch holds any field other than `done` (including `position`); `SetRepository.delete` throws
     it for any done set. A not-done set may be edited and marked done in one PATCH; a done set may
     not be unlocked and edited in one. An empty PATCH on a done set stays a 200 no-op.
4. **Toggling reuses `PATCH /api/sets/:id`:** `{ "done": true | false }`; no new route.
   - Why: `done` is just another field of a set; `EditSetDto` already carries partial patches.
   - Impact: `CreateSetDto` gets no `done` — new sets always start not done; the seeder marks its
     sets through `update`.
5. **The toggle uses Oat's built-in button styles only:** `.outline` ↔ default filled, `.icon.small`.
   - Why: Oat has no success button variant, and buttons are colored by Oat's variants only.
   - Impact: the done look of the row (muted text) lives in `gz-set-row.component.css`; the workout
     badge uses Oat's `badge` with `data-variant="success"`.
6. **Exercise and stats aggregates count done sets only:** `s.done = 1` in their SQL.
   - Why: after "Repeat", the not-done sets are a plan; counting them would inflate best set,
     progress and totals with lifts that never happened.
   - Impact: the exercise list's `LEFT JOIN` takes `AND s.done = 1` in its `ON` clause so exercises
     without done sets still list; the delete guard keeps counting every set, so an exercise a
     planned set uses cannot be deleted (its message says "set(s)" rather than "logged set(s)").
   - Tradeoff: the stats summary's workout-based numbers (`workout_count`, `workouts_last_30_days`,
     `last_performed_on`) keep counting every workout, so a fresh "Repeat" with nothing checked
     already counts as a session on its date. Only the set-based numbers filter on done, which also
     makes the dashboard's "N sets total" hint count done sets only.

## Current State

```
gz-workout-detail  (/workouts/:id)
 ├─ header form (date, title, notes)
 ├─ totals badges: (N sets) (M exercises) (R reps) (V total volume)
 ├─ <gz-set-row> × N
 │    read: index · exercise · 80 kg × 5 · note · volume  [Edit] [+1] [×]
 │    edit: exercise / reps / weight / notes  [Save] [Cancel]
 │    → setFacade.update/create/delete → emits 'sets-changed' → whole view reloads
 └─ <gz-add-set-form>

gz-workout-list  (/workouts)
 └─ card: title · date · (N sets · M exercises · V) [Repeat]

PATCH /api/sets/:id → SetController.update → SetFacade.#validateEdit
                     → translateDtoToEditSet → SetRepository.update (buildUpdate over FIELDS)

workouts(id, performed_on, title, notes, created_at)
sets(id, workout_id, exercise_id, reps, weight, notes, position, created_at)
```

- `src/backend/db/migrations/001-initial-schema.sql` is the only migration; `readMigrations` reads
  the directory both at runtime and for the single-file build, so a new file needs no registration.
- `SET_COLUMNS` (`src/backend/features/workouts/ports/sql.ts:13`) is shared with the exercises
  feature (`bestSet`).
- "Repeat" copies sets with an explicit column list (`workout.repository.ts:82`), so a new column is
  not copied and defaults to 0.
- `WorkoutRepository.list` (`workout.repository.ts:24`) computes the card stats in one aggregate.
- `ExerciseRepository.list`, `.progress`, `.bestSet` (`exercise.repository.ts`) and
  `StatsRepository.summary` (`stats.repository.ts`) aggregate every set.
- There is no `requiredBoolean` in `src/backend/shared/validate.ts` and no test for `gz-set-row`.

## Desired End State

```
Workout detail
  Push day
  ┌ Sets ───────────────────────────────────────────────────────────────────┐
  │ [■✓■] 1  Bench Press   80 kg × 5   felt easy   400 kg               [+1] │  done: muted, frozen
  │ [■✓■] 2  Bench Press   80 kg × 5               400 kg               [+1] │
  │ [ ✓ ] 3  Back Squat   100 kg × 5               500 kg  [Edit] [+1] [×]  │  not done
  └──────────────────────────────────────────────────────────────────────────┘
  totals: (3 sets) (2 exercises) (15 reps) (1,300 kg total volume) (2/3 done)
          … all checked → (3 sets) (2 exercises) (15 reps) (1,300 kg total volume) (✓ Done)

Mobile (≤ 720px)
  [■✓■] 1  Bench Press            80 kg × 5
           felt easy
           [+1]

Workout list
  Push day                        (5 sets · 2 exercises · 2,000 kg) (✓ Done)  [Repeat]
  Mon, Sep 29 · 3 days ago
  Leg day                         (4 sets · 1 exercise · 1,600 kg)            [Repeat]
```

```
PATCH /api/sets/:id  { done }                   → 200 always (toggle)
PATCH /api/sets/:id  { reps, … } on done set    → 409 "Set is done; mark it as not done before changing it"
PATCH /api/sets/:id  { done: false, reps } done → 409
DELETE /api/sets/:id on done set                → 409 "Set is done; mark it as not done before deleting it"

sets(…, done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1)))
LiftSetDto.done: boolean
WorkoutWithStatsDto.done: boolean, .doneSetCount: number
WorkoutWithSetsDto.done: boolean
```

## Abstractions and Code Reuse

- `src/backend/db/migrations/002-set-done.sql` — new: adds the column, backfills 1.
- `src/backend/shared/validate.ts` — new `requiredBoolean(dto, field)`: accepts only `true` / `false`
  (no string coercion — the frontend sends JSON booleans), else
  `` badRequest(`"${field}" must be true or false`) ``.
- `src/shared/dto/set.ts` — `LiftSetDto.done: boolean`, `EditSetDto.done?: boolean`.
- `src/shared/dto/workout.ts` — `WorkoutWithStatsDto.done`, `.doneSetCount`; `WorkoutWithSetsDto.done`.
- `src/backend/features/workouts/`
  - `ports/sql.ts` — `SET_COLUMNS` gains `s.done`.
  - `ports/set.ts` — `LiftSet.done: 0 | 1`.
  - `ports/workout.ts` — `WorkoutWithStats.done_set_count: number`.
  - `internal/set.repository.ts` — `EditSet` gains `done?: 0 | 1` (not `CreateSet`; split the type
    so `EditSet = Partial<CreateSet> & { done?: 0 | 1 }`), `FIELDS` gains `'done'`; `update` and
    `delete` check the stored state and throw `conflict()`.
  - `internal/set.translator.ts` — read `done` in `translateToEditSetDto`, map it to 0/1 in
    `translateDtoToEditSet`, map `row.done === 1` in `translateToLiftSetDto`.
  - `internal/workout.repository.ts` — `list` adds `COALESCE(SUM(s.done), 0) AS done_set_count`.
  - `internal/workout.translator.ts` — new local `isDone(setCount, doneSetCount)`
    (`setCount > 0 && doneSetCount === setCount`) used by both `translateToWorkoutWithStatsDto` and
    `translateToWorkoutWithSetsDto`.
  - `workouts.facade.ts` — `SetFacade.#validateEdit` validates `done` with `requiredBoolean`.
- `src/backend/features/exercises/internal/exercise.translator.ts` — `translateToBestSetDto` lists
  every `LiftSetDto` field by hand (`BestSetDto extends LiftSetDto`), so it gains `done` too.
- `src/backend/features/exercises/internal/exercise.repository.ts` — `list`, `progress`, `bestSet`
  filter on `s.done = 1`; the delete guard's message drops "logged".
- `src/backend/features/stats/internal/stats.repository.ts` — set-based subqueries and the 30-day
  join filter on `done = 1`.
- `src/frontend/features/workouts/`
  - `internal/gz-set-row.component.ts` / `.css` — the toggle, the frozen row, the grid column.
  - `gz-workout-detail.component.ts` — the done badge in the totals.
  - `gz-workout-list.component.ts` — the done badge on the card.
  - `workouts.fixtures.ts` — `set()` defaults `done: false`.
- `src/backend/features/workouts/workouts.fixtures.ts` — new `markDone(patch, setId)` test helper
  that PATCHes `{ done: true }` and expects a 200, for tests whose sets must count in aggregates.
- `src/scripts/seed.ts` — marks sets done unless `daysAgo === 0`.

The existing `conflict()` helper, `buildUpdate`, the `sets-changed` reload and the `set()` /
`createSet` / `createWorkout` fixtures are reused; only the two fixture files above change.

## Logging & Observability

No changes. A rejected edit of a done set is a 409 `HttpError`, returned as the usual JSON error
body and shown by `toastError` in the UI.

## Implementation

### Phase 1: Toggle a set as done

Dependencies: None

Store a done state on every set, expose it through the API, and let the set row toggle it. No lock
yet.

**Tasks**:

- [x] `src/backend/db/migrations/002-set-done.sql`: add the column and backfill.
      ```sql
      ALTER TABLE sets ADD COLUMN done INTEGER NOT NULL DEFAULT 0 CHECK (done IN (0, 1));

      -- Every set logged before this migration was performed, not planned.
      UPDATE sets SET done = 1;
      ```
- [x] `src/backend/shared/validate.ts`: add `requiredBoolean<T extends object>(dto: T, field: keyof T & string): boolean`.
- [x] `src/shared/dto/set.ts`: add `done: boolean` to `LiftSetDto` and `done?: boolean` to `EditSetDto`.
- [x] `src/backend/features/workouts/ports/set.ts`: add `done: 0 | 1` to `LiftSet`.
- [x] `src/backend/features/workouts/ports/sql.ts`: append `s.done` to `SET_COLUMNS`.
- [x] `src/backend/features/workouts/internal/set.repository.ts`: `EditSet = Partial<CreateSet> & { done?: 0 | 1 }`, add `'done'` to `FIELDS`.
- [x] `src/backend/features/workouts/internal/set.translator.ts`: read `body.done` in `translateToEditSetDto`; set `patch.done = dto.done ? 1 : 0` in `translateDtoToEditSet`; `done: row.done === 1` in `translateToLiftSetDto`.
- [x] `src/backend/features/workouts/workouts.facade.ts`: `SetFacade.#validateEdit` validates `done` with `requiredBoolean`.
- [x] `src/backend/features/exercises/internal/exercise.translator.ts`: `translateToBestSetDto` sets `done: row.done === 1`.
- [x] `src/scripts/seed.ts`: after `sets.create(...)`, call `sets.update(logged.id, { done: true })` unless `daysAgo === 0`, so today's workout shows sets still to do.
- [x] `src/frontend/features/workouts/workouts.fixtures.ts`: `set()` defaults `done: false`.
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.ts`: add a leading toggle in the read template and a `toggle-done` action calling `setFacade.update(set.id, { done: !set.done })`, then `emit('sets-changed')`; `toastError` on failure.
      ```ts
      <button
        class="${set.done ? '' : 'outline'} icon small toggle"
        data-action="toggle-done"
        aria-pressed="${set.done ? 'true' : 'false'}"
        aria-label="${set.done ? 'Mark set as not done' : 'Mark set as done'}"
      >✓</button>
      ```
      `html` renders `false` as an empty string (`src/frontend/ui/html.ts:24`), hence the explicit
      `'true'` / `'false'`.
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.css`: add a leading grid column for the toggle (desktop and the ≤ 720px areas, where the toggle sits left of the index).
- [x] `src/backend/features/workouts/set.routes.test.ts`: a new set is `done: false`; `PATCH { done: true }` returns `done: true`, `PATCH { done: false }` flips it back; `PATCH { done: 'yes' }` is a 400.
- [x] `src/backend/features/workouts/workout.routes.test.ts`: a set copied by "Repeat" (`copyFromWorkoutId`) from a done set starts `done: false`.
- [x] `src/backend/features/workouts/workouts.facade.test.ts`: `SetFacade.update` with `{ done: true }` returns a row with `done: 1`.
- [x] `src/backend/features/exercises/exercise.routes.test.ts`: the `progress.bestSet` `toEqual` expectation (around L118-129) gains `done: false` (Phase 4 turns it into `true`).
- [x] `src/backend/db/migrations.test.ts`: in "adopt a database that already has the schema but no ledger" (around L166-176), the expected `applied` becomes `[1, 2]` and `schemaVersion` 2. Extend that test (or add a sibling built the same way — 001's SQL run by hand, then `migrate`) so a set inserted before `migrate` ends up with `done = 1`, a set inserted after defaults to 0, and setting `done = 2` throws.
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.test.ts` (new): the toggle renders with `aria-pressed="false"` and `.outline` for a not-done set, clicking it PATCHes `/api/sets/:id` with `{ done: true }` and emits `sets-changed`; a done set renders `aria-pressed="true"` and clicking sends `{ done: false }`.
- [x] `docs/backend.md`: the data model paragraph mentions `done` on `sets`, its default and the 002 backfill.
- [x] `docs/frontend.md`: the `gz-set-row` mention covers the done toggle.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/workouts` passes
- [x] `bun test --parallel src/backend/db/migrations.test.ts` passes
- [x] `bun test --parallel src/frontend/features/workouts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] After `bun run migrate`, existing workouts show every set toggled done; clicking a toggle flips it and the state survives a reload.

### Phase 2: Lock done sets

Dependencies: Phase 1

Freeze a done set in the API and the row.

**Tasks**:

- [x] `src/backend/features/workouts/internal/set.repository.ts`: in `update`, take the row from `this.require(id)`; if `current.done === 1` and the patch holds any key other than `done`, `throw conflict('Set is done; mark it as not done before changing it')`. In `delete`, if the set is done, `throw conflict('Set is done; mark it as not done before deleting it')`. Validation still runs first in the facade, so a malformed body stays a 400. A `position` change counts as a change (409); an empty patch is a 200 no-op.
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.ts`: for a done set, leave out the Edit and × buttons (keep +1) and add a `done` class to `.row-view`.
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.css`: `.row-view.done` mutes `.exercise` and `.load` with `var(--muted-foreground)` (no derived colors).
- [x] `src/backend/features/workouts/set.routes.test.ts`: on a done set, `PATCH { reps }`, `{ weight }`, `{ exerciseId }`, `{ notes }` and `{ done: false, reps }` are 409 and leave the set unchanged; `PATCH { done: false }` is 200 and a following `PATCH { reps }` is 200; `PATCH { done: true, reps }` on a not-done set is 200; `DELETE` on a done set is 409, on a not-done set 204; deleting the workout still removes its done sets.
- [x] `src/backend/features/workouts/workouts.facade.test.ts`: `SetFacade.update` / `.delete` on a done set throw an `HttpError` with status 409.
- [x] `src/frontend/features/workouts/internal/gz-set-row.component.test.ts`: a done row has no `[data-action='edit']` or `[data-action='delete']` but has `[data-action='duplicate']` and the toggle; a not-done row has all four.
- [x] `docs/backend.md`: describe the lock — a done set accepts only `done` and cannot be deleted (409), and the stored state decides.
- [x] `docs/frontend.md`: a done row hides Edit and ×.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/workouts` passes
- [x] `bun test --parallel src/frontend/features/workouts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] A done row is muted and offers only the toggle and +1; unchecking it brings Edit and × back.

### Phase 3: Workout done state

Dependencies: Phase 1

Compute the workout's done state and show it on the detail page and the list cards.

**Tasks**:

- [x] `src/shared/dto/workout.ts`: add `done: boolean` and `doneSetCount: number` to `WorkoutWithStatsDto`; add `done: boolean` to `WorkoutWithSetsDto`.
- [x] `src/backend/features/workouts/ports/workout.ts`: add `done_set_count: number` to `WorkoutWithStats`.
- [x] `src/backend/features/workouts/internal/workout.repository.ts`: `list` selects `COALESCE(SUM(s.done), 0) AS done_set_count`.
- [x] `src/backend/features/workouts/internal/workout.translator.ts`: add `isDone(setCount, doneSetCount)`; `translateToWorkoutWithStatsDto` sets `doneSetCount` and `done`; `translateToWorkoutWithSetsDto` sets `done` from `sets.length` and the count of `row.done === 1`.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.ts`: in the totals, render `<span class="badge" data-variant="success">✓ Done</span>` when `workout.done`, else `<span class="badge outline">${doneCount}/${sets.length} done</span>` — only when the workout has sets.
- [x] `src/frontend/features/workouts/gz-workout-list.component.ts`: in `#card`, render `<span class="badge" data-variant="success">✓ Done</span>` after the stats badge when `workout.done`.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.test.ts`: the `WORKOUT` literal gains `done: false` so typecheck passes (it is the only DTO literal of these types in the tests).
- [x] `src/backend/features/workouts/workout.routes.test.ts`: an empty workout is `done: false` in `GET /api/workouts/:id` and the list; with one of two sets done it is `done: false` and `doneSetCount: 1`; with both done it is `done: true`, `doneSetCount: 2`; unchecking one makes it `done: false` again.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.test.ts`: with 1 of 3 sets done the totals show "1/3 done"; with all done they show "✓ Done" and no "x/y done"; with no sets neither shows.
- [x] `src/frontend/features/workouts/gz-workout-list.component.test.ts` (new): with a page of one done and one not-done workout, only the done card shows a `.badge[data-variant='success']` reading "✓ Done".
- [x] `docs/backend.md`: a workout's done state is derived from its sets (at least one, all done) and never stored.
- [x] `docs/frontend.md`: the workout detail's "x/y done" / "✓ Done" badge and the list card's "✓ Done" badge.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/workouts` passes
- [x] `bun test --parallel src/frontend/features/workouts` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] Checking the last open set flips the detail badge from "x/y done" to "✓ Done", and the workout's card in the list shows "✓ Done"; unchecking one set removes both.

### Phase 4: Stats count only done sets

Dependencies: Phase 1

Keep planned sets out of history-based numbers.

**Tasks**:

- [x] `src/backend/features/exercises/internal/exercise.repository.ts`: `list` joins `LEFT JOIN sets s ON s.exercise_id = e.id AND s.done = 1` (the `workouts` join follows it, so `workout_count` and `last_performed_on` count done sets too); `progress` and `bestSet` add `AND s.done = 1` to their `WHERE`. `delete`'s guard keeps counting every set; its message becomes `Exercise is used by ${used.n} set(s); delete those sets first to keep your history intact`.
- [x] `src/backend/features/workouts/workouts.fixtures.ts`: add `markDone(patch: TestServer['patch'], setId: LiftSetId): Promise<LiftSetDto>` (PATCH `{ done: true }`, expect 200).
- [x] `src/backend/features/exercises/exercise.routes.test.ts`: the existing progress test (around L98-131) marks its sets done with `markDone`, and its `bestSet` expectation becomes `done: true`.
- [x] `src/backend/features/stats/stats.routes.test.ts`: the existing summary test (around L16-23) marks its set done with `markDone`.
- [x] `src/backend/features/stats/internal/stats.repository.ts`: the `set_count`, `total_reps` and `total_volume` subqueries add `WHERE done = 1`; the 30-day query joins `LEFT JOIN sets s ON s.workout_id = w.id AND s.done = 1`. `workout_count`, `workouts_last_30_days` and `last_performed_on` keep counting workouts.
- [x] `src/backend/features/exercises/exercise.routes.test.ts`: a not-done set is left out of the list's `setCount`, `workoutCount`, `lastPerformedOn` and `bestWeight`, out of the progress points and out of the best set; an exercise used only by a not-done set still lists (with zero counts) and still cannot be deleted (409).
- [x] `src/backend/features/stats/stats.routes.test.ts`: a not-done set is left out of `setCount`, `totalReps`, `totalVolume` and `volumeLast30Days`, while its workout still counts in `workoutCount`.
- [x] `docs/backend.md`: which aggregates count only done sets (exercise list stats, progress, best set, the stats summary's set-based numbers) and which count every set or workout (workout totals, the exercise delete guard, the summary's workout counts and last performed day).

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/exercises` passes
- [x] `bun test --parallel src/backend/features/stats` passes
- [x] `bun test --parallel` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] After `bun run seed` on an empty database, today's workout shows open sets, and its weights do not appear in the exercise pages' best set or progress chart until they are checked.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Phase 1: `markDone` was added to `src/backend/features/workouts/workouts.fixtures.ts` already in
  Phase 1 (planned for Phase 4), since the "Repeat" test needs a done source set.
- Phase 1: `src/backend/db/db.test.ts` pins the schema version too; it now expects 2.
- Phase 2: the build and hot-reload tests failed once each across several full-suite runs and
  passed alone; they touch the filesystem and none of this change, so they are treated as
  pre-existing flakiness under `--parallel`.
- Phase 4: the seeder's closing line reports the summary's `set_count`, which now counts done sets
  only (95 of the 101 seeded sets).

## References

- `docs/agents/research/2026-09-22-opening-and-creating-workouts-and-exercises.md`
- `docs/agents/plans/2026-10-01-reduce-component-sizes.md` — `gz-set-row` / `gz-add-set-form` split
- `docs/agents/plans/2026-10-01-consolidate-test-helpers.md` — the `set()` / `createSet` fixtures
- `node_modules/@knadh/oat/css/button.css`, `badge.css` — the button styles and the success badge
