---
date: 2026-09-15T21:14:35.155023+00:00
git_commit: 12ff0e728264f6a662784e36ce95167fcf84e0ff
branch: main
topic: 'Build facades in their route files and remove facades.ts'
tags: [plan, backend, facades, routes, seed]
status: complete
---

# PLAN: Build facades in their route files and remove facades.ts

Move facade construction out of the backend's single composition root, `features/facades.ts`, and
into the route files that use the facades. Each data route factory takes the database and calls
its own feature's factory. `allRoutes` passes `db` through, and the seeder calls the per-feature
factories itself. After that `facades.ts`, `Facades` and `createFacades` have no callers and are
deleted.

## Acceptance Criteria

- `src/backend/features/facades.ts` no longer exists, and nothing in `src/` or `docs/` (outside
  `docs/agents/`) names `Facades`, `createFacades` or `features/facades.ts`.
- `statsRoutes(db)`, `exerciseRoutes(db)`, `workoutRoutes(db)` and `setRoutes(db)` each take
  `db: DB` and build their controller from facades they construct themselves.
- `allRoutes(db: DB)` passes `db` to those four factories, and `startServer` calls `allRoutes(db)`.
- `src/scripts/seed.ts` builds its facades with `createExerciseFacade`, `createWorkoutFacades` and
  `createStatsFacade`, and otherwise behaves exactly as before.
- `docs/backend.md` describes construction in the route files instead of a composition root.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test` pass.

## Technical Key Decisions and Tradeoffs

1. **Route factory argument:** `db: DB`, not facades.
   - Why: construction then lives in the route file that uses the facades, rather than in
     `routes.ts`.
   - Impact: `workoutRoutes` and `setRoutes` each call `createWorkoutFacades(db)`, so a server
     builds two `WorkoutRepository`/`SetRepository` pairs. This is harmless because the
     repositories hold nothing but `#db` (and `SetRepository` its `#workouts`), with no caches or
     other state.
2. **Seeder wiring:** call the three feature factories directly.
   - Why: `workouts.facade.test.ts` already builds its facades this way, and seeded data still
     passes through facade validation.
   - Impact: `seed.ts` imports from three facade modules instead of `facades.ts`.
3. **Single phase:** the signature change, rewiring, deletion and docs land together.
   - Why: changing a route factory's signature breaks `routes.ts` until it is rewired, so smaller
     slices would not compile.

## Current State

```
main.ts / testing.ts                         src/scripts/seed.ts
      │ startServer(db, port)                        │
      ▼                                              ▼
http/server.ts ── createFacades(db) ──►  features/facades.ts  ◄── createFacades(db)
      │                                    │  Facades { exercises, workouts, sets, stats }
      ▼                                    ├─ createExerciseFacade(db)
http/routes.ts  allRoutes(facades)         ├─ createWorkoutFacades(db) → { workouts, sets }
      ├─ statsRoutes(facades.stats)        └─ createStatsFacade(db)
      ├─ exerciseRoutes(facades.exercises)
      ├─ workoutRoutes(facades.workouts, facades.sets)
      └─ setRoutes(facades.sets)
            └─ new <X>Controller(facades…)
```

- `src/backend/features/facades.ts:22`: `createFacades(db)` is the only production caller of
  the feature factories.
- `src/backend/http/server.ts:10`: `routes: allRoutes(createFacades(db))`.
- `src/backend/http/routes.ts:20`: `allRoutes(facades: Facades)`.
- `src/scripts/seed.ts:52`: `const { exercises, workouts, sets, stats } = createFacades(db);`.
- The `*.routes.ts` lint override (`.oxlintrc.json:131`) does not restrict `*.facade.ts` or
  `db/db.ts`, so route files may already import both.

## Desired End State

```
http/server.ts ── allRoutes(db)
      ▼
http/routes.ts  allRoutes(db)
      ├─ statsRoutes(db)     ── createStatsFacade(db)    → new StatsController(stats)
      ├─ exerciseRoutes(db)  ── createExerciseFacade(db) → new ExerciseController(exercises)
      ├─ workoutRoutes(db)   ── createWorkoutFacades(db) → new WorkoutController(workouts, sets)
      └─ setRoutes(db)       ── createWorkoutFacades(db) → new SetController(sets)

src/scripts/seed.ts ── createExerciseFacade(db), createWorkoutFacades(db), createStatsFacade(db)
```

```ts
// workout.routes.ts
import type { DB } from '../../db/db.ts';
import type { RouteTable } from '../../http/routing.ts';
import { WorkoutController } from './internal/workout.controller.ts';
import { createWorkoutFacades } from './workouts.facade.ts';

export function workoutRoutes(db: DB): RouteTable {
  const { workouts, sets } = createWorkoutFacades(db);
  const controller = new WorkoutController(workouts, sets);
  return { … unchanged … };
}

// set.routes.ts
export function setRoutes(db: DB): RouteTable {
  const controller = new SetController(createWorkoutFacades(db).sets);
  …
}

// routes.ts
export function allRoutes(db: DB): RouteTable {
  return {
    ...metaRoutes(),
    ...statsRoutes(db),
    ...exerciseRoutes(db),
    ...workoutRoutes(db),
    ...setRoutes(db),
    ...staticRoutes(),
  };
}

// seed.ts
const exercises = createExerciseFacade(db);
const { workouts, sets } = createWorkoutFacades(db);
const stats = createStatsFacade(db);
```

## Abstractions and Code Reuse

No new abstractions. The existing per-feature factories get new callers, and the aggregate over
them is deleted.

- `src/backend/features/`
  - `facades.ts` - deleted (`Facades`, `createFacades`)
  - `stats/stats.routes.ts` - `statsRoutes(db)` calls `createStatsFacade`
  - `exercises/exercise.routes.ts` - `exerciseRoutes(db)` calls `createExerciseFacade`
  - `workouts/workout.routes.ts` - `workoutRoutes(db)` calls `createWorkoutFacades`
  - `workouts/set.routes.ts` - `setRoutes(db)` calls `createWorkoutFacades`
- `src/backend/http/routes.ts` - `allRoutes(db: DB)`
- `src/backend/http/server.ts` - `allRoutes(db)`, drops the `createFacades` import
- `src/scripts/seed.ts` - three factory calls replace `createFacades`
- `docs/backend.md` - rewrite the composition-root paragraph

The facade modules and their factories are unchanged. The doc comment on `SetRepository`'s
constructor (`set.repository.ts:26-31`) names `createWorkoutFacades` as the one place that wires
the pair, and that stays true.

## Logging & Observability

None.

## Implementation

Dependencies: None.

Move construction into the route files, rewire the callers, delete `facades.ts` and update the
backend docs.

**Tasks**:

- [x] `src/backend/features/stats/stats.routes.ts`: take `db: DB` (`import type` from
      `../../db/db.ts`), and replace the `StatsFacade` type import with `createStatsFacade`. Build
      the controller from `createStatsFacade(db)`.
- [x] `src/backend/features/exercises/exercise.routes.ts`: the same with `createExerciseFacade`.
- [x] `src/backend/features/workouts/workout.routes.ts`: take `db: DB` (`import type` from
      `../../db/db.ts`), replace the `SetFacade, WorkoutFacade` type import with
      `createWorkoutFacades`, destructure `{ workouts, sets }` from `createWorkoutFacades(db)`, and
      pass both to `WorkoutController`.
- [x] `src/backend/features/workouts/set.routes.ts`: take `db: DB` (`import type` from
      `../../db/db.ts`), replace the `SetFacade` type import with `createWorkoutFacades`, and pass
      `createWorkoutFacades(db).sets` to `SetController`.
- [x] `src/backend/http/routes.ts`: `allRoutes(db: DB)` passes `db` to the four data route
      factories. Replace the `Facades` import with `import type { DB } from '../db/db.ts'`, and
      leave the doc comment unchanged.
- [x] `src/backend/http/server.ts`: `routes: allRoutes(db)`, and remove the `createFacades` import.
- [x] `src/scripts/seed.ts`: replace the `createFacades` import and call with
      `createExerciseFacade`, `createWorkoutFacades` and `createStatsFacade` imported from their
      facade modules under `../backend/features/`, binding `exercises`, `{ workouts, sets }` and
      `stats`.
- [x] Delete `src/backend/features/facades.ts`.
- [x] `docs/backend.md:108-113`: replace the composition-root text (from "`features/facades.ts` is
      the single composition root" through "each factory builds its own controller from them.")
      with prose along these lines: "There is no composition root. Each route factory takes the
      database and builds what it uses: `workoutRoutes(db)` and `setRoutes(db)` each call
      `createWorkoutFacades(db)`, `exerciseRoutes(db)` calls `createExerciseFacade(db)`, and
      `statsRoutes(db)` calls `createStatsFacade(db)`, then each builds its controller from those
      facades. `allRoutes(db)` only passes the database along. Building the workouts facades twice
      costs nothing, because a repository holds only its connection. `src/scripts/seed.ts` calls
      the same three factories and hands the facades camelCase DTOs, so seeded data passes the same
      validation as the API." Keep the sentence that follows it ("`meta` and `static` have
      controllers but no facade…").
- [x] `docs/backend.md:84-86`: check that "A route handler holds its controller, and the controller
      holds the facades" and "constructed only by that facade's factory" still read correctly
      (they should), and adjust wording only if they don't.
- [x] `docs/frontend.md:52`: check that "rather than having a composition root" still reads
      correctly now that the backend has none either (it names no backend root, so it should), and
      adjust wording only if it doesn't.

**Automated Verification**:

- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes, including the `*.routes.ts` import restrictions.
- [x] `bun run fmt:check` passes.
- [x] `bun test` passes, including every `*.routes.test.ts`, which drive the rewired routes over
      HTTP through `useServer()` → `startServer`.
- [x] `Test-Path src/backend/features/facades.ts` is `False`.
- [x] `Get-ChildItem src, docs, AGENTS.md, CLAUDE.md, README.md -Recurse -File -ErrorAction SilentlyContinue | Where-Object FullName -notmatch '\\docs\\agents\\' | Select-String -CaseSensitive 'createFacades|features/facades\.ts|\bFacades\b'`
      returns no matches.
- [x] Seeding works end to end against a throwaway database:
      `$env:GAINZ_DB = "$env:TEMP/gainz-seed-check.sqlite"; bun run seed; bun run seed; Remove-Item "$env:TEMP/gainz-seed-check.sqlite*"; Remove-Item Env:GAINZ_DB`
      The first run prints "Seeded … workouts, … sets across 6 exercises.", and the second prints
      "Database already contains workouts — nothing seeded."

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/plans/2026-09-12-feature-facades.md` - the plan that introduced the facades and
  `facades.ts`
- `docs/backend.md` - the backend architecture document updated here
- `src/backend/features/workouts/workouts.facade.ts:144` - `createWorkoutFacades`
- `src/backend/features/workouts/internal/set.repository.ts:26` - the constructor doc comment
  naming the factory
