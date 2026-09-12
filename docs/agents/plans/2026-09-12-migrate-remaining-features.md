---
date: 2026-09-12T18:17:36+00:00
git_commit: 4893a581c636d8b2a7e86786a42b1872f5d74b83
branch: main
topic: 'Migrate the remaining backend features into the features/<feature>/{ports,internal} structure'
tags: [plan, backend, features, repositories, refactor, ports, internal]
status: complete
---

# PLAN: Every feature owns its repository

`features/exercises/` is the only feature carried through the feature-first restructuring. The
other four are half-moved: their routes and mappers sit under `features/`, but their repositories
are still in `db/repos/`, their request-body parsers are still inline in route files, and a single
`Repo` facade with twenty-two delegating methods still stands between every route and every table.

This plan finishes the move. Each feature ends up owning its own repository — `ExerciseRepository`,
`WorkoutRepository`, `SetRepository`, `StatsRepository` — behind a `ports/` surface other features
may read and an `internal/` folder nothing outside the feature touches. The `Repo` facade is
deleted rather than relocated, sets merge into workouts because the schema already says they belong
together, and `db/` is left holding the connection, the migrations and the SQL helpers no feature
owns.

Built on `docs/agents/research/2026-09-12-features-exercises-layout.md`.

## Acceptance Criteria

- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass at the end of
  every phase.
- No module under `src/backend/features/<a>/` imports from `src/backend/features/<b>/internal/`.
- `src/backend/db/` contains only `db.ts`, `migrations.ts`, `migrations/` and `sql.ts` — no
  `repos/`, no `Repo` class, and no SQL statement outside a feature's `internal/`.
- Every data-owning feature declares its own repository, named `<Entity>Repository`:
  `ExerciseRepository`, `WorkoutRepository`, `SetRepository`, `StatsRepository`.
- Each repository lives in `features/<feature>/internal/<entity>.repository.ts` and is constructed
  only in the three composition roots — `src/backend/main.ts`, `src/backend/testing.ts`,
  `src/scripts/seed.ts` — plus `src/backend/http/server.test.ts`, which builds a server directly.
- Every request body reaches a route through a `translateTo<Name>Dto` function in that feature's
  `internal/<entity>.translator.ts`. No `read*Body` function remains anywhere.
- `<Entity>Input` types and `from*` mappers are reachable only from inside their own feature.
- `POST /api/workouts/:id/sets` and `PATCH /api/sets/:id` answer `400` when the body names an
  exercise that does not exist, and no repository pre-checks the exercise.
- `resolveStaticPath('/')` resolves inside `src/frontend/`, pinned by a test that fails loudly if
  the module is moved again.
- `docs/backend.md`, `AGENTS.md`, `docs/frontend.md` and the header of `src/shared/dto/index.ts`
  describe the feature-first layout, with no reference to `http/dto/`, `http/routes/` or
  `db/repos/`.

## Technical Key Decisions and Tradeoffs

1. **The `Repo` facade is dissolved, not relocated.** Route factories receive the repositories they
   actually use; the three composition roots build them.
   - Why: it is the last module holding the layer-first structure together, and it forces every
     route to depend on all four entities.
   - Impact: `allRoutes` takes a `Repositories` parameter object declared in `http/routes.ts`;
     `seed.ts` switches from `repo.createExercise(…)` to `exercises.create(…)`; the four-line
     wiring is repeated in `main.ts`, `testing.ts` and `seed.ts`.

2. **`ports/` holds row types and `to*` mappers. `internal/` holds the repository, its
   `<Entity>Input`, the `from*` mappers and the translator.**
   - Why: gives `internal/` a meaning beyond "files we moved" — it is everything about how this
     feature talks to its own table — and closes the standing TODO at `ports/exercise.ts:30`.
   - Impact: a third internal module per entity, `<entity>.mapper.ts`. `<Entity>Input` is still
     declared with `export` so its sibling mapper can import it; the rule is about who imports it,
     not about the keyword.

3. **Sets merge into the workouts feature.**
   - Why: `sets.workout_id` is `ON DELETE CASCADE` and `sets.exercise_id` is `ON DELETE RESTRICT`
     (`001-initial-schema.sql:30-31`). The schema already says a set is part of a workout and
     merely refers to an exercise, and `docs/backend.md:60-65` spells out why.
   - Impact: `POST /api/workouts/:id/sets` crosses no boundary, so the documented URL-prefix rule
     survives untouched; the duplicate `LiftSet` declaration at `sets/ports/set.ts:1,4` resolves;
     `features/sets/` disappears; the workouts feature holds two route modules and two
     repositories, as `features/meta/` already holds two route modules today.

4. **The exercise pre-check is deleted; the foreign key enforces it and the violation becomes a
   400.**
   - Why: `ON DELETE RESTRICT` already guarantees it, and the pre-check was the only reason one
     feature's repository needed another feature's repository.
   - Impact: `SetRepository` takes `(db, workouts)`. A new `isForeignKeyViolation` matches Bun's
     structured `code === 'SQLITE_CONSTRAINT_FOREIGNKEY'` rather than the error text.
     `workout.routes.test.ts:102` changes from 404 to 400, and `PATCH /api/sets/:id` gains the same
     coverage, which it does not have today.

5. **`meta` splits into `meta` and `stats`.**
   - Why: health and the `/api` catch-all share nothing with whole-log aggregates but a folder.
   - Impact: `features/meta/` owns no repository, like `features/static/`; `features/stats/` gets
     the full three-level shape.

6. **SQL fragments follow their table; helpers stay shared.**
   - Why: `ExerciseRepository.progress()` and `.bestSet()` query the sets table, so `SET_COLUMNS`
     and `EST_1RM_SQL` genuinely cross a feature line and must be exported from a `ports/`.
   - Impact: `features/workouts/ports/sql.ts` holds those two; `EXERCISE_COLUMNS` moves into the
     exercises repository, its only consumer; `db/sql.ts` keeps `buildUpdate`, `isUniqueViolation`
     and `isForeignKeyViolation`.

7. **`http/routes/shared.ts` becomes `http/routing.ts`; `MAX_NAME`/`MAX_NOTES` move to
   `shared/validate.ts`.**
   - Why: a one-file folder sitting beside `routes.ts` invites confusion, and once every translator
     is extracted the two length bounds are used only by translators — beside `requiredString`,
     never by a route.
   - Impact: one import line changes in every route module; translators import their limits from
     the same module as their parsers.

8. **Phase 1 exists only to reach green.** The working tree currently fails all four checks.
   - Why: no later phase can prove it broke nothing without a baseline that passes.
   - Impact: phase 1 restructures nothing.

## Current State

All four checks fail on the working tree as it stands:

```
bun test           1 pass, 11 fail  — every file dies at import:
                   "Cannot find module '../../http/dto'" from set.routes.ts / workout.routes.ts
bun run typecheck  7 errors         — 5 in db/repos/index.ts, 2 from the dead http/dto imports
bun run lint       ~14 errors       — all cascading from the same unresolved import, plus seed.ts
bun run fmt:check  2 files          — db/repos/index.ts, exercises/internal/exercise.translator.ts
```

A second, quieter break: `features/static/paths.ts` computes `REPO_ROOT` from
`new URL('../..', import.meta.url)` and its own comment warns this "only holds while the file sits
in `src/backend/`". It now sits two levels deeper, so:

```
FRONTEND_DIR = …\gainz\src\backend\src\frontend      (does not exist)
```

The server would 404 the entire frontend. The dead `http/dto` imports mask it today; it surfaces
the moment the suite goes green.

Structurally, one facade sits between every route and every table:

```
   main.ts ─┐
 testing.ts ─┼─► new Repo(db) ──► db/repos/index.ts
   seed.ts ─┘                     22 flat methods: listExercises, createSet, countWorkouts, summary…
                                       │        │         │          │
                    ExerciseRepository ┘  WorkoutRepo  SetRepo  StatsRepo
                    features/exercises/   db/repos/    db/repos/ db/repos/
                          internal/

   exerciseRoutes(repo)  workoutRoutes(repo)  setRoutes(repo)  statsRoutes(repo)
   ── every route factory receives the whole facade; none receives a repository ──
```

| Feature | routes | `ports/` | `internal/` | repository | translator |
| --- | --- | --- | --- | --- | --- |
| exercises | ✅ | ✅ | ✅ | `ExerciseRepository` ✅ | ✅ `translateTo*Dto` |
| sets | ✅ | ✅ | ❌ | `SetRepo` in `db/repos/` | ❌ inline `readSetBody` |
| workouts | ✅ | ✅ | ❌ | `WorkoutRepo` in `db/repos/` | ❌ inline `readWorkoutBody` |
| meta | ✅ ×2 | ✅ stats | ❌ | `StatsRepo` in `db/repos/` | — |
| static | ✅ | ❌ | ❌ | — | — |

## Desired End State

```
src/backend/
├── main.ts                       builds the four repositories, passes them to serveOptions
├── testing.ts                    the same four, over an in-memory database
├── db/
│   ├── db.ts, migrations.ts, migrations/
│   └── sql.ts                    buildUpdate, isUniqueViolation, isForeignKeyViolation
├── http/
│   ├── routing.ts                RouteTable, ParamRequest, Handler, guard, guardAll
│   ├── routes.ts                 Repositories + allRoutes(repos)
│   ├── http.ts, errors.ts, server.ts
├── shared/validate.ts            parsers + MAX_NAME, MAX_NOTES
└── features/
    ├── exercises/
    │   ├── exercise.routes.ts(+test)
    │   ├── ports/exercise.ts         Exercise, ExerciseWithStats, SessionPoint
    │   │                             toExercise, toExerciseWithStats, toSessionPoint,
    │   │                             toExerciseProgress
    │   └── internal/
    │       ├── exercise.repository.ts   ExerciseRepository, ExerciseInput, EXERCISE_COLUMNS
    │       ├── exercise.translator.ts   translateToCreateExerciseDto, translateToEditExerciseDto
    │       └── exercise.mapper.ts       fromCreateExercise, fromEditExercise
    ├── workouts/
    │   ├── workout.routes.ts(+test)     /api/workouts, /api/workouts/:id, …/:id/sets
    │   ├── set.routes.ts(+test)         /api/sets/:id
    │   ├── ports/
    │   │   ├── workout.ts               Workout, WorkoutWithStats + toWorkout,
    │   │   │                            toWorkoutWithStats, toWorkoutWithSets, toWorkoutPage
    │   │   ├── set.ts                   LiftSet + toLiftSet, toBestSet
    │   │   └── sql.ts                   SET_COLUMNS, EST_1RM_SQL
    │   └── internal/
    │       ├── workout.repository.ts    WorkoutRepository, WorkoutInput
    │       ├── workout.translator.ts    translateToCreateWorkoutDto, translateToEditWorkoutDto
    │       ├── workout.mapper.ts        fromCreateWorkout, fromEditWorkout
    │       ├── set.repository.ts        SetRepository, SetInput
    │       ├── set.translator.ts        translateToCreateSetDto, translateToEditSetDto
    │       └── set.mapper.ts            fromCreateSet, fromEditSet
    ├── stats/
    │   ├── stats.routes.ts(+test)
    │   ├── ports/stats.ts               Summary + toSummary
    │   └── internal/stats.repository.ts StatsRepository
    ├── meta/
    │   └── meta.routes.ts(+test)        /api/health, /api, /api/*   — owns no data
    └── static/
        ├── static.routes.ts(+test)
        └── internal/
            ├── paths.ts(+test)          FRONTEND_DIR, VENDOR_FILES, resolveStaticPath, …
            └── transpile.ts(+test)
```

Dependency directions in the end state — every arrow either stays inside a feature or lands on a
`ports/`:

```
   main.ts / testing.ts / seed.ts
        │  builds
        ▼
   ┌─────────────────┐   ┌──────────────────────────────┐   ┌────────────┐
   │   exercises     │   │          workouts            │   │   stats    │
   │                 │   │                              │   │            │
   │ internal ───────┼──►│ ports/set.ts   (LiftSet,     │   │ internal   │
   │   repository    │   │                 toBestSet)   │   │            │
   │   translator    │   │ ports/sql.ts   (SET_COLUMNS, │   │ ports      │
   │   mapper        │   │                 EST_1RM_SQL) │   └────────────┘
   │                 │   │                              │
   │ ports ──────────┼──►│                              │        meta, static
   └─────────────────┘   │ internal: workout + set      │        (no data at all)
                         └──────────────────────────────┘
              no arrow ever points into another feature's internal/
```

The request path, unchanged in shape from what exercises does today:

```
  body  ──translateTo<X>Dto──►  <X>Dto  ──from<X>──►  <Entity>Input  ──repository──►  row
  (internal/…translator)      (shared/dto)  (internal/…mapper)      (internal/…repository)
                                                                                       │
  response  ◄──json()──  <X>Dto  ◄──to<Shape>──────────────────────────────────────────┘
                                  (ports/…)
```

## Abstractions and Code Reuse

Reused as-is, with no changes beyond import paths:

- `guard` / `guardAll` and the `RouteTable` / `ParamRequest` / `Handler` types — the error-to-JSON
  boundary every route already sits behind.
- `shared/validate.ts` parsers (`requiredString`, `optionalString`, `requiredInt`,
  `requiredNumber`, `requiredDate`, `isPresent`, `pathId`, `queryInt`, `today`) — every translator
  is assembled from these, so extracting translators moves calls rather than writing new ones.
- `buildUpdate` and `isUniqueViolation` — the dynamic-`UPDATE` builder and the duplicate-name
  predicate keep working unchanged.
- The `to*` / `from*` mapper style, field-by-field with no row ever spread
  (`docs/backend.md:18-24`).
- `useServer()` in `testing.ts` — every route test keeps its current shape; only the two lines that
  build the server change.

New abstractions, three in total:

- `internal/<entity>.mapper.ts` — a module per entity for the `from*` direction, so
  `<Entity>Input` can stop being public.
- `isForeignKeyViolation(err)` in `db/sql.ts` — the sibling of `isUniqueViolation`, matching Bun's
  structured `code` (`SQLITE_CONSTRAINT_FOREIGNKEY`, errno 787) rather than the message text.
- `Repositories` in `http/routes.ts` — a parameter object, not a class: it holds the four
  repositories and owns no methods and no knowledge of SQL.

Files, grouped by what happens to them:

- `src/backend/db/`
  - `repos/index.ts` - deleted in phase 5. `Repo` - the facade, gone
  - `repos/sql.ts` → `db/sql.ts` - loses `SET_COLUMNS`, `EST_1RM_SQL`, `EXERCISE_COLUMNS`; gains
    `isForeignKeyViolation`
  - `repos/sets.ts` → `features/workouts/internal/set.repository.ts` - `SetRepo` →
    `SetRepository`, loses its `exercises` constructor argument, gains the FK catch
  - `repos/workouts.ts` → `features/workouts/internal/workout.repository.ts` - `WorkoutRepo` →
    `WorkoutRepository`; `Workout` and `WorkoutWithStats` move out to `ports/`
  - `repos/stats.ts` → `features/stats/internal/stats.repository.ts` - `StatsRepo` →
    `StatsRepository`; `Summary` moves out to `ports/`
- `src/backend/features/`
  - `sets/` - dissolved into `workouts/` in phase 2
  - `workouts/set.routes.ts` - `readSetBody`/`readEditSetBody` extracted to a translator
  - `workouts/workout.routes.ts` - `readWorkoutBody`/`readEditWorkoutBody` extracted to a
    translator; handlers take `workouts` and `sets` instead of `repo`
  - `exercises/ports/exercise.ts` - loses `ExerciseInput`, `fromCreateExercise`, `fromEditExercise`
  - `meta/stats.routes.ts`, `meta/ports/stats.ts` → `features/stats/`
  - `static/paths.ts`, `static/transpile.ts` → `static/internal/`; `REPO_ROOT` depth corrected
- `src/backend/http/`
  - `routes/shared.ts` → `routing.ts` - loses `MAX_NAME`/`MAX_NOTES` to `shared/validate.ts`
  - `routes.ts` - declares `Repositories`; `allRoutes(repos)` passes each factory what it needs
  - `server.ts` - `serveOptions(repos: Repositories)`
- `src/backend/main.ts`, `src/backend/testing.ts`, `src/scripts/seed.ts` - the three composition
  roots, each building the four repositories
- `docs/backend.md`, `docs/frontend.md`, `AGENTS.md`, `src/shared/dto/index.ts`, `TODO.md` -
  updated in phase 5

## Logging & Observability

No logging changes. The only console output in the server is `main.ts`'s startup lines and the
per-migration notice, and neither is affected. Error reporting keeps its current shape: handlers
throw `HttpError`, `guardAll` turns it into `{ error }` with a status, and `serveOptions`' `error`
hook catches anything else as a 500. The one observable behaviour change in this plan is the
status code for a set naming an unknown exercise, covered by tests in phase 2.

## Implementation

### Phase 1: A green baseline

Dependencies: None.

Nothing is restructured here. This phase only makes the four checks pass so later phases have
something to verify against, and fixes the silent static break before it can be mistaken for
damage from a later phase.

**Tasks**:

- [x] `src/backend/features/sets/set.routes.ts:4` — replace the dead `from '../../http/dto'` with
      `import { fromEditSet, toLiftSet } from './ports/set.ts';`
- [x] `src/backend/features/workouts/workout.routes.ts:4` — replace the dead `from '../../http/dto'`
      with two imports:
      ```ts
      import { fromCreateWorkout, fromEditWorkout, toWorkout, toWorkoutPage, toWorkoutWithSets } from './ports/workout.ts';
      import { fromCreateSet, toLiftSet } from '../sets/ports/set.ts';
      ```
- [x] `src/backend/features/sets/ports/set.ts:1` — drop `LiftSet` from the import, which shadows the
      interface declared at line 4; keep only `import type { SetInput } from '../../../db/repos';`
- [x] `src/backend/db/repos/index.ts:7-8` — take the class from `internal/` but the row types from
      the features' ports:
      ```ts
      import { ExerciseRepository } from '../../features/exercises/internal/exercise.repository.ts';
      import type { Exercise, ExerciseInput, ExerciseWithStats, SessionPoint } from '../../features/exercises/ports/exercise.ts';
      import { SetRepo, type SetInput } from './sets.ts';
      import type { LiftSet } from '../../features/sets/ports/set.ts';
      ```
- [x] `src/backend/features/static/paths.ts:4-6` — correct `REPO_ROOT` for the module's new depth
      and rewrite the comment to name where the file actually lives:
      ```ts
      // Relative to this module's own location: src/backend/features/static/paths.ts, so four
      // levels up is the repository root. `paths.test.ts` fails loudly if the file moves again.
      const REPO_ROOT = resolve(fileURLToPath(new URL('../../../..', import.meta.url)));
      ```
- [x] Create `src/backend/features/static/paths.test.ts` pinning the anchor, so a future move is a
      failing test rather than a 404 on every page:
      ```ts
      test('FRONTEND_DIR points at the real src/frontend', () => {
        expect(FRONTEND_DIR.endsWith(join('src', 'frontend'))).toBe(true);
        expect(existsSync(join(FRONTEND_DIR, 'index.html'))).toBe(true);
      });
      test('resolveStaticPath refuses a path that escapes the web root', () => {
        expect(resolveStaticPath('/../backend/main.ts')).toBeNull();
      });
      ```
- [x] `src/backend/features/static/transpile.test.ts:49` — the second path broken by the same move.
      `resolve(import.meta.dir, '..', 'frontend', '__broken.ts')` was written when the file sat in
      `src/backend/`; from `features/static/` it now writes to `src/backend/features/frontend/`,
      outside the web root, so the request 404s instead of reporting the parse failure. It needs
      three levels: `resolve(import.meta.dir, '..', '..', '..', 'frontend', '__broken.ts')`
- [x] Run `bun run fmt` to settle `db/repos/index.ts` and
      `features/exercises/internal/exercise.translator.ts`
- [x] Restore the ten documents under `docs/agents/` that a find/replace rewrote in the working
      tree (`git checkout -- docs/agents/`), leaving this plan and the 2026-09-12 research in
      place. `AGENTS.md:26-27` puts those files off-limits: each records the repository as it stood
      on its own date, so the rewritten paths are damage rather than corrections

**Automated Verification**:

- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `bun test` passes — all 12 files, no "Cannot find module" at import
- [x] `bun test src/backend/features/static/` passes, including the two new `paths.test.ts` cases
- [x] `git status --short docs/agents/` lists only the two files added on 2026-09-12

### Phase 2: Merge sets into workouts

Dependencies: Phase 1.

The two entities the schema binds together become one feature with the full three-level shape, and
the exercise pre-check is replaced by the foreign key it duplicates.

`db/repos/index.ts` survives this phase and will import `SetInput` and `WorkoutInput` from the
feature's `internal/` — exactly as it already does for `ExerciseRepository`. That is transitional;
phase 5 deletes the file.

**Tasks**:

- [x] `git mv` the sets feature into the workouts feature, then delete the empty `features/sets/`:
      `sets/set.routes.ts` → `workouts/set.routes.ts`, `sets/set.routes.test.ts` →
      `workouts/set.routes.test.ts`, `sets/ports/set.ts` → `workouts/ports/set.ts`
- [x] `git mv src/backend/db/repos/workouts.ts src/backend/features/workouts/internal/workout.repository.ts`
      and rename the class `WorkoutRepo` → `WorkoutRepository`
- [x] `git mv src/backend/db/repos/sets.ts src/backend/features/workouts/internal/set.repository.ts`
      and rename the class `SetRepo` → `SetRepository`
- [x] Move `Workout` and `WorkoutWithStats` out of `internal/workout.repository.ts` into
      `ports/workout.ts`; leave `WorkoutInput` and `const FIELDS` in the repository. `ports/workout.ts:1`
      then imports nothing from `db/repos`: it declares `Workout` and `WorkoutWithStats` itself and
      takes `LiftSet` from `./set.ts`, while `WorkoutInput` goes to the mapper in `internal/`
- [x] Create `features/workouts/ports/sql.ts` holding `SET_COLUMNS` and `EST_1RM_SQL`, moved from
      `db/repos/sql.ts` with their doc comments, and re-point `internal/set.repository.ts`
- [x] Add `isForeignKeyViolation` to `db/repos/sql.ts`, matching the structured code rather than the
      message — Bun raises `SQLiteError` with `code: 'SQLITE_CONSTRAINT_FOREIGNKEY'`:
      ```ts
      /** A row pointing at something that is not there — as opposed to a duplicate. */
      export function isForeignKeyViolation(err: unknown): boolean {
        return err instanceof Error && 'code' in err && err.code === 'SQLITE_CONSTRAINT_FOREIGNKEY';
      }
      ```
- [x] `internal/set.repository.ts` — drop the `exercises: ExerciseRepository` constructor argument
      and both `this.exercises.require(…)` calls, so the constructor reads
      `(db: DB, workouts: WorkoutRepository)`. Rewrite the constructor doc comment: the cycle it
      described is gone with the merge
- [x] `internal/set.repository.ts` — wrap the `INSERT` in `create()` and the `buildUpdate` run in
      `update()` so a dangling `exercise_id` becomes a 400 rather than a 500:
      ```ts
      } catch (err) {
        if (isForeignKeyViolation(err)) {
          throw badRequest('"exerciseId" must name an existing exercise');
        }
        throw err;
      }
      ```
      `this.workouts.require(workoutId)` stays: that id comes from the path, where a 404 is right
- [x] Create `internal/set.translator.ts` with `translateToCreateSetDto` and
      `translateToEditSetDto`, moved verbatim from `set.routes.ts:10-38` (`readSetBody`,
      `readEditSetBody`); delete both from the route file along with the "Exported because…" comment,
      which the merge makes untrue
- [x] Create `internal/set.mapper.ts` with `fromCreateSet` and `fromEditSet`, moved from
      `ports/set.ts:39-67`; `ports/set.ts` keeps `LiftSet`, `toLiftSet` and `toBestSet` and loses
      its `db/repos` import entirely
- [x] Create `internal/workout.translator.ts` with `translateToCreateWorkoutDto` and
      `translateToEditWorkoutDto`, moved from `workout.routes.ts:10-31`
- [x] Create `internal/workout.mapper.ts` with `fromCreateWorkout` and `fromEditWorkout`, moved from
      `ports/workout.ts:38-63`, carrying the doc comment about `today()` and `copyFromWorkoutId`
- [x] `set.routes.ts` and `workout.routes.ts` — import the translators and mappers from
      `./internal/`, and the `to*` mappers from `./ports/`. Route signatures still take `repo: Repo`
      in this phase; phase 5 changes them
- [x] `features/exercises/internal/exercise.repository.ts` — take `SET_COLUMNS` and `EST_1RM_SQL`
      from `../../workouts/ports/sql.ts`, and `LiftSet` from `../../workouts/ports/set.ts`
- [x] `features/exercises/ports/exercise.ts:2-3` — take `toBestSet` **and** `LiftSet` from
      `../../workouts/ports/set.ts`, replacing the `db/repos` import
- [x] `db/repos/index.ts` — construct `new WorkoutRepository(db)` and `new SetRepository(db, this.workouts)`;
      re-point the type imports at the new locations
- [x] `http/routes.ts` — `setRoutes` now comes from `../features/workouts/set.routes.ts`
- [x] `workout.routes.test.ts:97-103` — the unknown-exercise assertion becomes `400`, and rename the
      test to match what it now checks
- [x] `set.routes.test.ts` — add the coverage `PATCH /api/sets/:id` lacks today. `useServer()`
      offers `createExercise` and `createWorkout` but no set helper, so build the set the way the
      existing test at line 11 does:
      ```ts
      test('rejects a patch naming an exercise that does not exist', async () => {
        const exercise = await createExercise();
        const workout = await createWorkout();
        const set = await body<LiftSetDto>(await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 }));

        expect((await patch(`/api/sets/${set.id}`, { exerciseId: 4242 })).status).toBe(400);
      });
      ```
- [x] Repair the `exercise`→`exercises` find/replace damage in the moved files: the comment in
      `set.repository.ts` ("an unknown exercises is a 404" — now describing the FK behaviour
      instead), `'Insert of workouts returned no row'`, and the `create()` doc comment "Creates a
      workouts" in `workout.repository.ts`

**Automated Verification**:

- [x] `bun test src/backend/features/workouts/` passes, including the changed 404→400 assertion and
      the new `PATCH` case
- [x] `bun test` passes
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass
- [x] `src/backend/features/sets/` no longer exists, and no import references it
- [x] No `read*Body` function remains under `features/workouts/`

### Phase 3: Exercises to the target shape

Dependencies: Phase 2 (the exercises repository takes its SQL fragments and `LiftSet` from the
merged workouts ports).

The first feature migrated is now the one furthest from the rule the other features will follow.
This phase closes its standing TODO.

**Tasks**:

- [x] Create `features/exercises/internal/exercise.mapper.ts` with `fromCreateExercise` and
      `fromEditExercise`, moved verbatim from `ports/exercise.ts:81-101`
- [x] Move `ExerciseInput` from `ports/exercise.ts:30-35` into `internal/exercise.repository.ts`,
      beside the class that takes it, and delete the TODO comment above it — it is now done
- [x] Move `EXERCISE_COLUMNS` from `db/repos/sql.ts` into `internal/exercise.repository.ts` as a
      module-level const; it has no other consumer
- [x] `ports/exercise.ts` — keeps `Exercise`, `ExerciseWithStats`, `SessionPoint` and the four `to*`
      mappers, and nothing else
- [x] `exercise.routes.ts` — import `fromCreateExercise` / `fromEditExercise` from
      `./internal/exercise.mapper.ts`
- [x] `db/repos/index.ts` — take `ExerciseInput` from the feature's `internal/` for as long as the
      facade lives; the other three exercise types stay in `ports/`
- [x] Repair the find/replace damage in this feature and its contract: the two repository doc
      comments ("for one exercises" → "for one exercise", "recorded for an exercises" → "for an
      exercise"), `'Insert of exercises returned no row'` → `'Insert of exercise returned no row'`,
      the three test names in `exercise.routes.test.ts:36,40,49`, and
      `src/shared/dto/exercise.ts:18,31` ("an exercises's progress line", "the exercises detail
      view")

**Automated Verification**:

- [x] `bun test src/backend/features/exercises/` passes
- [x] `bun test` passes
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass
- [x] No module outside `features/exercises/internal/` imports `ExerciseInput`,
      `fromCreateExercise` or `fromEditExercise`, other than `db/repos/index.ts`, which phase 5
      deletes

### Phase 4: Split meta and stats

Dependencies: Phase 1. (Independent of phases 2 and 3; ordered here to keep each phase small.)

**Tasks**:

- [x] Create `features/stats/` and `git mv` into it: `features/meta/stats.routes.ts` →
      `features/stats/stats.routes.ts`, `features/meta/stats.routes.test.ts` →
      `features/stats/stats.routes.test.ts`, `features/meta/ports/stats.ts` →
      `features/stats/ports/stats.ts`; remove the now-empty `features/meta/ports/`
- [x] `git mv src/backend/db/repos/stats.ts src/backend/features/stats/internal/stats.repository.ts`
      and rename `StatsRepo` → `StatsRepository`
- [x] Move the `Summary` row type into `features/stats/ports/stats.ts`, declared flat with the eight
      fields and the doc comments its two halves carry today. `internal/stats.repository.ts` keeps
      `SummaryTotals` and `SummaryRecentActivity` as local query shapes and declares
      `summary(): Summary`, so a drift between the halves and the published row type is a compile
      error rather than a silent mismatch. `ports/stats.ts:1` loses its `db/repos` import: it now
      declares `Summary` itself
- [x] `http/routes.ts` — `statsRoutes` now comes from `../features/stats/stats.routes.ts`
- [x] `db/repos/index.ts` — construct `new StatsRepository(db)` and take `Summary` from
      `features/stats/ports/stats.ts`
- [x] Confirm `features/meta/` is left holding only `meta.routes.ts` and `meta.routes.test.ts`

**Automated Verification**:

- [x] `bun test src/backend/features/stats/ src/backend/features/meta/` passes
- [x] `bun test` passes
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass
- [x] `src/backend/db/repos/` holds only `index.ts` and `sql.ts`

### Phase 5: Dissolve the facade and finish the layout

Dependencies: Phases 2, 3 and 4 (every repository must already live in its feature).

With all four repositories in their features, the facade is deletion plus three composition roots
rather than a rewrite. This phase also moves the last shared modules into place and brings the
documentation in line.

**Tasks**:

- [x] `http/routes.ts` — declare the parameter object and hand each factory what it uses:
      ```ts
      export interface Repositories {
        exercises: ExerciseRepository;
        workouts: WorkoutRepository;
        sets: SetRepository;
        stats: StatsRepository;
      }

      export function allRoutes(repos: Repositories): RouteTable {
        return {
          ...metaRoutes(),
          ...statsRoutes(repos.stats),
          ...exerciseRoutes(repos.exercises),
          ...workoutRoutes(repos.workouts, repos.sets),
          ...setRoutes(repos.sets),
          ...staticRoutes(),
        };
      }
      ```
      Keep the existing comment about spread order and Bun's specificity matching
- [x] Change each route factory's signature and every `repo.xxx()` call inside it:
      `exerciseRoutes(exercises)` → `exercises.list()`, `exercises.require(id)`,
      `exercises.create(…)`, `exercises.update(…)`, `exercises.delete(…)`, `exercises.progress(id)`,
      `exercises.bestSet(id)`; `workoutRoutes(workouts, sets)` → `workouts.list(limit, offset)`,
      `workouts.count()`, `sets.list(id)`, `sets.create(id, …)`; `setRoutes(sets)`;
      `statsRoutes(stats)`
- [x] `http/server.ts` — `serveOptions(repos: Repositories)`, passing `repos` to `allRoutes`
- [x] `src/backend/main.ts` — build the four repositories and pass them:
      ```ts
      const workouts = new WorkoutRepository(db);
      const repositories = {
        exercises: new ExerciseRepository(db),
        workouts,
        sets: new SetRepository(db, workouts),
        stats: new StatsRepository(db),
      };
      const server = Bun.serve({ port, ...serveOptions(repositories) });
      ```
- [x] `src/backend/testing.ts` — the same four in `beforeEach`, replacing `new Repo(db)`
- [x] `src/backend/http/server.test.ts:17` — `serveOptions(new Repo(db))` is the fourth place a
      `Repo` is built; give it the same parameter object. Its comment at line 11 cites
      `src/backend/transpile.ts:22`, a path that has moved twice — re-point it at
      `features/static/internal/transpile.ts`
- [x] `src/scripts/seed.ts` — build the repositories it needs and switch the call sites:
      `repo.countWorkouts()` → `workouts.count()`, `repo.createExercise(…)` →
      `exercises.create(…)`, `repo.createWorkout(…)` → `workouts.create(…)`,
      `repo.createSet(…)` → `sets.create(…)`, `repo.summary()` → `stats.summary()`. Also fix the
      "exercises name" comment at line 18
- [x] Delete `src/backend/db/repos/index.ts`
- [x] `git mv src/backend/db/repos/sql.ts src/backend/db/sql.ts` — by now it holds only
      `buildUpdate`, `UpdateStatement`, `isUniqueViolation` and `isForeignKeyViolation`. Update its
      header comment, which still says "shared by the entity repositories", and re-point the three
      importers. Remove the empty `db/repos/`
- [x] `git mv src/backend/http/routes/shared.ts src/backend/http/routing.ts`; move `MAX_NAME` and
      `MAX_NOTES` to `src/backend/shared/validate.ts`; re-point all eight importing modules
      (`http/routes.ts`, the five route modules, `static.routes.ts` and every translator); remove
      the empty `http/routes/`
- [x] Move the static feature's private modules into `internal/`: `paths.ts`, `paths.test.ts`,
      `transpile.ts`, `transpile.test.ts`. `REPO_ROOT` goes one level deeper again —
      `new URL('../../../../..', import.meta.url)` — and `paths.test.ts` is what catches it if the
      count is wrong. `transpile.test.ts`'s fixture path goes one level deeper too, to
      `resolve(import.meta.dir, '..', '..', '..', '..', 'frontend', '__broken.ts')`
- [x] `static.routes.test.ts:80` — the escape-attempt URL names `backend/transpile.ts`, which no
      longer exists at that path. The assertion holds either way (the escape is refused before any
      file lookup), but point it at a file that is really there, as line 79 does
- [x] `docs/backend.md` — rewrite the opening layering paragraph and the `db/repos/index.ts` facade
      paragraph for the feature-first structure: `db/` is the connection, the migrations and the
      shared SQL helpers; each feature owns its repository behind `internal/`, publishes rows and
      `to*` mappers through `ports/`, and is wired in the three composition roots. State the
      ports/internal rule, keep the "a route returns a DTO, never a row" paragraph, keep the
      URL-prefix rule (the merge makes it true without an exception), and update the paragraph at
      lines 26-30 — `testing.ts` still sits at the top of `src/backend/`, but `paths.ts` and
      `transpile.ts` are now inside the static feature. Add the new 400-on-dangling-`exerciseId`
      behaviour beside the three-status paragraph
- [x] `AGENTS.md` — update the architecture block (line 31 `db/` → `http/` → `main.ts`; line 34
      already names `features/static`) and the sentence at lines 41-42 pointing at
      `src/backend/http/routes/`. Fix the stale test path at line 14 to
      `src/backend/features/workouts/workout.routes.test.ts`
- [x] `docs/frontend.md` — line 36 still says the backend translates rows in
      `src/backend/http/dto/`; lines 46 and 90 carry a stray leading `../` from the find/replace and
      should name `src/backend/features/static/internal/`
- [x] `src/shared/dto/index.ts` — the header comment names `src/backend/paths.ts` (line 5) and
      `src/backend/http/dto/` (line 10); both have moved
- [x] `TODO.md` — remove the two entries this plan completes: "readWorkoutBody and readSetBody
      should be part of an explicit mapping layer" and "Validation should not be part of mapping"

**Automated Verification**:

- [x] `bun test` passes
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass
- [x] `bun run seed` against a throwaway `GAINZ_DB` fills an empty database and prints its summary
      line; running it a second time reports "Database already contains workouts"
- [x] `src/backend/db/` contains only `db.ts`, `migrations.ts`, `migrations/` and `sql.ts`
- [x] A repository-wide search finds no `db/repos`, no `http/dto`, no `http/routes/` and no `Repo`
      class
- [x] A repository-wide search finds no import matching `features/*/internal/` from outside that
      same feature
- [x] `grep -r "ExerciseRepo\b\|WorkoutRepo\b\|SetRepo\b\|StatsRepo\b" src/` returns nothing — every
      repository carries the full `Repository` suffix

**Manual Verification**:

- [x] `bun start`, then open the app: the dashboard loads, the exercise list and a workout detail
      view render, and adding a set to a workout works. This is the phase where the static feature's
      `REPO_ROOT` moves a second time, and a wrong level count serves a 404 for every asset

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-12-features-exercises-layout.md` — how `features/exercises` is
  built, the `translateTo<Dto>` convention, and what the move into `internal/` changed
- `docs/agents/plans/2026-09-11-shared-dto-translation-layer.md` — decision 5, the per-entity split
  the `ports/` files inherited, and the `to*` / `from*` mapper style
- `docs/agents/plans/2026-09-10-split-routes-into-per-entity-files.md:52-53` — the `.routes.ts`
  suffix convention and the URL-prefix ownership rule
- `docs/backend.md:18-24` — a route returns a DTO, never a row
- `docs/backend.md:60-65` — why `sets` has one cascading and one restricting foreign key
- `src/backend/db/migrations/001-initial-schema.sql:28-37` — the `sets` table and its two foreign
  keys
