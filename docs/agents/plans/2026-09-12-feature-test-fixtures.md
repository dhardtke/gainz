---
date: 2026-09-12T21:48:12.244266+00:00
git_commit: 57ce3f1e164d247c91683f72de19894e2694b66f
branch: main
topic: 'Move domain fixtures out of testing.ts into their features'
tags: [plan, tests, testing, fixtures, exercises, workouts, stats]
status: ready
---

# PLAN: Move domain fixtures out of testing.ts into their features

`src/backend/testing.ts` is meant to be the technical test harness that belongs to no feature, but
`useServer()` also hands out two domain fixtures, `createExercise` and `createWorkout`, which know
the exercises and workouts endpoints, their request bodies and their response DTOs. This plan moves
each fixture into the feature that owns the endpoint, as a plain function in a
`<feature>.fixtures.ts` module at the feature root, and leaves `testing.ts` holding only technical
hooks: `useServer()` (`api`, `post`, `patch`), `useTempDir()`, `body()` and `at()`.

## Acceptance Criteria

- `src/backend/testing.ts` exports only technical helpers: `useServer()` returning `api`, `post` and
  `patch`, `useTempDir()`, `body()` and `at()`. `TestServer` has no `createExercise` or
  `createWorkout`, and `testing.ts` imports neither `expect` nor anything from `shared/dto`.
- `src/backend/features/exercises/exercises.fixtures.ts` exports
  `createExercise(post, name = 'Bench Press'): Promise<ExerciseDto>`.
- `src/backend/features/workouts/workouts.fixtures.ts` exports
  `createWorkout(post, performedOn = '2026-01-05'): Promise<WorkoutWithSetsDto>`, still sending
  `title: 'Push day'`.
- Both fixtures POST through the `post` they are given, assert `201` and return the response body as
  the DTO, exactly as they do today.
- `exercise.routes.test.ts`, `workout.routes.test.ts`, `set.routes.test.ts` and
  `stats.routes.test.ts` import the fixtures from the owning feature and pass `post` at every call
  site; no test's assertions change.
- `docs/backend.md` describes the fixture modules and names them as the one cross-feature import
  that does not land on a `ports/`.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **Per-feature fixture modules:** each domain fixture moves into the feature that owns its
   endpoint.
   - Why: `testing.ts` stays purely technical, and a feature owns how its data is created.
   - Impact: the stats and workouts tests import from the exercises feature, and the exercises and
     stats tests import from the workouts feature.
2. **Feature root, named `<feature>.fixtures.ts`:** beside `<feature>.facade.ts`, not under
   `ports/` and not in a new `testing/` directory.
   - Why: `ports/` stays a production-only public surface, and the root already holds the modules
     named after the feature.
   - Impact: `docs/backend.md` must name fixtures as the exception to "every arrow that crosses a
     feature line lands on a `ports/`".
3. **`post` passed on every call:** `createExercise(post, name?)` and `createWorkout(post, performedOn?)`
   are plain stateless functions; no factory binds them to a server.
   - Why: the simplest shape, and `TestServer` stays the only harness type.
   - Impact: all 24 call sites gain a `post` argument.
4. **Behaviour carried over unchanged:** the defaults (`'Bench Press'`, `'2026-01-05'`,
   `title: 'Push day'`) and the `201` assertion stay in the fixtures.
   - Why: `exercise.routes.test.ts:33,70`, `workout.routes.test.ts:91` and
     `stats.routes.test.ts:20` assert those defaults.
   - Impact: the fixture modules import `expect` from `bun:test`, as `testing.ts` does today.
5. **No lint rule guards `*.fixtures.ts`:** production modules are kept from importing fixtures by
   convention, as they already are for `testing.ts`.
   - Why: `testing.ts` is not lint-guarded either; adding a rule is out of scope.
   - Impact: none beyond the doc comment on each fixture module.

## Current State

```
src/backend/testing.ts
├── useServer(): TestServer        lifecycle hooks: :memory: DB + port-0 server per test
│   ├── api(path, init)            technical
│   ├── post(path, body)           technical
│   ├── patch(path, body)          technical
│   ├── createExercise(name?)      DOMAIN  POST /api/exercises, expects 201   (testing.ts:68)
│   └── createWorkout(date?)       DOMAIN  POST /api/workouts,  expects 201   (testing.ts:74)
├── useTempDir()                   technical
├── body<T>(res)                   technical
└── at<T>(items, i)                technical
```

`expect` (`testing.ts:5`) and the `ExerciseDto` / `WorkoutWithSetsDto` type import (`testing.ts:12`)
exist only for the two domain fixtures.

Callers of the domain fixtures:

```
features/exercises/exercise.routes.test.ts   createExercise ×6, createWorkout ×1
features/workouts/workout.routes.test.ts     createExercise ×5, createWorkout ×6
features/workouts/set.routes.test.ts         createExercise ×2, createWorkout ×2
features/stats/stats.routes.test.ts          createExercise ×1, createWorkout ×1
```

`docs/backend.md:18-21` states that every arrow crossing a feature line lands on a `ports/`, and
`docs/backend.md:44-45` describes `testing.ts` as test-only plumbing that belongs to no feature.

## Desired End State

```
src/backend/testing.ts                          technical only
├── useServer(): TestServer { api, post, patch }
├── useTempDir()
├── body<T>(res)
└── at<T>(items, i)

src/backend/features/exercises/exercises.fixtures.ts
└── createExercise(post, name = 'Bench Press')        → ExerciseDto

src/backend/features/workouts/workouts.fixtures.ts
└── createWorkout(post, performedOn = '2026-01-05')   → WorkoutWithSetsDto

imports
exercise.routes.test.ts ──► exercises.fixtures.ts, workouts.fixtures.ts
workout.routes.test.ts  ──► exercises.fixtures.ts, workouts.fixtures.ts
set.routes.test.ts      ──► exercises.fixtures.ts, workouts.fixtures.ts
stats.routes.test.ts    ──► exercises.fixtures.ts, workouts.fixtures.ts
*.fixtures.ts           ──► testing.ts (TestServer type, body)
```

A route test reads:

```ts
const { api, post, patch } = useServer();

test('updates only the supplied fields', async () => {
  const exercise = await createExercise(post);
  // ...
});
```

## Abstractions and Code Reuse

The fixtures reuse `TestServer['post']` for their parameter type and `body<T>()` for reading the
response, both from `testing.ts`. No new types are introduced.

- `src/backend/`
  - `testing.ts` - drop the domain fixtures
    - `TestServer` - remove `createExercise` and `createWorkout`
    - `useServer` - remove both inner functions and their entries in the returned object
    - imports - remove `expect` and the `shared/dto` type import
  - `features/exercises/`
    - `exercises.fixtures.ts` - new; `createExercise(post, name?)`
    - `exercise.routes.test.ts` - import both fixtures, pass `post`
  - `features/workouts/`
    - `workouts.fixtures.ts` - new; `createWorkout(post, performedOn?)`
    - `workout.routes.test.ts` - import both fixtures, pass `post`
    - `set.routes.test.ts` - import both fixtures, pass `post`
  - `features/stats/`
    - `stats.routes.test.ts` - import both fixtures, pass `post`
- `docs/backend.md` - describe the fixture modules and their cross-feature exception

## Logging & Observability

None; this is a test-only refactor.

## Implementation

Dependencies: None

Move both domain fixtures into their features in one step. A partial move would leave the four
test files not compiling, so there is no smaller vertical slice.

**Tasks**:

- [ ] Create `src/backend/features/exercises/exercises.fixtures.ts`:
      ```ts
      /** Test-only. Exercise data for any feature's route tests; no production module imports it. */
      import { expect } from 'bun:test';
      import type { ExerciseDto } from '../../../shared/dto';
      import { body, type TestServer } from '../../testing.ts';

      export async function createExercise(post: TestServer['post'], name = 'Bench Press'): Promise<ExerciseDto> {
        const res = await post('/api/exercises', { name });
        expect(res.status).toBe(201);
        return body<ExerciseDto>(res);
      }
      ```
- [ ] Create `src/backend/features/workouts/workouts.fixtures.ts`, following the same pattern:
      `createWorkout(post: TestServer['post'], performedOn = '2026-01-05'): Promise<WorkoutWithSetsDto>`
      posting `{ performedOn, title: 'Push day' }` to `/api/workouts`.
- [ ] `src/backend/testing.ts`: remove `createExercise` and `createWorkout` from `TestServer`, from
      `useServer()` and from its returned object (`return { api, post, patch };`), and remove the
      now-unused `expect` import and `import type { ExerciseDto, WorkoutWithSetsDto }`.
- [ ] `src/backend/features/exercises/exercise.routes.test.ts`: import `createExercise` from
      `./exercises.fixtures.ts` and `createWorkout` from `../workouts/workouts.fixtures.ts`, destructure
      `{ api, post, patch }` from `useServer()`, and pass `post` as the first argument at all 7 call
      sites (`createExercise('Back Squat')` becomes `createExercise(post, 'Back Squat')`).
- [ ] `src/backend/features/workouts/workout.routes.test.ts`: import `createExercise` from
      `../exercises/exercises.fixtures.ts` and `createWorkout` from `./workouts.fixtures.ts`, destructure
      `{ api, post }`, and pass `post` at all 11 call sites (`createWorkout('2026-01-05')` becomes
      `createWorkout(post, '2026-01-05')`).
- [ ] `src/backend/features/workouts/set.routes.test.ts`: import both fixtures the same way,
      destructure `{ api, post, patch }`, and pass `post` at all 4 call sites.
- [ ] `src/backend/features/stats/stats.routes.test.ts`: import `createExercise` from
      `../exercises/exercises.fixtures.ts` and `createWorkout` from `../workouts/workouts.fixtures.ts`,
      destructure `{ api, post }`, and pass `post` at both call sites.
- [ ] `docs/backend.md`: in the paragraph at lines 18-23, qualify "the arrows that do cross a feature
      line all land on a `ports/`" so it excludes test code, and list `<feature>.fixtures.ts` among the
      modules a feature keeps at its root. In the paragraph at line 44, add that `testing.ts` holds
      only technical hooks (`useServer()`, `useTempDir()`, `body()`, `at()`), while the fixtures that
      create a feature's data over HTTP — `createExercise` in `exercises/exercises.fixtures.ts` and
      `createWorkout` in `workouts/workouts.fixtures.ts` — live in the feature that owns the endpoint,
      take `post` from `useServer()`, and are imported by other features' route tests, the one
      cross-feature import that does not go through `ports/`.

**Automated Verification**:

- [ ] `bun test` passes, with the same number of tests as before the change
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] A search for `createExercise|createWorkout|shared/dto|expect` in `src/backend/testing.ts`
      finds nothing
- [ ] A search for `createExercise|createWorkout` outside `*.test.ts`, `*.fixtures.ts`, `docs/` and
      the facade factories (`createExerciseFacade`, `createWorkoutFacades`) finds nothing

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `src/backend/testing.ts`
- `src/backend/features/exercises/exercise.routes.test.ts`
- `src/backend/features/workouts/workout.routes.test.ts`
- `src/backend/features/workouts/set.routes.test.ts`
- `src/backend/features/stats/stats.routes.test.ts`
- `docs/backend.md`
- `.oxlintrc.json`
