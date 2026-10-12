---
date: 2026-10-12T13:15:21.450975+00:00
git_commit: 002b4103582cc7472cf6d7f25ffae2a4fa9c4f83
branch: main
topic: 'Bodyweight exercises'
tags: [plan, exercises, sets, stats, progression, migrations]
status: ready
---

# PLAN: Bodyweight exercises

Let an exercise be marked as bodyweight. Its sets are reps only — no weight input anywhere — and
the flag, rather than a guess from a volume of 0, decides how the Statistics page compares it with
its previous session. Its progress pages and hints speak in reps instead of kilograms.

## Acceptance Criteria

- An exercise has a `bodyweight` flag, set with an Oat switch labeled "Bodyweight" in "Add an
  exercise" and "Edit exercise"; a bodyweight exercise is labeled "Bodyweight" on its list card
  and under its name on its page.
- Migration 006 adds `exercises.bodyweight` (0/1, default 0) and marks bodyweight every exercise
  that has at least one set and whose sets all have weight 0.
- `PATCH /api/exercises/:id` with `bodyweight: true` is a 409 while any set of the exercise has a
  non-zero weight; `bodyweight: false` is always allowed. A non-boolean `bodyweight` is a 400.
- `weight` on `POST /api/workouts/:id/sets` is optional: for a bodyweight exercise it is stored as
  0 and any non-zero value is a 400; for a weighted exercise it stays required (a 400 without it).
  A `PATCH /api/sets/:id` setting a non-zero weight on a bodyweight exercise's set is a 400.
- A bodyweight exercise's set rows have no weight input and no volume; the add-set form shows no
  weight field while a bodyweight exercise is selected; its last-session hint reads
  "Last · Oct 9: 12 · 10 · 8 reps"; its group summary reads "3 sets · 30 reps"; deleting one of
  its sets asks about "12 reps".
- Statistics: a bodyweight exercise's progression is its done reps ÷ those of its previous
  session − 1; a weighted exercise's is its done volume ÷ that of its previous session − 1, and it
  is not compared when either session's volume is 0. There is no reps fallback any more.
- A bodyweight exercise's page shows the tiles Sessions · Best set ("15 reps") · Top set (the
  latest session's most reps in a set, with its change against the previous session) · Total reps;
  the chart offers Top set and Total reps; the session table shows Date · Sets · Top set · Reps,
  with the change on Reps. Its list card reads "15 reps best" and the add-set hint ends in "best 15 reps".
- The seed holds a bodyweight "Dips" on push day.
- `docs/backend.md` and `docs/frontend.md` describe the flag, the set rule, the migration, the
  comparison and the reps views.

## Technical Key Decisions and Tradeoffs

1. **Bodyweight means reps only:** a loaded variant (belted pull-up, weighted dip) is a separate,
   weighted exercise, as the seed's "Pull-up" already is.
   - Why: one flag then decides both the input and the comparison.
   - Impact: `sets.weight` stays `NOT NULL`; bodyweight sets store 0.
2. **The backend enforces weight 0:** `CreateSetDto.weight` becomes optional; `SetRepository`
   reads the exercise's flag inside its transaction and defaults, accepts or refuses the weight.
   - Why: no client can attach a load to a bodyweight exercise.
   - Impact: the unknown-exercise 400 now comes from that lookup as well as the foreign key.
3. **Changing to bodyweight is blocked by weighted history (409):** like the delete guard, history
   is never rewritten; weighted ← bodyweight is free since old sets read as 0 kg.
   - Impact: a check in `ExerciseRepository.update`.
4. **The flag alone decides the comparison:** reps for bodyweight, volume for weighted, and a
   weighted session pair with a 0 volume is not compared.
   - Why: the user chose the strict rule over keeping the reps fallback for weighted exercises.
   - Impact: the `sessions` CTE joins `exercises` for `e.bodyweight`; the fallback tests are
     rewritten.
5. **Backfill in the migration:** exercises with sets, all at weight 0, become bodyweight.
   - Why: they keep being compared without manual work under decision 4.
   - Impact: mixed history (the seed's Pull-up, 0 kg in its first week) stays weighted.
6. **The flag travels on `ExerciseDto` and `WorkoutExerciseDto` only:** a `gz-set-row` gets it
   from its group, `gz-add-set-form` from the exercise list it is already handed; `LiftSetDto` is
   unchanged.
7. **Reps metrics for the views:** `topReps` (`MAX(s.reps)`) on `SessionPointDto` and `bestReps`
   (`MAX(s.reps)`) on `ExerciseWithStatsDto`, done sets only like their siblings. `bestSet`
   already orders by est. 1RM (0 for bodyweight), weight, then reps, so for a bodyweight exercise
   it already is the set with the most reps.
8. **Four vertical phases:** flag → logging → statistics → progress views, each usable on its own.
   - Impact: until phase 2 lands, the API still accepts a weight on a bodyweight exercise's set;
     phases 3 and 4 depend only on phase 1, except phase 4's add-set hint, which builds on phase 2.

## Current State

```
exercises (id, name, muscle_group, notes, created_at)            no notion of bodyweight
sets      (…, reps INTEGER NOT NULL, weight REAL NOT NULL, …)     bodyweight work = weight 0

Weight inputs
├─ gz-add-set-form   Reps · Weight (kg) · Notes                    workouts/internal/gz-add-set-form.component.ts:244-247
│                     "Last · Oct 9: 12×0 · 10×0"                   :186
└─ gz-set-row        [ 60 kg ] × [ 5 reps ]  300 kg                 workouts/internal/gz-set-row.component.ts:180-215

Statistics  StatsRepository.calendar()                             stats/internal/stats.repository.ts:29-38
  exerciseProgression(row):
    no previous session          → null
    volume > 0 on both sides     → volume ÷ previous − 1
    otherwise                    → reps ÷ previous reps − 1         the bodyweight guess
```

- Set weight is validated `requiredNumber(…, { min: 0 })` in `SetFacade`
  (`src/backend/features/workouts/workouts.facade.ts:128,139`); `SetRepository.create` turns the
  foreign key failure into `"exerciseId" must name an existing exercise`
  (`internal/set.repository.ts:64-93`).
- `WorkoutExerciseDto` carries the exercise's name and muscle group, read in
  `workout-exercise.repository.ts:20`.
- Weight-only figures: the exercise detail's tiles, chart metrics and table
  (`gz-exercise-detail.component.ts:137-166`, `internal/gz-progress-chart.component.ts:19-28`,
  `internal/gz-session-table.component.ts`), the list card's "best"
  (`gz-exercise-list.component.ts:91`), the group summary (`gz-workout-detail.component.ts:388-392`).
- The delete guard style a 409 follows: `exercise.repository.ts:128-135`; `update()` is at `:111-126`.
- Oat ships a switch: `input[type=checkbox][role=switch]` (`node_modules/@knadh/oat/css/form.css:101`).
  `GzElement.formData()` drops an unchecked checkbox and gives a checked one `'on'`
  (`src/frontend/ui/base.ts:66-74`).

## Desired End State

```
exercises (…, bodyweight INTEGER NOT NULL DEFAULT 0 CHECK (bodyweight IN (0, 1)))

ExerciseDto.bodyweight ─┬─ list card label, detail label, reps tiles/chart/table
                        └─ gz-add-set-form (via ExerciseWithStatsDto) ─ weight field hidden
WorkoutExerciseDto.bodyweight ─ group summary in reps ─ gz-set-row.bodyweight ─ no weight, no volume

POST /sets  weight?  ─▶ SetRepository: bodyweight → 0 (≠ 0 → 400) │ weighted → required
StatsRepository.calendar(): sessions CTE + e.bodyweight
  exerciseProgression(row):
    no previous session          → null
    bodyweight                   → reps ÷ previous reps − 1
    weighted, both volume > 0    → volume ÷ previous − 1
    weighted, otherwise          → null
```

Add / edit form:

```
┌ Add an exercise ───────────────────────────────────────────────────────┐
│ Name [Dips            ]  Muscle group [Chest ▾]  Notes [            ]  │
│ (●) Bodyweight                                                [Add]    │
└────────────────────────────────────────────────────────────────────────┘
```

Exercise list card:

```
┌──────────────────────────────────────────────┐
│ Dips                                         │
│ 💪 Chest · Bodyweight · Lean forward         │
│ 18 sets · 15 reps best · 3 days ago          │
└──────────────────────────────────────────────┘
```

Workout page, a bodyweight group, before and after:

```
▾ 💪 Dips     3 sets · 0 kg          1/3 done      ▾ 💪 Dips     3 sets · 30 reps        1/3 done
  ✓ 1  [ 0  kg] × [12 reps]  Notes   0 kg  +1 ×      ✓ 1  [12 reps]  Notes             +1 ×
    2  [ 0  kg] × [10 reps]  Notes   0 kg  +1 ×        2  [10 reps]  Notes             +1 ×
```

Add-set form with Dips selected:

```
Exercise [Dips ▾]  Reps [12]  Notes [          ]  [Log set]
Last · Oct 9: 12 · 10 · 8 reps · best 15 reps
[Add last session's 3 sets]
```

Exercise page of a bodyweight exercise:

```
Dips
💪 Chest · Bodyweight
[Sessions   ][Best set  ][Top set              ][Total reps        ]
  12          15 reps     15 reps               412
  last 3 days Oct 9       +2 reps vs. previous  across all sessions

Top set                                   [ Top set | Total reps ]
 ── chart ──
Most reps in one set in each session.

Session history
Date      Sets  Top set  Reps
Oct 9     3     15       36 +3
```

## Abstractions and Code Reuse

- `src/backend/db/migrations/006-bodyweight-exercises.sql` - `ALTER TABLE … ADD COLUMN` and the
  backfill `UPDATE`
- `src/shared/dto/`
  - `exercise.ts` - `bodyweight` on `ExerciseDto`, `CreateExerciseDto`, `EditExerciseDto`;
    `bestReps` on `ExerciseWithStatsDto`; `topReps` on `SessionPointDto`
  - `workout.ts` - `bodyweight` on `WorkoutExerciseDto`
  - `set.ts` - `CreateSetDto.weight` optional
- `src/backend/features/exercises/`
  - `ports/exercise.ts` - `bodyweight: 0 | 1`, `best_reps`, `top_reps`
  - `internal/exercise.repository.ts` - columns, `create`, `update` guard, `list`, `progress`
  - `internal/exercise.translator.ts` - the new fields both ways
  - `exercises.facade.ts` - `requiredBoolean` for `bodyweight`
- `src/backend/features/workouts/`
  - `ports/workout-exercise.ts`, `internal/workout-exercise.repository.ts`,
    `internal/workout.translator.ts` - `bodyweight` on the group
  - `internal/set.repository.ts` - `#weightFor(exerciseId, weight)`, used by `create` and `update`
  - `internal/set.translator.ts`, `workouts.facade.ts` - optional weight
- `src/backend/features/stats/internal/stats.repository.ts` - `exerciseProgression` by flag
- `src/frontend/features/exercises/`
  - `gz-exercise-list.component.ts`, `gz-exercise-detail.component.ts` - switch, label, reps views
  - `internal/gz-progress-chart.component.ts`, `internal/gz-session-table.component.ts` - a
    `bodyweight` property choosing metrics and columns
  - `exercises.fixtures.ts` - `bodyweight: false`, `bestReps: null`, `topReps` defaults
- `src/frontend/features/workouts/`
  - `gz-workout-detail.component.ts` - group summary, `row.bodyweight`
  - `internal/gz-set-row.component.ts` - `bodyweight` property, set before `set` like `locked`
  - `internal/gz-add-set-form.component.ts` - `#isBodyweight(id)`, weight field toggled on
    selection, reps-only hint
  - `workouts.fixtures.ts` - `bodyweight: false` on groups
- `src/scripts/seed.ts` - `bodyweight` on the exercise list, "Dips" with a weekly rep step
- `src/backend/features/exercises/exercises.fixtures.ts` - `createExercise(post, name, extra?)`
  posting `{ name, ...extra }`, so tests can create a bodyweight exercise

Reused as they are: `requiredBoolean`, `conflict`/`badRequest`, `buildUpdate` (with
`bodyweight` added to `FIELDS`), `formatDelta`, `plural`, `gz-tile`, `gz-chart`, the frontend
`formData()`.

## Logging & Observability

No new logging; the new 400s and the 409 carry the usual `{ error }` body through the access log.

## Implementation

### Phase 1: Bodyweight flag on exercises

Dependencies: None

Store, validate and show the flag, with the backfill and the guard against weighted history.

**Tasks**:

- [x] `src/backend/db/migrations/006-bodyweight-exercises.sql`:
      ```sql
      ALTER TABLE exercises ADD COLUMN bodyweight INTEGER NOT NULL DEFAULT 0 CHECK (bodyweight IN (0, 1));

      -- Exercises that were only ever logged without weight.
      UPDATE exercises SET bodyweight = 1
       WHERE EXISTS (SELECT 1 FROM sets WHERE sets.exercise_id = exercises.id)
         AND NOT EXISTS (SELECT 1 FROM sets WHERE sets.exercise_id = exercises.id AND sets.weight <> 0);
      ```
- [x] `src/shared/dto/exercise.ts`: `bodyweight: boolean` on `ExerciseDto`; `bodyweight?: boolean`
      on `CreateExerciseDto` and `EditExerciseDto`
- [x] `ports/exercise.ts`: `bodyweight: 0 | 1` on `Exercise`
- [x] `exercise.repository.ts`: `EXERCISE_COLUMNS` and the `RETURNING` gain `bodyweight`;
      `CreateExercise.bodyweight: 0 | 1` inserted; `FIELDS` gains `'bodyweight'`; `update()` throws
      before writing when `patch.bodyweight === 1` and the exercise is weighted with a set of
      non-zero weight:
      `conflict(\`"${name}" has sets with weight; it cannot become bodyweight\`)`
- [x] `exercise.translator.ts`: `bodyweight` in `translateToCreateExerciseDto`,
      `translateToEditExerciseDto` (as `boolean | undefined`), `translateDtoToCreateExercise`
      (`dto.bodyweight ? 1 : 0`), `translateDtoToEditExercise`, and `bodyweight: row.bodyweight === 1`
      in `translateToExerciseDto` and `translateToExerciseWithStatsDto`
- [x] `exercises.facade.ts`: `#validateCreate` → `bodyweight: dto.bodyweight === undefined ? false :
      requiredBoolean(dto, 'bodyweight')`; `#validateEdit` the same when defined
- [x] Frontend `exercises.fixtures.ts`: `bodyweight: false` in the exercise fixtures, and in the
      inline `ExerciseWithStatsDto`s of `gz-exercise-list.component.test.ts:19-26` and
      `gz-workout-detail.component.test.ts:19-26`
- [x] Backend `exercises.fixtures.ts`: `createExercise(post, name = 'Bench Press', extra: Partial<CreateExerciseDto> = {})`
      posting `{ name, ...extra }`; existing callers stay as they are
- [x] `gz-exercise-list.component.ts`: the add form gains, after the notes field,
      `<label class="field-bodyweight"><input type="checkbox" role="switch" name="bodyweight" data-testid="bodyweight" /> Bodyweight</label>`;
      `handleSubmit` sends `bodyweight: values.bodyweight === 'on'`; the card subtitle joins group,
      `Bodyweight` and notes with ` · ` (shown when any is present)
- [x] `gz-exercise-detail.component.ts`: the edit form gains the same switch, `checked` from the
      exercise, and `handleSubmit` sends it; the header subtitle appends ` · Bodyweight`
      (or reads `Bodyweight` alone when no group is set)
- [x] CSS for the switch row in `gz-exercise-list.component.css` and
      `gz-exercise-detail.component.css` only if Oat's label layout needs alignment inside
      `.fields`; Oat tokens only, no font sizes
- [x] `src/scripts/seed.ts`: `bodyweight: boolean` on each seed exercise (all `false`), passed to
      `exercises.create`
- [x] `docs/backend.md`: a paragraph after the muscle-group paragraph (`docs/backend.md:283-290`):
      the flag, the 409 when weighted history exists, and what `006-bodyweight-exercises.sql`
      backfilled
- [x] `docs/frontend.md`: the switch in both forms and the label, beside the muscle-group text
      (`docs/frontend.md:380-388`)

**Automated Verification**:

- [x] `migrations.test.ts`: version counts move to 6 (`adopt a database…` at `:171-172`,
      `mark done every workout…` at `:228`, the muscle-group test's `[5]` at `:249` becomes
      `[5, 6]`); `db.test.ts:16` expects `schemaVersion` 6; a new test: after 005, an exercise with only 0 kg sets becomes bodyweight, one
      with a 0 kg and a 2.5 kg set and one without sets stay weighted; `bodyweight = 2` throws
- [x] `exercise.routes.test.ts`: create without `bodyweight` answers `false`, with `true` answers
      `true`; `bodyweight: 'yes'` is a 400 on POST and PATCH; PATCH to `true` is a 409 with a
      weighted set and a 200 with only 0 kg sets; PATCH to `false` is a 200 with any history
- [x] `exercises.facade.test.ts` (backend): the default and the 400
- [x] `gz-exercise-list.component.test.ts`: the switch posts `bodyweight: true` when checked and
      `false` when not; a bodyweight card's subtitle contains "Bodyweight"
- [x] `gz-exercise-detail.component.test.ts`: the edit switch starts checked for a bodyweight
      exercise and its save sends the flag; the header shows "Bodyweight"
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

### Phase 2: Logging bodyweight sets

Dependencies: Phase 1

Sets of a bodyweight exercise take no weight, in the API and on the workout page.

**Tasks**:

- [x] `src/shared/dto/set.ts`: `weight?: number` on `CreateSetDto`, documented "Required for a
      weighted exercise; 0 or left out for a bodyweight one."
- [x] `workouts.facade.ts` `#validateCreate`: `weight` is `requiredNumber(…)` when defined, else
      left out
- [x] `set.repository.ts`: `CreateSet.weight: number | null`; a private
      `#weightFor(exerciseId, weight: number | null): number`, run inside the transactions:
      - exercise missing → `badRequest('"exerciseId" must name an existing exercise')`
      - bodyweight: `null` or `0` → `0`, else `badRequest('"weight" must be 0 for a bodyweight exercise')`
      - weighted: `null` → `badRequest('"weight" must be a number')`, else the weight
      `create()` calls it after `#requireOpen`; `update()` calls it with `current.exercise_id` when
      `patch.weight !== undefined`; `create()` keeps its foreign-key catch
- [x] `set.translator.ts`: `translateDtoToCreateSet` maps `weight: dto.weight ?? null`;
      `translateToCreateSetDto` reads `body.weight as number | undefined`
- [x] `ports/workout-exercise.ts`: `bodyweight: 0 | 1`; `workout-exercise.repository.ts:20`
      selects `e.bodyweight`; `workout.translator.ts` maps `bodyweight: row.bodyweight === 1`
- [x] `src/shared/dto/workout.ts`: `bodyweight: boolean` on `WorkoutExerciseDto`
- [x] Frontend `workouts.fixtures.ts`: `bodyweight: false` on group fixtures
- [x] `gz-set-row.component.ts`: a stored-only `bodyweight` setter like `locked`; when set, the
      template drops the weight `fieldset.group`, the `×` and the volume span; `#save` skips
      weight; `duplicate` leaves `weight` out; the delete confirmation's message is
      `plural(set.reps, 'rep')`
- [x] `gz-workout-detail.component.ts`: `afterRender` sets `row.bodyweight` from the row's group
      before `row.set`; `#groupSummary` reads `${plural(count, 'set')} · ${plural(reps, 'rep')}`
      for a bodyweight group
- [x] `gz-add-set-form.component.ts`:
  - `#isBodyweight(exerciseId)` from `#exercises`
  - the weight field gets `class="field field-num field-weight"` and renders `hidden` with its
    input `disabled` when the selected exercise is bodyweight (a disabled input is neither
    validated nor in `FormData`)
  - the select's `change` listener toggles them with `#syncWeight(exerciseId)`
  - `handleSubmit` sends `weight` only when `values.weight !== undefined`
  - `#hint` for a bodyweight exercise: `Last · ${date}: ${reps.join(' · ')} reps` (no best yet;
    phase 4 adds it)
- [x] `src/scripts/seed.ts`: `{ name: 'Dips', muscleGroup: 'Chest', notes: 'Lean forward.', bodyweight: true }`
      and on push day `{ name: 'Dips', start: 0, step: 0, reps: [12, 10, 8], repStep: 1 }`; lifts
      gain an optional `repStep` (each set's reps grow by it per week, like `step` for weight, so
      Dips progresses), and a bodyweight lift's sets are created without `weight`; check `src/scripts/screenshots.ts:127` still holds (it floors weights, 0 stays 0)
- [x] `docs/backend.md`: the set weight rule in the sets/routes text and the new paragraph from
      phase 1
- [x] `docs/frontend.md`: the add-set form paragraph (`docs/frontend.md:153-168`) — the hidden
      weight field and the reps-only hint — and the set-row paragraph (`:170-179`) — no weight
      input and no volume for a bodyweight group, the flag handed down by the view

**Automated Verification**:

- [x] `set.routes.test.ts` / `workout.routes.test.ts`: a bodyweight set without `weight` stores
      0; with `weight: 0` stores 0; with `weight: 5` is a 400; a weighted set without `weight` is
      a 400; PATCH `weight: 5` on a bodyweight set is a 400 and `weight: 0` a 200; an unknown
      exercise is still a 400; the workout's groups carry `bodyweight`
- [x] `workouts.facade.test.ts` (backend): the same rules through `SetFacade.create`
- [x] `gz-set-row.component.test.ts`: a bodyweight row has no weight input and no volume, saves
      reps without `weight`, and its delete confirmation reads "12 reps"
- [x] `gz-add-set-form.component.test.ts`: selecting a bodyweight exercise hides and disables the
      weight field and posts without `weight`; selecting a weighted one shows it again; the hint
      reads "Last · … : 12 · 10 reps"
- [x] `gz-workout-detail.component.test.ts`: a bodyweight group's summary reads "3 sets · 30 reps"
      and its rows get `bodyweight`
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [x] After `bun run seed` (on a fresh `data/gainz.sqlite`), a workout with Dips shows its rows
      without weight on a phone-width screen and in both themes, and logging Dips from the
      add-set form works without a weight

### Phase 3: Statistics compare by the flag

Dependencies: Phase 1

The calendar's progression reads the flag instead of guessing from a volume of 0.

**Tasks**:

- [x] `stats.repository.ts`: the `sessions` CTE joins `exercises e ON e.id = s.exercise_id` and
      selects `e.bodyweight` (grouped by `w.id, s.exercise_id`, so it is constant per group); the
      outer `SELECT` and `ExerciseSession` gain `bodyweight: 0 | 1`
- [x] `exerciseProgression(row)`:
      ```ts
      // Bodyweight work compares reps; weighted work compares volume and is not compared beside a session without load.
      function exerciseProgression(row: ExerciseSession): number | null {
        if (row.previous_reps === null || row.previous_volume === null) {
          return null;
        }
        if (row.bodyweight === 1) {
          return row.reps / row.previous_reps - 1;
        }
        return row.volume > 0 && row.previous_volume > 0 ? row.volume / row.previous_volume - 1 : null;
      }
      ```
      (`previous_reps` is ≥ 1 for a session that exists, since a set has at least one rep)
- [x] `docs/backend.md:266-281`: replace the reps-fallback sentences with the flag rule, and say
      that a weighted exercise beside a session without load is not compared

**Automated Verification**:

- [x] `stats.routes.test.ts`: the bodyweight test marks its exercise bodyweight and still gives
      `0.2` for 30 → 36 reps; the "bodyweight → weighted and weighted → bodyweight compare reps"
      test is replaced by: a weighted exercise at 0 kg then 60 kg is not compared
      (`progression: null`, `comparedExerciseCount: 0`), and at 60 kg then 0 kg neither; an
      exercise switched from bodyweight to weighted is not compared on its first loaded session
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

### Phase 4: Bodyweight progress views

Dependencies: Phase 1 (Phase 2 for the add-set hint)

Reps figures where weighted exercises show kilograms.

**Tasks**:

- [x] `src/shared/dto/exercise.ts`: `bestReps: number | null` on `ExerciseWithStatsDto`;
      `topReps: number` on `SessionPointDto` ("most reps in one set")
- [x] `ports/exercise.ts`: `best_reps`, `top_reps`
- [x] `exercise.repository.ts`: `list()` selects `MAX(s.reps) AS best_reps`; `progress()` selects
      `MAX(s.reps) AS top_reps`
- [x] `exercise.translator.ts`: map both
- [x] Frontend `exercises.fixtures.ts`: `bestReps: null`, `topReps` defaults; the inline
      `ExerciseWithStatsDto`s in `gz-exercise-list.component.test.ts:19-26` and
      `gz-workout-detail.component.test.ts:19-26` gain `bestReps` (and `bodyweight` in phase 1)
- [x] `gz-exercise-list.component.ts`: a bodyweight card reads
      `${plural(bestReps, 'rep')} best` (or `no best yet`)
- [x] `gz-progress-chart.component.ts`: `MetricKey` gains `'topReps' | 'totalReps'`; a second
      tuple `BODYWEIGHT_METRICS` — `{ key: 'topReps', label: 'Top set', unit: 'reps', hint: 'Most reps in one set in each session.' }`,
      `{ key: 'totalReps', label: 'Total reps', unit: 'reps', hint: 'Reps summed over the session.' }`;
      a `bodyweight` setter, set before `sessions`, chooses the tuple; `metric` and the action look
      the key up in the chosen tuple and fall back to its first
- [x] `gz-session-table.component.ts`: a `bodyweight` setter, set before `sessions`; for it the
      columns are Date · Sets · Top set (`topReps`) · Reps, with `formatDelta(totalReps, earlier.totalReps)`
      as the change on Reps
- [x] `gz-exercise-detail.component.ts`: `afterRender` sets `chart.bodyweight` and
      `table.bodyweight` before `sessions`; `#summaryTiles` for a bodyweight exercise: Sessions ·
      Best set (`plural(bestSet.reps, 'rep')`, its date) · Top set (`plural(latest.topReps, 'rep')`,
      hint `${formatDelta(latest.topReps, previous.topReps)} reps vs. previous session` or
      `needs two sessions`) · Total reps (sum of `totalReps`, `across all sessions`)
- [x] `gz-add-set-form.component.ts`: the bodyweight hint appends `· best ${plural(bestReps, 'rep')}`
      when `bestReps` is set
- [x] `README.md:23`: "Every exercise charts its estimated one-rep max, top set and volume over
      time; bodyweight exercises chart their reps."
- [x] `docs/backend.md:245-250`: `bestReps` and the progress points' `topReps` among the done-set
      aggregates
- [x] `docs/frontend.md`: the exercise detail paragraph (`docs/frontend.md:390-395`) — the reps
      tiles, metrics and columns for a bodyweight exercise — and "best" in the add-set paragraph

**Automated Verification**:

- [x] `exercise.routes.test.ts`: the list's `bestReps` and the progress points' `topReps` count
      done sets only
- [x] `gz-progress-chart.component.test.ts`: a bodyweight chart offers Top set and Total reps and
      plots `topReps`; switching works as for weighted
- [x] `gz-session-table.component.test.ts`: a bodyweight table has the four columns and the change
      on Reps
- [x] `gz-exercise-detail.component.test.ts`: a bodyweight exercise's tiles read Sessions,
      Best set "15 reps", Top set with its change, Total reps
- [x] `gz-exercise-list.component.test.ts`: a bodyweight card reads "15 reps best"
- [x] `gz-add-set-form.component.test.ts`: the bodyweight hint ends in "best 15 reps"
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [x] With seed data, the Dips page shows reps tiles, chart and table in both themes and at phone
      width; the Back Squat page is unchanged
- [x] `/stats` still marks days, and a day with Dips counts it among its compared exercises

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- No CSS was added for the "Bodyweight" switch. Inside "Add an exercise"'s `.fields` row it sat at
  the row's bottom edge, lined up with neither the labels nor the inputs (user feedback), so it moved
  to a line of its own below the fields, opposite the Add button, as in the mockup above.
- The set-row and add-set tests choose the selected exercise explicitly where it is past the second
  option, since happy-dom misreads `selected` there.
- The backend facade test for a non-boolean `bodyweight` builds its DTO through the translator, as
  oxlint forbids the `as unknown as boolean` cast.
- The session table now renders its head and rows from `#weightedRows()` or `#bodyweightRows()`
  inside one wrapper, with the change cell shared through `changeTemplate()`.

## References

- `docs/agents/plans/2026-10-12-statistics-calendar.md` — the progression this plan changes
- `src/backend/features/stats/internal/stats.repository.ts:29-38, 85-101` — `exerciseProgression` and
  the `sessions` CTE
- `src/backend/features/workouts/internal/set.repository.ts:64-144` — set create and update
- `src/backend/features/exercises/internal/exercise.repository.ts:111-135` — update and the delete
  guard
- `src/backend/db/migrations/004-workout-done.sql` — a migration with a backfill
- `node_modules/@knadh/oat/css/form.css:94-135` — Oat's switch
- `docs/backend.md:245-290`, `docs/frontend.md:149-179`, `docs/frontend.md:380-395`
