---
date: 2026-09-12T20:47:42+00:00
git_commit: c8e146309ade1ceb98efc10607dc324e3c859a2c
branch: main
topic: 'Remove guard/guardAll in favour of the error hook, and start the server through one function'
tags: [plan, backend, http, server, routing, errors, testing, refactor]
status: ready
---

# PLAN: One server entry point, no guard

Two things about how the server is started and how it turns a throw into a response are said twice.

Every API route file wraps its handlers in `guardAll()` (and `meta.routes.ts` in `guard()`), a
try/catch that hands the error to `errorResponse()`. `Bun.serve`'s `error` hook, set in
`http/server.ts`, hands errors to the very same `errorResponse()`. Measured on Bun 1.4.2, that hook
already catches a throw from a synchronous method-map handler, an async one, a bare-function route
and `/*` alike, so the wrapper adds nothing but an import and a level of nesting in every route file.

And `Bun.serve({ port, ...serveOptions(createFacades(db)) })` is spelled out in both `main.ts` and
`testing.ts`, which differ only in the port.

This plan deletes `guard` and `guardAll` so that the `error` hook is the single place a throw becomes
a response, and replaces `serveOptions` with `startServer(db, port)`, the only call to `Bun.serve`.

## Acceptance Criteria

- `guard`, `guardAll` and the then-unused `Handler` type no longer exist anywhere under `src/`.
- Every `*.routes.ts` file is a plain method table; a throw from any route, API or static, is
  rendered by the one `error` hook in `http/server.ts` through `errorResponse`.
- API error responses are unchanged: same statuses, same `{ error, details }` bodies.
- `startServer(db, port)` in `http/server.ts` is the only place `Bun.serve` is called; `main.ts` and
  `testing.ts` both call it; `serveOptions` and `GainzServeOptions` are gone.
- `http/errors.test.ts` covers `errorResponse` for an `HttpError` (its status and body) and for an
  unexpected `Error` (500, `Internal server error`, logged); `http/server.test.ts` is gone.
- `docs/backend.md` describes the `error` hook as the one error path and `startServer` as the one
  way the server starts.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **Delete `guard`/`guardAll` and rely on Bun's `error` hook:** no wrapper, central or per route.
   - Why: both paths already call `errorResponse`, and the hook catches every kind of route handler
     (measured on Bun 1.4.2: sync and async method maps, bare functions, `/*`). A central wrapper
     applied in `allRoutes` would keep a redundant try/catch and would have to know which routes to
     skip.
   - Impact: route files lose the wrapper and its import; `http/routing.ts` keeps only `RouteTable`
     and `ParamRequest`. Handler parameters stay unannotated: without `guardAll`, `req` is inferred
     from `RouteTable` as `BunRequest<string>`, whose `params: Record<string, string>` is assignable
     to `ParamRequest` (checked with `tsc` against the project's `tsconfig.json`). `RouteTable`'s
     `string` path type means the literal keys do not narrow `params`, exactly as today.
2. **`startServer(db: Database, port: number): Server<undefined>`:** it builds the facades, the
   routes and the `error` hook and calls `Bun.serve`.
   - Why: `main.ts` and `testing.ts` differ only in the port and in what they do with the server
     afterwards; each still owns the database it opened.
   - Impact: callers keep opening and closing their own database and stopping their own server.
     `createFacades` moves from those two callers into `server.ts`.
3. **`http/errors.test.ts` replaces `http/server.test.ts`:** a unit test of `errorResponse` beside
   `errors.ts`.
   - Why: with `serveOptions` gone the hook is reachable only through a running server, and every
     4xx route test already proves the hook's wiring end to end. The 500 branch cannot be provoked
     over HTTP, so it is tested at the function.
   - Impact: `docs/backend.md` lists it with the other tests that do not go over HTTP.
4. **Out of scope:** `MetaController.endpointNotFound` keeps returning `errorResponse(notFound(...))`;
   `.oxlintrc.json` is unchanged, since route files still import `http/routing.ts` only for types.

## Current State

```
main.ts                                         testing.ts  useServer()
  db = openDatabase(DEFAULT_DB_PATH, log)         db = openDatabase(':memory:')
  Bun.serve({ port, ...serveOptions(              Bun.serve({ port: 0, ...serveOptions(
      createFacades(db)) })                           createFacades(db)) })
                 │                                              │
                 └────────────────────┬─────────────────────────┘
                                      ▼
http/server.ts   serveOptions(facades) → { routes: allRoutes(facades),
                                           error: (err) => errorResponse(err) }   ◄── path 2
                                      │
                                      ▼
http/routes.ts   allRoutes(facades) → { ...metaRoutes(), ...statsRoutes(), ..., ...staticRoutes() }
                                      │
     ┌────────────────────────────────┼───────────────────────────────────┐
     ▼                                ▼                                   ▼
*.routes.ts (API)               meta.routes.ts                      static.routes.ts
'/api/x': guardAll({            '/api', '/api/*':                   unwrapped; a throw reaches
  GET: (req) => c.x(req) })       guard(() => c.endpointNotFound())   the error hook
     │                                │
     └──────── http/routing.ts  guard(): try { … } catch (err) { return errorResponse(err) } ◄── path 1
```

- `src/backend/http/routing.ts:9-24` — `Handler`, `guard`, `guardAll`.
- `src/backend/http/server.ts:5-21` — `GainzServeOptions`, `serveOptions`.
- `src/backend/main.ts:12`, `src/backend/testing.ts:40` — the two `Bun.serve` calls.
- `src/backend/http/server.test.ts` — calls `serveOptions(...).error` directly with a 418
  `HttpError` and a plain `Error`.
- `guardAll` in `exercise.routes.ts`, `workout.routes.ts`, `set.routes.ts`, `stats.routes.ts`,
  `meta.routes.ts`; `guard` in `meta.routes.ts:28`.
- `docs/backend.md:8`, `:25`, `:75`, `:84-89`, `:118-128` — describe `guard`/`guardAll`,
  `serveOptions` and `server.test.ts`.

## Desired End State

```
main.ts                                   testing.ts  useServer()
  db = openDatabase(DEFAULT_DB_PATH, log)   db = openDatabase(':memory:')
  server = startServer(db, port)            server = startServer(db, 0)
                 └──────────────┬───────────────────┘
                                ▼
http/server.ts   startServer(db, port) → Bun.serve({ port,
                                                     routes: allRoutes(createFacades(db)),
                                                     error: (err) => errorResponse(err) })  ◄── only path
                                ▼
http/routes.ts   allRoutes(facades)   (unchanged)
                                ▼
*.routes.ts      '/api/x': { GET: (req) => controller.x(req) }       plain tables everywhere
```

```ts
// src/backend/features/workouts/set.routes.ts
export function setRoutes(sets: SetFacade): RouteTable {
  const controller = new SetController(sets);
  return {
    '/api/sets/:id': {
      GET: (req) => controller.show(req),
      PATCH: (req) => controller.update(req),
      DELETE: (req) => controller.delete(req),
    },
  };
}
```

## Abstractions and Code Reuse

- `src/backend/http/`
  - `routing.ts` — delete `Handler`, `guard`, `guardAll` and the `errorResponse` import; keep
    `RouteTable` and `ParamRequest`.
  - `server.ts` — replace `GainzServeOptions` and `serveOptions` with `startServer(db, port)`.
  - `server.test.ts` — deleted.
  - `errors.test.ts` — new; unit test of `errorResponse`.
- `src/backend/features/`
  - `exercises/exercise.routes.ts`, `workouts/workout.routes.ts`, `workouts/set.routes.ts`,
    `stats/stats.routes.ts` — unwrap `guardAll({ … })` to `{ … }`, drop the import.
  - `meta/meta.routes.ts` — unwrap `guardAll` in `healthRoute`; `notFoundRoute` becomes
    `const endpointNotFound = (): Response => controller.endpointNotFound();`.
- `src/backend/main.ts` — call `startServer(db, port)`; drop the `createFacades` and `serveOptions`
  imports.
- `src/backend/testing.ts` — call `startServer(db, 0)`; drop the `createFacades` and `serveOptions`
  imports.
- `docs/backend.md` — error-handling and server/test paragraphs.

Reused as they are: `errorResponse` and `HttpError` (`http/errors.ts`), `allRoutes`
(`http/routes.ts`), `createFacades` (`features/facades.ts`), `body<T>()` (`testing.ts`).

## Logging & Observability

No change. `errorResponse` still logs `Unhandled error: <err>` through `console.error` for anything
that is not an `HttpError`; the only difference is that for API routes it is now reached through the
`error` hook instead of through `guard`. `main.ts` keeps its `gainz is running on …` and `database: …`
lines. The new `errors.test.ts` asserts the log call rather than letting it print to stderr.

## Implementation

### Phase 1: Remove guard and guardAll

Dependencies: None

Every route becomes a plain table and the existing `error` hook becomes the single error path. The
route tests that assert 4xx statuses and `{ error }` bodies prove the responses did not change.

**Tasks**:

- [ ] `src/backend/features/exercises/exercise.routes.ts` — unwrap the three `guardAll({ … })` calls
      to plain objects; remove `import { guardAll } from '../../http/routing.ts';`.
- [ ] `src/backend/features/workouts/workout.routes.ts` — unwrap the three `guardAll` calls; remove
      the import.
- [ ] `src/backend/features/workouts/set.routes.ts` — unwrap the `guardAll` call; remove the import.
- [ ] `src/backend/features/stats/stats.routes.ts` — unwrap the `guardAll` call; remove the import.
- [ ] `src/backend/features/meta/meta.routes.ts` — unwrap `guardAll` in `healthRoute`; in
      `notFoundRoute` replace `guard(() => controller.endpointNotFound())` with
      `(): Response => controller.endpointNotFound()`; remove the `guard, guardAll` import.
- [ ] `src/backend/http/routing.ts` — delete `Handler`, `guard`, `guardAll` and the
      `import { errorResponse } from './errors.ts';`, leaving `RouteTable` and `ParamRequest`.
- [ ] `docs/backend.md` — rewrite the passages that name the wrapper:
  - line 8: `routing.ts` is described as holding the `RouteTable` and `ParamRequest` types, with no
    mention of `guard`/`guardAll`;
  - line 25: drop ", wrapped in `guardAll`" from the route-file sentence;
  - lines 84-89: controllers throw `HttpError` and the `error` hook in `http/server.ts` turns any
    throw from any route into the JSON `{ error }` body with its status — one path for the API and
    the static route alike, so a new route needs nothing to get it. Drop the "must be wrapped in
    `guardAll`" rule and the static-route exception, whose claim that a wrapper would give it the
    wrong body no longer applies. Keep the rest of the paragraph (the three statuses, 404 vs 400 for
    broken references).

**Automated Verification**:

- [ ] This search finds nothing (run in PowerShell; the single quotes keep the backtick literal):
      ```powershell
      git grep -nE 'guardAll|guard\(|\bguard`|Handler\b' -- src/backend docs/backend.md
      ```
- [ ] `bun test src/backend/features/exercises/exercise.routes.test.ts` passes — `rejects a blank
      name` (400 with `error` containing `name`), `rejects a duplicate name regardless of case`,
      `returns 404 for a missing exercise` and `refuses to delete an exercise that has logged sets`
      now go through the `error` hook.
- [ ] `bun test src/backend/http/http.test.ts` passes — `rejects malformed JSON` is a throw from
      inside an async controller method, the case `guard` used to await.
- [ ] `bun test src/backend/features/meta/meta.routes.test.ts` passes — `unknown api endpoint returns
      a JSON 404` and `the bare /api prefix returns a JSON 404, but /apix does not`.
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes (handler `req` parameters infer from `RouteTable` without
      annotations).
- [ ] `bun run lint` passes.
- [ ] `bun run fmt:check` passes.

### Phase 2: One server entry point

Dependencies: Phase 1 (the `error` hook must be the only error path before it is folded into
`startServer`).

`startServer` becomes the only call to `Bun.serve`, `serveOptions` goes, and the direct test of the
hook becomes a unit test of `errorResponse`.

**Tasks**:

- [ ] `src/backend/http/server.ts` — replace `GainzServeOptions` and `serveOptions` (and the doc
      comment explaining why the options interface is spelled out) with:
      ```ts
      import type { Server } from 'bun';
      import type { DB } from '../db/db.ts';
      import { errorResponse } from './errors.ts';
      import { createFacades } from '../features/facades.ts';
      import { allRoutes } from './routes.ts';

      export function startServer(db: DB, port: number): Server<undefined> {
        return Bun.serve({
          port,
          routes: allRoutes(createFacades(db)),
          error: (err) => errorResponse(err),
        });
      }
      ```
- [ ] `src/backend/main.ts` — `const server = startServer(db, port);`; import `startServer` from
      `./http/server.ts`; remove the `createFacades` and `serveOptions` imports.
- [ ] `src/backend/testing.ts` — `server = startServer(db, 0);` in `beforeEach`; import `startServer`;
      remove the `createFacades` and `serveOptions` imports.
- [ ] Delete `src/backend/http/server.test.ts`.
- [ ] Add `src/backend/http/errors.test.ts`:
      ```ts
      import { describe, expect, spyOn, test } from 'bun:test';
      import type { ErrorDto } from '../../shared/dto';
      import { HttpError, errorResponse } from './errors.ts';
      import { body } from '../testing.ts';

      describe('errorResponse', () => {
        test('renders an HttpError with its status, message and details', async () => {
          const res = errorResponse(new HttpError(400, 'bad input', { field: 'name' }));
          expect(res.status).toBe(400);
          expect(await body<ErrorDto>(res)).toEqual({ error: 'bad input', details: { field: 'name' } });
        });

        test('renders anything else as a logged 500', async () => {
          const log = spyOn(console, 'error').mockImplementation(() => {});
          try {
            const res = errorResponse(new Error('boom'));
            expect(res.status).toBe(500);
            expect(await body<ErrorDto>(res)).toEqual({ error: 'Internal server error' });
            expect(log).toHaveBeenCalledWith('Unhandled error:', expect.any(Error));
          } finally {
            log.mockRestore();
          }
        });
      });
      ```
- [ ] `docs/backend.md`:
  - lines 9-11: `main.ts` is the entry point that opens the database and starts the server through
    `startServer`;
  - line 75: `features/facades.ts` is called by `http/server.ts` and `src/scripts/seed.ts` (no longer
    by `main.ts`, `testing.ts` or `http/server.test.ts`);
  - lines 118-121: `startServer(db, port)` in `http/server.ts` is the one place `Bun.serve` is
    called — `main.ts` passes `PORT`, and `useServer()` in `testing.ts` passes port 0 and an
    in-memory database — keeping the sentence about `beforeEach`/`afterEach` being registered inside
    the function;
  - lines 124-128: the tests that do not go over HTTP are `db/db.test.ts`, `db/migrations.test.ts`,
    `features/static/internal/paths.test.ts` and `http/errors.test.ts`, the last because the 500
    branch of `errorResponse` cannot be provoked over HTTP; fix the "with one exception" wording to
    match the list.

**Automated Verification**:

- [ ] `git grep -nE "serveOptions|GainzServeOptions|server\.test\.ts" -- src docs/backend.md` finds
      nothing.
- [ ] `git grep -n "Bun.serve(" -- src` finds only `src/backend/http/server.ts`.
- [ ] `bun test src/backend/http/errors.test.ts` passes both tests without printing
      `Unhandled error` to stderr.
- [ ] `bun test` passes (every route test now starts its server through `startServer`).
- [ ] `bun run typecheck` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run fmt:check` passes.

**Manual Verification**:

- [ ] `bun start` prints `gainz is running on http://localhost:3000/`; `GET /api/health` answers
      `{"status":"ok","app":"gainz"}`, `GET /api/nope` answers a JSON 404, and Ctrl+C shuts the
      server down cleanly.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-12-handler-construction-and-data-flow.md` — how handlers, `guard` and
  the controllers fit together at the previous commit.
- `docs/agents/plans/2026-09-12-feature-controllers.md` — the plan that introduced the controllers.
- `node_modules/bun-types/serve.d.ts:535-642` — `ExtractRouteParams`, `Handler` and `Routes`, which
  type the handler `req` once `guardAll` no longer does.
- Bun 1.4.2 probe (run during planning): a `Bun.serve` with an `error` hook answered throws from a
  sync method-map handler, an async one, a bare-function route and `/*` with the hook's response.
