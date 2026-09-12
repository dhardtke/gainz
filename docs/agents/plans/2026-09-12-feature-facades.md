---
date: 2026-09-12T19:17:26+00:00
git_commit: 89659b29769e8947b0080a386e0aea89eb29e4f8
branch: main
topic: 'Route handlers reach the database through a per-feature facade'
tags: [plan, backend, features, facades, repositories, routes, refactor, oxlint]
status: ready
---

# PLAN: Every feature has a front door

Today a route handler closes over a repository. Every route file imports its repository straight
out of its own `internal/` (`workout.routes.ts:2-3`, `set.routes.ts:2`, `exercise.routes.ts:2`,
`stats.routes.ts:2`), and `http/routes.ts:1-11` names all four repository classes from four
different `features/*/internal/` directories. Four composition roots — `main.ts`, `testing.ts`,
`src/scripts/seed.ts`, `http/server.test.ts` — repeat the same construction block.

This plan puts a facade in front of each repository. Each data-owning feature gains one module at
its root, beside its routes: `exercises/exercises.facade.ts`, `workouts/workouts.facade.ts`,
`stats/stats.facade.ts`. Those modules become the only place any repository is constructed, and the
only place outside a feature's own `internal/` where one is named at all.
`features/facades.ts` assembles them into a `Facades` object, which replaces `Repositories` as what
`allRoutes()` and `serveOptions()` take, and an oxlint rule makes the boundary a check rather than a
convention.

Built on `docs/agents/research/2026-09-12-repositories-and-route-handlers.md`.

## Acceptance Criteria

- No `*.routes.ts` under `src/backend/features/` imports a `*.repository.ts`, and `bun run lint`
  fails if one does — type imports included.
- Each data-owning feature publishes exactly one facade module at its root:
  `features/exercises/exercises.facade.ts`, `features/workouts/workouts.facade.ts`,
  `features/stats/stats.facade.ts`. `meta` and `static` own no data and gain nothing.
- Four facade classes — `ExerciseFacade`, `WorkoutFacade`, `SetFacade`, `StatsFacade` — each
  delegating to one repository and publishing only what its callers use. None exposes `get()`.
- `src/backend/features/facades.ts` declares `Facades` and `createFacades(db)`, and is the only
  module that assembles the four.
- `allRoutes(facades)` and `serveOptions(facades)` take `Facades`; the `Repositories` interface is
  deleted and the name appears nowhere under `src/`.
- `main.ts`, `testing.ts`, `http/server.test.ts` and `src/scripts/seed.ts` each call
  `createFacades(db)` and construct no repository.
- No repository is named outside the feature that owns it, and the only module outside a feature's
  `internal/` that names one is that feature's facade. Inside a feature nothing changes: the
  `from*` mappers keep importing their `<Entity>Input`, and `SetRepository` keeps taking its
  sibling through its constructor.
- Behaviour is unchanged. Same URLs, same status codes, same bodies, and no assertion anywhere is
  edited: the only lines touched inside a test module are the ones that build the server, in
  `testing.ts` and `http/server.test.ts`.
- `docs/backend.md` and `AGENTS.md` describe the facade, and the paragraph at `docs/backend.md:49`
  opening "There is no facade over the repositories" is gone.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass.

## Technical Key Decisions and Tradeoffs

1. **Rows cross the facade boundary, not DTOs.** A facade returns `Workout`, `LiftSet`, `Exercise`,
   `Summary` — the `ports/` types the repositories already return.
   - Why: `docs/backend.md:25` makes "a route returns a DTO, never a row" a compile-time rule,
     because a snake_case row is not structurally assignable to its camelCase DTO. Moving the `to*`
     mappers behind the facade would hand that rule back to convention.
   - Impact: handler bodies do not change at all. `json(toWorkoutWithSets(workouts.require(id),
     sets.list(id)))` is the same line before and after; only each route factory's parameter type
     and its import line change.

2. **Four facades mirroring the four repositories**, named `<Entity>Facade` beside
   `<Entity>Repository`, keeping the short verbs `list` / `require` / `create` / `update` /
   `delete`.
   - Why: the workouts feature owns two entities whose repositories share six method names. One
     facade per feature would mean either an eleven-method object with `listWorkouts` / `listSets`
     renaming, or grouped sub-objects that read like the repositories they hide.
   - Impact: `Facades` keeps today's four keys — `exercises`, `workouts`, `sets`, `stats` — so
     `allRoutes` changes in no way beyond the types.

3. **The facade sits at the feature root, beside the routes**, as `<feature>.facade.ts` — named
   after the feature the way `*.routes.ts` is named after its URL group.
   - Why: `ports/` is documented as the row types and `to*` mappers other features may read. The
     facade is not one more published type; it is the feature's front door.
   - Impact: `ports/` and `internal/` keep exactly what they hold today. The facade module is the
     one file in a feature that imports `internal/` as a *value* rather than a type.

4. **Each feature owns a factory; `features/facades.ts` composes them.** `createWorkoutFacades(db)`
   builds both repositories of its feature and returns both facades.
   - Why: `SetRepository` takes a `WorkoutRepository` through its constructor
     (`set.repository.ts:19-27`). Building them anywhere else means that caller naming two
     `internal/` modules. With a per-feature factory, nothing outside a feature names its
     `internal/` again.
   - Impact: the four duplicated composition blocks collapse into `createFacades(db)`. The comment
     at `set.repository.ts:19-23` — "keeps the composition roots the one place that decides which
     workout repository a set repository reads" — is no longer true as written: the factory is now
     that one place, and the comment moves there.

5. **The boundary is enforced by oxlint**, through an `overrides` entry restricting
   `**/*.repository.ts` imports in `src/backend/features/**/*.routes.ts`.
   - Why: measured on the installed oxlint 1.82.0 against this working tree, the rule flags exactly
     the five repository imports the route files carry today and leaves their `internal/` mapper and
     translator imports alone. `allowTypeImports` defaults to false, so `import type
     { WorkoutRepository }` is caught too — which is the form every route file actually uses, and
     the form a convention-only rule would never catch.
   - Impact: the first `overrides` block in `.oxlintrc.json`. It merges with the existing
     type-aware ruleset rather than replacing it (verified by running the merged config over
     `src/`: the same five errors, nothing else).

6. **`src/scripts/seed.ts` goes through the facades too.**
   - Why: every call it makes — `exercises.create`, `workouts.count`, `workouts.create`,
     `sets.create`, `stats.summary` — is already on the facade surface. Leaving it on the
     repositories would keep one module outside the features naming their `internal/`, and would
     mean a repository has two callers rather than one.
   - Impact: `seed.ts` loses four imports and gains one. Its `db.transaction(...)` wrapper is
     untouched: the facade delegates, so `WorkoutRepository.create`'s own transaction still nests as
     a savepoint.

7. **The facades are deliberately thin, and that is the whole point.** With rows crossing the
   boundary they are delegation and nothing else.
   - Why: what they buy is a narrower published surface (no `get()`, which only `require()` ever
     called), a single place where a repository is constructed, and a rule a linter can check — not
     new logic. Putting logic in them now would be inventing a layer the app has no use for.
   - Impact: `GET /api/workouts/:id` still composes two calls in the handler, as
     `docs/backend.md` and the research both describe. If a later feature wants that composition
     pushed down, the facade is where it will go; this plan does not pre-build the room.

## Current State

```
main.ts ┐   testing.ts ┐   seed.ts ┐   server.test.ts ┐
        └──────────────┴───────────┴──────────────────┘
              each builds the same four repositories by hand:
                const workouts = new WorkoutRepository(db);
                { exercises: new ExerciseRepository(db),
                  workouts,
                  sets:      new SetRepository(db, workouts),
                  stats:     new StatsRepository(db) }
                (seed.ts builds the same four as four separate consts,
                 since it has no server to hand a parameter object to)
                              │
                              ▼
              Repositories  (http/routes.ts:18-23, importing four internal/ modules)
                              │
                    serveOptions(repos) → allRoutes(repos)
        ┌──────────────┬──────────────┴─────────┬──────────────┐
        ▼              ▼                        ▼              ▼
 exerciseRoutes(  workoutRoutes(          setRoutes(     statsRoutes(
   exercises)       workouts, sets)         sets)          stats)
        └────────── handlers close over the repository classes ─────────┘
```

Who names a repository today, and how:

| Module | Names | As |
| --- | --- | --- |
| `http/routes.ts:1,5,8,11` | all four | `import type` |
| `features/*/*.routes.ts` | its own (5 imports across 4 files) | `import type` |
| `main.ts:3-6` | all four | value |
| `testing.ts:13-16` | all four | value |
| `http/server.test.ts:4-7` | all four | value |
| `src/scripts/seed.ts:7-10` | all four | value |

`bun run lint` with the proposed override, run against this tree, reports exactly:

```
features/stats/stats.routes.ts:2:1      './internal/stats.repository.ts' … restricted
features/exercises/exercise.routes.ts:2:1 './internal/exercise.repository.ts' … restricted
features/workouts/set.routes.ts:2:1     './internal/set.repository.ts' … restricted
features/workouts/workout.routes.ts:2:1 './internal/workout.repository.ts' … restricted
features/workouts/workout.routes.ts:3:1 './internal/set.repository.ts' … restricted
```

Those five lines are the work list, and their disappearance is the proof the refactor landed.

## Desired End State

```
                     main.ts / testing.ts / server.test.ts / seed.ts
                                    │  createFacades(db)
                                    ▼
                       features/facades.ts     Facades { exercises, workouts, sets, stats }
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
     createExerciseFacade  createWorkoutFacades  createStatsFacade
          (db)                  (db)                  (db)
            │                     │                     │
            ▼                     ▼                     ▼
     ExerciseFacade      WorkoutFacade + SetFacade    StatsFacade
            │                     │                     │
            ▼                     ▼                     ▼
  ExerciseRepository   WorkoutRepository ◄── SetRepository   StatsRepository
   (internal/)            (internal/)         (internal/)     (internal/)

  ── each repository is constructed by its feature's factory and named nowhere outside it ──
```

```
src/backend/features/
├── facades.ts                    Facades + createFacades(db)
├── exercises/
│   ├── exercise.routes.ts        exerciseRoutes(exercises: ExerciseFacade)
│   ├── exercises.facade.ts       ExerciseFacade, createExerciseFacade   ← new
│   ├── ports/exercise.ts         unchanged
│   └── internal/                 unchanged
├── workouts/
│   ├── workout.routes.ts         workoutRoutes(workouts: WorkoutFacade, sets: SetFacade)
│   ├── set.routes.ts             setRoutes(sets: SetFacade)
│   ├── workouts.facade.ts        WorkoutFacade, SetFacade,
│   │                             createWorkoutFacades                   ← new
│   ├── ports/                    unchanged
│   └── internal/                 unchanged
├── stats/
│   ├── stats.routes.ts           statsRoutes(stats: StatsFacade)
│   ├── stats.facade.ts           StatsFacade, createStatsFacade         ← new
│   ├── ports/stats.ts            unchanged
│   └── internal/                 unchanged
├── meta/                         no data, no facade
└── static/                       no data, no facade
```

The request path is unchanged end to end; only the box the handler calls is renamed:

```
  body ──translateTo<X>Dto──► <X>Dto ──from<X>──► <Entity>Input ──facade──► repository ──► row
                                                                                            │
  response ◄──json()── <X>Dto ◄──to<Shape>───────────────────────────────────────────────────┘
```

The published surface of each facade, which is narrower than the repository behind it — every
method below has a caller today, and `get()` has none outside its own `require()`:

```ts
ExerciseFacade   list(): ExerciseWithStats[]
                 require(id): Exercise
                 create(input): Exercise
                 update(id, patch): Exercise
                 delete(id): void
                 progress(id): SessionPoint[]
                 bestSet(id): (LiftSet & { performed_on: string }) | null

WorkoutFacade    list(limit, offset): WorkoutWithStats[]
                 count(): number
                 require(id): Workout
                 create(input, options): Workout
                 update(id, patch): Workout
                 delete(id): void

SetFacade        list(workoutId): LiftSet[]
                 require(id): LiftSet
                 create(workoutId, input): LiftSet
                 update(id, patch): LiftSet
                 delete(id): void

StatsFacade      summary(): Summary
```

## Abstractions and Code Reuse

Reused unchanged — this refactor adds no behaviour, so nothing below is touched:

- Every handler body, every translator, every `from*` and `to*` mapper, and all four repositories —
  the only edit to a repository is the constructor comment in `set.repository.ts`.
- `guard` / `guardAll`, `RouteTable`, `ParamRequest`, `Handler` — the error-to-JSON boundary.
- `useServer()` in `testing.ts` keeps its shape; only the lines that build the server change. No
  route test is touched, and the one `*.test.ts` file edited is `http/server.test.ts`, which builds
  a server of its own.
- The `ports/` row types are what the facades publish, so they gain a caller and lose nothing.

New abstractions, two kinds:

- `<Entity>Facade` — a class holding one repository as a parameter property and delegating. It is
  the feature's published surface and the only thing a route may hold.
- `createFacades(db)` in `features/facades.ts`, over three per-feature factories. `Facades` is a
  parameter object with four fields and no methods, exactly as `Repositories` was.

Files, grouped by what happens to them:

- `src/backend/features/`
  - `facades.ts` - new. `Facades` interface, `createFacades(db)`
  - `exercises/exercises.facade.ts` - new. `ExerciseFacade`, `createExerciseFacade`
  - `exercises/exercise.routes.ts` - takes `ExerciseFacade`; handler bodies unchanged
  - `workouts/workouts.facade.ts` - new. `WorkoutFacade`, `SetFacade`, `createWorkoutFacades`
  - `workouts/workout.routes.ts` - takes `WorkoutFacade` and `SetFacade`
  - `workouts/set.routes.ts` - takes `SetFacade`
  - `workouts/internal/set.repository.ts` - constructor comment re-pointed at the factory
  - `stats/stats.facade.ts` - new. `StatsFacade`, `createStatsFacade`
  - `stats/stats.routes.ts` - takes `StatsFacade`
- `src/backend/http/`
  - `routes.ts` - `Repositories` deleted with its four `import type` lines; `allRoutes(facades: Facades)`
  - `server.ts` - `serveOptions(facades: Facades)`
- `src/backend/main.ts`, `src/backend/testing.ts`, `src/backend/http/server.test.ts`,
  `src/scripts/seed.ts` - four repository imports each become one `createFacades` import
- `.oxlintrc.json` - first `overrides` block
- `docs/backend.md`, `AGENTS.md` - the facade paragraph and the architecture summary

## Logging & Observability

No logging changes. The only console output in the server is `main.ts`'s two startup lines and the
per-migration notice, and neither is affected; `seed.ts` keeps its "already contains workouts" and
summary lines verbatim. Error reporting keeps its shape — repositories throw `HttpError`, the
facades do not catch, `guardAll` renders it, and `serveOptions`'s `error` hook catches the rest as a
500.

## Implementation

Dependencies: None.

One phase. The compiler finds every call site, so there is no transitional half-state to keep green.
The lint rule goes in first, so its five errors on the current tree are the work list, and the last
task is watching them go.

**Tasks**:

- [ ] `.oxlintrc.json` — add the `overrides` block after `rules`. Confirm it reports the five errors
      listed under Current State before changing any source:
      ```json
      "overrides": [
        {
          "files": ["src/backend/features/**/*.routes.ts"],
          "rules": {
            "no-restricted-imports": [
              "error",
              {
                "patterns": [
                  {
                    "group": ["**/*.repository.ts"],
                    "message": "Route handlers reach the database through their feature's facade."
                  }
                ]
              }
            ]
          }
        }
      ]
      ```
- [ ] Create `src/backend/features/exercises/exercises.facade.ts`:
      ```ts
      import type { DB } from '../../db/db.ts';
      import { ExerciseRepository, type ExerciseInput } from './internal/exercise.repository.ts';
      import type { Exercise, ExerciseWithStats, SessionPoint } from './ports/exercise.ts';
      import type { LiftSet } from '../workouts/ports/set.ts';

      /**
       * The exercises feature's front door. Routes hold this rather than the repository, so the
       * SQL, the ExerciseInput shape and the nullable get() stay inside the feature.
       */
      export class ExerciseFacade {
        constructor(private readonly exercises: ExerciseRepository) {}

        list(): ExerciseWithStats[] {
          return this.exercises.list();
        }
        require(id: number): Exercise {
          return this.exercises.require(id);
        }
        // create / update / delete / progress / bestSet delegate the same way
      }

      export function createExerciseFacade(db: DB): ExerciseFacade {
        return new ExerciseFacade(new ExerciseRepository(db));
      }
      ```
      `bestSet` returns `(LiftSet & { performed_on: string }) | null`, which is why `LiftSet` comes
      from the workouts ports — the same cross-feature arrow `ports/exercise.ts:2` already draws
- [ ] Create `src/backend/features/workouts/workouts.facade.ts` with `WorkoutFacade`, `SetFacade`
      and the factory that builds both. The factory is where the repository-into-repository wiring
      now lives:
      ```ts
      /**
       * Both repositories are built here because both belong to this feature: SetRepository reads
       * workouts through the WorkoutRepository it is given, and this factory is the one place that
       * decides which one that is.
       */
      export function createWorkoutFacades(db: DB): { workouts: WorkoutFacade; sets: SetFacade } {
        const workouts = new WorkoutRepository(db);
        return {
          workouts: new WorkoutFacade(workouts),
          sets: new SetFacade(new SetRepository(db, workouts)),
        };
      }
      ```
      `WorkoutFacade.create` mirrors the repository's optional second argument:
      `create(input: WorkoutInput, options: { copyFrom?: number } = {}): Workout`
- [ ] `src/backend/features/workouts/internal/set.repository.ts:19-23` — rewrite the constructor
      comment: the composition roots no longer decide which workout repository a set repository
      reads, `createWorkoutFacades` does. Keep the `import type` (still no runtime cycle)
- [ ] Create `src/backend/features/stats/stats.facade.ts` — `StatsFacade` with the single
      `summary(): Summary`, and `createStatsFacade(db)`
- [ ] Create `src/backend/features/facades.ts`:
      ```ts
      import type { DB } from '../db/db.ts';
      import { createExerciseFacade, type ExerciseFacade } from './exercises/exercises.facade.ts';
      import { createStatsFacade, type StatsFacade } from './stats/stats.facade.ts';
      import { createWorkoutFacades, type SetFacade, type WorkoutFacade } from './workouts/workouts.facade.ts';

      /**
       * Everything the route table needs to reach the database. A parameter object rather than a
       * class: it holds the four facades and knows nothing itself, so each route factory can be
       * handed only the ones it uses. Built once per process — one server, one test file, one
       * seeder run.
       */
      export interface Facades {
        exercises: ExerciseFacade;
        workouts: WorkoutFacade;
        sets: SetFacade;
        stats: StatsFacade;
      }

      export function createFacades(db: DB): Facades {
        return {
          exercises: createExerciseFacade(db),
          ...createWorkoutFacades(db),
          stats: createStatsFacade(db),
        };
      }
      ```
- [ ] `features/exercises/exercise.routes.ts:2` and `:10` — import `ExerciseFacade` from
      `./exercises.facade.ts` and change the signature to `exerciseRoutes(exercises: ExerciseFacade)`.
      No handler body changes
- [ ] `features/stats/stats.routes.ts:2` and `:7` — the same for `StatsFacade`
- [ ] `features/workouts/workout.routes.ts:2-3` and `:14` — replace both repository imports with one
      `import type { SetFacade, WorkoutFacade } from './workouts.facade.ts';` and change the
      signature to `workoutRoutes(workouts: WorkoutFacade, sets: SetFacade)`. No handler body
      changes — `workouts.require(id)`, `sets.list(id)`, `workouts.create(…, { copyFrom })` all read
      identically against the facade
- [ ] `features/workouts/set.routes.ts:2` and `:10` — the same for `SetFacade`, imported from
      `./workouts.facade.ts`
- [ ] `http/routes.ts` — delete the `Repositories` interface and the four repository `import type`
      lines; take `Facades` from `../features/facades.ts`. Keep the comment above `allRoutes` about
      spread order and Bun's specificity matching:
      ```ts
      export function allRoutes(facades: Facades): RouteTable {
        return {
          ...metaRoutes(),
          ...statsRoutes(facades.stats),
          ...exerciseRoutes(facades.exercises),
          ...workoutRoutes(facades.workouts, facades.sets),
          ...setRoutes(facades.sets),
          ...staticRoutes(),
        };
      }
      ```
- [ ] `http/server.ts` — `serveOptions(facades: Facades)`, importing `Facades` from
      `../features/facades.ts` and passing it to `allRoutes`. Its doc comment still reads "shared by
      the CLI entry point and the test suite", which stays true
- [ ] `src/backend/main.ts:3-6,13-22` — drop the four repository imports for
      `import { createFacades } from './features/facades.ts';`, and build the server with
      `Bun.serve({ port, ...serveOptions(createFacades(db)) })`
- [ ] `src/backend/testing.ts:13-16,41-54` — the same in `beforeEach`:
      ```ts
      db = openDatabase(':memory:');
      server = Bun.serve({ port: 0, ...serveOptions(createFacades(db)) });
      base = server.url.origin;
      ```
      This is the only edit to a `*.test*` module, and it changes no test
- [ ] `src/backend/http/server.test.ts:4-7,20-26` — `const { error } = serveOptions(createFacades(db));`.
      Leave the comment above the test alone: what it describes about the unguarded static route is
      unaffected
- [ ] `src/scripts/seed.ts:7-10,52-57` — one import, one destructuring:
      `const { exercises, workouts, sets, stats } = createFacades(db);`. Every call site
      (`workouts.count()`, `exercises.create(…)`, `workouts.create(…)`, `sets.create(…)`,
      `stats.summary()`) is unchanged. Re-point the comment at lines 65-67 from
      "WorkoutRepository.create opens a transaction of its own" to name what the seeder now calls,
      `workouts.create()`; the nesting-as-a-savepoint sentence stays true
- [ ] `docs/backend.md` — three edits:
      - line 10-11: `main.ts` is "the entry point that builds the repositories and starts the
        server" → builds the facades
      - lines 13-19: the `ports/`-is-public / `internal/`-is-private paragraph gains the third
        place a feature keeps code — the feature root, holding its routes and its facade
      - lines 49-59: replace the paragraph opening "There is no facade over the repositories" with
        what is now true. Each feature publishes one facade module at its root; a repository is
        named only by its own feature's facade and constructed only by its factory; `createFacades`
        in `features/facades.ts` is the single composition root, called by `main.ts`, `testing.ts`,
        `seed.ts` and `http/server.test.ts`; a facade publishes rows, so the DTO rule above it is
        unchanged; and the oxlint override is what keeps a route from reaching past it. Keep the
        surrounding sentences about `db/sql.ts` and `import type` between repositories
      - line 94: `serveOptions(repos)` → `serveOptions(facades)`
- [ ] `AGENTS.md` — the architecture paragraph (`features/<feature>/` owns its routes, its SQL and
      its mapping …) gains the facade at the feature root and `features/facades.ts` as what
      `allRoutes` is given. `CLAUDE.md` is a symbolic link to this file, so it needs no separate
      edit
- [ ] `bun run fmt`

**Automated Verification**:

- [ ] `bun run lint` passes — in particular the five `no-restricted-imports` errors listed under
      Current State are all gone, which is the rule confirming the refactor rather than the rule
      being satisfied vacuously
- [ ] `bun run typecheck` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test` passes, and `git diff -- '*.test.ts'` shows one file, `http/server.test.ts`, whose
      diff is its imports and the argument to `serveOptions` — no assertion anywhere changed
- [ ] `grep -rln "\.repository\.ts'" src/` lists exactly these seven, every one of them inside the
      feature that owns the repository, and the only three outside `internal/` are the facades:
      ```
      features/exercises/exercises.facade.ts
      features/exercises/internal/exercise.mapper.ts      (ExerciseInput)
      features/stats/stats.facade.ts
      features/workouts/workouts.facade.ts
      features/workouts/internal/set.mapper.ts            (SetInput)
      features/workouts/internal/set.repository.ts        (its sibling, by constructor)
      features/workouts/internal/workout.mapper.ts        (WorkoutInput)
      ```
      The nine to disappear from today's list are `http/routes.ts`, `main.ts`, `testing.ts`,
      `http/server.test.ts`, `src/scripts/seed.ts` and the four `*.routes.ts` files
- [ ] `grep -rn "Repositories" src/` returns nothing
- [ ] `grep -rln "features/.*/internal/" src/backend/http src/scripts src/backend/main.ts src/backend/testing.ts`
      returns nothing — no module outside a feature names another feature's internals
- [ ] `bun run seed` against a throwaway `GAINZ_DB` fills an empty database and prints its summary
      line; a second run reports "Database already contains workouts"

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-12-repositories-and-route-handlers.md` — how a repository reaches a
  handler today, what each side does, and the four types that cross the boundary
- `docs/agents/plans/2026-09-12-migrate-remaining-features.md` — decision 1, which dissolved the
  single 22-method `Repo` facade over all four tables. This plan is its opposite in shape: a facade
  per feature, owned by the feature, rather than one object every route depended on wholesale
- `docs/backend.md:13-19` — `ports/` is public, `internal/` is private
- `docs/backend.md:25-31` — a route returns a DTO, never a row
- `docs/backend.md:49-59` — the paragraph this plan rewrites
- `src/backend/features/workouts/internal/set.repository.ts:19-27` — the repository-into-repository
  constructor and the comment that moves to `createWorkoutFacades`
- oxlint 1.82.0 `configuration_schema.json` — `overrides[].files` and the
  `no-restricted-imports` `patterns` shape, including the `allowTypeImports` default
