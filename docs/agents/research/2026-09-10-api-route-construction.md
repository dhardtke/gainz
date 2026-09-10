---
date: 2026-09-10T17:40:48+00:00
git_commit: 1bd876785993a14800740784c097d4e32d7477ca
branch: main
topic: "How the routes are currently built (src/routes.ts)"
tags: [research, codebase, routes, http, validation, bun-serve]
status: complete
---

# Research: How the routes are currently built (`src/routes.ts`)

## Research Question

How are the routes currently built? (starting point: `src/routes.ts`)

## Summary

Routing is a single plain-object route table handed to `Bun.serve`. There is no router
library, no decorators, no registration side effects: `apiRoutes(repo)` in `src/routes.ts:58`
returns one object literal whose keys are Bun route patterns (`"/api/workouts/:id"`) and whose
values are method maps (`{ GET, POST, PATCH, DELETE }`). `src/server.ts:114` spreads that
object into `Bun.serve` as `routes`, alongside a `fetch` fallback that serves the static
frontend and an `error` hook.

Every method map is passed through `guardAll()` (`src/routes.ts:21`), which wraps each handler
in `guard()` (`src/routes.ts:11`) — a try/catch that converts a thrown value into a JSON error
response via `errorResponse()`. That is the project's whole error strategy: handlers never
build error responses, they throw `HttpError` from `src/http.ts` and let the wrapper translate.

A handler is written as one expression where possible. The recurring shape is *parse the path
id, parse and validate the body, call one `Repo` method, wrap in `json()`*. Validation lives
entirely in `src/validate.ts` and is invoked field by field from the route module; there is no
schema library and no middleware chain.

```
public/js/api.ts  --fetch("/api/...")-->  Bun.serve
                                             |
                                routes ------+------ fetch  (serveStatic -> public/, /vendor/*)
                                             |
                                 apiRoutes(repo)            src/routes.ts
                                             |
                        guardAll({ GET, POST, PATCH, ... }) -- guard() try/catch
                                             |                      |
                                             |                      +-> errorResponse(HttpError) -> { error, details }
                                             v
                     readJsonObject(req)  ->  read*Body()  ->  validate.ts (requiredString, pathId, ...)
                                             |
                                             v
                                        Repo methods (src/repo/*) -- all SQL
                                             |
                                             v
                                    json(data, status) / noContent()
```

Key files:

```
src/
|-- routes.ts        the Bun.serve route table: apiRoutes(repo), guard/guardAll, body readers
|-- server.ts        serveOptions(repo) -> { routes, fetch, error }; static + vendor serving
|-- http.ts          HttpError + badRequest/notFound/conflict; json(), noContent(), errorResponse(), readJsonObject()
|-- validate.ts      per-field parsers: requiredString/optionalString/requiredInt/requiredNumber/requiredDate/pathId/queryInt/isPresent/today
`-- repo/
    |-- index.ts     Repo facade -- the flat surface every handler calls
    |-- exercises.ts workouts.ts sets.ts stats.ts   one repository per entity (all SQL)
    `-- sql.ts       shared SQL fragments + buildUpdate()
test/api.test.ts     end-to-end over HTTP against serveOptions() on port 0
public/js/api.ts     the frontend client that consumes the same surface
docs/backend.md      the documented layering rule ("New routes must be wrapped in guardAll")
README.md:221        the endpoint tables
```

## Detailed Findings

### The route table itself

`apiRoutes(repo: Repo): Bun.Serve.Routes<undefined, string>` (`src/routes.ts:58`) is a function
of the repository — it takes `repo` as a parameter and closes over it, so nothing is imported
from a module-level singleton and the test suite can build a table over an in-memory database.
It returns an object literal with ten entries, grouped by comment banners (`// ---- exercises`,
`// ---- workouts`, `// ---- sets`):

| Pattern | Methods | Location |
| --- | --- | --- |
| `/api/health` | GET | `src/routes.ts:60` |
| `/api/stats/summary` | GET | `src/routes.ts:64` |
| `/api/exercises` | GET, POST | `src/routes.ts:70` |
| `/api/exercises/:id` | GET, PATCH, DELETE | `src/routes.ts:75` |
| `/api/exercises/:id/progress` | GET | `src/routes.ts:100` |
| `/api/workouts` | GET, POST | `src/routes.ts:113` |
| `/api/workouts/:id` | GET, PATCH, DELETE | `src/routes.ts:130` |
| `/api/workouts/:id/sets` | GET, POST | `src/routes.ts:158` |
| `/api/sets/:id` | GET, PATCH, DELETE | `src/routes.ts:173` |
| `/api/*` | (any) | `src/routes.ts:204` |

The last entry is a catch-all: `"/api/*": guard(() => errorResponse(notFound("Endpoint")))`. It
is a bare handler rather than a method map, so any method on any unmatched `/api/...` path gets
a JSON 404 instead of falling through to `serveStatic`. This one *returns*
`errorResponse(notFound(...))` directly rather than throwing, though it is still wrapped in
`guard`.

Path parameters arrive on the request object. `ParamRequest` (`src/routes.ts:6`) is the local
type for that: `Request & { params: Record<string, string | undefined> }`, and `Handler`
(`src/routes.ts:8`) is `(req: ParamRequest) => Response | Promise<Response>`. Handlers read
`req.params.id` and immediately narrow it with `pathId(req.params.id, "exercise")`.

### Error handling: `guard` and `guardAll`

`guard(handler)` (`src/routes.ts:11`) returns an async handler that awaits the wrapped one
inside a try/catch and funnels anything thrown into `errorResponse(err)`.

`guardAll(handlers)` (`src/routes.ts:21`) maps over the entries of a method map and wraps each
value, via `Object.fromEntries(Object.entries(...).map(...))`. Every method map in the table is
written as `guardAll({ ... })`; `docs/backend.md:15-16` states this as a rule for new routes.

`errorResponse` (`src/http.ts:25`) renders an `HttpError` as
`{ error: message, details: details ?? undefined }` at the error's status; anything else is
logged with `console.error("Unhandled error:", err)` and becomes a generic 500
`{ error: "Internal server error" }`. The same function is wired as `Bun.serve`'s `error` hook
in `src/server.ts:118`, so a throw that escapes the route table is rendered the same way.

The error constructors are `badRequest` (400), `notFound` (404) and `conflict` (409)
(`src/http.ts:13-15`). Nothing in `routes.ts` constructs a `Response` for a failure — errors
originate either in `validate.ts` (bad input) or in the repositories (`require*()` -> 404, a
unique-name violation -> 409).

### Request-body handling

Bodies are read with `readJsonObject(req)` (`src/http.ts:43`), which awaits `req.json()`,
throws `badRequest("Request body must be valid JSON")` on a parse failure, and rejects anything
that is not a plain object (arrays and `null` included) via the `isJsonObject` type guard at
`src/http.ts:38`.

Three module-level readers turn a parsed body into a repository input type:

- `readExerciseBody` (`src/routes.ts:28`) -> `ExerciseInput`
- `readWorkoutBody` (`src/routes.ts:36`) -> `WorkoutInput`; `performed_on` defaults to `today()`
  when absent
- `readSetBody` (`src/routes.ts:44`) -> `SetInput`; `position` is spread in conditionally
  (`...(isPresent(body, "position") ? { position: ... } : {})`) so an absent position stays
  absent rather than becoming `undefined`

These readers are used only by the `POST` handlers. The `PATCH` handlers do **not** use them:
each builds a `Partial<...>` inline, guarded field by field with `isPresent(body, field)`
(`src/routes.ts:78-92` for exercises, `136-150` for workouts, `176-196` for sets). This is what
makes PATCH a true partial update — a field the caller did not send is never added to the patch
object, while a field sent explicitly as `null` is added as `null` and clears the column
(`buildUpdate` in `src/repo/sql.ts:31` tests membership with `in`, not `!== undefined`).

Two shared length limits live at the top of the module: `MAX_NAME = 120` and
`MAX_NOTES = 2000` (`src/routes.ts:25-26`). Muscle group uses a literal `60` at each call site.

### Validation

`src/validate.ts` holds one small parser per field kind; each throws `badRequest` with a
message naming the field, and returns the normalised value:

- `isPresent` (`:5`) — `hasOwnProperty` **and** not `undefined`; the gate for every PATCH field
- `requiredString` (`:10`) — non-empty after trim, max length; returns the trimmed value
- `optionalString` (`:23`) — `undefined`, `null` and empty-after-trim all collapse to `null`
- `requiredInt` (`:41`) / `requiredNumber` (`:57`) — accept a numeric string too, bounded by
  `{ min, max }`; `requiredNumber` rounds to two decimals
- `requiredDate` (`:71`) — `YYYY-MM-DD` by regex plus `Date.parse`
- `pathId` (`:80`) — turns the raw path segment into a positive integer or throws
  `badRequest("Invalid <what> id")`
- `queryInt` (`:88`) — reads a `URLSearchParams` key with a fallback and bounds
- `today` (`:100`) — `new Date().toISOString().slice(0, 10)`

Bounds are stated at the call site in `routes.ts`, not inside the validators: reps
`{ min: 1, max: 1000 }`, weight `{ min: 0, max: 100000 }`, position `{ min: 0 }`, `limit`
`{ min: 1, max: 200 }` defaulting to 50, `offset` `{ min: 0, max: 100000 }` defaulting to 0.

Query strings are parsed by hand in the handler that needs them — only `GET /api/workouts`
does: `new URL(req.url).searchParams` (`src/routes.ts:115`) feeding two `queryInt` calls.

### What handlers do with the repository

Handlers call exactly one `Repo` method in the simple cases and compose a response object in
the others. `Repo` (`src/repo/index.ts:14`) is a flat facade over four entity repositories, so
handlers never touch SQL or reach a sub-repository.

The composing handlers:

- `GET /api/exercises/:id/progress` (`src/routes.ts:101`) builds `{ exercise, sessions, best_set }`
  from three repository calls
- `GET /api/workouts` (`src/routes.ts:114`) builds the page envelope
  `{ items, total, limit, offset }` from `listWorkouts` + `countWorkouts`
- `POST /api/workouts` (`src/routes.ts:121`) returns `{ ...workout, sets: repo.listSets(id) }`,
  and passes `copy_from_workout_id` through as an option:
  `{ copyFrom: isPresent(body, "copy_from_workout_id") ? requiredInt(...) : undefined }`
- `GET /api/workouts/:id` (`src/routes.ts:131`) merges the workout with its sets the same way
- `GET /api/workouts/:id/sets` (`src/routes.ts:159`) calls `repo.requireWorkout(id)` purely for
  its 404 side effect before listing, so an unknown workout is a 404 rather than an empty array

Multi-statement writes stay in the repository: `createWorkout` wraps the insert and the set copy
in `db.transaction()` (`src/repo/workouts.ts:69-98`), and `docs/backend.md:18-21` records that
`routes.ts` never opens a transaction itself.

Responses are built with two helpers only: `json(data, status = 200)` (`src/http.ts:17`, a thin
wrapper over `Response.json`) and `noContent()` (`src/http.ts:21`, a 204 with a null body).
Creations pass `201` explicitly; all three `DELETE` handlers call the repository and then
`noContent()`.

### How the table is mounted

`serveOptions(repo)` (`src/server.ts:114`) returns
`{ routes: apiRoutes(repo), fetch: serveStatic, error }`, typed as the locally-declared
`GainzServeOptions` (`src/server.ts:107`) — the comment there explains it is spelled out rather
than taken from `Bun.Serve.Options` because that type's port/unix union stops being spreadable
once named.

The CLI entry point (`src/server.ts:122`, behind `import.meta.main`) opens the database, builds
a `Repo`, and calls `Bun.serve({ port, ...serveOptions(repo) })`. Requests that no route pattern
matches fall through to `fetch: serveStatic` (`src/server.ts:55`), which serves `public/`,
transpiles `.ts` on request, serves the `/vendor/*` allowlist, and falls back to `index.html`
for extension-less paths — which is what the `/api/*` catch-all guards against, keeping unknown
API paths from being answered with the SPA shell.

### How the routes are exercised and consumed

`test/api.test.ts` starts a real server per test:
`Bun.serve({ port: 0, ...serveOptions(new Repo(db)) })` against `openDatabase(":memory:")`
(`test/api.test.ts:38-41`), with small `api`/`post`/... fetch helpers. Response shapes that the
route module composes ad hoc (`WorkoutDetail`, `WorkoutPage`, `Progress`, `ErrorBody`) are
re-declared as interfaces at the top of the test file (`test/api.test.ts:11-33`), since the
handlers return object literals rather than a named type.

The frontend client `public/js/api.ts` mirrors the same surface: a single `request<T>()`
(`public/js/api.ts:42`) prefixes `/api`, reads the error body's `error`/`details` fields into an
`ApiError`, and an `api` object groups `exercises` / `workouts` / `sets` methods that each
declare the return type they expect. It re-declares the response shapes in `public/js/types.ts`
— the shapes are not shared with the backend types.

`README.md:221-263` documents the endpoint tables, and `docs/backend.md` documents the layering
rule the route module sits in.

## Code References

- `src/routes.ts:6-8` — `ParamRequest` / `Handler` types
- `src/routes.ts:11-19` — `guard()`, the try/catch to `errorResponse` wrapper
- `src/routes.ts:21-23` — `guardAll()`, applied to every method map
- `src/routes.ts:25-26` — `MAX_NAME` / `MAX_NOTES`
- `src/routes.ts:28-52` — `readExerciseBody` / `readWorkoutBody` / `readSetBody`
- `src/routes.ts:58-206` — `apiRoutes(repo)`, the whole route table
- `src/routes.ts:78-92`, `136-150`, `176-196` — the three inline PATCH patch-builders
- `src/routes.ts:204` — the `/api/*` JSON 404 catch-all
- `src/http.ts:2-15` — `HttpError` and the `badRequest`/`notFound`/`conflict` constructors
- `src/http.ts:17-31` — `json()`, `noContent()`, `errorResponse()`
- `src/http.ts:38-54` — `isJsonObject()` and `readJsonObject()`
- `src/validate.ts:5-101` — every field parser used by the route module
- `src/repo/index.ts:14-121` — the `Repo` facade the handlers call
- `src/repo/sql.ts:31-52` — `buildUpdate()`, which consumes the PATCH partials
- `src/server.ts:107-120` — `GainzServeOptions` and `serveOptions(repo)`
- `src/server.ts:122-131` — the `Bun.serve` call
- `test/api.test.ts:38-56` — how the table is booted and called in tests
- `public/js/api.ts:42-123` — the frontend client over the same paths
- `docs/backend.md:1-21` — the documented layering and the `guardAll` rule
- `README.md:221-263` — the documented endpoint tables

## Architecture Documentation

Patterns currently in force in the route layer:

1. **One object literal, no registration.** The table is data returned by a function; nothing
   mutates a router at import time. Adding an endpoint means adding a key.
2. **Dependency by parameter.** `apiRoutes(repo)` receives the repository; `serveOptions(repo)`
   passes it down. There is no module-level database or singleton.
3. **Throw, do not return, for failures.** `HttpError` carries the status; `guardAll` is the
   single translation point. `docs/backend.md` states new routes must be wrapped.
4. **Validation at the boundary, field by field.** No schema library. Each field is parsed by a
   named function from `validate.ts`, with its bounds spelled out at the call site.
5. **POST and PATCH are shaped differently on purpose.** POST goes through a `read*Body`
   function that produces a complete input type; PATCH builds a `Partial<...>` inline behind
   `isPresent` checks so absent fields stay absent.
6. **Handlers stay one expression deep.** They parse, call one or a few `Repo` methods, and wrap
   the result in `json()`/`noContent()`. Transactions and multi-statement writes belong to the
   repository.
7. **Response envelopes are ad-hoc object literals.** `{ items, total, limit, offset }`,
   `{ ...workout, sets }` and `{ exercise, sessions, best_set }` exist only as literals in
   `routes.ts`; the test suite and the frontend each re-declare their shape independently.

## Open Questions

- Method handling for verbs a route does not declare (for example `PUT /api/exercises/:id`) is
  left to Bun's route-table defaults; the route module declares no `OPTIONS`/`HEAD` handlers and
  no CORS headers, and nothing in the repository documents the intended behaviour there.
