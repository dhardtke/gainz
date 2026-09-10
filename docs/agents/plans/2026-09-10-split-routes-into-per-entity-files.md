---
date: 2026-09-10T18:06:47+00:00
git_commit: 3d079f404f68f3113b824e8d30b73a1444e6cfd0
branch: main
topic: "Split routes.ts into per-entity route files under src/routes/"
tags: [plan, routes, http, tests, refactor]
status: draft
---

# PLAN: Split `routes.ts` into per-entity route files

`src/routes.ts` is one 206-line module holding the whole `Bun.serve` route table: the
error-translation wrapper, three body readers, three inline PATCH builders and ten route
patterns across four resources. This plan breaks it into one file per URL group under a new
`src/routes/` folder and leaves `src/routes.ts` as a central registry that imports those files
and spreads them into a single table.

The change is behaviour-preserving. No endpoint, status code, response body or validation rule
changes; only where the code lives. `test/api.test.ts` is split along the same lines so each
route file has a test file facing it.

Research: `docs/agents/research/2026-09-10-api-route-construction.md`.

## Acceptance Criteria

- Every one of the ten route patterns keeps its current methods, status codes and response
  bodies.
- `src/routes.ts` contains no handler code at all — imports plus one spread literal, with
  `/api/*` last exactly as it is today.
- `src/routes/` holds `shared.ts`, `meta.routes.ts`, `stats.routes.ts`, `exercise.routes.ts`,
  `workout.routes.ts` and `set.routes.ts`.
- `src/server.ts`, `src/http.ts`, `src/validate.ts` and everything under `src/repo/` are
  untouched; the import at `src/server.ts:6` still reads `"./routes"`.
- `test/api.test.ts` no longer exists; five test files sit over `test/helpers/server.ts`.
- `bun test` reports **52 pass, 0 fail, 139 expect() calls** — the same counts as before the
  refactor.
- `bun run typecheck`, `bun run lint` and `bun run fmt:check` are clean.
- `docs/backend.md` describes the new layout, and no file outside `docs/agents/` still names
  `test/api.test.ts` — including the project tree in `README.md` and the Commands block in
  `AGENTS.md`.

## Technical Key Decisions and Tradeoffs

1. **Layout: `src/routes.ts` stays as the registry, entity files go in `src/routes/`.**
   - Why: it is the requested shape, and it was verified to work — with both `src/routes.ts`
     and `src/routes/` present, Bun's runtime resolver and `tsc` under
     `moduleResolution: "bundler"` both resolve `"./routes"` to the *file*, so `src/server.ts`
     needs no change.
   - Impact: `src/routes/` and the existing `src/repo/` (folder plus `index.ts`) end up using
     two different conventions for the same shape. This is accepted.

2. **File names are singular with a `.routes` suffix:** `exercise.routes.ts`,
   `workout.routes.ts`, `set.routes.ts`, `stats.routes.ts`, `meta.routes.ts`.
   - Why: chosen during planning; the suffix makes the files findable by typing "routes" in a
     file switcher.
   - Impact: diverges from the plural, unsuffixed names in `src/repo/`. Nothing in
     `.oxlintrc.json` constrains filenames, so no lint follows from this.

3. **Routes are grouped by URL prefix**, so `/api/workouts/:id/sets` belongs to
   `workout.routes.ts`, not to `set.routes.ts`.
   - Why: a URL maps to a file by reading its prefix, with no exceptions to remember.
   - Impact: `set.routes.ts` exports `readSetBody` and `workout.routes.ts` imports it. This is
     the only cross-file dependency between route files and it points one way, so there is no
     cycle.

4. **Shared plumbing lives in `src/routes/shared.ts`:** `RouteTable`, `ParamRequest`,
   `Handler`, `guard`, `guardAll`, `MAX_NAME`, `MAX_NOTES`.
   - Why: the route files import these and `src/routes.ts` imports the route files, so leaving
     `guard` in `src/routes.ts` would create an import cycle.
   - Impact: `src/http.ts` and `src/validate.ts` stay exactly as they are.

5. **`src/routes.ts` is a pure registry.** `/api/health` and the `/api/*` catch-all move to
   `meta.routes.ts` as two separate exports, spread separately so the wildcard stays last.
   - Why: one rule with no exceptions — every route lives in `src/routes/`.
   - Impact: `src/routes.ts` ends up around 20 lines and imports no HTTP helpers at all.

6. **The return type is a named alias:** `shared.ts` exports
   `type RouteTable = Bun.Serve.Routes<undefined, string>`.
   - Why: `typescript/explicit-function-return-type` and
     `typescript/explicit-module-boundary-types` are both `"error"`, so the six route-table
     factories and `apiRoutes` must each spell a return type out; the alias states the Bun
     generics once.
   - Impact: `Routes<WebSocketData, R>` is a mapped type (`bun-types/serve.d.ts:637-642`), so
     with `R = string` it becomes an index signature. Partial tables and the spread in
     `apiRoutes` therefore type-check with no casts.

7. **The test suite splits alongside the routes, grouped by subject.** `test/helpers/server.ts`
   exports `useServer()`, which registers the per-file lifecycle hooks and returns the request
   helpers.
   - Why: verified that hooks registered *inside a function called at module scope* give each
     test file its own independent hooks and state (a second file's counter restarted at 1).
     Bare top-level hooks in a helper module would depend on import-time side effects and
     module-cache behaviour across files.
   - Impact: the three set-behaviour tests move to `set.api.test.ts` even though each of them
     POSTs to `/api/workouts/:id/sets` and only one touches `/api/sets/:id` — tests group by
     subject, routes group by URL.

8. **`describe` block names are preserved** wherever a block moves intact.
   - Why: `AGENTS.md` documents `bun test -t "health"` as the way to run one block by name.
     Renaming blocks would quietly break the documented command.
   - Impact: only the two blocks that are actually split get new names —
     `"health and routing"` loses its five static-file tests to a new `"static files"` block,
     and `"workouts and sets"` becomes `"workouts"` plus `"sets"`.

## Current State

```
src/routes.ts  (206 lines, one module, one importer: src/server.ts:6)
├── ParamRequest, Handler                         :6-8
├── guard(), guardAll()                           :11-23
├── MAX_NAME = 120, MAX_NOTES = 2000              :25-26
├── readExerciseBody / readWorkoutBody / readSetBody   :28-52
└── apiRoutes(repo): Bun.Serve.Routes<undefined, string>   :58-206
    ├── /api/health                 GET                    :60
    ├── /api/stats/summary          GET                    :64
    ├── /api/exercises              GET POST               :70
    ├── /api/exercises/:id          GET PATCH DELETE       :75   PATCH builder :78-92
    ├── /api/exercises/:id/progress GET                    :100
    ├── /api/workouts               GET POST               :113
    ├── /api/workouts/:id           GET PATCH DELETE       :130  PATCH builder :136-150
    ├── /api/workouts/:id/sets      GET POST               :158
    ├── /api/sets/:id               GET PATCH DELETE       :173  PATCH builder :176-196
    └── /api/*                      guard(...) JSON 404    :204
```

```
test/api.test.ts  (440 lines, 39 tests)
├── shapes: WorkoutDetail, WorkoutPage, Progress, ErrorBody   :11-34
├── harness: db/server/base + beforeEach/afterEach            :36-49
├── helpers: api, post, patch, body, at                       :51-91
├── fixtures: createExercise, createWorkout                   :93-103
├── describe("health and routing")   7 tests   :105   (2 API + 5 static)
├── describe("typescript modules")  10 tests   :151
├── describe("exercises")            7 tests   :227
├── describe("workouts and sets")   11 tests   :276
├── describe("progress")             1 test    :384
├── describe("stats")                1 test    :408
└── describe("request bodies")       2 tests   :426

test/migrate.test.ts   13 tests, untouched by this plan
```

## Desired End State

```
src/
├── routes.ts            registry only: import six functions, spread six tables
└── routes/
    ├── shared.ts        RouteTable, ParamRequest, Handler, guard, guardAll,
    │                    MAX_NAME, MAX_NOTES
    ├── meta.routes.ts   metaRoutes()      -> /api/health
    │                    notFoundRoute()   -> /api/*
    ├── stats.routes.ts  statsRoutes(repo) -> /api/stats/summary
    ├── exercise.routes.ts   /api/exercises, /api/exercises/:id,
    │                        /api/exercises/:id/progress
    │                        readExerciseBody + PATCH builder
    ├── workout.routes.ts    /api/workouts, /api/workouts/:id,
    │                        /api/workouts/:id/sets
    │                        readWorkoutBody + PATCH builder
    │                        imports readSetBody from ./set.routes
    └── set.routes.ts        /api/sets/:id
                             readSetBody (exported) + PATCH builder
```

`src/routes.ts` in full:

```ts
export function apiRoutes(repo: Repo): RouteTable {
  return {
    ...metaRoutes(),
    ...statsRoutes(repo),
    ...exerciseRoutes(repo),
    ...workoutRoutes(repo),
    ...setRoutes(repo),
    ...notFoundRoute(),
  };
}
```

Import direction — acyclic, and `src/server.ts` is unaware of the whole thing:

```
server.ts ──► routes.ts ──┬─► routes/meta.routes.ts     ──┐
                          ├─► routes/stats.routes.ts    ──┤
                          ├─► routes/exercise.routes.ts ──┼─► routes/shared.ts ──► http.ts
                          ├─► routes/workout.routes.ts  ──┤                        validate.ts
                          │        │                      │                        repo/
                          │        └──► set.routes.ts ────┤
                          └─► routes/set.routes.ts      ──┘
```

```
test/
├── helpers/server.ts    useServer() + body/at + shared response interfaces
├── meta.api.test.ts      5 tests   health, unknown endpoint, stats, request bodies
├── static.api.test.ts   15 tests   static files, vendor, typescript modules
├── exercise.api.test.ts  8 tests   exercises, progress
├── workout.api.test.ts   8 tests   workouts
├── set.api.test.ts       3 tests   sets
└── migrate.test.ts      13 tests   untouched

5 + 15 + 8 + 8 + 3 + 13 = 52 tests, matching today's count exactly.
```

## Abstractions and Code Reuse

Everything moves; almost nothing is rewritten. `guard`/`guardAll` keep their bodies verbatim,
each handler keeps its expression, and every validator call keeps its bounds. The only genuinely
new abstractions are the `RouteTable` alias, the six route-table factory functions, and
`useServer()` on the test side.

- `src/`
  - `routes.ts` — reduced to a registry
    - `apiRoutes` — same name, same signature, body becomes six spreads
  - `routes/shared.ts` — **new**
    - `RouteTable` — alias for `Bun.Serve.Routes<undefined, string>`
    - `ParamRequest`, `Handler` — moved from `routes.ts:6-8`
    - `guard`, `guardAll` — moved verbatim from `routes.ts:11-23`
    - `MAX_NAME`, `MAX_NOTES` — moved from `routes.ts:25-26`
  - `routes/meta.routes.ts` — **new**
    - `metaRoutes` — `/api/health` from `routes.ts:60`
    - `notFoundRoute` — `/api/*` from `routes.ts:204`
  - `routes/stats.routes.ts` — **new**
    - `statsRoutes` — `/api/stats/summary` from `routes.ts:64`
  - `routes/exercise.routes.ts` — **new**
    - `readExerciseBody` — moved from `routes.ts:28-34`
    - `exerciseRoutes` — the three patterns from `routes.ts:70-109`
  - `routes/workout.routes.ts` — **new**
    - `readWorkoutBody` — moved from `routes.ts:36-42`
    - `workoutRoutes` — the three patterns from `routes.ts:113-169`
  - `routes/set.routes.ts` — **new**
    - `readSetBody` — moved from `routes.ts:44-52`, now **exported**
    - `setRoutes` — `/api/sets/:id` from `routes.ts:173-202`
- `test/`
  - `helpers/server.ts` — **new**
    - `useServer` — the harness from `api.test.ts:36-49` plus `api`/`post`/`patch` and the
      `createExercise`/`createWorkout` fixtures, returned as an object
    - `body`, `at` — standalone exports; they hold no server state
    - `WorkoutDetail`, `WorkoutPage`, `Progress`, `ErrorBody` — moved from `api.test.ts:11-34`
  - `meta.api.test.ts`, `static.api.test.ts`, `exercise.api.test.ts`, `workout.api.test.ts`,
    `set.api.test.ts` — **new**, together replacing `api.test.ts`
- `docs/`
  - `backend.md` — the layering paragraph, the `guardAll` rule and the testing paragraph
- `README.md` — two lines of the project tree: `routes.ts    The REST route table` (`:82`) and
  `api.test.ts      End-to-end tests over a real server on an in-memory database` (`:108`),
  which names a file this plan deletes
- `AGENTS.md` — the Commands block at `:14`, `bun test test/api.test.ts # one file`, which
  becomes a broken command once that file is gone

Lint rules that shape the new code, all `"error"` in `.oxlintrc.json`:

- `typescript/explicit-function-return-type` and `explicit-module-boundary-types` — every
  exported function needs a written return type, which is what `RouteTable` is for.
- `typescript/consistent-type-imports` — type-only imports must use `import type`
  (`Repo`, `RouteTable`, `ExerciseInput`, …).
- `typescript/method-signature-style` — interfaces must use property signatures, so the
  `useServer()` return type is written `api: (path: string, init?: RequestInit) => Promise<Response>`,
  not `api(path: string): Promise<Response>`.
- `typescript/consistent-type-definitions` — an object type must be declared as an `interface`,
  not a `type` alias, so that return type is `interface TestServer { … }`. (`RouteTable`,
  `ParamRequest` and `Handler` are unaffected: an alias for a generic instantiation, an
  intersection and a function type are all outside this rule.)

Unchanged and deliberately so: `src/server.ts` (its `GainzServeOptions.routes` keeps the
literal `Bun.Serve.Routes<undefined, string>` spelling), `src/http.ts`, `src/validate.ts`,
`src/repo/**`, the REST API tables in `README.md:221-263` (the endpoint surface does not
change), the architecture section of `AGENTS.md` (it describes `src/` at folder level only),
and `docs/agents/research/2026-09-10-api-route-construction.md` (a dated snapshot of the state
before this refactor).

## Logging & Observability

No changes. The one log statement in this area — `console.error("Unhandled error:", err)` in
`errorResponse` (`src/http.ts:29`) — lives in `http.ts`, which this plan does not touch.

## Implementation

### Phase 1: Shared plumbing, the non-entity routes and the test harness

Dependencies: None.

Stand up `src/routes/` with the shared module and the two non-entity route files, and stand up
the test harness by moving the blocks that no entity file will own. `src/routes.ts` keeps the
three entity groups inline at the end of this phase, now importing `guard`/`guardAll` from
`shared.ts`.

**Tasks**:

- [ ] Create `src/routes/shared.ts` with `RouteTable`, `ParamRequest`, `Handler`, `guard`,
      `guardAll`, `MAX_NAME` and `MAX_NOTES`, moved verbatim from `src/routes.ts:6-26`.
      Keep the existing doc comments on `ParamRequest` and `guard`.

      ```ts
      export type RouteTable = Bun.Serve.Routes<undefined, string>;
      export type ParamRequest = Request & { params: Record<string, string | undefined> };
      export type Handler = (req: ParamRequest) => Response | Promise<Response>;
      export function guard(handler: Handler): Handler { /* unchanged */ }
      export function guardAll(handlers: Record<string, Handler>): Record<string, Handler> { /* unchanged */ }
      export const MAX_NAME = 120;
      export const MAX_NOTES = 2000;
      ```

- [ ] Create `src/routes/meta.routes.ts` exporting `metaRoutes(): RouteTable` (the
      `/api/health` entry from `src/routes.ts:60`) and `notFoundRoute(): RouteTable` (the
      `/api/*` entry from `src/routes.ts:204`). Neither takes `repo`.
- [ ] Create `src/routes/stats.routes.ts` exporting `statsRoutes(repo: Repo): RouteTable` with
      the `/api/stats/summary` entry from `src/routes.ts:64`.
- [ ] Update `src/routes.ts`: delete the moved declarations, import `guardAll`, `MAX_NAME`,
      `MAX_NOTES` and `RouteTable` from `./routes/shared`, spread `metaRoutes()` first and
      `notFoundRoute()` last, and keep the exercise, workout and set groups inline between
      them. Return type becomes `RouteTable`.
      Do **not** import `guard` — its only use in this module was the `/api/*` entry, which
      moves to `meta.routes.ts` in this same phase. For the same reason, narrow the `./http`
      import (`src/routes.ts:1`) to `json`, `noContent` and `readJsonObject`: `errorResponse`
      and `notFound` were used only by that entry. A leftover import raises
      `eslint(no-unused-vars)` as a *warning*, so `bun run lint` still exits 0 — verified —
      which is why the phase checks for silent output rather than a zero exit code.
- [ ] Create `test/helpers/server.ts`: export `useServer()` returning
      `{ api, post, patch, createExercise, createWorkout }`, with `beforeEach`/`afterEach`
      registered inside the function; export `body` and `at` as standalone functions; export
      the `WorkoutDetail`, `WorkoutPage`, `Progress` and `ErrorBody` interfaces from
      `api.test.ts:11-34`. Carry over the two explanatory comments on `body` and `at`
      (`api.test.ts:71-82`, `:84`) and the `oxlint-disable-next-line` on the assertion in
      `body`.

      ```ts
      export function useServer(): TestServer {
        let base = "";
        let db: Database;
        let server: Server<undefined>;
        beforeEach(() => { /* openDatabase(":memory:"), Bun.serve port 0 */ });
        afterEach(async () => { /* server.stop(true), db.close() */ });
        return { api, post, patch, createExercise, createWorkout };
      }
      ```

- [ ] Create `test/meta.api.test.ts` with `describe("health and routing")` holding the two API
      tests from `api.test.ts:106-116`, plus `describe("stats")` (`:408-424`) and
      `describe("request bodies")` (`:426-440`) moved intact. 5 tests.
- [ ] Create `test/static.api.test.ts` with a new `describe("static files")` holding the five
      static-serving tests from `api.test.ts:118-148`, plus `describe("typescript modules")`
      (`:151-225`) moved intact. 15 tests. Do not import the `body` helper here — these tests
      declare a local `const body = await res.text()`.
- [ ] Delete the moved blocks, the harness, the helpers and the interfaces from
      `test/api.test.ts`, and have what remains (`exercises`, `workouts and sets`, `progress`)
      use `useServer()` from the helper.

**Automated Verification**:

- [ ] `bun test` reports 52 pass, 0 fail, 139 expect() calls.
- [ ] `bun test test/meta.api.test.ts` reports 5 pass.
- [ ] `bun test test/static.api.test.ts` reports 15 pass.
- [ ] `bun test -t "health"` still selects the health block (the command documented in
      `AGENTS.md`).
- [ ] `bun run typecheck` is clean.
- [ ] `bun run lint` prints nothing at all (it does today; warnings such as `no-unused-vars`
      do not change the exit code, so output is the check, not the status).
- [ ] `bun run fmt` then `bun run fmt:check` is clean.

### Phase 2: Exercises

Dependencies: Phase 1.

Move the three exercise patterns and their body reader out of `src/routes.ts`, and give them a
test file.

**Tasks**:

- [ ] Create `src/routes/exercise.routes.ts` with `readExerciseBody` (from
      `src/routes.ts:28-34`) and `exerciseRoutes(repo: Repo): RouteTable` covering
      `/api/exercises`, `/api/exercises/:id` (including the inline PATCH builder at
      `:78-92`) and `/api/exercises/:id/progress`. `readExerciseBody` stays module-private.
- [ ] Update `src/routes.ts` to import `exerciseRoutes` and spread it in place of the three
      inline entries, dropping the now-unused imports (`readExerciseBody`'s validators,
      `ExerciseInput`).
- [ ] Create `test/exercise.api.test.ts` with `describe("exercises")` (`api.test.ts:227-274`)
      and `describe("progress")` (`:384-406`) moved intact, over `useServer()`. 8 tests.
- [ ] Delete those two blocks from `test/api.test.ts`.

**Automated Verification**:

- [ ] `bun test test/exercise.api.test.ts` reports 8 pass.
- [ ] `bun test` reports 52 pass, 0 fail, 139 expect() calls.
- [ ] `bun run typecheck` is clean.
- [ ] `bun run lint` prints nothing at all (it does today; warnings such as `no-unused-vars`
      do not change the exit code, so output is the check, not the status).
- [ ] `bun run fmt` then `bun run fmt:check` is clean.

### Phase 3: Workouts, sets, and the finish

Dependencies: Phase 2.

Move the last two groups, reduce `src/routes.ts` to the registry, retire `test/api.test.ts` and
bring `docs/backend.md` in line with the new layout.

**Tasks**:

- [ ] Create `src/routes/set.routes.ts` with an **exported** `readSetBody` (from
      `src/routes.ts:44-52`) and `setRoutes(repo: Repo): RouteTable` covering `/api/sets/:id`
      including the PATCH builder at `:176-196`.
- [ ] Create `src/routes/workout.routes.ts` with `readWorkoutBody` (from `src/routes.ts:36-42`)
      and `workoutRoutes(repo: Repo): RouteTable` covering `/api/workouts`,
      `/api/workouts/:id` (PATCH builder at `:136-150`) and `/api/workouts/:id/sets`,
      importing `readSetBody` from `./set.routes`.
- [ ] Reduce `src/routes.ts` to imports plus `apiRoutes(repo: Repo): RouteTable` returning the
      six spreads in order: `metaRoutes()`, `statsRoutes(repo)`, `exerciseRoutes(repo)`,
      `workoutRoutes(repo)`, `setRoutes(repo)`, `notFoundRoute()`. Keep the existing
      file-level doc comment (`src/routes.ts:54-57`), updated to describe the registry.
- [ ] Create `test/workout.api.test.ts` with `describe("workouts")` holding the eight
      workout-subject tests from `api.test.ts:276-382`: defaults the date to today
      (`:295`), rejects an invalid date (`:301`), deleting a workout removes its sets
      (`:327`), copies sets from a previous workout (`:336`), copying from a missing workout
      creates nothing (`:349`), rejects a malformed `copy_from_workout_id` (`:359`), lists
      workouts with roll-up statistics (`:368`), rejects an out-of-range limit (`:379`).
- [ ] Create `test/set.api.test.ts` with `describe("sets")` holding the three set-subject
      tests: logs sets and returns them with the workout (`api.test.ts:277`), rejects
      non-positive reps and unknown exercises (`:306`), updates and deletes a set (`:314`).
- [ ] Delete `test/api.test.ts`.
- [ ] Update `docs/backend.md`: the layering line (`:3-6`) to name `routes.ts` as the registry
      and `routes/` as one file per URL group; the error-handling rule (`:15-16`) so
      `guardAll()` is located in `routes/shared.ts` and the rule reads "new routes must be
      wrapped in `guardAll`" in whichever route file owns them; the transaction paragraph
      (`:18-21`) so it refers to the route files rather than `routes.ts`; and the testing
      paragraph (`:31-33`) to describe the five API test files over `test/helpers/server.ts`.
- [ ] Update the project tree in `README.md`: replace the `routes.ts    The REST route table`
      line (`:82`) with the registry plus a `routes/` entry mirroring how `repo/` is listed
      just above it (`:76-81`), and replace the `api.test.ts` line (`:108`) with the five API
      test files and `helpers/server.ts`.
- [ ] Update `AGENTS.md:14`, `bun test test/api.test.ts # one file`, to name a file that still
      exists — for example `bun test test/workout.api.test.ts`.

**Automated Verification**:

- [ ] `bun test test/workout.api.test.ts` reports 8 pass.
- [ ] `bun test test/set.api.test.ts` reports 3 pass.
- [ ] `bun test` reports 52 pass, 0 fail, 139 expect() calls.
- [ ] `test/api.test.ts` no longer exists, and `git grep -n "api\.test\.ts"` returns nothing
      outside `docs/agents/` (where the dated research and plan documents keep their record of
      the old layout).
- [ ] Every command in the `AGENTS.md` Commands block still runs.
- [ ] `src/routes.ts` contains no `guardAll(` or `json(` call — a registry only.
- [ ] `src/routes/` contains exactly `shared.ts`, `meta.routes.ts`, `stats.routes.ts`,
      `exercise.routes.ts`, `workout.routes.ts`, `set.routes.ts`.
- [ ] `git diff --stat` shows no change to `src/server.ts`, `src/http.ts`, `src/validate.ts` or
      `src/repo/**` across all three phases.
- [ ] `bun run typecheck` is clean.
- [ ] `bun run lint` prints nothing at all (it does today; warnings such as `no-unused-vars`
      do not change the exit code, so output is the check, not the status).
- [ ] `bun run fmt` then `bun run fmt:check` is clean.
- [ ] With `bun start` running,
      `bun -e "for (const p of ['/api/health', '/api/nope']) { const r = await fetch('http://localhost:3000' + p); console.log(p, r.status, await r.text()); }"`
      prints `200 {"status":"ok","app":"gainz"}` for the first path and `404` for the second.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-10-api-route-construction.md` — how the route table works today
- `docs/backend.md` — the layering rules this refactor has to keep true
- `src/routes.ts` — the module being split
- `test/api.test.ts` — the suite being split
- `node_modules/bun-types/serve.d.ts:637-642` — `Bun.Serve.Routes` is a mapped type, so
  `Routes<undefined, string>` is an index signature and partial tables spread cleanly
