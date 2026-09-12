---
date: 2026-09-12T21:43:40+02:00
git_commit: 6f2a5ffd8f977e03197b60075555b3b1cfd500d0
branch: main
repository: dhardtke/gainz
topic: 'How handlers are built, and how data flows from the request body into them, into the facade and out again'
tags: [research, codebase, backend, routes, handlers, facades, translators, mappers, dto, http]
status: complete
---

# Research: How handlers are built, and how data flows from the request body through the facade and back

## Research Question

How are route handlers built, and how does data flow from the request body into a handler, from the
handler into the feature's facade, and out again as a response?

## Summary

A handler is a closure inside a **route factory** — `workoutRoutes(workouts, sets)`,
`setRoutes(sets)`, `exerciseRoutes(exercises)`, `statsRoutes(stats)`, `metaRoutes()`,
`staticRoutes()` — that returns a partial Bun `RouteTable`. Each URL key maps to an object of HTTP
methods, wrapped in `guardAll()`, which turns any thrown `HttpError` into a JSON error response. The
facades a factory closes over are built once by `createFacades(db)` (the composition root), passed
into `serveOptions(facades)` and unpacked in `allRoutes(facades)`, which hands each factory only the
facades it uses.

Inside an API handler that takes a body, the data passes through the same five stages every time,
each owned by a differently-named function:

| Stage | Function | Input → Output | Lives in |
|---|---|---|---|
| 1. parse | `readJsonObject(req)` | `Request` → `Record<string, unknown>` | `http/http.ts` |
| 2. translate (validate) | `translateTo<X>Dto(body)` | `Record<string, unknown>` → camelCase request DTO | `features/<f>/internal/*.translator.ts` |
| 3. map in | `from<X>(dto)` | request DTO → snake_case `<X>Input` / `Partial<<X>Input>` | `features/<f>/internal/*.mapper.ts` |
| 4. call facade | `facade.create/update(...)` | `<X>Input` → snake_case row | `features/<f>/<f>.facade.ts` → `internal/*.repository.ts` |
| 5. map out | `to<X>(row)` then `json(dto, status)` | row → camelCase response DTO → `Response` | `features/<f>/ports/*.ts`, `http/http.ts` |

Path and query values skip stages 1–3: `pathId(req.params.id, what)` and `queryInt(params, …)` from
`shared/validate.ts` turn them straight into numbers that are passed to the facade. Failure never
flows back as a value — validators, translators and repositories *throw* `HttpError`s, which
`guard()` catches.

### Key files

```
src/
├── backend/
│   ├── main.ts                          composition: openDatabase → createFacades → serveOptions → Bun.serve
│   ├── testing.ts                       same composition over :memory: for tests
│   ├── http/
│   │   ├── server.ts                    serveOptions(facades): { routes, error }
│   │   ├── routes.ts                    allRoutes(facades): spreads every feature's RouteTable
│   │   ├── routing.ts                   RouteTable, ParamRequest, Handler, guard, guardAll
│   │   ├── http.ts                      json, noContent, readJsonObject
│   │   └── errors.ts                    HttpError, badRequest/notFound/conflict, errorResponse
│   ├── shared/
│   │   └── validate.ts                  requiredString/Int/Number/Date, optionalString, isPresent, pathId, queryInt, today
│   ├── db/
│   │   └── sql.ts                       buildUpdate, isUniqueViolation, isForeignKeyViolation
│   └── features/
│       ├── facades.ts                   Facades interface, createFacades(db)
│       ├── exercises/
│       │   ├── exercise.routes.ts       /api/exercises, /:id, /:id/progress
│       │   ├── exercises.facade.ts      ExerciseFacade, createExerciseFacade
│       │   ├── ports/exercise.ts        row types + toExercise/toExerciseWithStats/toExerciseProgress
│       │   └── internal/                exercise.translator.ts, exercise.mapper.ts, exercise.repository.ts
│       ├── workouts/
│       │   ├── workout.routes.ts        /api/workouts, /:id, /:id/sets
│       │   ├── set.routes.ts            /api/sets/:id
│       │   ├── workouts.facade.ts       WorkoutFacade, SetFacade, createWorkoutFacades
│       │   ├── ports/workout.ts, set.ts row types + to* mappers
│       │   └── internal/                workout/set .translator.ts, .mapper.ts, .repository.ts
│       ├── stats/
│       │   ├── stats.routes.ts          /api/stats/summary
│       │   ├── stats.facade.ts          StatsFacade
│       │   └── ports/stats.ts           Summary + toSummary
│       ├── meta/meta.routes.ts          /api/health, /api and /api/* 404
│       └── static/static.routes.ts      vendor CSS + /* frontend (bare handlers, no guard)
└── shared/dto/                          types-only wire contract: Create*/Edit* request DTOs, *Dto responses, ErrorDto
```

### One request, end to end — `PATCH /api/sets/:id`

```
HTTP PATCH /api/sets/7   body: {"reps":"8","notes":"  "}
   │
   ▼  Bun router (routes from allRoutes → setRoutes)            http/routes.ts:26
guard(handler)  ── try { … } catch → errorResponse(err) ──────  http/routing.ts:12-20
   │
   ▼  handler closure over `sets: SetFacade`                    set.routes.ts:15-19
pathId(req.params.id, 'set')           "7"  → 7                shared/validate.ts:81
readJsonObject(req)                    JSON → { reps:"8", notes:"  " }            http/http.ts:20
translateToEditSetDto(body)            → EditSetDto { reps: 8, notes: null }      set.translator.ts:14
fromEditSet(dto)                       → Partial<SetInput> { reps: 8, notes: null } set.mapper.ts:14
sets.update(7, patch)                  SetFacade → SetRepository.update           workouts.facade.ts:60
   │                                     require(7) → buildUpdate('sets', FIELDS, patch)
   │                                     UPDATE sets SET reps = ?, notes = ? WHERE id = ?
   │                                     require(7) → LiftSet row (snake_case)     set.repository.ts:86-101
   ▼
toLiftSet(row)                         → LiftSetDto (camelCase)                   ports/set.ts:15
json(dto)                              → Response 200 application/json            http/http.ts:3
```

## Detailed Findings

### 1. Handler types and the guard

- `RouteTable` is `Bun.Serve.Routes<undefined, string>` (`src/backend/http/routing.ts:4`).
- `ParamRequest` is `Request & { params: Record<string, string | undefined> }`
  (`routing.ts:7`); `Handler` is `(req: ParamRequest) => Response | Promise<Response>` (`routing.ts:9`).
  Handlers that ignore the request are written with no parameter (`() => json(...)`).
- `guard(handler)` returns an `async` handler that awaits the original inside `try` and returns
  `errorResponse(err)` from `catch` (`routing.ts:12-20`). Because it `await`s, both synchronous
  throws and rejected promises are caught.
- `guardAll(handlers)` maps a `{ GET, POST, … }` record through `guard` with
  `Object.fromEntries(Object.entries(...))` (`routing.ts:22-24`). Every `/api` route in the
  features uses it; the method record is the value Bun receives for that URL key.
- `metaRoutes` uses `guard` directly for the bare-function `/api` and `/api/*` catch-alls, which
  return `errorResponse(notFound('Endpoint'))` (`features/meta/meta.routes.ts:27-33`).
- `staticRoutes` handlers (`serveVendor`, `serveFrontend`) are plain functions, not guarded, and
  build `Response`s themselves (`features/static/static.routes.ts:15-79`). Anything that escapes
  them reaches Bun.serve's `error` option, which also calls `errorResponse`
  (`http/server.ts:19`).

### 2. How a handler gets its facade

- `createFacades(db)` is the composition root: it calls `createExerciseFacade(db)`,
  `createWorkoutFacades(db)` (spread, yielding `workouts` and `sets`) and `createStatsFacade(db)`
  and returns the `Facades` object (`features/facades.ts:11-28`).
- Each feature factory constructs its repository and wraps it: `new ExerciseFacade(new
  ExerciseRepository(db))` (`exercises.facade.ts:43-45`), `new StatsFacade(new StatsRepository(db))`
  (`stats.facade.ts:17-19`). `createWorkoutFacades` builds one `WorkoutRepository` and gives it both
  to `WorkoutFacade` and, as a constructor argument, to `SetRepository`
  (`workouts.facade.ts:74-80`).
- Callers of `createFacades`: `main.ts:12` (`Bun.serve({ port, ...serveOptions(createFacades(db)) })`)
  and `testing.ts:40` (same over `openDatabase(':memory:')`, per test).
- `serveOptions(facades)` returns `{ routes: allRoutes(facades), error }` (`http/server.ts:16-21`).
- `allRoutes(facades)` spreads `metaRoutes()`, `statsRoutes(facades.stats)`,
  `exerciseRoutes(facades.exercises)`, `workoutRoutes(facades.workouts, facades.sets)`,
  `setRoutes(facades.sets)`, `staticRoutes()` into one table (`http/routes.ts:20-29`).
- Route factories receive facades as parameters and the handlers close over them; there is no
  `db` or repository in scope in any `*.routes.ts`. `.oxlintrc.json:129-146` applies
  `no-restricted-imports` with the pattern `**/*.repository.ts` to
  `src/backend/features/**/*.routes.ts`, with the message "Route handlers reach the database
  through their feature's facade."
- Route files do import from their feature's `internal/` — translators and mappers — and from
  `ports/` for the `to*` functions (`workout.routes.ts:1-11`, `exercise.routes.ts:1-8`).

### 3. Stage 1 — reading the body

`readJsonObject(req)` (`http/http.ts:20-31`):

- calls `req.json()`; a parse failure throws `badRequest('Request body must be valid JSON')`;
- checks the result with the type guard `isJsonObject` (non-null object, not an array,
  `http.ts:16-18`); otherwise throws `badRequest('Request body must be a JSON object')`;
- returns `Record<string, unknown>` — the only type the translators accept.

It is called inline in every body-taking handler: `POST /api/workouts`, `PATCH /api/workouts/:id`,
`POST /api/workouts/:id/sets`, `PATCH /api/sets/:id`, `POST /api/exercises`,
`PATCH /api/exercises/:id`.

### 4. Stage 2 — translators: unknown body → request DTO

Translators live in `internal/*.translator.ts`, are named `translateTo<Create|Edit><X>Dto`, and
return the types declared in `src/shared/dto/` (`CreateWorkoutDto`, `EditSetDto`, …). They are
built entirely from `shared/validate.ts` helpers, each of which reads one field and throws a
`badRequest` naming it:

| Helper | Behaviour (`shared/validate.ts`) |
|---|---|
| `isPresent(body, f)` | own property and not `undefined` (`:9-11`) |
| `requiredString(body, f, max=200)` | non-empty after trim, returns trimmed, length-bounded (`:13-23`) |
| `optionalString(body, f, max=2000)` | `undefined`/`null`/blank → `null`, else trimmed and bounded (`:26-42`) |
| `requiredInt(body, f, {min,max})` | accepts number or numeric string; integer within range (`:44-58`) |
| `requiredNumber(body, f, {min,max})` | number or numeric string; finite, in range; rounded to 2 decimals (`:60-71`) |
| `requiredDate(body, f)` | `requiredString` max 10 + `YYYY-MM-DD` regex + `Date.parse` (`:73-79`) |
| `MAX_NAME = 120`, `MAX_NOTES = 2000` | shared length bounds (`:6-7`) |

Two shapes recur:

- **Create translators** return an object literal. Required fields call a `required*` helper;
  optional fields either call `optionalString` (so an absent field becomes `null`) or are added by a
  conditional spread `...(isPresent(body, 'x') ? { x: requiredInt(...) } : {})` so the key is
  absent when the body lacks it (`workout.translator.ts:4-11`, `set.translator.ts:4-12`,
  `exercise.translator.ts:4-10`).
- **Edit translators** start from `{}` and assign each field only `if (isPresent(body, field))`,
  so the DTO carries exactly the keys the body carried; a present `null` in a string field
  survives as `null` (`workout.translator.ts:13-25`, `set.translator.ts:14-32`,
  `exercise.translator.ts:12-24`).

Keys in the body that no translator reads are dropped here; nothing downstream sees them.

### 5. Stage 3 — mappers: request DTO → repository input

Mappers live in `internal/*.mapper.ts`, are named `from<Create|Edit><X>`, and return the
snake_case input type exported by the repository (`WorkoutInput`, `SetInput`, `ExerciseInput`).

- Create mappers rename fields and supply defaults with `??`: `muscle_group: dto.muscleGroup ??
  null` (`exercise.mapper.ts:4-10`); `performed_on: dto.performedOn ?? today()`
  (`workout.mapper.ts:10-16`) — the one mapper that reads the clock; `fromCreateSet` keeps
  `position` absent when the DTO has none (`set.mapper.ts:4-12`).
- Edit mappers copy each field only `if (dto.x !== undefined)`, returning `Partial<<X>Input>`
  (`workout.mapper.ts:18-30`, `set.mapper.ts:14-32`, `exercise.mapper.ts:12-24`).
- `CreateWorkoutDto.copyFromWorkoutId` is not mapped: the handler passes it as the separate
  `{ copyFrom: dto.copyFromWorkoutId }` options argument (`workout.routes.ts:23-29`,
  `workout.mapper.ts:5-9`).

### 6. Stage 4 — the facade and the repository behind it

- Facades are classes holding one repository in a `private readonly` constructor field; every
  method forwards one-to-one with the same arguments and return type (`exercises.facade.ts:11-41`,
  `workouts.facade.ts:11-67`, `stats.facade.ts:9-15`). The repository's nullable `get()` is not
  exposed; routes see `require()`, which returns the row or throws `notFound`.
- Facade methods accept the repository input types (`WorkoutInput`, `Partial<SetInput>`, …) and
  return **rows** — the snake_case interfaces in `ports/` (`Workout`, `WorkoutWithStats`, `LiftSet`,
  `Exercise`, `SessionPoint`, `Summary`). The facade does no DTO mapping; the
  `ExerciseFacade` doc comment states that mapping is the route's job (`exercises.facade.ts:6-10`).
- Repositories run the SQL and raise the failure statuses:
  - `require(id)` throws `notFound('Workout' | 'Set' | 'Exercise')` (`workout.repository.ts:42-48`,
    `set.repository.ts:46-52`, `exercise.repository.ts:41-47`);
  - `update(id, patch)` calls `require`, builds `UPDATE <table> SET … WHERE id = ?` with
    `buildUpdate(table, FIELDS, patch)` — columns from the hard-coded `FIELDS` tuple, membership by
    `in` so an explicit `null` clears a column, `null` returned for an empty patch (`db/sql.ts:30-51`)
    — runs it if non-null, then returns `require(id)` again;
  - unique violations become `conflict(...)` (`exercise.repository.ts:61-66`, `:76-81`); foreign-key
    violations on `exercise_id` become `badRequest('"exerciseId" must name an existing exercise')`
    (`set.repository.ts:78-83`, `:93-98`); deleting a used exercise throws `conflict`
    (`exercise.repository.ts:86-93`);
  - `WorkoutRepository.create` runs the insert and optional set copy in one `db.transaction`,
    requiring `copyFrom` first (`workout.repository.ts:55-84`); `SetRepository.create` requires the
    workout, computes `position` when absent, inserts, and re-reads the joined row
    (`set.repository.ts:58-84`).

### 7. Stage 5 — rows back out to the wire

- `ports/*.ts` next to each row interface export `to<X>` functions that list every DTO field
  explicitly, renaming snake_case to camelCase (`ports/workout.ts:19-49`, `ports/set.ts:15-36`,
  `ports/exercise.ts:29-71`, `ports/stats.ts:19-30`).
- Composite responses are assembled from more than one facade call in the handler and a composing
  mapper:
  - `toWorkoutPage(workouts.list(limit, offset), workouts.count(), limit, offset)`
    (`workout.routes.ts:16-21`, `ports/workout.ts:47-49`);
  - `toWorkoutWithSets(workout, sets.list(workout.id))` for `POST /api/workouts` and
    `GET /api/workouts/:id` (`workout.routes.ts:27-28`, `:35`; `ports/workout.ts:43-45`);
  - `toExerciseProgress(exercises.require(id), exercises.progress(id), exercises.bestSet(id))`
    (`exercise.routes.ts:33-36`, `ports/exercise.ts:65-71`), which uses `toBestSet` from the
    workouts feature's ports (`ports/set.ts:34-36`).
- `json(data, status = 200, headers = {})` wraps `Response.json` (`http/http.ts:3-5`); handlers pass
  `201` on creation. `noContent()` returns an empty `204` for every `DELETE`
  (`http/http.ts:7-9`), after the facade's `delete` — which throws `notFound` for an unknown id.
- `GET /api/workouts/:id/sets` calls `workouts.require(id)` purely for the 404 before listing
  (`workout.routes.ts:51-55`).

### 8. The error path

- `HttpError(status, message, details?)` (`http/errors.ts:5-14`) with factories `badRequest`
  (400, optional `details`), `notFound(what)` (404, `"<what> not found"`), `conflict` (409)
  (`errors.ts:16-18`).
- `errorResponse(err)` produces `json({ error, details }, err.status)` typed as `ErrorDto` for an
  `HttpError`; anything else is logged with `console.error` and answered
  `json({ error: 'Internal server error' }, 500)` (`errors.ts:20-28`, `shared/dto/error.ts:6-9`).
- Throw sites by stage: `readJsonObject` (1), every validate helper used by translators and
  `pathId`/`queryInt` (2), repositories (4). Mappers (3) and `to*` functions (5) do not throw.

### 9. Handler shapes, per route

| Route | Method | Handler body (abridged) |
|---|---|---|
| `/api/health` | GET | `json({ status: 'ok', app: 'gainz' })` |
| `/api/stats/summary` | GET | `json(toSummary(stats.summary()))` |
| `/api/exercises` | GET | `json(exercises.list().map(toExerciseWithStats))` |
| `/api/exercises` | POST | `json(toExercise(exercises.create(fromCreateExercise(translateToCreateExerciseDto(await readJsonObject(req))))), 201)` |
| `/api/exercises/:id` | GET / PATCH / DELETE | `pathId` → `require` / translate+map+`update` / `delete` + `noContent()` |
| `/api/exercises/:id/progress` | GET | three facade calls → `toExerciseProgress` |
| `/api/workouts` | GET | `queryInt` limit (1–200, default 50) and offset (0–100000, default 0) → `toWorkoutPage` |
| `/api/workouts` | POST | translate → `create(fromCreateWorkout(dto), { copyFrom })` → `toWorkoutWithSets(…, sets.list(id))`, 201 |
| `/api/workouts/:id` | GET / PATCH / DELETE | `toWorkoutWithSets(require, sets.list)` / `toWorkout(update(...))` / `delete` + 204 |
| `/api/workouts/:id/sets` | GET / POST | `require` then `sets.list(id).map(toLiftSet)` / `toLiftSet(sets.create(id, fromCreateSet(translate…)))`, 201 |
| `/api/sets/:id` | GET / PATCH / DELETE | `toLiftSet(require)` / `toLiftSet(update(id, fromEditSet(translate…)))` / `delete` + 204 |

Handlers are written either as one expression (the one-line `POST /api/exercises`, `GET
/api/sets/:id`) or as a block with named intermediates `id`, `patch`, `dto`, `workout`.

## Code References

- `src/backend/http/routing.ts:4-24` — `RouteTable`, `ParamRequest`, `Handler`, `guard`, `guardAll`
- `src/backend/http/http.ts:3-31` — `json`, `noContent`, `isJsonObject`, `readJsonObject`
- `src/backend/http/errors.ts:5-28` — `HttpError`, error factories, `errorResponse`
- `src/backend/http/routes.ts:20-29` — `allRoutes(facades)`
- `src/backend/http/server.ts:16-21` — `serveOptions(facades)`
- `src/backend/features/facades.ts:11-28` — `Facades`, `createFacades(db)`
- `src/backend/main.ts:12`, `src/backend/testing.ts:40` — composition call sites
- `src/backend/shared/validate.ts:9-103` — field validators, `pathId`, `queryInt`, `today`
- `src/backend/features/workouts/workout.routes.ts:13-63` — workout and nested set handlers
- `src/backend/features/workouts/set.routes.ts:10-27` — set handlers
- `src/backend/features/exercises/exercise.routes.ts:10-39` — exercise handlers
- `src/backend/features/stats/stats.routes.ts:7-13` — summary handler
- `src/backend/features/meta/meta.routes.ts:6-33` — health and `/api` 404 handlers
- `src/backend/features/*/internal/*.translator.ts` — body → request DTO
- `src/backend/features/*/internal/*.mapper.ts` — request DTO → repository input
- `src/backend/features/workouts/workouts.facade.ts:11-80` — `WorkoutFacade`, `SetFacade`, factory
- `src/backend/features/exercises/exercises.facade.ts:11-45` — `ExerciseFacade`, factory
- `src/backend/features/stats/stats.facade.ts:9-19` — `StatsFacade`, factory
- `src/backend/features/*/internal/*.repository.ts` — SQL, `require`, constraint → `HttpError`
- `src/backend/db/sql.ts:30-51` — `buildUpdate`
- `src/backend/features/*/ports/*.ts` — row interfaces and `to*` response mappers
- `src/shared/dto/index.ts:14-18` — the types-only wire contract
- `.oxlintrc.json:129-146` — the lint rule forbidding repository imports in `*.routes.ts`

## Architecture Documentation

- **Three shapes, three namings.** A value is `Record<string, unknown>` straight off the wire, a
  camelCase DTO from `src/shared/dto/` once translated, a snake_case `<X>Input` once mapped, and a
  snake_case row once returned; it becomes a camelCase response DTO again only through a `to*`
  function. The function prefix tells the direction: `translateTo…Dto` (untrusted → DTO),
  `from…` (DTO → input), `to…` (row → DTO).
- **Composition inside the handler.** The handler is where the stages are chained; neither
  translators, mappers, facades nor `to*` functions call one another across stages (the exception
  being composing `to*` functions such as `toWorkoutWithSets` calling `toLiftSet`).
- **Constructor injection by parameter.** Facades are created once by `createFacades(db)` and
  threaded as function arguments through `serveOptions` → `allRoutes` → route factory → handler
  closure.
- **Facades are pass-throughs over repository types.** They narrow what routes can reach (no
  `get()`, no repository class) without changing argument or return types.
- **Errors as exceptions.** Every stage that can reject input throws an `HttpError`; `guardAll`
  on each route is the single conversion point to an `ErrorDto` response, with Bun.serve's `error`
  option as the fallback for unguarded code.
- **Partial updates** are carried by key presence end to end: `isPresent` in the translator,
  `!== undefined` in the mapper, `in` in `buildUpdate`.

## Open Questions

- None arising from the question as asked. The frontend side of the flow (how `src/frontend/`
  builds these request bodies and reads the DTOs) was not part of this research.
