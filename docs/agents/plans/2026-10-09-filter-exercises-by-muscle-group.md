---
date: 2026-10-09T12:36:18.525430+00:00
git_commit: d837926d7664f8e57016134da444d9ec6a5e8011
branch: main
topic: 'Filter exercises by muscle group'
tags: [plan, exercises, muscle-group, migrations, pagination, frontend, backend]
status: ready
---

# PLAN: Filter exercises by muscle group

Let the exercises page filter its list by muscle group. To give the filter a fixed set of options,
an exercise's muscle group stops being free text and becomes one of seven groups (or none),
enforced by the database and the API and picked from a `<select>` wherever it is entered.

## Acceptance Criteria

- An exercise's muscle group is one of `Chest`, `Back`, `Shoulders`, `Arms`, `Legs`, `Core`,
  `Full body`, or none (`null`). The database refuses anything else with a `CHECK`, and
  `POST`/`PATCH /api/exercises` answer 400 for any other value (matching is exact, case included).
- Migration 005 maps each stored value onto a group by trimming it and comparing case-insensitively;
  any other value becomes `NULL` and is not kept anywhere.
- The add form on the exercise list and the edit form on the exercise detail offer a `<select>`
  ("None" plus the seven groups) in place of the text input.
- The exercise list has a "Muscle group" `<select>` beside its heading: "All", the seven groups and
  "No muscle group".
- The filter lives in the URL as `?muscleGroup=<group>` or `?muscleGroup=none`, beside `?page`;
  changing it navigates to page 1 of the new filter; a reload and Back/Forward keep it; an unknown
  value in the URL is treated as "All".
- With a filter, the cards, the pager and the subtitle follow it; the subtitle reads
  "3 of 12 exercises"; an empty filtered list reads "No Legs exercises yet." or "No exercises
  without a muscle group."; "Add an exercise" starts open only while there are no exercises at all.
- Adding an exercise navigates to the new exercise's group (`none` when it has none) and to the page
  of that filtered list that holds it.
- `GET /api/exercises` and `GET /api/exercises/:id/position` take an optional `muscleGroup` query
  parameter (a group or `none`) and answer 400 for any other value; the page DTO gains `all`, the
  count of every exercise, beside `total`, which now counts the filtered ones.

## Technical Key Decisions and Tradeoffs

1. **A fixed list of seven broad groups:** `Chest`, `Back`, `Shoulders`, `Arms`, `Legs`, `Core`,
   `Full body`.
   - Why: clean data and a filter whose options do not depend on what was typed; the broad split
     avoids forcing compound lifts into one narrow muscle.
   - Impact: a table rebuild adds a `CHECK`; inputs become `<select>`s; the seed already fits.
2. **Unmatched legacy values become `NULL`:** trim + case-insensitive match only, no synonyms, and
   nothing appended to notes.
   - Why: simplest migration; losing odd values is accepted.
   - Impact: one `CASE lower(trim(muscle_group))` in the rebuild's `INSERT … SELECT`.
3. **`MuscleGroup` is a type in `src/shared/`, the value lists are not:** `src/shared/` must stay free
   of runtime code (`docs/frontend.md` "shared"), so the type union lives in a new
   `src/shared/muscle-group.ts` and the backend and the frontend each declare their own array with
   `satisfies readonly MuscleGroup[]`.
   - Why: a type-only import is stripped by the transpiler; a value import would 404 in the browser.
     A separate file (not `shared/dto/`) because `ports/` may not import `shared/dto/`.
   - Impact: typecheck catches a typo in either array; it cannot catch a group missing from one.
     A backend route test and a frontend test each pin the full list in order.
4. **One `<select>` filter held in the URL, with `none` for "No muscle group".**
   - Why: compact on a phone, the same control as the forms, and survives reload and Back.
   - Impact: an `exercisesPath(filter, page)` helper builds the list's URLs; the list listens for
     `change` on the filter and calls `navigate()`, as it does for `page-change`.
5. **After "Add", switch to the new exercise's group:** `/position` takes the same filter.
   - Why: the new card is always visible.
   - Impact: `index()` gains the filter's `WHERE`.
6. **Filtered `total`, plus `all`:** `ExercisePageDto` gains `all: number`.
   - Why: "3 of 12 exercises" and an add form that does not pop open on an empty filter.
   - Impact: the controller counts twice when filtered (two cheap `COUNT(*)`s).
7. **`muscle_group IS ?` for the filter:** SQLite's `IS` compares `NULL` as equal, so one predicate
   serves both a group and `none`; with no filter the `WHERE` is left out.

## Current State

```
/exercises?page=N
  gz-exercise-list.component.ts
    load(): parsePage(location.search) ─► exerciseFacade.list({ limit, offset })
                                            └─► GET /api/exercises?limit=&offset=
    create ─► POST /api/exercises ─► GET /api/exercises/:id/position ─► navigate(pagePath('/exercises', n))

  exercise.controller.ts:21  list(req)      limit/offset from searchParams
    ├─► facade.list(limit, offset) ─► repository.list   exercise.repository.ts:28 (no WHERE, NOCASE name order)
    └─► facade.count()             ─► repository.count  exercise.repository.ts:49 (every exercise)
  exercise.controller.ts:48  position(req)  ─► repository.index(id)  exercise.repository.ts:54

  exercises.muscle_group TEXT (nullable, no CHECK)    001-initial-schema.sql:4
  validated as optionalString(dto, 'muscleGroup', 60)  exercises.facade.ts:59, :69-70
  ExerciseDto.muscleGroup: string | null               src/shared/dto/exercise.ts:7
```

The current list page:

```
+--------------------------------------------------+
| Exercises                                        |
| 12 exercises                                     |
| > Add an exercise                                |
|     Name [Back Squat]  Muscle group [Legs     ]  |   <- free text
|     Notes [...........]                 [Add]    |
| +----------------------------------------------+ |
| | Back Squat                                   | |
| | Legs · Low bar, belt above 100 kg.           | |
| | 12 sets · 140 kg best · 2 days ago           | |
| +----------------------------------------------+ |
| ...                                              |
|                 < 1 2 >                          |
+--------------------------------------------------+
```

The detail page's "Edit exercise" has the same free-text muscle group input
(`gz-exercise-detail.component.ts:110`); its header shows the group or "No muscle group set".

## Desired End State

```
/exercises?muscleGroup=Legs&page=2
  gz-exercise-list.component.ts
    load(): parseMuscleGroupFilter + parsePage ─► exerciseFacade.list({ limit, offset, muscleGroup })
                                                  └─► GET /api/exercises?limit=&offset=&muscleGroup=Legs
    filter change ─► navigate(exercisesPath(filter, 1))
    page-change   ─► navigate(exercisesPath(filter, n))
    create ─► POST ─► GET /api/exercises/:id/position?muscleGroup=<its group|none>
           ─► navigate(exercisesPath(<its group|none>, n))

  controller.list:  muscleGroup ∈ MUSCLE_GROUPS ∪ {none} | absent  (else 400)
    items = list(limit, offset, filter)   total = count(filter)   all = count()
  repository:       … WHERE e.muscle_group IS ?  (only when filtered)

  exercises.muscle_group TEXT CHECK (muscle_group IN ('Chest', …, 'Full body'))
```

The list page:

```
+--------------------------------------------------+
| Exercises                   Muscle group         |
| 3 of 12 exercises           [Legs            v]  |
| > Add an exercise                                |
|     Name [Back Squat]  Muscle group [None    v]  |   <- select
|     Notes [...........]                 [Add]    |
| +----------------------------------------------+ |
| | Back Squat                                   | |
| | Legs · Low bar, belt above 100 kg.           | |
| | 12 sets · 140 kg best · 2 days ago           | |
| +----------------------------------------------+ |
| ...                                              |
|                 < 1 >                            |
+--------------------------------------------------+

Filter options: All · Chest · Back · Shoulders · Arms · Legs · Core · Full body · No muscle group

Empty filtered list:
| Exercises                   Muscle group         |
| 0 of 12 exercises           [Core            v]  |
| > Add an exercise                    (collapsed) |
| No Core exercises yet.                           |
```

Without a filter the subtitle stays "12 exercises". The detail page's edit form shows the same
`<select>` as the add form, preselected with the exercise's group.

## Abstractions and Code Reuse

- `src/shared/`
  - `muscle-group.ts` - **new**, types only: `MuscleGroup` union and `MuscleGroupFilter = MuscleGroup | 'none'`.
  - `dto/exercise.ts` - `muscleGroup: MuscleGroup | null` on `ExerciseDto`, `CreateExerciseDto`,
    `EditExerciseDto`; `ExercisePageDto.all` (phase 2), `total`'s comment becomes "every exercise
    matching the filter".
- `src/backend/`
  - `db/migrations/005-fixed-muscle-groups.sql` - **new**, table rebuild with the `CHECK` and the mapping.
  - `shared/validate.ts` - **new** `optionalOneOf` beside `requiredOneOf`, reusing `isOneOf`.
  - `http/http.ts` - **new** `optionalQueryOneOf` beside `optionalQueryInt` (phase 2).
  - `features/exercises/exercises.facade.ts` - **new** exported `MUSCLE_GROUPS`; validation uses
    `optionalOneOf`; `list`/`count`/`index` take the filter (phase 2).
  - `features/exercises/ports/exercise.ts` - `muscle_group: MuscleGroup | null`.
  - `features/exercises/internal/exercise.repository.ts` - `CreateExercise.muscle_group` typed;
    `list`/`count`/`index` filtered (phase 2).
  - `features/exercises/internal/exercise.translator.ts` - casts to `MuscleGroup`; `all` (phase 2).
  - `features/exercises/internal/exercise.controller.ts` - parses `muscleGroup` (phase 2).
- `src/frontend/features/exercises/`
  - `internal/muscle-groups.ts` - **new**: `MUSCLE_GROUPS`, `parseMuscleGroup(value)` for form
    values, `muscleGroupOptions(selected)` rendering the `<option>`s; in phase 2
    `parseMuscleGroupFilter(search)` and `exercisesPath(filter, page)`.
  - `gz-exercise-list.component.ts` - select in the add form; filter, URL and redirect (phase 2).
  - `gz-exercise-detail.component.ts` - select in the edit form.
  - `internal/exercise.api.ts`, `exercises.facade.ts` - filter on `list` and `position` (phase 2).
- `src/frontend/ui/pagination/pagination.ts` - unchanged; `exercisesPath` composes the query itself
  because `pagePath` only knows `?page`.
- `src/scripts/seed.ts` - `EXERCISES` typed `satisfies` with `muscleGroup: MuscleGroup`.

## Logging & Observability

No new logs. Migration 005 is reported by the existing `db info applied 005-fixed-muscle-groups`
line from `main.ts`'s `onMigration`.

## Implementation

### Phase 1: Fixed muscle groups

Dependencies: None

Turn the muscle group into one of seven values everywhere it is stored, validated and entered.

**Tasks**:

- [ ] Add `src/shared/muscle-group.ts` (types only):
      ```ts
      export type MuscleGroup = 'Chest' | 'Back' | 'Shoulders' | 'Arms' | 'Legs' | 'Core' | 'Full body';

      /** A group, or `none` for exercises without one. */
      export type MuscleGroupFilter = MuscleGroup | 'none';
      ```
- [ ] `src/shared/dto/exercise.ts`: `muscleGroup: MuscleGroup | null` on `ExerciseDto`, and
      `muscleGroup?: MuscleGroup | null` on `CreateExerciseDto` and `EditExerciseDto`.
- [ ] Add `src/backend/db/migrations/005-fixed-muscle-groups.sql`, SQLite's rebuild procedure (the
      runner already turns foreign keys off and runs `foreign_key_check`):
      ```sql
      CREATE TABLE exercises_new (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        name          TEXT    NOT NULL,
        muscle_group  TEXT    CHECK (muscle_group IN ('Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body')),
        notes         TEXT,
        created_at    TEXT    NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
      );

      -- Anything that is not one of the groups, ignoring case and surrounding spaces, is dropped.
      INSERT INTO exercises_new (id, name, muscle_group, notes, created_at)
      SELECT id, name,
             CASE lower(trim(muscle_group))
               WHEN 'chest'     THEN 'Chest'
               WHEN 'back'      THEN 'Back'
               WHEN 'shoulders' THEN 'Shoulders'
               WHEN 'arms'      THEN 'Arms'
               WHEN 'legs'      THEN 'Legs'
               WHEN 'core'      THEN 'Core'
               WHEN 'full body' THEN 'Full body'
             END,
             notes, created_at
        FROM exercises;

      -- Keep the sequence, so ids of deleted exercises are not handed out again.
      UPDATE sqlite_sequence SET seq = (SELECT seq FROM sqlite_sequence WHERE name = 'exercises') WHERE name = 'exercises_new';

      DROP TABLE exercises;
      ALTER TABLE exercises_new RENAME TO exercises;

      CREATE UNIQUE INDEX idx_exercises_name ON exercises (name COLLATE NOCASE);
      ```
      Copying `id`s keeps `sets.exercise_id` and `workout_exercises.exercise_id` valid. The
      `INSERT … SELECT` only advances `exercises_new`'s sequence to the largest *surviving* id, hence
      the `UPDATE`; `DROP` removes the old sequence row and `RENAME` carries the new one over.
- [ ] `src/backend/shared/validate.ts`: add `optionalOneOf(dto, field, values)`. `undefined`, `null`
      and `''` give `null`; any other value must pass `isOneOf`, otherwise
      `badRequest('"<field>" must be one of: …')` (the same message `requiredOneOf` uses).
- [ ] `src/backend/features/exercises/exercises.facade.ts`: export
      `MUSCLE_GROUPS = ['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body'] as const satisfies readonly MuscleGroup[]`;
      replace both `optionalString(dto, 'muscleGroup', 60)` with `optionalOneOf(dto, 'muscleGroup', MUSCLE_GROUPS)`.
- [ ] `src/backend/features/exercises/ports/exercise.ts`: `muscle_group: MuscleGroup | null`
      (imports `src/shared/muscle-group.ts`, which the `ports/` lint rule allows).
- [ ] `src/backend/features/exercises/internal/exercise.repository.ts`: `CreateExercise.muscle_group: MuscleGroup | null`;
      the `create` query's parameter tuple follows.
- [ ] `src/backend/features/exercises/internal/exercise.translator.ts`: body-to-DTO casts become
      `MuscleGroup | null | undefined`.
- [ ] `src/scripts/seed.ts`: type `EXERCISES` so each `muscleGroup` is checked as a `MuscleGroup`
      (e.g. `satisfies readonly { name: string; muscleGroup: MuscleGroup; notes: string | null }[]`).
- [ ] Add `src/frontend/features/exercises/internal/muscle-groups.ts`:
      - `MUSCLE_GROUPS` (same `as const satisfies readonly MuscleGroup[]`),
      - `parseMuscleGroup(value: string | undefined): MuscleGroup | null` (a member, or `null`),
      - `muscleGroupOptions(selected: MuscleGroup | null): RawHtml`, a `<option value="">None</option>`
        followed by one `<option>` per group, with `selected` on the current one.
- [ ] `gz-exercise-list.component.ts`: replace the muscle group `<input>` in the add form with
      `<select id="muscleGroup" name="muscleGroup" data-testid="muscleGroup">${muscleGroupOptions(null)}</select>`,
      and send `muscleGroup: parseMuscleGroup(values.muscleGroup)`.
- [ ] `gz-exercise-detail.component.ts`: the same `<select>` in the edit form with
      `muscleGroupOptions(exercise.muscleGroup)`, keeping `data-testid="muscleGroup"`; send
      `parseMuscleGroup(values.muscleGroup)`.
- [ ] `src/frontend/features/exercises/exercises.fixtures.ts`: the fixture still defaults to
      `muscleGroup: null`; fix any test passing a non-member string.
- [ ] Tests, `src/backend/db/migrations.test.ts` ("the real migrations"): build a database up to 004
      from a temp dir (as the 004 test does), insert exercises with `' legs '`, `'CHEST'`,
      `'Full Body'`, `'Quads'`, `NULL` and a set on one of them, migrate, and assert
      `Legs`, `Chest`, `Full body`, `NULL`, `NULL`, the same ids, the set still pointing at its
      exercise, the unique-name index still refusing `'back squat'` beside `'Back Squat'`, and an
      `UPDATE exercises SET muscle_group = 'Quads'` throwing. Also assert that after deleting the
      exercise with the highest id before 005, the next exercise inserted after 005 gets a new id,
      not the deleted one.
- [ ] Tests, `src/backend/db/migrations.test.ts`: update the existing expectations that list the
      real migrations: `:171-172` (`[1, 2, 3, 4]` and version 4 become `[1, 2, 3, 4, 5]` and 5) and
      `:228` (`[4]` becomes `[4, 5]`).
- [ ] Tests, `src/backend/shared/validate.test.ts`: `optionalOneOf` returns `null` for `undefined`,
      `null` and `''`, returns a member, and throws for `'legs'` and a number.
- [ ] Tests, `src/backend/features/exercises/exercise.routes.test.ts`: `POST` with every one of the
      seven groups in order succeeds and echoes it; `POST` with `'Quads'` and with `'legs'` is a
      400; `PATCH` with `'Arms'` changes it and with `null` clears it.
- [ ] Tests, `gz-exercise-list.component.test.ts`: add a `beforeEach` resetting the URL with
      `history.replaceState(null, '', '/exercises')`, as `gz-workout-list.component.test.ts:14-16`
      does, since `navigate()` pushes history that outlives a test. Then: the add form's select lists
      "None" and the seven groups in order, and submitting with "Legs" (picked with `choose()`, `src/frontend/testing.ts:235`) posts
      `muscleGroup: 'Legs'`, with "None" posts `null`. These need new stubs for
      `POST /api/exercises` and `GET /api/exercises/:id/position`.
- [ ] Tests, `gz-exercise-detail.component.test.ts`: the edit select is preselected with the
      exercise's group (and "None" when it has none). Rewrite "saves the details trimmed" (`:118-123`),
      which types `' Chest  '` into the muscle group field: pick "Chest" with `choose()` and keep
      the trimming assertions for name and notes.
- [ ] Docs, `docs/backend.md`: in the data-model paragraphs (before "The schema lives in …",
      around line 234) describe the seven groups, the `CHECK`, the exact-match 400, and that
      `005-fixed-muscle-groups.sql` kept values matching a group after trimming, ignoring case, and
      cleared the rest; mention `optionalOneOf` beside `requiredOneOf` where `shared/validate.ts`
      is listed (line 10).
- [ ] Docs, `docs/frontend.md`: where the add form (around line 322) and `gz-exercise-detail`'s edit
      form (around line 325) are described, say the muscle group is a `<select>` of "None" and the
      seven groups, rendered by `internal/muscle-groups.ts`, whose list is the frontend's own copy
      of the backend's, typed against `src/shared/muscle-group.ts`.

**Automated Verification**:

- [ ] `bun test --parallel src/backend/db/migrations.test.ts` passes, including the 005 test.
- [ ] `bun test --parallel src/backend/shared/validate.test.ts src/backend/features/exercises` passes.
- [ ] `bun test --parallel src/frontend/features/exercises` passes.
- [ ] `bun test --parallel`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

### Phase 2: Filter the exercise list by muscle group

Dependencies: Phase 1

Add the `muscleGroup` query parameter to the list and position endpoints and the filter `<select>`,
URL state and post-create redirect to the list.

**Tasks**:

- [ ] `src/shared/dto/exercise.ts`: `ExercisePageDto` gains `/** Every exercise, whatever the filter. */ all: number;`;
      `total`'s comment becomes "Every exercise matching the filter, not just this page."
- [ ] `src/backend/http/http.ts`: add
      `optionalQueryOneOf<V extends string>(params, key, values: readonly V[]): V | null`; absent or
      `''` gives `null`, a non-member is `badRequest('"<key>" must be one of: …')`.
- [ ] `src/backend/features/exercises/internal/exercise.repository.ts`: `list(limit, offset, muscleGroup?)`,
      `count(muscleGroup?)` and `index(id, muscleGroup?)`, where `muscleGroup: MuscleGroup | null | undefined`
      (`undefined` = every exercise, `null` = those without a group). A private helper returns the
      condition and its parameter without a table alias, `{ sql: 'muscle_group IS ?', params: [muscleGroup] }`
      or `null`, since `count()` and `index()` query `exercises` unaliased; `list` renders it as
      `WHERE e.muscle_group IS ?` (the column is unambiguous, so the bare name works too) before
      `GROUP BY`, binding the filter ahead of `LIMIT`/`OFFSET`; `count` as `WHERE muscle_group IS ?`;
      `index` as `AND muscle_group IS ?` after its `name < ?`. Update
      `index`'s doc comment: names are unique under NOCASE across all exercises, so they are within a
      group too.
- [ ] `src/backend/features/exercises/exercises.facade.ts`: `list`, `count` and `index` pass the filter through.
- [ ] `src/backend/features/exercises/internal/exercise.controller.ts`: a private `#muscleGroup(params)`
      reads `optionalQueryOneOf(params, 'muscleGroup', [...MUSCLE_GROUPS, 'none'])` and maps
      absent → `undefined`, `'none'` → `null`. `list` answers
      `translateToExercisePageDto(list(limit, offset, filter), count(filter), count(), limit, offset)`;
      `position` passes the filter to `index`.
- [ ] `src/backend/features/exercises/internal/exercise.translator.ts`: `translateToExercisePageDto`
      takes and returns `all`.
- [ ] `src/frontend/features/exercises/internal/exercise.api.ts`: `list({ limit, offset, muscleGroup })`
      and `position(id, muscleGroup?)` build their query with `URLSearchParams`, keeping today's
      exact URLs when no filter is given (`/exercises` and `/exercises?limit=10&offset=0`, so the
      add-set form's unpaged call is unchanged); `muscleGroup` is a `MuscleGroupFilter`.
- [ ] `src/frontend/features/exercises/exercises.facade.ts`: `list` and `position` pass `muscleGroup` through.
- [ ] `internal/muscle-groups.ts`: add
      - `parseMuscleGroupFilter(search: string): MuscleGroupFilter | null`, `null` (= All) for an
        absent or unknown value,
      - `exercisesPath(filter: MuscleGroupFilter | null, page: number): string`, `/exercises`, then
        `muscleGroup` and then `page` (left out on page 1), e.g. `/exercises?muscleGroup=Full+body&page=2`,
      - `muscleGroupFilterOptions(selected)`, `<option value="">All</option>`, the seven groups,
        `<option value="none">No muscle group</option>`.
- [ ] `gz-exercise-list.component.ts`:
      - `ExerciseListData` gains `all` and `filter: MuscleGroupFilter | null`; `load()` reads the
        filter with `parseMuscleGroupFilter(location.search)` and passes it to `list`.
      - The heading becomes the workouts list's `<div class="hstack justify-between gap-2">` row:
        the `hgroup` on the left, on the right a field with
        `<label for="filter">Muscle group</label><select id="filter" data-testid="filter">…</select>`.
      - `connectedCallback` listens for `change` on `#filter` (delegated on `this.root`, like
        `page-change`) and navigates to `exercisesPath(<value or null>, 1)`; `page-change` navigates to
        `exercisesPath(this.data.filter, n)`.
      - Subtitle: `plural(all, 'exercise')` without a filter, `${total} of ${plural(all, 'exercise')}`
        with one. "Add an exercise" is open when `all === 0`.
      - Empty list: the current text when `all === 0`; otherwise "No <group> exercises yet." or
        "No exercises without a muscle group.".
      - After a create: `const filter = exercise.muscleGroup ?? 'none'`, `position(exercise.id, filter)`,
        `navigate(exercisesPath(filter, Math.floor(index / PAGE_SIZE) + 1))`.
- [ ] `optionalQueryOneOf` has no unit test of its own, like `optionalQueryInt`: the route tests
      below cover absent, a member and a non-member 400.
- [ ] Add `all` to every hand-built `ExercisePageDto` in frontend tests:
      `src/frontend/app/gz-app.component.test.ts:53` and
      `src/frontend/features/workouts/gz-workout-detail.component.test.ts:19`, besides `page()` in
      `gz-exercise-list.component.test.ts:23`.
- [ ] Tests, `exercise.routes.test.ts`: with exercises in Legs, Chest and none,
      `?muscleGroup=Legs` lists only Legs with the right `total` and `all`; `?muscleGroup=none` lists
      only those without a group; `?muscleGroup=Full+body` decodes; paging within a filter;
      `?muscleGroup=Quads` and `?muscleGroup=legs` are 400; no parameter keeps `total === all`;
      `/position?muscleGroup=Legs` counts only Legs exercises sorting before it, `?muscleGroup=none`
      likewise, and a bad value is a 400; an empty `?muscleGroup=` is the same as none given.
- [ ] Tests, `internal/muscle-groups.test.ts` (new): `parseMuscleGroupFilter` (absent, a group,
      `Full+body`, `none`, unknown → `null`) and `exercisesPath` (no filter page 1 → `/exercises`,
      filter and page, `none`, encoded space).
- [ ] Tests, `exercises.facade.test.ts` / API: `list` and `position` request the filtered URLs, and
      the unfiltered ones are unchanged.
- [ ] Tests, `gz-exercise-list.component.test.ts` (update `page()` to fill `all`):
      - with `?muscleGroup=Legs` in the URL it requests the filtered page, preselects "Legs", reads
        "3 of 12 exercises", and keeps the add form closed on an empty filtered page while `all > 0`
        and shows "No Legs exercises yet.";
      - `?muscleGroup=none` with no matches shows "No exercises without a muscle group.";
      - choosing a group navigates to `/exercises?muscleGroup=<group>`; choosing "All" to `/exercises`;
      - a `page-change` under a filter keeps it in the URL;
      - creating an "Arms" exercise while filtered to Chest requests `/position?muscleGroup=Arms` and
        navigates to `/exercises?muscleGroup=Arms`; one without a group goes to `?muscleGroup=none`.
- [ ] Docs, `docs/backend.md` (lines 42-50): `GET /api/exercises` and `/position` take an optional
      `muscleGroup` (a group or `none`, else 400); `total` counts the filtered rows and the exercise
      page adds `all`; the position is counted within the filter, still exact because names are
      unique under NOCASE overall; `optionalQueryOneOf` beside `optionalQueryInt` (line 10).
- [ ] Docs, `docs/frontend.md` (lines 301-323): the exercises list keeps its filter in the URL as
      `?muscleGroup=` beside `?page=`, built by `exercisesPath`, and a filter change starts at page 1;
      the "3 of 12 exercises" subtitle and filter-specific empty text; the add form opens on `all`;
      adding an exercise navigates to its group's page that holds it.

**Automated Verification**:

- [ ] `bun test --parallel src/backend` passes, including the new filter and position cases.
- [ ] `bun test --parallel src/frontend/features/exercises` passes, including `muscle-groups.test.ts`.
- [ ] `bun test --parallel`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [ ] On a seeded database (`bun run seed`, `bun run start:dev`), filter `/exercises` by Back,
      check the cards, the subtitle and the URL, reload, then go Back and Forward through filter
      changes.
- [ ] With a filter active, add an exercise in another group and in none, and confirm the list
      switches to that group with the new card visible.
- [ ] On a phone-width window, the heading row with the filter wraps cleanly and the selects in the
      add and edit forms are usable.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/plans/2026-09-29-paginate-workouts-and-exercises.md` - the URL paging and `/position` this extends
- `docs/agents/plans/2026-09-22-open-workouts-and-exercises-by-clicking-the-card.md` - list and detail layout
- `src/backend/db/migrations.ts:125-150` - foreign keys off and `foreign_key_check` around table rebuilds
- `src/backend/shared/validate.ts:73-85` - `isOneOf` / `requiredOneOf`
- `src/frontend/features/workouts/gz-workout-list.component.ts:74-80` - heading row with a control on the right
- SQLite `ALTER TABLE` docs, "Making Other Kinds Of Table Schema Changes" (the 12-step rebuild)
