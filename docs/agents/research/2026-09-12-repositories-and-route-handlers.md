---
date: 2026-09-12T18:59:30+00:00
git_commit: 89659b29769e8947b0080a386e0aea89eb29e4f8
branch: main
topic: 'The interaction between repositories and route handlers'
tags: [research, codebase, backend, routes, repositories, dto, http]
status: complete
---

# Research: The interaction between repositories and route handlers

## Research Question

How do repositories and route handlers interact in the backend — how does a handler get hold of a
repository, what does each side do with the request, and where does the boundary between them fall?

## Summary

A repository reaches a handler as a **constructor argument to a route factory**, and nothing else.
There is no container, no facade, no module-level singleton and no `db` in scope inside a handler.
Four composition roots (`main.ts`, `testing.ts`, `src/scripts/seed.ts`, `http/server.test.ts`) open
a database, build the four repositories, and pass them as one `Repositories` parameter object into
`serveOptions(repos)`; `allRoutes(repos)` then unpacks that object and hands each route factory only
the repositories it uses — `workoutRoutes(repos.workouts, repos.sets)`, `exerciseRoutes(repos.exercises)`,
`statsRoutes(repos.stats)`, while `metaRoutes()` and `staticRoutes()` take nothing. Each factory
returns a partial `RouteTable` whose handlers are closures over those repositories.

Inside a handler the division of labour is fixed:

- the **handler** parses the URL (`pathId`, `queryInt`), reads and validates the body
  (`readJsonObject` → `translateTo<X>Dto`), renames DTO fields to column names (`from<X>`), calls one
  or two repository methods, maps the returned row(s) back to DTOs (`to<X>`) and picks the success
  status (200 / 201 / 204);
- the **repository** owns every SQL statement, every transaction, and — notably — the *failure*
  statuses. `require()` throws `notFound`, a duplicate name throws `conflict`, a broken foreign key
  is caught and rethrown as `badRequest`. Handlers never test for absence or build an error response.

Errors therefore travel upward as exceptions: `guardAll()` wraps every method of an API route, and
`HttpError` thrown anywhere below it — validator, translator or repository — becomes a JSON
`{ error, details? }` body with the carried status.

The types cross the same boundary in both directions. A repository's **input** type
(`WorkoutInput`, `SetInput`, `ExerciseInput`) is declared beside it in `internal/`; its **return**
type (`Workout`, `LiftSet`, `Exercise`, `Summary`) is declared in the feature's `ports/` next to the
`to*` mapper that turns it into a DTO. So the handler can name what it passes in and what it gets
back without ever importing from another feature's `internal/`.

```
src/
├── backend/
│   ├── main.ts                      composition root: opens DB, builds the 4 repositories
│   ├── testing.ts                   test composition root (useServer(), in-memory DB)
│   ├── db/
│   │   ├── db.ts                    openDatabase() → DB (bun:sqlite Database)
│   │   └── sql.ts                   buildUpdate, isUniqueViolation, isForeignKeyViolation
│   ├── http/
│   │   ├── routes.ts                Repositories interface + allRoutes(repos)
│   │   ├── routing.ts               RouteTable, Handler, guard, guardAll
│   │   ├── http.ts                  json(), noContent(), readJsonObject()
│   │   ├── errors.ts                HttpError, badRequest/notFound/conflict, errorResponse
│   │   └── server.ts                serveOptions(repos)
│   ├── shared/validate.ts           pathId, queryInt, requiredString, requiredInt, …
│   └── features/
│       ├── exercises/
│       │   ├── exercise.routes.ts           exerciseRoutes(exercises)
│       │   ├── ports/exercise.ts            Exercise rows + toExercise/toExerciseWithStats/…
│       │   └── internal/
│       │       ├── exercise.repository.ts   ExerciseRepository + ExerciseInput
│       │       ├── exercise.mapper.ts       fromCreateExercise / fromEditExercise
│       │       └── exercise.translator.ts   translateToCreateExerciseDto / …EditExerciseDto
│       ├── workouts/
│       │   ├── workout.routes.ts            workoutRoutes(workouts, sets)
│       │   ├── set.routes.ts                setRoutes(sets)
│       │   ├── ports/{workout.ts,set.ts,sql.ts}
│       │   └── internal/{workout,set}.{repository,mapper,translator}.ts
│       ├── stats/{stats.routes.ts, ports/stats.ts, internal/stats.repository.ts}
│       ├── meta/meta.routes.ts               no repository
│       └── static/static.routes.ts           no repository, deliberately unguarded
└── shared/dto/                       the wire contract, types only
```

The wiring, end to end:

```
main.ts / testing.ts / seed.ts / server.test.ts
  openDatabase(path) ─────────────► DB
  new WorkoutRepository(db)
  new SetRepository(db, workouts)          ┐
  new ExerciseRepository(db)               ├─► { exercises, workouts, sets, stats } : Repositories
  new StatsRepository(db)                  ┘             │
                                                         ▼
                                     serveOptions(repos) → { routes: allRoutes(repos), error }
                                                         │
                       ┌─────────────────────────────────┴───────────────────────────┐
                       ▼                    ▼                    ▼                   ▼
            exerciseRoutes(exercises)  workoutRoutes(workouts, sets)  setRoutes(sets)  statsRoutes(stats)
                       │                    │                    │                   │
                       └──────────── handlers close over the repositories ───────────┘
```

And one request through it (`PATCH /api/sets/:id`):

```
request
  │ Bun matches '/api/sets/:id' → guard(PATCH)
  ▼
pathId(req.params.id, 'set')            shared/validate.ts   → 400 on a non-id
readJsonObject(req)                     http/http.ts         → 400 on non-JSON / non-object
translateToEditSetDto(body)             internal/            → 400 on a bad field   ─┐
fromEditSet(dto)                        internal/            camelCase → snake_case  │ throws
sets.update(id, patch)                  internal/repository  → 404 / 400 (FK)        │ HttpError
  ├ require(id) ─ SELECT … ─ throws notFound if absent                               │
  ├ buildUpdate('sets', FIELDS, patch) ─ UPDATE … (skipped when the patch is empty)  │
  └ require(id) ─ returns the fresh LiftSet row                                      │
toLiftSet(row)                          ports/               row → DTO               │
json(dto)                               http/http.ts         200                     │
  ▼                                                                                  ▼
response                                                        guard → errorResponse → { error }
```

## Detailed Findings

### How a repository reaches a handler

`Repositories` is a plain parameter object with four fields and no methods
(`src/backend/http/routes.ts:18-23`); its comment states the intent — "it holds the four repositories
and knows nothing itself, so each route factory can be handed only the ones it actually uses".

`allRoutes(repos)` (`src/backend/http/routes.ts:35-44`) is the only place that unpacks it. Each
feature's route factory receives repositories positionally and returns a partial `RouteTable` that is
spread into one table:

```ts
...statsRoutes(repos.stats),
...exerciseRoutes(repos.exercises),
...workoutRoutes(repos.workouts, repos.sets),
...setRoutes(repos.sets),
```

`routes.ts` imports the repository classes **as types only** (`import type`, lines 1, 5, 8, 11) and
the route factories as values — the registry names the repositories but never constructs one.

The four composition roots that do construct them:

- `src/backend/main.ts:10-22` — production: `openDatabase(DEFAULT_DB_PATH)`, then the four
  repositories, then `Bun.serve({ port, ...serveOptions(repositories) })`.
- `src/backend/testing.ts:41-54` — `useServer()`'s `beforeEach`: an in-memory DB, the same four
  repositories, a server on port 0.
- `src/backend/http/server.test.ts:20-27` — builds the same four to test the `error` hook that
  `serveOptions` returns.
- `src/scripts/seed.ts:52-57` — builds them without a server at all and calls repository methods
  directly, which is what makes "no HTTP-only logic in a handler" visible: seeding needs no routes.

`SetRepository` is the one repository that depends on another. It takes `WorkoutRepository` through
its constructor rather than importing it as a value (`src/backend/features/workouts/internal/set.repository.ts:19-27`),
and the comment records why: both live in the same feature, so injection "keeps the composition roots
the one place that decides which workout repository a set repository reads". `SetRepository` imports
`WorkoutRepository` with `import type` only, so there is no runtime cycle.

### What a handler does, step by step

Every API route is a `{ METHOD: handler }` map passed through `guardAll` (`src/backend/http/routing.ts:22-24`),
which wraps each method in `guard` (`:12-20`). A handler is `(req: ParamRequest) => Response | Promise<Response>`,
where `ParamRequest` is Bun's `Request` widened with `params` (`:7`).

A write handler runs four named steps and then the repository call. `PATCH /api/workouts/:id`
(`src/backend/features/workouts/workout.routes.ts:39-43`) shows all of them:

```ts
const id = pathId(req.params.id, 'workout');
const patch = translateToEditWorkoutDto(await readJsonObject(req));
return json(toWorkout(workouts.update(id, fromEditWorkout(patch))));
```

- `pathId` (`src/backend/shared/validate.ts:84-90`) turns the raw path segment into a positive integer
  or throws `badRequest`.
- `readJsonObject` (`src/backend/http/http.ts:21-32`) rejects malformed JSON and non-objects with 400.
- the **translator** validates and produces a DTO (`internal/workout.translator.ts:13-25`); it is the
  only layer that inspects raw body values, using the parsers in `shared/validate.ts`.
- the **mapper** renames camelCase DTO fields to snake_case columns (`internal/workout.mapper.ts:18-30`)
  and produces the repository's `Partial<WorkoutInput>`.
- the repository returns a row; a `to*` mapper from `ports/` turns it into a DTO; `json()` wraps it.

Read handlers skip the body steps. `GET /api/workouts` (`workout.routes.ts:17-22`) reads the query
string with `queryInt` (bounds `limit` to 1..200 and `offset` to 0..100000, `shared/validate.ts:92-102`),
then calls two repository methods and assembles a page DTO:

```ts
return json(toWorkoutPage(workouts.list(limit, offset), workouts.count(), limit, offset));
```

Deletes return `noContent()` (204) and never touch a mapper (`workout.routes.ts:45-48`, `set.routes.ts:21-24`,
`exercise.routes.ts:26-29`); creates return 201 (`workout.routes.ts:29`, `:60`, `exercise.routes.ts:14`).

`statsRoutes` is the minimal case — one line, one repository call, one mapper
(`src/backend/features/stats/stats.routes.ts:9-11`). `metaRoutes()` and `staticRoutes()` take no
repository at all; `meta.routes.ts:28` builds its `/api` and `/api/*` catch-all out of
`guard(() => errorResponse(notFound('Endpoint')))`, and the static route is deliberately left
unguarded because it answers plain text rather than JSON.

### Where the handler composes two repositories

Three handlers call more than one repository, and all three do it for **reads**:

- `GET /api/workouts/:id` — `toWorkoutWithSets(workouts.require(id), sets.list(id))`
  (`workout.routes.ts:34-37`). The mapper takes the row and the set list as two arguments
  (`ports/workout.ts:43-45`), so the join happens in the handler, not in SQL.
- `POST /api/workouts` — creates through `workouts`, then reads back through `sets` so the response
  carries whatever the `copyFrom` copy produced (`workout.routes.ts:24-30`).
- `GET /api/workouts/:id/sets` — `workouts.require(id)` is called purely for its 404, its return
  value discarded, before `sets.list(id)` (`workout.routes.ts:52-55`).

`GET /api/exercises/:id/progress` composes three calls on the *same* repository —
`exercises.require(id)`, `exercises.progress(id)`, `exercises.bestSet(id)` — into one DTO via
`toExerciseProgress` (`exercise.routes.ts:32-37`, `ports/exercise.ts:65-71`).

Multi-statement **writes** go the other way: they are one repository method wrapped in a
transaction. `WorkoutRepository.create(input, { copyFrom })` (`internal/workout.repository.ts:55-84`)
validates `copyFrom`, inserts the workout and copies the sets inside `this.db.transaction(...)()`.
The handler passes `copyFromWorkoutId` as the second argument itself, because it belongs to the
request but not to `WorkoutInput` — the comment at `workout.routes.ts:26-27` and the one at
`internal/workout.mapper.ts:5-9` both record that split. No route file opens a transaction.

### Where the status codes are decided

Success statuses are the handler's: `json(dto)` defaults to 200 (`http/http.ts:3-5`), creates pass
`201`, deletes return `noContent()` (`:7-9`).

Failure statuses come from below, thrown as `HttpError` (`http/errors.ts:5-18`):

| Where it is thrown | Example | Status |
| --- | --- | --- |
| `shared/validate.ts` parsers | `pathId('abc', 'set')`, `requiredInt` out of range | 400 |
| `readJsonObject` | body is not a JSON object | 400 |
| translators (via those parsers) | `"reps" must be a whole number` | 400 |
| `<Repo>.require(id)` | `notFound('Workout')` | 404 |
| `ExerciseRepository.create/update` | `isUniqueViolation` → `conflict` | 409 |
| `ExerciseRepository.delete` | exercise still used by sets → `conflict` | 409 |
| `SetRepository.create/update` | `isForeignKeyViolation` → `badRequest` | 400 |

The asymmetry between the last two rows is deliberate and documented in the repository itself
(`internal/set.repository.ts:53-56`): the workout id came from the path, so an unknown one is a 404
raised by `workouts.require`, while `exerciseId` came from the body and is left to the
`ON DELETE RESTRICT` foreign key, whose violation is translated into a 400.

`guard` catches whatever comes out and calls `errorResponse` (`http/errors.ts:20-28`), which renders
an `HttpError` as `{ error, details? }` at its status and anything else as a logged 500. The same
function is the `error` hook `serveOptions` gives `Bun.serve` (`http/server.ts:15-20`), so a throw
that escapes an unguarded route — the static one — still becomes a response.

### The type boundary between the two

For a given entity the handler holds four types, and they live on opposite sides of the
`ports/`–`internal/` line:

| Type | Declared in | Produced by | Consumed by |
| --- | --- | --- | --- |
| `EditSetDto` | `src/shared/dto/set.ts` | translator | mapper |
| `SetInput` | `internal/set.repository.ts:8-14` | mapper (`fromEditSet`) | repository |
| `LiftSet` (row) | `ports/set.ts:3-13` | repository | `to*` mapper |
| `LiftSetDto` | `src/shared/dto/set.ts` | `toLiftSet` (`ports/set.ts:15-27`) | `json()` |

So a repository's signature names one type from its own directory and one from its feature's
`ports/`: `update(id: number, patch: Partial<SetInput>): LiftSet`. A handler importing the repository
as a type therefore never needs anything else out of `internal/` except the mapper and translator of
its own feature.

The snake_case/camelCase rename is what enforces the "a route returns a DTO, never a row" rule: a row
is not structurally assignable to its DTO, so a handler that forgot a mapper would not typecheck.
Mappers name every field rather than spreading — the single spread in `ports/set.ts:34-36` spreads an
already-mapped DTO, and its comment says why.

`StatsRepository` shows the direction of that dependency. Its `summary()` returns `Summary`, declared
flat in `ports/stats.ts:8-17`, while the two half-row shapes it assembles it from are private
interfaces in the repository file (`internal/stats.repository.ts:5-18`). The published row is the
contract; how many queries produced it is the repository's business.

### What neither side does

- Handlers never see `db`. The only `DB` imports in `features/` are the four repository files.
- Handlers never write SQL and repositories never build a `Response` — they throw instead.
- `db/sql.ts` names no table and executes nothing (`src/backend/db/sql.ts:1-6`); `buildUpdate` takes the
  column list as a hard-coded tuple at each call site (`FIELDS` in each repository) so a request body
  cannot smuggle a column name into the statement (`:22-29`).
- There is no facade or service layer between the two, and no handler-side caching: every request
  re-queries.

### How the tests exercise the seam

`useServer()` (`src/backend/testing.ts:36-94`) starts a real server over an in-memory database and
returns `api`/`post`/`patch` helpers, so every route test drives the full handler → repository path
over HTTP. There are no unit tests of the repositories; `src/backend/http/server.test.ts` is the one
place a piece of the wiring (`serveOptions`'s `error` hook) is called directly, because nothing
reachable over HTTP throws past `guard`.

## Code References

- `src/backend/http/routes.ts:18-23` — the `Repositories` parameter object
- `src/backend/http/routes.ts:35-44` — `allRoutes`, the only place repositories are handed to factories
- `src/backend/http/routing.ts:7-9` — `ParamRequest` and `Handler`
- `src/backend/http/routing.ts:12-24` — `guard` / `guardAll`
- `src/backend/http/errors.ts:5-28` — `HttpError`, the three constructors, `errorResponse`
- `src/backend/http/http.ts:3-32` — `json`, `noContent`, `readJsonObject`
- `src/backend/http/server.ts:15-20` — `serveOptions(repos)`
- `src/backend/main.ts:10-22` — production composition root
- `src/backend/testing.ts:41-54` — test composition root
- `src/scripts/seed.ts:52-57` — repositories used with no server at all
- `src/backend/features/workouts/workout.routes.ts:14-63` — the widest handler set; two repositories
- `src/backend/features/workouts/workout.routes.ts:24-30` — `copyFrom` passed beside the mapped input
- `src/backend/features/workouts/set.routes.ts:10-26` — the single-repository route file
- `src/backend/features/exercises/exercise.routes.ts:32-37` — three repository calls into one DTO
- `src/backend/features/stats/stats.routes.ts:9-11` — the minimal handler
- `src/backend/features/meta/meta.routes.ts:27-33` — the `/api` catch-all built from `guard`
- `src/backend/features/workouts/internal/workout.repository.ts:42-48` — `require()` as the 404 source
- `src/backend/features/workouts/internal/workout.repository.ts:55-84` — the one transaction
- `src/backend/features/workouts/internal/set.repository.ts:19-27` — repository injected into repository
- `src/backend/features/workouts/internal/set.repository.ts:53-83` — FK violation → 400
- `src/backend/features/exercises/internal/exercise.repository.ts:49-93` — unique violation and in-use → 409
- `src/backend/features/workouts/ports/workout.ts:19-49` — row types and their `to*` mappers
- `src/backend/features/workouts/internal/workout.mapper.ts:10-30` — DTO → `WorkoutInput`
- `src/backend/features/workouts/internal/workout.translator.ts:4-25` — body → DTO
- `src/backend/shared/validate.ts:84-102` — `pathId`, `queryInt`
- `src/backend/db/sql.ts:30-51` — `buildUpdate`

## Architecture Documentation

Patterns visible in the current code:

1. **Factory-per-URL-group, closure-injected.** A route file exports one function named after its URL
   prefix, taking exactly the repositories its handlers call. Adding a route means adding a key to the
   returned table; adding a dependency means adding a parameter and a line in `allRoutes`.
2. **Composition root, four times over.** Every process that needs repositories builds them itself —
   server, tests, error-hook test, seeder. Nothing is constructed at module scope, which is what lets
   each test file own a fresh in-memory database.
3. **Errors as exceptions, statuses as domain knowledge.** The repository knows whether a missing row
   is a 404 or a 409; the handler knows only the success status. `guardAll` is the single translation
   point from exception to `Response`.
4. **Four types per entity, two directories.** `Dto` (shared) → `Input` (internal) → row (ports) →
   `Dto` (shared), with the camelCase/snake_case rename making the boundary a compile-time one.
5. **Reads compose in the handler, writes compose in the repository.** Two repository calls in a
   handler are normal for a GET; two statements in a write belong in one transactional repository
   method.
6. **Repositories are reachable by type across feature lines, by value only through the roots.**
   `http/routes.ts` imports all four classes as types; the values are imported by `main.ts`,
   `testing.ts`, `seed.ts` and `server.test.ts`.

## Open Questions

- Whether a future feature needing more than two repositories in one handler would keep composing in
  the handler or move the composition down — no such handler exists today.
- Nothing in the code enforces the `ports/`/`internal/` import rule mechanically (no lint rule was
  found); it is held by convention and by the documentation in `docs/backend.md`.
