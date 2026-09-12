---
date: 2026-09-12T20:00:58+00:00
git_commit: 6f2a5ffd8f977e03197b60075555b3b1cfd500d0
branch: main
topic: 'Route handlers delegate to a per-route-file controller that maps requests and responses'
tags: [plan, backend, features, controllers, facades, routes, dto, mappers, static, oxlint, refactor]
status: ready
---

# PLAN: Every route file has a controller

Today a route handler does five jobs at once. It parses HTTP (`pathId`, `queryInt`,
`readJsonObject`), translates the body into a request DTO, maps that DTO into the snake_case
`<Entity>Input`, calls one or more facades, and maps the rows back into DTOs through `ports/` before
wrapping them in `json()`. That is why `workout.routes.ts:1-11` carries eleven imports and why
`exercise.routes.ts:14` is a single line six calls deep.

This plan puts a controller between each route file and its feature. The route handler keeps HTTP
and nothing else; the controller takes plain values — an id, a limit, an untyped JSON body — and
returns a type from `src/shared/dto/`. Everything between those two edges — translating, the `from*`
mapping, the facade calls, composing several of them, the `to*` mapping — moves into the controller.
Every feature gets one, `meta` and `static` included, and two oxlint overrides make the boundary a
check rather than a convention.

Built on `docs/agents/research/2026-09-12-handler-construction-and-data-flow.md`, which is current
at the commit this plan carries.

## Acceptance Criteria

- Every feature has a controller at its root, one class per route file, each in its own
  `<x>.controller.ts`: `ExerciseController`, `WorkoutController`, `SetController`,
  `StatsController`, `MetaController`, `StaticController`.
- A route handler calls only its controller. It keeps every HTTP concern: `pathId`, `queryInt`,
  `readJsonObject`, `json()` / `noContent()`, status codes, `guard` / `guardAll`, and — for the
  static routes — the 405, the headers and the construction of every `Response`.
- The data controllers take plain values (`id: number`, `limit` / `offset`,
  `body: Record<string, unknown>`) and return `src/shared/dto` types. Translating, `from*` mapping,
  facade calls, composing several facade calls and `to*` mapping all happen inside them.
- Route factories keep today's signatures — `workoutRoutes(workouts, sets)`, `setRoutes(sets)`,
  `exerciseRoutes(exercises)`, `statsRoutes(stats)`, `metaRoutes()`, `staticRoutes()` — and each
  constructs its own controller. `allRoutes`, `serveOptions`, `createFacades`, `main.ts`,
  `testing.ts`, `http/server.test.ts` and `src/scripts/seed.ts` are untouched.
- `bun run lint` fails if any `*.routes.ts` under `src/backend/features/` imports a module under
  `internal/` or `ports/` (repositories included), and fails if any `*.controller.ts` imports a
  module under `http/` or a `*.repository.ts`.
- `GET /api/health` returns a `HealthDto` declared in the new `src/shared/dto/meta.ts` and exported
  from `src/shared/dto/index.ts`. The `/api` and `/api/*` 404 catch-alls stay in `meta.routes.ts`
  with no controller call.
- `StaticController` resolves a pathname to an internal result union and supplies the vendor URL
  list; `static.routes.ts` turns each result into the same `Response` it returns today.
  `transpileModule` returns the transpiled code or `null`, never a `Response`.
- Behaviour is unchanged: same URLs, statuses, headers and bodies. No `*.test.ts` file is edited.
- `docs/backend.md`, `AGENTS.md` and the facade doc comments describe the controller. The phrases
  "mapping a row to a DTO is the route's job" and "a handler still maps what the facade returns"
  appear nowhere.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass after every
  phase.

## Technical Key Decisions and Tradeoffs

1. **Values in, DTOs out.** A data controller method takes numbers and
   `Record<string, unknown>` bodies and returns a `src/shared/dto` type.
   - Why: the return type is checked by the compiler against the wire contract, and the controller
     never learns what a `Request` is. The body arrives as `Record<string, unknown>` — the output of
     `readJsonObject`, and exactly what every translator already accepts — so the whole of
     "request body → internal format" is the controller's.
   - Impact: handlers shrink to `json(controller.x(pathId(…), await readJsonObject(req)), 201)`.
     Status codes stay in the route, which is the only place that knows it is answering HTTP.

2. **One controller class per route file**, in a module named after that file:
   `workout.controller.ts` beside `workout.routes.ts`, `set.controller.ts` beside `set.routes.ts`.
   - Why: it follows the existing rule that a route belongs to the file its URL prefix names, and
     keeps the short verbs `list` / `create` / `show` / `update` / `delete` free of collisions — the
     same reason the facades plan split `WorkoutFacade` from `SetFacade`.
   - Impact: `WorkoutController` holds both `WorkoutFacade` and `SetFacade`, because
     `/api/workouts/:id` and `/api/workouts/:id/sets` both need sets. `SetController` holds only
     `SetFacade`.

3. **Each route factory builds its own controller** from the facades it is already given.
   - Why: no new composition module and no change to any caller; the facades stay the one thing
     threaded through `allRoutes`.
   - Impact: a route file imports its facade *types* and its controller class. Controllers are
     constructed once per `allRoutes` call, i.e. once per server, exactly like the handler closures
     they replace.

4. **Two non-overlapping oxlint overrides.** Routes may not import `**/internal/**`,
   `**/ports/**` or `**/*.repository.ts`; controllers may not import `**/http/**` or
   `**/*.repository.ts`.
   - Why: measured on the installed oxlint 1.82.0 against this tree, the routes pattern reports
     exactly fifteen imports (listed under Current State) and nothing else, and `**/http/**` matches
     `../../http/*.ts`. The same measurement showed that when two `overrides` entries set
     `no-restricted-imports` for the same file, **the later entry replaces the earlier one** rather
     than merging with it.
   - Impact: the `*.routes.ts` and `*.controller.ts` globs never overlap. The existing
     repository-only override is folded into the new routes pattern. While phases 1–3 are in
     progress, the new routes override lists the converted route files explicitly and sits *after*
     the existing `features/**/*.routes.ts` override, so for those files it wins — and since its
     group includes `**/*.repository.ts`, the old restriction is not lost. Phase 4 collapses the two
     into one entry over `features/**/*.routes.ts`.

5. **`meta` and `static` get controllers but no facades.** "A controller calls facades" holds for
   the data features; `StaticController` calls `internal/paths.ts` and `internal/transpile.ts`
   directly, and `MetaController` calls nothing.
   - Why: a pass-through facade over file lookup, or over a constant, would add a class and no
     boundary.
   - Impact: every `*.routes.ts` falls under the routes lint rule without an exemption.

6. **Static results are a union per route, not one shared union.** `StaticController.vendor()`
   returns `VendorResult`, `frontend()` returns `FrontendResult`; both are exported from
   `static.controller.ts`, not `src/shared/dto/`, because they never reach the wire.
   - Why: a single union would force the vendor route to handle a `module` result it can never
     receive.
   - Impact: `static.routes.ts` turns each result into a `Response` with an **if-chain** narrowing on
     `result.kind`, ending in an unconditional return for the last remaining kind. Not a `switch`:
     measured in a scratch copy, an exhaustive `switch` whose every case returns trips
     `typescript/consistent-return`, and adding a `default` trips
     `switch-exhaustiveness-check`. The route keeps its comments about Bun's MIME inference and the
     405.

7. **`HealthDto` joins the shared wire contract** as `{ status: 'ok'; app: 'gainz' }` in
   `src/shared/dto/meta.ts`.
   - Why: every other controller returns a `src/shared/dto` type; health should not be the one
     that returns an anonymous literal.
   - Impact: `src/shared/dto/index.test.ts` covers the new file automatically — it transpiles every
     declaration file in the directory and requires nothing to survive.

8. **Controller method names**:

   | Controller | Methods |
   | --- | --- |
   | `ExerciseController` | `list()`, `create(body)`, `show(id)`, `update(id, body)`, `delete(id)`, `progress(id)` |
   | `WorkoutController` | `list(limit, offset)`, `create(body)`, `show(id)`, `update(id, body)`, `delete(id)`, `listSets(id)`, `addSet(id, body)` |
   | `SetController` | `show(id)`, `update(id, body)`, `delete(id)` |
   | `StatsController` | `summary()` |
   | `MetaController` | `health()` |
   | `StaticController` | `vendorUrls()`, `vendor(pathname)`, `frontend(pathname)` |

   - Why: the verbs mirror the facades; `listSets` / `addSet` and `progress` name the nested URLs.
   - Impact: `copyFromWorkoutId` — which belongs to the request but not to `WorkoutInput` — is read
     in `WorkoutController.create`, the only place that now sees the request DTO.

9. **No new unit tests.** The end-to-end suite already pins every status, header and body, and the
   repository has no unit tests of its layers (`docs/backend.md`, "There are no unit tests of the
   repositories"). An unchanged suite passing is the proof this is a refactor.

## Current State

```
Bun router
   │
   ▼
guardAll({ GET, POST, … })                                   http/routing.ts:22
   │
   ▼  handler closure in <x>.routes.ts, closing over facades
   ├─ HTTP in:   pathId / queryInt / await readJsonObject(req)
   ├─ translate: translateTo<X>Dto(body)          internal/*.translator.ts
   ├─ map in:    from<X>(dto)                     internal/*.mapper.ts
   ├─ facade:    facade.create(…) → row           <feature>.facade.ts
   ├─ map out:   to<X>(row)                       ports/*.ts
   └─ HTTP out:  json(dto, status) / noContent()
```

Handlers that compose more than one facade call today:

| Route | Composition in the handler |
| --- | --- |
| `GET /api/workouts` | `toWorkoutPage(workouts.list(limit, offset), workouts.count(), limit, offset)` |
| `POST /api/workouts` | `workouts.create(fromCreateWorkout(dto), { copyFrom: dto.copyFromWorkoutId })`, then `toWorkoutWithSets(workout, sets.list(workout.id))` |
| `GET /api/workouts/:id` | `toWorkoutWithSets(workouts.require(id), sets.list(id))` |
| `GET /api/workouts/:id/sets` | `workouts.require(id)` for the 404, then `sets.list(id).map(toLiftSet)` |
| `GET /api/exercises/:id/progress` | `toExerciseProgress(exercises.require(id), exercises.progress(id), exercises.bestSet(id))` |

The static routes build every `Response` inline (`static.routes.ts:24-79`), and
`transpileModule` (`internal/transpile.ts:21-37`) returns a `Response` of its own. `/api/health`
returns an untyped literal (`meta.routes.ts:16`).

The routes override below, run against this tree with oxlint 1.82.0, reports exactly these fifteen
imports — the work list:

```
features/stats/stats.routes.ts:5           ./ports/stats.ts
features/exercises/exercise.routes.ts:6    ./ports/exercise.ts
features/exercises/exercise.routes.ts:7    ./internal/exercise.mapper.ts
features/exercises/exercise.routes.ts:8    ./internal/exercise.translator.ts
features/workouts/workout.routes.ts:3      ./ports/workout.ts
features/workouts/workout.routes.ts:4      ./ports/set.ts
features/workouts/workout.routes.ts:5      ./internal/workout.mapper.ts
features/workouts/workout.routes.ts:6      ./internal/workout.translator.ts
features/workouts/workout.routes.ts:7      ./internal/set.mapper.ts
features/workouts/workout.routes.ts:8      ./internal/set.translator.ts
features/workouts/set.routes.ts:3          ./ports/set.ts
features/workouts/set.routes.ts:4          ./internal/set.mapper.ts
features/workouts/set.routes.ts:5          ./internal/set.translator.ts
features/static/static.routes.ts:11        ./internal/paths.ts
features/static/static.routes.ts:12        ./internal/transpile.ts
```

`meta.routes.ts` has none — it only reaches `http/`.

## Desired End State

```
Bun router
   │
   ▼
guardAll({ GET, POST, … })
   │
   ▼  handler in <x>.routes.ts, closing over its controller only
   ├─ HTTP in:   pathId / queryInt / await readJsonObject(req)
   │
   │     ┌──────────────── <x>.controller.ts ────────────────┐
   ├────►│ translateTo<X>Dto(body)   internal/*.translator.ts │
   │     │ from<X>(dto)              internal/*.mapper.ts     │
   │     │ facade.a(…), facade.b(…)  <feature>.facade.ts      │
   │     │ to<X>(rows…)              ports/*.ts               │
   │◄────│ → <X>Dto                  src/shared/dto           │
   │     └────────────────────────────────────────────────────┘
   │
   └─ HTTP out:  json(dto, status) / noContent()
```

```
src/backend/features/
├── exercises/
│   ├── exercise.routes.ts        exerciseRoutes(exercises) → new ExerciseController(exercises)
│   ├── exercise.controller.ts    ExerciseController                              ← new
│   ├── exercises.facade.ts       doc comment: controllers hold it, controllers map
│   ├── ports/, internal/         unchanged
├── workouts/
│   ├── workout.routes.ts         workoutRoutes(workouts, sets) → new WorkoutController(workouts, sets)
│   ├── workout.controller.ts     WorkoutController                               ← new
│   ├── set.routes.ts             setRoutes(sets) → new SetController(sets)
│   ├── set.controller.ts         SetController                                   ← new
│   ├── workouts.facade.ts        doc comment updated
│   ├── ports/, internal/         unchanged
├── stats/
│   ├── stats.routes.ts           statsRoutes(stats) → new StatsController(stats)
│   ├── stats.controller.ts       StatsController                                 ← new
│   ├── stats.facade.ts           doc comment updated
├── meta/
│   ├── meta.routes.ts            metaRoutes() → new MetaController()
│   └── meta.controller.ts        MetaController                                  ← new
└── static/
    ├── static.routes.ts          staticRoutes() → new StaticController(); builds Responses
    ├── static.controller.ts      StaticController, VendorResult, FrontendResult  ← new
    └── internal/transpile.ts     transpileModule(path): Promise<string | null>
```

What each layer may import, as `bun run lint` enforces it:

```
*.routes.ts      ✓ http/, shared/validate.ts, own *.controller.ts, *.facade.ts (types)
                 ✗ **/internal/**, **/ports/**, **/*.repository.ts
*.controller.ts  ✓ own internal/ translators + mappers, ports/, *.facade.ts (types), src/shared/dto
                 ✗ **/http/**, **/*.repository.ts
```

A controller still throws: translators and validators raise `HttpError` via `shared/validate.ts`,
and repositories raise it behind the facade. The controller imports neither `http/errors.ts` nor
anything else from `http/`, and `guardAll` in the route stays the single place those errors become
responses.

## Abstractions and Code Reuse

Reused unchanged:

- Every translator, `from*` mapper, `to*` mapper, facade method and repository. The controllers
  call exactly the functions the handlers call today, in the same order.
- `guard` / `guardAll`, `json`, `noContent`, `readJsonObject`, `pathId`, `queryInt` — all still
  called from the routes.
- `internal/paths.ts` — `resolveStaticPath`, `resolveVendorPath`, `FRONTEND_DIR`, `VENDOR_FILES` —
  now called from `StaticController`.
- The whole test suite, including `static.routes.test.ts` and `internal/transpile.test.ts`, which
  drive the static routes over HTTP and therefore see no change.

New abstractions:

- `<X>Controller` — a class holding its facades as `private readonly` parameter properties (as the
  facades hold their repositories), with one method per handler.
- `VendorResult` / `FrontendResult` — discriminated unions describing what the static feature found,
  so the controller decides *what* to serve and the route decides *how* to say it.
- `HealthDto` — the one new wire type.

Files, grouped by phase:

- Phase 1
  - `.oxlintrc.json` - controllers override; routes override listing the stats and meta route files
  - `src/backend/features/stats/stats.controller.ts` - new. `StatsController`
  - `src/backend/features/stats/stats.routes.ts` - builds `StatsController`; no `ports/` import
  - `src/backend/features/stats/stats.facade.ts` - doc comment names the controller
  - `src/shared/dto/meta.ts` - new. `HealthDto`
  - `src/shared/dto/index.ts` - export `HealthDto`
  - `src/backend/features/meta/meta.controller.ts` - new. `MetaController`
  - `src/backend/features/meta/meta.routes.ts` - `/api/health` calls `controller.health()`
- Phase 2
  - `src/backend/features/exercises/exercise.controller.ts` - new. `ExerciseController`
  - `src/backend/features/exercises/exercise.routes.ts` - builds `ExerciseController`
  - `src/backend/features/exercises/exercises.facade.ts` - doc comment
  - `.oxlintrc.json` - routes override lists `exercise.routes.ts`
- Phase 3
  - `src/backend/features/workouts/workout.controller.ts` - new. `WorkoutController`
  - `src/backend/features/workouts/set.controller.ts` - new. `SetController`
  - `src/backend/features/workouts/workout.routes.ts`, `set.routes.ts` - build their controllers
  - `src/backend/features/workouts/workouts.facade.ts` - doc comment
  - `src/backend/features/workouts/internal/workout.mapper.ts` - doc comment: the controller, not the handler, passes `copyFromWorkoutId` on
  - `.oxlintrc.json` - routes override lists both workouts route files
- Phase 4
  - `src/backend/features/static/static.controller.ts` - new. `StaticController`, `VendorResult`, `FrontendResult`
  - `src/backend/features/static/internal/transpile.ts` - `transpileModule` returns `string | null`
  - `src/backend/features/static/static.routes.ts` - builds `StaticController`, turns results into `Response`s
  - `.oxlintrc.json` - one routes override over `features/**/*.routes.ts`, the old one removed
  - `docs/backend.md`, `AGENTS.md` - the controller layer, the lint rules, static serving

## Logging & Observability

No logging changes. The one log line on a request path — `console.error('gainz: could not
transpile …', cause)` in `transpile.ts` — stays in `transpileModule` with the same text; only its
return value changes. `errorResponse` still logs anything that is not an `HttpError`.

## Implementation

### Phase 1: Controllers for stats and meta, and the rules that hold them

Dependencies: None.

Introduces the controller layer on the two smallest features and puts both lint overrides in
place.

**Tasks**:

- [ ] `.oxlintrc.json` — keep the existing `features/**/*.routes.ts` override as the **first** entry
      and append two more. Order matters: for a file matched by two entries, the later
      `no-restricted-imports` replaces the earlier.
      ```json
      {
        "files": ["src/backend/features/stats/*.routes.ts", "src/backend/features/meta/*.routes.ts"],
        "rules": {
          "no-restricted-imports": [
            "error",
            {
              "patterns": [
                {
                  "group": ["**/internal/**", "**/ports/**", "**/*.repository.ts"],
                  "message": "Route handlers map requests and responses through their controller."
                }
              ]
            }
          ]
        }
      },
      {
        "files": ["src/backend/features/**/*.controller.ts"],
        "rules": {
          "no-restricted-imports": [
            "error",
            {
              "patterns": [
                {
                  "group": ["**/http/**", "**/*.repository.ts"],
                  "message": "Controllers stay free of HTTP and reach the database through their feature's facade."
                }
              ]
            }
          ]
        }
      }
      ```
      Confirm `bun run lint` now reports `stats.routes.ts:5` (`./ports/stats.ts`) before changing
      any source
- [ ] Create `src/backend/features/stats/stats.controller.ts`:
      ```ts
      import type { SummaryDto } from '../../../shared/dto';
      import type { StatsFacade } from './stats.facade.ts';
      import { toSummary } from './ports/stats.ts';

      export class StatsController {
        constructor(private readonly stats: StatsFacade) {}

        summary(): SummaryDto {
          return toSummary(this.stats.summary());
        }
      }
      ```
- [ ] `src/backend/features/stats/stats.routes.ts` — drop the `ports/stats.ts` import, construct the
      controller, and call it:
      ```ts
      export function statsRoutes(stats: StatsFacade): RouteTable {
        const controller = new StatsController(stats);
        return {
          '/api/stats/summary': guardAll({
            GET: () => json(controller.summary()),
          }),
        };
      }
      ```
- [ ] `src/backend/features/stats/stats.facade.ts:5-8` — the doc comment's point ("the repository
      behind it is named nowhere else") stays; add that its caller is `StatsController`
- [ ] Create `src/shared/dto/meta.ts`, types only:
      ```ts
      /** `GET /api/health`. */
      export interface HealthDto {
        status: 'ok';
        app: 'gainz';
      }
      ```
- [ ] `src/shared/dto/index.ts` — `export type { HealthDto } from './meta.ts';`, alphabetically
      between `exercise.ts` and `set.ts`
- [ ] Create `src/backend/features/meta/meta.controller.ts`:
      ```ts
      import type { HealthDto } from '../../../shared/dto';

      export class MetaController {
        health(): HealthDto {
          return { status: 'ok', app: 'gainz' };
        }
      }
      ```
- [ ] `src/backend/features/meta/meta.routes.ts` — `metaRoutes()` constructs `MetaController` and
      passes it to `healthRoute(controller)`, whose handler becomes
      `GET: () => json(controller.health())`. `notFoundRoute()` and its comment are unchanged
- [ ] `bun run fmt`

`docs/backend.md` and `AGENTS.md` are deliberately not edited until phase 4: they describe the
backend as a whole, and until every route file is converted a sentence saying "a route handler
holds only its controller" would be false for the rest.

**Automated Verification**:

- [ ] `bun run lint` passes, with no error in `stats.routes.ts` or `meta.routes.ts`
- [ ] `bun run typecheck` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test src/backend/features/stats src/backend/features/meta src/shared/dto` passes —
      including `index.test.ts` over the new `meta.ts`
- [ ] `bun test` passes
- [ ] `git diff --name-only 6f2a5ff -- '*.test.ts'` prints nothing

### Phase 2: ExerciseController

Dependencies: Phase 1.

**Tasks**:

- [ ] `.oxlintrc.json` — add `"src/backend/features/exercises/*.routes.ts"` to the `files` of the
      routes override added in phase 1. Confirm lint reports `exercise.routes.ts:6-8`
- [ ] Create `src/backend/features/exercises/exercise.controller.ts`:
      ```ts
      import type { ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto } from '../../../shared/dto';
      import type { ExerciseFacade } from './exercises.facade.ts';
      import { toExercise, toExerciseProgress, toExerciseWithStats } from './ports/exercise.ts';
      import { fromCreateExercise, fromEditExercise } from './internal/exercise.mapper.ts';
      import { translateToCreateExerciseDto, translateToEditExerciseDto } from './internal/exercise.translator.ts';

      export class ExerciseController {
        constructor(private readonly exercises: ExerciseFacade) {}

        list(): ExerciseWithStatsDto[] {
          return this.exercises.list().map(toExerciseWithStats);
        }

        create(body: Record<string, unknown>): ExerciseDto {
          return toExercise(this.exercises.create(fromCreateExercise(translateToCreateExerciseDto(body))));
        }

        show(id: number): ExerciseDto {
          return toExercise(this.exercises.require(id));
        }

        update(id: number, body: Record<string, unknown>): ExerciseDto {
          return toExercise(this.exercises.update(id, fromEditExercise(translateToEditExerciseDto(body))));
        }

        delete(id: number): void {
          this.exercises.delete(id);
        }

        progress(id: number): ExerciseProgressDto {
          return toExerciseProgress(this.exercises.require(id), this.exercises.progress(id), this.exercises.bestSet(id));
        }
      }
      ```
      The translator runs before the facade in `update`, as it does today, so a bad body is a 400
      even for an unknown id
- [ ] `src/backend/features/exercises/exercise.routes.ts` — imports shrink to `http/http.ts`,
      `http/routing.ts`, `shared/validate.ts`, `ExerciseFacade` (type) and `ExerciseController`.
      The factory builds `const controller = new ExerciseController(exercises);` and every handler
      calls it:
      ```ts
      '/api/exercises': guardAll({
        GET: () => json(controller.list()),
        POST: async (req) => json(controller.create(await readJsonObject(req)), 201),
      }),

      '/api/exercises/:id': guardAll({
        GET: (req) => json(controller.show(pathId(req.params.id, 'exercise'))),

        PATCH: async (req) => {
          const id = pathId(req.params.id, 'exercise');
          return json(controller.update(id, await readJsonObject(req)));
        },

        DELETE: (req) => {
          controller.delete(pathId(req.params.id, 'exercise'));
          return noContent();
        },
      }),

      '/api/exercises/:id/progress': guardAll({
        GET: (req) => json(controller.progress(pathId(req.params.id, 'exercise'))),
      }),
      ```
      `pathId` is still evaluated before `readJsonObject` in `PATCH`, so an invalid id is still
      reported ahead of an invalid body
- [ ] `src/backend/features/exercises/exercises.facade.ts:6-10` — "Routes hold this rather than the
      repository" → controllers hold it; "mapping a row to a DTO is the route's job" → it is the
      controller's job, and the compiler still enforces it
- [ ] `bun run fmt`

**Automated Verification**:

- [ ] `bun run lint` passes, with no error in `exercise.routes.ts`
- [ ] `bun run typecheck` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test src/backend/features/exercises` passes
- [ ] `bun test` passes
- [ ] `git diff --name-only 6f2a5ff -- '*.test.ts'` prints nothing

### Phase 3: WorkoutController and SetController

Dependencies: Phase 1.

**Tasks**:

- [ ] `.oxlintrc.json` — add `"src/backend/features/workouts/*.routes.ts"` to the routes override's
      `files`. Confirm lint reports `workout.routes.ts:3-8` and `set.routes.ts:3-5`
- [ ] Create `src/backend/features/workouts/workout.controller.ts`:
      ```ts
      import type { LiftSetDto, WorkoutDto, WorkoutPageDto, WorkoutWithSetsDto } from '../../../shared/dto';
      import type { SetFacade, WorkoutFacade } from './workouts.facade.ts';
      import { toWorkout, toWorkoutPage, toWorkoutWithSets } from './ports/workout.ts';
      import { toLiftSet } from './ports/set.ts';
      import { fromCreateWorkout, fromEditWorkout } from './internal/workout.mapper.ts';
      import { translateToCreateWorkoutDto, translateToEditWorkoutDto } from './internal/workout.translator.ts';
      import { fromCreateSet } from './internal/set.mapper.ts';
      import { translateToCreateSetDto } from './internal/set.translator.ts';

      export class WorkoutController {
        constructor(
          private readonly workouts: WorkoutFacade,
          private readonly sets: SetFacade,
        ) {}

        list(limit: number, offset: number): WorkoutPageDto {
          return toWorkoutPage(this.workouts.list(limit, offset), this.workouts.count(), limit, offset);
        }

        create(body: Record<string, unknown>): WorkoutWithSetsDto {
          const dto = translateToCreateWorkoutDto(body);
          // `copyFromWorkoutId` belongs to the request but not to `WorkoutInput`.
          const workout = this.workouts.create(fromCreateWorkout(dto), { copyFrom: dto.copyFromWorkoutId });
          return toWorkoutWithSets(workout, this.sets.list(workout.id));
        }

        show(id: number): WorkoutWithSetsDto {
          return toWorkoutWithSets(this.workouts.require(id), this.sets.list(id));
        }

        update(id: number, body: Record<string, unknown>): WorkoutDto {
          return toWorkout(this.workouts.update(id, fromEditWorkout(translateToEditWorkoutDto(body))));
        }

        delete(id: number): void {
          this.workouts.delete(id);
        }

        listSets(id: number): LiftSetDto[] {
          this.workouts.require(id);
          return this.sets.list(id).map(toLiftSet);
        }

        addSet(id: number, body: Record<string, unknown>): LiftSetDto {
          return toLiftSet(this.sets.create(id, fromCreateSet(translateToCreateSetDto(body))));
        }
      }
      ```
      The comment at `workout.routes.ts:25-26` moves here, shortened to the one line above
- [ ] Create `src/backend/features/workouts/set.controller.ts` — `SetController` holding `SetFacade`,
      with `show(id): LiftSetDto` (`toLiftSet(require)`), `update(id, body): LiftSetDto`
      (`toLiftSet(update(id, fromEditSet(translateToEditSetDto(body))))`) and `delete(id): void`
- [ ] `src/backend/features/workouts/workout.routes.ts` — imports shrink to `http/http.ts`,
      `http/routing.ts`, `shared/validate.ts`, the two facade types and `WorkoutController`. The
      factory builds `new WorkoutController(workouts, sets)`. `GET /api/workouts` keeps its
      `queryInt` calls and ends `json(controller.list(limit, offset))`; `POST` is
      `json(controller.create(await readJsonObject(req)), 201)`; `/:id` calls `show` / `update` /
      `delete` + `noContent()`; `/:id/sets` calls `listSets(id)` and
      `json(controller.addSet(id, await readJsonObject(req)), 201)`. Each `pathId` stays before its
      `readJsonObject`
- [ ] `src/backend/features/workouts/set.routes.ts` — the same, with `new SetController(sets)` and
      `show` / `update` / `delete`
- [ ] `src/backend/features/workouts/workouts.facade.ts:7-10` — "Routes hold this rather than the
      repository" → controllers hold it
- [ ] `src/backend/features/workouts/internal/workout.mapper.ts:8` — "so the handler passes it on
      itself" → so `WorkoutController.create` passes it on itself
- [ ] `bun run fmt`

**Automated Verification**:

- [ ] `bun run lint` passes, with no error in `workout.routes.ts` or `set.routes.ts`
- [ ] `bun run typecheck` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test src/backend/features/workouts` passes
- [ ] `bun test` passes
- [ ] `git diff --name-only 6f2a5ff -- '*.test.ts'` prints nothing

### Phase 4: StaticController, and the rule over every route file

Dependencies: Phases 1–3.

**Tasks**:

- [ ] `.oxlintrc.json` — replace the first override (repository-only, `features/**/*.routes.ts`) and
      the per-file routes override with a single entry: `files`
      `["src/backend/features/**/*.routes.ts"]`, group
      `["**/internal/**", "**/ports/**", "**/*.repository.ts"]`, message "Route handlers map requests
      and responses through their controller." Keep the controllers override. Confirm lint now
      reports exactly `static.routes.ts:11` and `:12`
- [ ] `src/backend/features/static/internal/transpile.ts` — `transpileModule(path)` returns
      `Promise<string | null>`: the code on success; on a transform error it keeps its
      `console.error` line and returns `null`. The `basename` import goes; the header comment's
      "Serves the TypeScript frontend" becomes "Turns the TypeScript frontend into". The doc comment
      at `:17-20` ("resolved inside `src/frontend/` by the caller, which is where the traversal guard
      lives") becomes: resolved inside `src/frontend/` by `StaticController`, through the traversal
      guard in `paths.ts`
- [ ] Create `src/backend/features/static/static.controller.ts`:
      ```ts
      import type { BunFile } from 'bun';
      import { basename, extname, resolve } from 'node:path';
      import { FRONTEND_DIR, VENDOR_FILES, resolveStaticPath, resolveVendorPath } from './internal/paths.ts';
      import { transpileModule } from './internal/transpile.ts';

      export type VendorResult = { kind: 'file'; file: BunFile } | { kind: 'uninstalled' } | { kind: 'missing' };

      export type FrontendResult =
        | { kind: 'file'; file: BunFile }
        | { kind: 'module'; code: string }
        | { kind: 'untranspilable'; name: string }
        | { kind: 'missing' };

      export class StaticController {
        vendorUrls(): string[] {
          return Object.keys(VENDOR_FILES);
        }

        async vendor(pathname: string): Promise<VendorResult> {
          const vendor = resolveVendorPath(pathname);
          if (!vendor) {
            return { kind: 'missing' };
          }
          const file = Bun.file(vendor);
          return (await file.exists()) ? { kind: 'file', file } : { kind: 'uninstalled' };
        }

        async frontend(pathname: string): Promise<FrontendResult> {
          const resolved = resolveStaticPath(pathname);
          if (!resolved) {
            return { kind: 'missing' };
          }

          const isDirectory = pathname === '/' || pathname.endsWith('/');
          const candidate = isDirectory ? resolve(resolved, 'index.html') : resolved;

          const file = Bun.file(candidate);
          if (await file.exists()) {
            if (extname(candidate) !== '.ts') {
              return { kind: 'file', file };
            }
            const code = await transpileModule(candidate);
            return code === null ? { kind: 'untranspilable', name: basename(candidate) } : { kind: 'module', code };
          }

          // A trailing slash asked for a directory index that is not there, so it is a miss, not a route.
          if (extname(pathname) === '' && !isDirectory) {
            const index = Bun.file(resolve(FRONTEND_DIR, 'index.html'));
            if (await index.exists()) {
              return { kind: 'file', file: index };
            }
          }
          return { kind: 'missing' };
        }
      }
      ```
      Both union aliases pass `typescript/consistent-type-definitions`, and `StaticController` and
      `MetaController` pass `no-extraneous-class` (measured in a scratch copy)
- [ ] `src/backend/features/static/static.routes.ts` — imports shrink to `http/routing.ts` and
      `StaticController` (plus `type VendorResult` / `FrontendResult` if a helper names them).
      `staticRoutes()` builds `const controller = new StaticController();`. `serveVendor` and
      `serveFrontend` stay module-level functions and take the controller as their first
      parameter; the route map binds them with explicitly typed arrows —
      `(req: Request): Promise<Response> => serveVendor(controller, req)` — because an untyped arrow
      inside `Object.fromEntries` fails `explicit-function-return-type`. The route keeps every
      `Response`, built with an if-chain on `result.kind` (see decision 6):
      ```ts
      async function serveVendor(controller: StaticController, req: Request): Promise<Response> {
        const result = await controller.vendor(new URL(req.url).pathname);
        if (result.kind === 'missing') {
          // The specifier would not resolve: the package is not installed.
          return new Response('Not found', { status: 404 });
        }
        if (result.kind === 'uninstalled') {
          return new Response('Vendor stylesheet missing — run `bun install`', { status: 500 });
        }
        // Versioned by the lockfile rather than the URL, but it only changes on install.
        return new Response(result.file, {
          headers: { 'Content-Type': 'text/css;charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      ```
      `serveFrontend(controller, req)` keeps the 405 check first, then narrows
      `await controller.frontend(new URL(req.url).pathname)`: `missing` → `new Response('Not found',
      { status: 404 })`; `untranspilable` → ``new Response(`Could not transpile ${result.name}`,
      { status: 500 })``; `module` → `new Response(result.code, { headers: { 'Content-Type':
      'text/javascript;charset=utf-8', 'Cache-Control': 'no-cache' } })` under the "TypeScript on
      disk and JavaScript on the wire" comment (today at `:58`); and finally `file` →
      `new Response(result.file, { headers: { 'Cache-Control': 'no-cache' } })` under the comment on
      Bun's MIME inference (today at `:62-66`). The header comment (`:1-9`) stays. The SPA-fallback
      comment (`:70-71`) moves to the controller, and the "Today's 404" wording at `:27` loses
      "Today's", which described a behaviour that no longer needs defending
- [ ] `docs/backend.md` — describe the controller layer, now that it covers every route file:
      - lines 3-5: a feature owns "its routes, its SQL and its mapping" — the mapping is reached
        through its controllers
      - lines 19-22: the feature root holds a third kind of module, `<x>.controller.ts`, one per
        route file and named after it
      - lines 24-26: the request line becomes route (HTTP) → controller
        (`translateTo<X>Dto → from<X> → facade → to<X>`) → route (`json`), and say which half owns
        which
      - lines 28-34: "a route returns a DTO, never a row" becomes "a controller returns a DTO, never
        a row"; the rest of the paragraph (every field named, no spreads, the camelCase rename) stays
      - lines 36-39: the static feature's private modules are called from `static.controller.ts`
      - lines 52-66: a route handler holds a controller, and the controller holds the facades; the
        sentence "if a composition like `GET /api/workouts/:id` ever wants pushing down out of its
        handler, the facade is where it goes" becomes: composition across facades lives in the
        controller, and the facade is where it goes if it ever needs to move further down; the
        sentence at lines 64-66 ("a handler still maps what the facade returns") says the controller
        maps it. Replace the lint sentence with both overrides — no `*.routes.ts`, `static.routes.ts`
        included, may reach `internal/`, `ports/` or a repository; no controller may reach `http/`
        or a repository — and say that route factories build their own controller from the facades
        `allRoutes` hands them, and that meta and static have controllers but no facade
      - lines 76-78: handlers *and controllers* throw `HttpError`; `guardAll` in the route converts
      - lines 88-92: "if a handler finds itself sequencing two writes, the sequence belongs in the
        repository" → if a *controller* does; likewise "the route files never open a transaction"
        covers controllers too
      - lines 121-126, "Static serving is deliberately narrow": the controller decides what is
        served — path-escape guard, vendor allowlist, directory index, SPA fallback, transpiling —
        and `static.routes.ts` turns that into a `Response`
      - lines 127-137, "Two things `static.routes.ts` deliberately does not do": the first point is
        no longer literally true, because the route now also sets `text/javascript;charset=utf-8` on
        transpiled modules (formerly set inside `transpile.ts`). Reword it to: it sets a
        `Content-Type` only on responses whose body is not a file on disk with a telling extension —
        the vendor stylesheet and transpiled modules — and otherwise leaves `new Response(Bun.file(x))`
        to infer it. The HEAD point and the 405 ownership stay as they are
- [ ] `AGENTS.md:31-39` — the architecture paragraph: beside the facade at the feature root sit the
      `*.controller.ts` files, one per route file, which translate the body, call the facades and
      map rows to DTOs; a route handler holds only its controller; `bun run lint` fails if a route
      reaches `internal/`, `ports/` or a repository, or a controller reaches `http/` or a
      repository. `CLAUDE.md` is a symbolic link to `AGENTS.md` and needs no separate edit
- [ ] `bun run fmt`

**Automated Verification**:

- [ ] `bun run lint` passes, and `.oxlintrc.json` has exactly two `overrides` entries
- [ ] `bun run typecheck` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test src/backend/features/static` passes — covering the vendor stylesheet, HEAD, 405,
      path escapes, the SPA fallback, `.ts` transpiling and the untranspilable-module 500
- [ ] `bun test` passes
- [ ] `git diff --name-only 6f2a5ff -- '*.test.ts'` prints nothing
- [ ] `git grep -lE "from '\./(internal|ports)/" -- 'src/backend/features/**/*.routes.ts'` prints nothing
- [ ] `git grep --untracked -l "http/" -- 'src/backend/features/**/*.controller.ts'` prints nothing
- [ ] `git grep -lE "route's job|handler still maps|handler passes it on|if a handler finds itself" -- src docs/backend.md AGENTS.md` prints nothing
- [ ] `git ls-files --cached --others --exclude-standard -- 'src/backend/features/**/*.controller.ts'` lists exactly six files:
      `exercises/exercise.controller.ts`, `workouts/workout.controller.ts`,
      `workouts/set.controller.ts`, `stats/stats.controller.ts`, `meta/meta.controller.ts`,
      `static/static.controller.ts`

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-12-handler-construction-and-data-flow.md` — the five stages of a
  handler, per-route handler shapes, and the error path
- `docs/agents/plans/2026-09-12-feature-facades.md` — the facade layer the controllers call, and the
  first `overrides` entry this plan folds into its routes rule
- `docs/backend.md:24-34` — the request flow and "a route returns a DTO, never a row"
- `docs/backend.md:52-74` — the facade paragraph this plan rewrites
- `docs/backend.md:121-137` — static serving
- `.oxlintrc.json:129-146` — the existing override
- oxlint 1.82.0, measured against commit `6f2a5ff`: the routes pattern reports the fifteen imports
  under Current State; `**/http/**` matches `../../http/*.ts`; a later `overrides` entry replaces an
  earlier one's `no-restricted-imports` for a file both match
