---
date: 2026-10-14T12:26:08.964310+00:00
git_commit: 933b6104d695b84d946b5607cc9cbf1e87f7ed0a
branch: main
topic: 'Assisted exercises'
tags: [plan, exercises, sets, stats, progression, weight, migrations]
status: done
---

# PLAN: Assisted exercises

Track assisted exercises, such as an assisted pull-up or dip on a counterweight machine: the weight
set on the machine is assistance, so the more of it, the easier the set, and less is better. An
exercise gets a `kind` — weighted, bodyweight or assisted — in place of the `bodyweight` flag. An
assisted exercise logs its assistance in kg, compares its sessions by effective volume (reps ×
(body weight − assistance), the body weight from the weigh-ins), and its page reads lower
assistance as progress.

## Acceptance Criteria

- An exercise has a `kind`, `weighted`, `bodyweight` or `assisted`, chosen with a "Type" select in
  "Add an exercise" and "Edit exercise". Migration 008 rebuilds `exercises`, replacing
  `bodyweight` with `kind TEXT NOT NULL DEFAULT 'weighted' CHECK (kind IN ('weighted', 'bodyweight', 'assisted'))`;
  `bodyweight = 1` becomes `'bodyweight'`, everything else `'weighted'`.
- `kind` replaces `bodyweight` on `ExerciseDto`, `CreateExerciseDto`, `EditExerciseDto`,
  `WorkoutExerciseDto` and `RecentExerciseDto`; it defaults to `weighted` on create, and anything
  but one of the three strings is a 400. The kind changes freely in every direction: the 409 for
  turning an exercise with loaded sets bodyweight goes away.
- The exercise list's Type filter offers All · Weighted · Bodyweight · Assisted
  (`?type=assisted`); an assisted card's subtitle includes "Assisted" and its foot reads
  "17.5 kg assist least" (or "no best yet"); its page reads "Back · Assisted" under its name.
- Logging: an assisted set's `weight` is its assistance, required and ≥ 0 like a weighted one.
  The add-set form's weight field reads "Assistance (kg)"; its hint reads
  "Last · Oct 9: 8×30 · 8×30 · 6×25 kg assist · least 25 kg". An assisted set row reads
  `[30] kg assist × [8] reps` with no volume; its delete confirmation asks about "30 kg assist × 8";
  its group summary reads "3 sets · 22 reps".
- Statistics: an assisted session's figure is its effective volume, Σ reps × (body weight −
  assistance), the body weight being the latest weigh-in on or before the workout's date. The
  calendar's progression and the Progress cards compare it as weighted volume is compared; a
  session without such a weigh-in, or with a set whose assistance is ≥ that body weight, has no
  effective volume and is not compared. An assisted exercise's Progress card lists each session's
  effective volume ("–" without one).
- The dashboard's "Total volume" and the "kg moved" of the last 14 days count weighted exercises'
  done sets only.
- An assisted exercise's page shows the tiles Sessions · Best set (least assistance, then most
  reps: "17.5 kg assist × 8") · Least assistance (the latest session's, "−2.5 kg vs. previous
  session") · Effective volume (summed over the sessions that have one); the chart offers Least
  assistance · Effective volume · Total reps; the session table reads Date · Sets · Reps ·
  Least assist · Effective volume, with the change on Least assist colored as an improvement when
  it drops.
- The seed holds an "Assisted Pull-up" on pull day whose assistance drops 2.5 kg a week from 30 kg.
- `docs/backend.md`, `docs/frontend.md` and `README.md` describe kinds, the assisted set rule, the
  effective volume comparison, the weighted-only dashboard volume and the assisted views.

## Technical Key Decisions and Tradeoffs

1. **One `kind` column replaces the `bodyweight` flag:** `'weighted' | 'bodyweight' | 'assisted'`.
   - Why: the three are mutually exclusive, and the `?type=` filter already speaks this vocabulary.
   - Impact: a table rebuild like `005-fixed-muscle-groups.sql`; every `bodyweight` branch in the
     backend and frontend becomes a `kind` check; the Bodyweight switch becomes a Type select.
2. **`sets.weight` holds the assistance for an assisted exercise:** no change to `sets`.
   - Impact: `SetRepository#weightFor` treats `assisted` like `weighted` (required, any number ≥ 0).
3. **Effective volume from the weigh-ins:** per session, `SUM(reps) × body weight − SUM(reps × weight)`,
   the body weight being the latest `weigh_ins.weight` with `measured_on <= performed_on`.
   - Why: less assistance and more reps both count, and it stays fair while body weight changes.
   - Impact: `bodyWeightOnSql(dateColumn)` in `weight/ports/sql.ts` (the weigh-in lookup) and
     `effectiveVolumeSql(bodyWeight, reps, volume, topWeight)` in `workouts/ports/sql.ts` (beside
     `EST_1RM_SQL`, since it is set arithmetic), used by the stats CTE and
     `ExerciseRepository.progress()`; `null` without a weigh-in or with any set's assistance ≥ the
     body weight, so such a session is never compared and never charted.
4. **Kind changes are free:** no guard in any direction.
   - Why: the user prefers being able to fix a wrong pick at any time over protecting history.
   - Impact: the 409 in `ExerciseRepository.update` and its tests go; a change reinterprets the
     stored weights (bodyweight views ignore them, assisted views read them as assistance).
5. **Assistance is shown in kg where it is read, effective volume where sessions are compared.**
   - Impact: `leastWeight` (`MIN(s.weight)`, done sets) on `ExerciseWithStatsDto` and
     `SessionPointDto`; `effectiveVolume` on `SessionPointDto` and `RecentSessionDto`;
     `bestSet` orders assisted sets by `weight ASC, reps DESC`.
6. **The dashboard's volume counts weighted exercises only.**
   - Why: the tile means load put on a bar or a machine; bodyweight sets already add 0, assisted
     sets would add their assistance.
7. **Assisted set rows carry no volume:** the client has no body weight on the workout page.
8. **Four vertical phases:** kind → logging → statistics → exercise page.
   - Impact: after phase 1 an assisted exercise logs and renders like a weighted one; phases 2
     and 3 depend only on phase 1; phase 4 needs phase 2's `formatAssistance` and phase 3's SQL
     helpers.

## Current State

```
exercises (id, name, muscle_group, notes, bodyweight 0|1, created_at)      migrations 005, 006
sets      (…, reps, weight REAL NOT NULL, …)                               bodyweight sets store 0
weigh_ins (measured_on TEXT PRIMARY KEY, weight REAL > 0)                  migration 007

ExerciseDto.bodyweight ──┬─ list card label, "best" (bestReps | bestWeight)   gz-exercise-list.component.ts:93-121
                         ├─ ?type=bodyweight|weighted                          exercise-filter.ts:6-8, exercise.repository.ts:33-36
                         ├─ Bodyweight switch in both forms                    gz-exercise-list.component.ts:193, gz-exercise-detail.component.ts:133
                         ├─ detail tiles/chart/table: weighted | reps          gz-exercise-detail.component.ts:144-210
                         └─ add-set form: weight hidden, reps-only hint        gz-add-set-form.component.ts:136-145, 195-207
WorkoutExerciseDto.bodyweight ─ group summary, gz-set-row.bodyweight           gz-workout-detail.component.ts:233, 392
SetRepository#weightFor: bodyweight → 0 (≠ 0 → 400) │ weighted → required      set.repository.ts:160-175
ExerciseRepository.update: → bodyweight is a 409 with loaded sets              exercise.repository.ts:124-131

Statistics (bigger is better)                                                  stats.repository.ts:47-82
  comparedSessionsSql: per (workout, exercise) SUM(reps), SUM(reps × weight), e.bodyweight, LAG()
  sessionChange: bodyweight → reps ratio │ weighted → volume ratio, null beside 0
  summary(): total_volume, volume_since = SUM(reps × weight) over every done set   :96-123
ExerciseRepository: best_weight = MAX(weight), best_reps; progress() top_weight, top_reps, est 1RM
  bestSet ORDER BY est. 1RM DESC, weight DESC, reps DESC                       exercise.repository.ts:176-188
```

An assisted exercise today can only be logged as weighted: its most assisted set is its "best",
its Epley estimate and volume grow with the assistance, and the dashboard adds the assistance to
the total volume.

## Desired End State

```
exercises (…, kind TEXT NOT NULL DEFAULT 'weighted' CHECK (kind IN ('weighted','bodyweight','assisted')))

ExerciseDto.kind ──┬─ Type select (both forms), list label + "least", ?type=assisted
                   └─ detail: weighted │ bodyweight │ assisted tiles, metrics, columns
WorkoutExerciseDto.kind ─ group summary in reps for bodyweight and assisted ─ gz-set-row.kind
SetRepository#weightFor: bodyweight → 0 │ weighted, assisted → required

weight/ports/sql.ts    bodyWeightOnSql(dateColumn) = latest weigh-in on or before the date
workouts/ports/sql.ts  effectiveVolumeSql(bodyWeight, reps, volume, topWeight)
Statistics
  comparedSessionsSql: + e.kind, body_weight, top_weight → effective_volume, LAG(effective_volume)
  sessionChange(kind, …):
    no previous                         → null
    bodyweight                          → reps ÷ previous reps − 1
    assisted, both effective volumes    → effective ÷ previous effective − 1, else null
    weighted, both volumes > 0          → volume ÷ previous volume − 1, else null
  summary(): volume of sets whose exercise is weighted only
ExerciseRepository: least_weight on the list and the progress points, effective_volume on the points,
  bestSet for assisted ORDER BY weight ASC, reps DESC
```

Add / edit form:

```
┌ Add an exercise ────────────────────────────────────────────────────────────┐
│ Name [Assisted Pull-up ]  Muscle group [Back ▾]  Notes [                 ]  │
│ Type [Assisted ▾]                                                   [Add]   │
└─────────────────────────────────────────────────────────────────────────────┘
          Weighted │ Bodyweight │ Assisted
```

Exercise list card:

```
┌──────────────────────────────────────────────┐
│ Assisted Pull-up                             │
│ 💪 Back · Assisted · Knees on the pad         │
│ 18 sets · 17.5 kg assist least · 3 days ago  │
└──────────────────────────────────────────────┘
```

Workout page, an assisted group, and the add-set form with it selected:

```
▾ 💪 Assisted Pull-up   3 sets · 22 reps                          1/3 done
  ✓ 1  [ 30 ] kg assist × [ 8 ] reps   Notes                      +1 ×
    2  [ 30 ] kg assist × [ 8 ] reps   Notes                      +1 ×
    3  [ 25 ] kg assist × [ 6 ] reps   Notes                      +1 ×

Exercise [Assisted Pull-up ▾]  Reps [8]  Assistance (kg) [30]  Notes [        ]  [Log set]
Last · Oct 9: 8×30 · 8×30 · 6×25 kg assist · least 25 kg
[Add last session's 3 sets]
```

Exercise page of an assisted exercise:

```
Assisted Pull-up
💪 Back · Assisted
[Sessions   ][Best set           ][Least assistance            ][Effective volume   ]
  12          17.5 kg assist × 8   17.5 kg                       16.4 t
  last 3 days Oct 9                −2.5 kg vs. previous session  across all sessions

Least assistance          [ Least assistance | Effective volume | Total reps ]
 ── chart ──
Least assistance in each session — lower is better.

Session history
Date     Sets  Reps  Least assist     Effective volume
Oct 9    3     22    17.5 −2.5 (up)   1 405 kg
Oct 2    3     22    20               1 350 kg
```

Statistics page, Progress card of an assisted exercise:

```
┌ Assisted Pull-up                         ▲ +4.1% ┐
│ Sep 25   1 298 kg    ▲ +2.0%                     │
│ Oct 2    1 350 kg    ▲ +4.0%                     │
│ Oct 9    1 405 kg    ▲ +4.1%                     │
└──────────────────────────────────────────────────┘
```

## Abstractions and Code Reuse

- `src/backend/db/migrations/008-exercise-kinds.sql` - the table rebuild, following 005
- `src/shared/dto/`
  - `exercise.ts` - `ExerciseKind` replaces `ExerciseType` (`'weighted' | 'bodyweight' | 'assisted'`);
    `kind` replaces `bodyweight` on `ExerciseDto`, `CreateExerciseDto`, `EditExerciseDto`;
    `ExerciseFilterDto.type?: ExerciseKind`; `leastWeight` on `ExerciseWithStatsDto`;
    `leastWeight`, `effectiveVolume` on `SessionPointDto`
  - `workout.ts` - `kind` on `WorkoutExerciseDto`
  - `stats.ts` - `kind` on `RecentExerciseDto`; `effectiveVolume` on `RecentSessionDto`
  - `set.ts` - the `CreateSetDto.weight` doc
- `src/backend/features/weight/ports/sql.ts` (new) - `bodyWeightOnSql(dateColumn)`
- `src/backend/features/workouts/ports/sql.ts` - `effectiveVolumeSql(bodyWeight, reps, volume, topWeight)`
- `src/backend/features/exercises/`
  - `ports/exercise.ts` - `kind: ExerciseKind`, `least_weight`, `effective_volume`; filter `kind`
  - `internal/exercise.repository.ts` - columns, `create`, `update` without the guard, filter
    (`FilterParam` gains `ExerciseKind`), `list`, `progress`, `bestSet(id, kind)`
  - `internal/exercise.translator.ts` - the new fields both ways
  - `internal/exercise.controller.ts` - the `type` query validated against `EXERCISE_KINDS`
    (`:5, :73`); the best set call passes the kind (`:58`)
  - `exercises.facade.ts` - `EXERCISE_KINDS`, `kind` validated with `requiredOneOf`
    (`src/backend/shared/validate.ts:95-108`); `bestSet` passes the kind (`:57`)
- `src/backend/features/workouts/`
  - `ports/workout-exercise.ts`, `internal/workout-exercise.repository.ts`,
    `internal/workout.translator.ts` - `kind` on the group
  - `internal/set.repository.ts` - `#weightFor` reads `kind`
- `src/backend/features/stats/`
  - `internal/stats.repository.ts` - `comparedSessionsSql`, `sessionChange(kind, …)`, `summary()`
  - `ports/stats.ts`, `internal/stats.translator.ts` - `kind`, `effective_volume`
- `src/frontend/ui/format.ts` - `formatAssistance(kg)` → `"30 kg assist"`
- `src/frontend/features/exercises/`
  - `internal/exercise-filter.ts` - `EXERCISE_KINDS`, `KIND_LABELS` (Weighted, Bodyweight, Assisted),
    `typeFilterOptions`, a new `kindOptions(selected)` for the forms, `parseExerciseKind`
  - `gz-exercise-list.component.ts`, `gz-exercise-detail.component.ts` - Type select, labels,
    assisted tiles
  - `internal/gz-progress-chart.component.ts` - a `kind` setter choosing `METRICS`,
    `BODYWEIGHT_METRICS` or `ASSISTED_METRICS`
  - `internal/gz-session-table.component.ts` - a `kind` setter; `#assistedRows()`;
    `changeTemplate(…, lowerIsBetter)`
  - `exercises.fixtures.ts` - `kind: 'weighted'`, `leastWeight`, `effectiveVolume` defaults
- `src/frontend/features/workouts/`
  - `gz-workout-detail.component.ts` - group summary, `row.kind`
  - `internal/gz-set-row.component.ts` - `kind` setter replacing `bodyweight`
  - `internal/gz-add-set-form.component.ts` - `#kindOf(id)`, weight label, assisted hint
  - `workouts.fixtures.ts` - `kind: 'weighted'` on groups
- `src/frontend/features/stats/internal/gz-exercise-progress.component.ts` - value by kind
- `src/frontend/features/stats/gz-dashboard.component.ts` - the volume tile's hint
- `src/scripts/seed.ts` - `kind` on the exercise list, "Assisted Pull-up"

Reused as they are: the 005 rebuild pattern (`sqlite_sequence` copy, unique index),
`EST_1RM_SQL`, `buildUpdate`, `formatDelta`, `formatVolume`, `formatNumber`, `plural`, `gz-tile`,
`gz-chart` (it drops non-finite points, so a `null` effective volume is passed as `NaN`), the
`kindOptions` select built like `muscleGroupOptions`.

## Logging & Observability

No new logging; the new 400 for a bad `kind` carries the usual `{ error }` body through the access
log.

## Implementation

### Phase 1: Exercise kinds replace the bodyweight flag

Dependencies: None

Store, validate, choose and show `kind`; assisted exercises exist and, until the next phases, log
and render as weighted ones.

**Tasks**:

- [x] `src/backend/db/migrations/008-exercise-kinds.sql`: rebuild like 005 —
      `CREATE TABLE exercises_new (…, kind TEXT NOT NULL DEFAULT 'weighted' CHECK (kind IN ('weighted', 'bodyweight', 'assisted')), created_at …)`
      with the same `muscle_group` `CHECK`; `INSERT … SELECT …, CASE bodyweight WHEN 1 THEN 'bodyweight' ELSE 'weighted' END, …`;
      the `sqlite_sequence` copy; `DROP TABLE exercises`; rename; `CREATE UNIQUE INDEX idx_exercises_name …`
- [x] `src/shared/dto/exercise.ts`: `export type ExerciseKind = 'weighted' | 'bodyweight' | 'assisted'`
      replaces `ExerciseType`; `kind: ExerciseKind` replaces `bodyweight` on `ExerciseDto`
      (doc: "weighted: load in kg; bodyweight: reps only, weight 0; assisted: weight is the
      assistance, less is better"); `kind?: ExerciseKind` on `CreateExerciseDto` and
      `EditExerciseDto`; `ExerciseFilterDto.type?: ExerciseKind`
- [x] `src/shared/dto/workout.ts`, `src/shared/dto/stats.ts`: `kind: ExerciseKind` replaces
      `bodyweight` on `WorkoutExerciseDto` and `RecentExerciseDto`
- [x] `exercises/ports/exercise.ts`: `kind: ExerciseKind` on `Exercise`; `ExerciseFilter.kind?: ExerciseKind`
- [x] `exercise.repository.ts`: `kind` in `EXERCISE_COLUMNS`, `CreateExercise`, `FIELDS`, the
      `INSERT` and its `RETURNING`; `filterConditions` pushes `kind = ?` and `FilterParam` becomes
      `MuscleGroup | ExerciseKind | null`; `update()` loses the bodyweight 409
- [x] `exercise.translator.ts`: `kind` through every translation, `kind: dto.kind ?? 'weighted'`
      on create, the filter's `type` → `kind`
- [x] `exercises.facade.ts`: `EXERCISE_KINDS = ['weighted', 'bodyweight', 'assisted'] as const satisfies readonly ExerciseKind[]`
      replaces `EXERCISE_TYPES`; `#validateCreate`:
      `kind: dto.kind === undefined ? 'weighted' : requiredOneOf(dto, 'kind', EXERCISE_KINDS)`
      (not `optionalOneOf`, which reads `''` and `null` as absent and would skip the 400);
      `#validateEdit` the same when defined
- [x] `exercise.controller.ts:5,73`: the list's and the position's `type` query is
      `optionalQueryOneOf(…, EXERCISE_KINDS)`
- [x] `set.repository.ts` `#weightFor`: reads `kind`; `'bodyweight'` → 0 as now; `'weighted'` and
      `'assisted'` → required
- [x] Workouts: `ports/workout-exercise.ts` `kind: ExerciseKind`; `workout-exercise.repository.ts:20`
      selects `e.kind`; `workout.translator.ts:109` maps `kind`
- [x] Stats: `stats.repository.ts` selects `e.kind` instead of `e.bodyweight` (`ExerciseSession`,
      `RecentSessionRow`, `sessionChange(kind: ExerciseKind, …)` with `kind === 'bodyweight'`);
      `ports/stats.ts:40` and `stats.translator.ts:41` pass `kind`
- [x] Frontend `exercise-filter.ts`: `EXERCISE_KINDS` and `KIND_LABELS`
      (`Weighted`, `Bodyweight`, `Assisted`); `parseExerciseKind`; `typeFilterOptions` offers the
      three after All; `kindOptions(selected: ExerciseKind)` renders the form select's options
- [x] `gz-exercise-list.component.ts`: the switch becomes
      `<div class="field"><label for="kind">Type</label><select id="kind" name="kind" data-testid="kind">${kindOptions('weighted')}</select></div>`
      in its place below the fields; `handleSubmit` sends `kind: parseExerciseKind(values.kind) ?? 'weighted'`;
      the filter after create uses `exercise.kind`; the card subtitle shows `KIND_LABELS[kind]` for a
      non-weighted kind; `#best` keys off `kind === 'bodyweight'` (assisted gets its own in phase 2)
- [x] `gz-exercise-detail.component.ts`: the same select in the edit form, selected from the
      exercise; `handleSubmit` sends it; the header appends ` · Assisted` / ` · Bodyweight`
      (or the label alone without a group); `bodyweight` checks become `kind === 'bodyweight'`
- [x] `gz-progress-chart.component.ts`, `gz-session-table.component.ts`: `kind: ExerciseKind`
      setters replace `bodyweight` (assisted falls back to the weighted views until phase 4)
- [x] `gz-workout-detail.component.ts`, `gz-set-row.component.ts`, `gz-add-set-form.component.ts`,
      `gz-exercise-progress.component.ts`: `bodyweight` → `kind === 'bodyweight'`; the set row's
      setter becomes `kind`
- [x] CSS only if the select needs alignment in that row; Oat tokens only, no font sizes
- [x] Frontend fixtures (`exercises.fixtures.ts`, `workouts.fixtures.ts`, and the inline DTOs in
      the tests that carry `bodyweight`, `gz-stats.component.test.ts:96` among them):
      `kind: 'weighted'` / `'bodyweight'`; backend `workouts.facade.test.ts:108-127` creates its
      exercises with `kind: 'bodyweight'`; finish with a grep for `bodyweight` and `ExerciseType`
      over `src/` that finds only the `'bodyweight'` kind and migration 006
- [x] Backend `exercises.fixtures.ts`: `createExercise(post, name, extra)` keeps working with
      `{ kind: … }`
- [x] `src/scripts/seed.ts`: `kind` on each seed exercise (`'bodyweight'` for Dips), the
      bodyweight set from `kind`
- [x] `docs/backend.md`: "Bodyweight exercises" (`:385-394`) becomes "Exercise kinds": the three
      kinds, the default, the 400, free changes, and what `008-exercise-kinds.sql` did; the
      `type` filter (`:360-361`) and the group shape (`:323`) name `kind`; the set weight rule
      (`:287-291`) reads `kind`
- [x] `docs/frontend.md`: the list and forms (`:503-533`) — the Type select, the filter's third
      option, the labels; the set-row and add-set paragraphs (`:403-419`, `:465-466`) name `kind`

**Automated Verification**:

- [x] `migrations.test.ts`: the version counts move to 8 and `db.test.ts` expects
      `schemaVersion` 8; a new test: after 007, a bodyweight exercise becomes `kind = 'bodyweight'`,
      a weighted one and one without sets `'weighted'`, ids, sets and the sequence survive;
      `kind = 'other'` throws
- [x] `exercise.routes.test.ts`: create without `kind` answers `'weighted'`, with `'assisted'`
      answers `'assisted'`; `kind: 'heavy'`, `''` and `null` are 400s on POST and PATCH; PATCH to `'bodyweight'`
      with a loaded set is now a 200 (the 409 test is replaced); `?type=assisted` lists only
      assisted exercises and `?type=other` is a 400
- [x] `exercises.facade.test.ts` (backend): the default, and the 400 on create and on edit
- [x] `set.routes.test.ts`: an assisted set without `weight` is a 400, with `weight: 30` stores 30
- [x] `exercise-filter.test.ts`: `?type=assisted` parses, the type filter has four options
- [x] `gz-exercise-list.component.test.ts`: the Type select posts `kind`; an assisted card's
      subtitle contains "Assisted"
- [x] `gz-exercise-detail.component.test.ts`: the edit select starts on the exercise's kind and
      its save sends it; the header shows "Assisted"
- [x] The existing bodyweight tests pass with `kind: 'bodyweight'`
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

### Phase 2: Logging assisted sets

Dependencies: Phase 1

The workout page and the exercise list speak of assistance for an assisted exercise.

**Tasks**:

- [x] `src/shared/dto/set.ts`: `CreateSetDto.weight` doc — "Required for a weighted exercise
      (load) and an assisted one (assistance); 0 or left out for a bodyweight one."
- [x] `src/shared/dto/exercise.ts`: `leastWeight: number | null` on `ExerciseWithStatsDto`
      ("Least weight in one done set: an assisted exercise's least assistance.")
- [x] `exercises/ports/exercise.ts`, `exercise.repository.ts` `list()` (`MIN(s.weight) AS least_weight`),
      `exercise.translator.ts`: map it
- [x] `src/frontend/ui/format.ts`: `formatAssistance(kg: number): string` → `` `${formatNumber(kg)} ${UNIT} assist` ``
- [x] `gz-exercise-list.component.ts` `#best`: an assisted card reads
      `${formatAssistance(leastWeight)} least`, or `no best yet`
- [x] `gz-set-row.component.ts`: for `kind === 'assisted'` the weight group's label reads
      `${UNIT} assist` and its `aria-label` "Assistance"; the volume span is left out; the delete
      confirmation reads `${formatAssistance(set.weight)} × ${set.reps}`
- [x] `gz-workout-detail.component.ts` `#groupSummary`: an assisted group reads like a bodyweight
      one, `${plural(count, 'set')} · ${plural(reps, 'rep')}`
- [x] `gz-add-set-form.component.ts`: `#kindOf(exerciseId)` replaces `#isBodyweight`; the weight
      label is `Assistance (${UNIT})` for an assisted selection and `Weight (${UNIT})` otherwise,
      set in the template and by `#syncWeight` on change; `#hint` for assisted:
      `` `${last}: ${sets} ${UNIT} assist${least}` `` with `sets` as for weighted and `least` =
      `` ` · least ${formatAssistance(leastWeight)}` `` when `leastWeight` is not null
- [x] Frontend `exercises.fixtures.ts`: `leastWeight: null` default; inline `ExerciseWithStatsDto`s
      in tests gain it
- [x] `src/scripts/seed.ts`: `{ name: 'Assisted Pull-up', muscleGroup: 'Back', notes: 'Knees on the pad.', kind: 'assisted' }`
      and on pull day `{ name: 'Assisted Pull-up', start: 30, step: -2.5, reps: [8, 8, 6] }`
      (30 → 17.5 kg over the six weeks); check `src/scripts/screenshots.ts` still holds
- [x] `docs/backend.md`: the set weight rule names assisted; `leastWeight` among the list's
      done-set aggregates
- [x] `docs/frontend.md`: the add-set form (`:403-419`) — the "Assistance (kg)" label and the
      assisted hint; set rows (`:465-466`) — the "kg assist" label and no volume; the group
      summary (`:386`); the list card's "least"

**Automated Verification**:

- [x] `exercise.routes.test.ts`: the list's `leastWeight` counts done sets only
- [x] `format.test.ts`: `formatAssistance(17.5)` reads "17.5 kg assist"
- [x] `gz-set-row.component.test.ts`: an assisted row's weight label reads "kg assist", it has no
      volume, saves its weight, and its delete confirmation reads "30 kg assist × 8"
- [x] `gz-add-set-form.component.test.ts`: selecting an assisted exercise labels the field
      "Assistance (kg)", keeps it required and posts `weight`; switching to a weighted one labels it
      "Weight (kg)"; the hint reads "Last · …: 8×30 · 6×25 kg assist · least 25 kg"
- [x] `gz-workout-detail.component.test.ts`: an assisted group's summary reads "3 sets · 22 reps"
      and its rows get `kind`
- [x] `gz-exercise-list.component.test.ts`: an assisted card reads "17.5 kg assist least"
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [x] After `bun run seed` on a fresh `data/gainz.sqlite`, a pull day shows the Assisted Pull-up
      rows with "kg assist" and no volume, in both themes and at phone width, and logging it from
      the add-set form shows "Assistance (kg)"

### Phase 3: Statistics compare assisted work by effective volume

Dependencies: Phase 1

The calendar and the Progress cards read less assistance as progress; the dashboard's volume is
weighted-only.

**Tasks**:

- [x] `src/backend/features/weight/ports/sql.ts` (new):
      ```ts
      // In ports/ because the stats and exercises features read the body weight of a date.

      /** The latest weigh-in on or before `dateColumn`, or NULL. */
      export function bodyWeightOnSql(dateColumn: string): string {
        return `(SELECT wi.weight FROM weigh_ins wi WHERE wi.measured_on <= ${dateColumn} ORDER BY wi.measured_on DESC LIMIT 1)`;
      }
      ```
      (the lint boundaries allow it: `.oxlintrc.json` restricts only controllers and ports
      importing DTOs)
- [x] `src/backend/features/workouts/ports/sql.ts`: beside `EST_1RM_SQL`, a non-aggregate
      expression over a session's figures, so it works on grouped rows and on aggregates alike:
      ```ts
      /** Σ reps × (body weight − weight), from a session's totals; NULL without a body weight or with a set at or above it. */
      export function effectiveVolumeSql(bodyWeight: string, reps: string, volume: string, topWeight: string): string {
        return `CASE WHEN ${bodyWeight} IS NULL OR ${topWeight} >= ${bodyWeight} THEN NULL ELSE ${reps} * ${bodyWeight} - ${volume} END`;
      }
      ```
- [x] `stats.repository.ts` `comparedSessionsSql`: the `sessions` CTE selects
      `${bodyWeightOnSql('w.performed_on')} AS body_weight` (valid under the `GROUP BY`, as
      `performed_on` depends on `w.id`) and `MAX(s.weight) AS top_weight` alongside its sums; a
      `weighed` CTE adds
      `${effectiveVolumeSql('body_weight', 'reps', 'volume', 'top_weight')} AS effective_volume`;
      `compared` reads from `weighed` and adds
      `LAG(effective_volume) OVER history AS previous_effective_volume`
- [x] `stats.repository.ts`: `SessionTotals` gains `effective_volume: number | null`;
      `ExerciseSession`, `RecentSessionRow` and `previousOf` carry it, and the "no previous
      session" test keeps using `previous_reps` (the LAG of a non-null column)
- [x] `sessionChange(kind, current, previous)`:
      ```ts
      // Bodyweight work compares reps, assisted work effective volume, weighted work volume; a side without a figure is not compared.
      if (kind === 'assisted') {
        return current.effective_volume !== null && previous.effective_volume !== null && previous.effective_volume > 0
          ? current.effective_volume / previous.effective_volume - 1
          : null;
      }
      ```
      between the bodyweight and the weighted branch
- [x] `recentExercises()`: each session's `effective_volume` passed through; `ports/stats.ts` and
      `stats.translator.ts` map it to `effectiveVolume` on `RecentSessionDto`
- [x] `summary()`: `total_volume` and `volume_since` sum only sets whose exercise has
      `kind = 'weighted'`: `total_volume`'s subquery gains
      `AND exercise_id IN (SELECT id FROM exercises WHERE kind = 'weighted')`, and `volume_since`
      puts the same condition in its `LEFT JOIN … ON`, so set-less workouts still count in
      `workouts_since`
- [x] `src/shared/dto/stats.ts`: `effectiveVolume: number | null` on `RecentSessionDto`
      ("reps × (body weight − weight); null without a weigh-in on or before the date or with
      assistance at or above it"); `SummaryDto.totalVolume` / `volumeSince` documented as weighted
      exercises only
- [x] `gz-exercise-progress.component.ts` `#session`: an assisted session's value is
      `session.effectiveVolume === null ? '–' : formatVolume(session.effectiveVolume)`
- [x] `gz-dashboard.component.ts:89`: the Total volume hint reads "weighted lifts, all time"
- [x] `docs/backend.md`: the calendar paragraph (`:414-428`) — the assisted rule, the body weight
      lookup and when a session is not compared; the summary paragraph (`:409-412`) — weighted only;
      the Progress cards' `effectiveVolume`
- [x] `docs/frontend.md`: the Statistics section (`:598`) — effective volume for an assisted
      exercise; the dashboard tile's hint

**Automated Verification**:

- [x] `stats.routes.test.ts`, with weigh-ins put through the weight facade or routes:
  - [x] an assisted exercise at BW 80, 3×8 @ 30 then 3×8 @ 25 has `progression` 1320/1200 − 1 = 0.1
  - [x] the body weight is the latest weigh-in on or before each date (a later weigh-in is ignored;
        two different body weights give the expected ratio)
  - [x] without a weigh-in on or before the earlier session, it is not compared
        (`progression: null`, `comparedExerciseCount: 0`)
  - [x] a session with a set at assistance ≥ body weight is not compared, and a day holding
        such a session beside a compared one has `comparedExerciseCount` 1  - [x] the recent exercises' sessions carry `effectiveVolume`, `null` where the rule says so,
        and the card's `progression` skips back past a session without one
  - [x] the summary's `totalVolume` and `volumeSince` leave out an assisted exercise's sets
  - [x] the weighted and bodyweight progression tests still pass unchanged
- [x] `gz-exercise-progress.component.test.ts`: an assisted card lists effective volumes and "–"
      for a session without one
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [x] With seed data, `/stats` marks pull days ▲ for the Assisted Pull-up, and its Progress card
      lists effective volumes

### Phase 4: The assisted exercise page

Dependencies: Phases 1, 2 (`formatAssistance`) and 3 (`bodyWeightOnSql`, `effectiveVolumeSql`)

Assistance tiles, metrics and columns where weighted exercises show load.

**Tasks**:

- [x] `src/shared/dto/exercise.ts`: on `SessionPointDto`, `leastWeight: number` ("least weight in
      one set: an assisted exercise's least assistance") and `effectiveVolume: number | null`
      (same doc as on `RecentSessionDto`)
- [x] `exercises/ports/exercise.ts`: `least_weight`, `effective_volume` on `SessionPoint`
- [x] `exercise.repository.ts` `progress()`: `MIN(s.weight) AS least_weight` and
      `effective_volume` from `effectiveVolumeSql(bw, 'SUM(s.reps)', 'SUM(s.reps * s.weight)', 'MAX(s.weight)')`
      with `bw = bodyWeightOnSql('w.performed_on')`
- [x] `exercise.repository.ts` `bestSet(id, kind)`: for `'assisted'`
      `ORDER BY s.weight ASC, s.reps DESC`, otherwise as now; its caller passes the exercise's kind
- [x] `exercise.translator.ts`: map both
- [x] `gz-progress-chart.component.ts`: `MetricKey` gains `'leastWeight' | 'effectiveVolume'`;
      `ASSISTED_METRICS`:
      `{ key: 'leastWeight', label: 'Least assistance', unit: UNIT, hint: 'Least assistance in each session — lower is better.' }`,
      `{ key: 'effectiveVolume', label: 'Effective volume', unit: UNIT, hint: 'Reps × (body weight − assistance), from the weigh-in on or before each session.' }`,
      `{ key: 'totalReps', label: 'Total reps', unit: 'reps', hint: 'Reps summed over the session.' }`;
      the `kind` setter chooses it; a point's value is `session[metric.key] ?? Number.NaN`
- [x] `gz-session-table.component.ts`: `changeTemplate(current, earlier, decimals?, lowerIsBetter = false)`
      swaps the `up`/`down` class when `lowerIsBetter`; `#assistedRows()` — Date · Sets · Reps ·
      Least assist (`changeTemplate(leastWeight, earlier.leastWeight, undefined, true)`) ·
      Effective volume (`formatVolume`, or `–` when `null`)
- [x] `gz-exercise-detail.component.ts` `#assistedTiles`: Sessions · Best set
      (`` `${formatAssistance(bestSet.weight)} × ${bestSet.reps}` ``, its date) · Least assistance
      (`` `${formatNumber(latest.leastWeight)} ${UNIT}` ``, hint
      `` `${formatDelta(latest.leastWeight, previous.leastWeight)} ${UNIT} vs. previous session` ``
      or `needs two sessions`) · Effective volume (sum of the non-null `effectiveVolume`,
      `across all sessions`); `#summaryTiles` picks it for `kind === 'assisted'`
- [x] Frontend `exercises.fixtures.ts`: `leastWeight`, `effectiveVolume` defaults on session points
- [x] `README.md:23`: "…bodyweight exercises chart their reps, and assisted exercises their
      assistance and effective volume."
- [x] `docs/backend.md`: the progress points' `leastWeight` and `effectiveVolume`, and the assisted
      `bestSet` order
- [x] `docs/frontend.md`: the exercise page (`:535-547`) — the assisted tiles, `ASSISTED_METRICS`,
      the columns and the inverted change color

**Automated Verification**:

- [x] `exercise.routes.test.ts`: the progress points' `leastWeight` counts done sets only;
      `effectiveVolume` uses the weigh-in on or before each date and is `null` without one; the
      best set of an assisted exercise is the least assisted, ties broken by reps
- [x] `gz-progress-chart.component.test.ts`: an assisted chart offers the three metrics, plots
      `leastWeight`, and skips a session without `effectiveVolume`
- [x] `gz-session-table.component.test.ts`: an assisted table has the five columns; a drop in
      assistance has class `up`, a rise `down`
- [x] `gz-exercise-detail.component.test.ts`: an assisted exercise's tiles read Sessions,
      Best set "17.5 kg assist × 8", Least assistance with "−2.5 kg vs. previous session",
      Effective volume
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [x] With seed data, the Assisted Pull-up page shows the assisted tiles, chart and table in both
      themes and at phone width, with the falling assistance colored as progress; the Back Squat and
      Dips pages are unchanged
- [x] `bun run screenshots` still runs

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Phase 1: `ExerciseKind` lives in `src/shared/exercise-kind.ts`, beside `muscle-group.ts`, not in
  `dto/exercise.ts`: the lint boundary forbids `ports/` importing DTOs, and the ports carry `kind`.
- Phase 1: `FilterParam` keeps `number` (the list's `LIMIT`/`OFFSET` share its params).
- Phase 1: happy-dom misreads `select.value` after an innerHTML parse, so the type-select tests read
  `option[selected]`, as the muscle-group tests already did.
- Phase 1: the add form's Type/Add row gets `align-items: flex-end` (`.submit-row`) so the button lines
  up with the select.
- Phase 2: the assisted hint ends in `least 25 kg` (`formatNumber` + unit), as the acceptance criteria
  and the test read, not `formatAssistance` ("least 25 kg assist"), which the task line suggested.

## References

- `docs/agents/plans/2026-10-12-bodyweight-exercises.md` — the flag this plan replaces, and the
  pattern of its views
- `docs/agents/plans/2026-10-13-weight-log.md` — the weigh-ins the effective volume reads
- `src/backend/db/migrations/005-fixed-muscle-groups.sql` — the table rebuild to follow
- `src/backend/features/stats/internal/stats.repository.ts:47-123` — the compared sessions and the summary
- `src/backend/features/exercises/internal/exercise.repository.ts:124-188` — update, progress, best set
- `src/backend/features/workouts/internal/set.repository.ts:160-175` — `#weightFor`
- `src/backend/features/workouts/ports/sql.ts` — the cross-feature SQL precedent
- `docs/backend.md:287-291, 323, 358-394, 407-430`, `docs/frontend.md:386, 403-419, 465-466, 503-547, 598`
