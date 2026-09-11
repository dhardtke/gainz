---
date: 2026-09-11T09:29:19+00:00
git_commit: 27eb98c84e92f0e8923d03813ebc7b9be9170f74
branch: main
topic: 'Serve static files from a route handler instead of the fetch fallback'
tags: [plan, backend, http, routes, static-files, bun-serve, vendor-allowlist]
status: draft
---

# PLAN: Static files as a route

Static serving is currently the `fetch` option of `Bun.serve` — the thing Bun calls when no
declared route pattern matched. That makes the static half structurally different from every
other URL the server answers: the API surface is data (an object literal of patterns assembled
by `apiRoutes()`), while the static surface is one imperative function reachable only by
falling off the end of the table.

This plan turns it into a route file like any other, at
`src/backend/http/routes/static.routes.ts`, and removes `fetch` from the server options
entirely. It closes `TODO.md:10` — _"Change static.ts to become an actual route, not a fetch
fallback"_ — and resolves both open questions left by
`docs/agents/research/2026-09-11-static-file-serving.md`.

## Acceptance Criteria

- `src/backend/http/routes/static.routes.ts` exports `staticRoutes(): RouteTable` and holds the
  whole static request pipeline; `src/backend/http/static.ts` no longer exists.
- `serveOptions(repo)` returns `{ routes, error }`. `GainzServeOptions` no longer declares a
  `fetch` property, and `Bun.serve` is given no fallback.
- `/vendor/pico.css` appears as its own key in the route table, generated from `VENDOR_FILES`,
  so every URL the server answers can be found by reading `http/routes.ts` and `http/routes/`.
- `http/routes.ts` exports `allRoutes(repo)` and spreads `staticRoutes()` alongside the API
  tables. No caller of `apiRoutes` remains.
- The static tests live at `src/backend/http/routes/static.routes.test.ts`, beside the module
  they exercise, as `docs/backend.md:63` requires.
- Every response measured in the research document is unchanged, with exactly three exceptions:
  - `GET /api` answers the JSON 404 from the API catch-all instead of the SPA page.
  - `POST /api` (and every other verb on the bare prefix) answers that same JSON 404 instead of
    the plain-text 405 it gets today by falling through to the static half.
  - A trailing-slash path whose directory holds no `index.html` (`/css/`, `/components/`)
    answers a plain-text 404 instead of the SPA page.
- `POST`, `OPTIONS` and every other verb still answer `405 Method not allowed` as plain text on
  every URL the static half owns — `/`, `/css/app.css` and `/vendor/pico.css` alike.
- `docs/backend.md` describes the static half as a route rather than a `fetch` fallback, and
  `TODO.md:10` is removed.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass.

## Technical Key Decisions and Tradeoffs

Every claim about Bun's dispatch below was measured against a real server on port 0, on Bun
1.4.2 with `@types/bun` 1.4.2 — not inferred from the documentation.

1. **The `/*` route is a bare function handler, not a `{ GET, HEAD }` method map.** The handler
   keeps the method gate and the plain-text 405 inside it.
   - Why: measured — a `{ GET, HEAD }` map with no `fetch` behind it answers `POST` with an
     **empty-bodied 404** and no `Allow` header, losing today's `405 Method not allowed`. A bare
     function receives every method, so the 405 survives.
   - Impact: `fetch` can be deleted outright rather than kept alive for the sole purpose of
     saying 405.

2. **The vendor allowlist becomes route entries generated from `VENDOR_FILES`.** `paths.ts`
   exports the map; `static.routes.ts` turns each key into a route with a `{ GET, HEAD }` map.
   - Why: it makes the allowlist routing data instead of a branch buried in an imperative
     pipeline, and it is the difference between the route table describing the server's URL
     surface and merely describing its `/api` surface.
   - Impact: measured — an unmatched **method** on a specific route falls through to the next
     less-specific pattern, so `POST /vendor/pico.css` reaches `/*`, hits the method gate, and
     still answers 405. Nothing is needed to preserve that.

3. **`apiRoutes` becomes `allRoutes`, and `staticRoutes()` is spread in `routes.ts`.**
   - Why: the name stops being true the moment a non-`/api` table joins the spread, and
     `docs/backend.md:6` already calls `routes.ts` "the registry that spreads the route files
     into one `Bun.serve` table" — a route file under `routes/` belongs in that registry.
   - Impact: `server.ts` keeps holding no routing knowledge at all; the alternative was
     `server.ts` merging two registries itself.

4. **Route matching is by specificity, not by declaration order.**
   - Why: measured — with `/*` declared **first** in the object literal, `/api/health` still won
     for `/api/health` and `/api/*` still won for `/api/nope`. The existing comment in
     `routes.ts` ("Order matters only at the ends") overstates the constraint.
   - Impact: `staticRoutes()` is spread last for readability rather than for correctness, and
     the comment is corrected rather than copied forward.

5. **The static route is not wrapped in `guard()`.**
   - Why: `guard` renders a thrown `HttpError` as a JSON `{ error }` body, and the static half
     answers plain text. The pipeline throws nothing deliberately — `transpileModule` catches
     its own parse failures and returns a 500 itself.
   - Impact: the `error` hook becomes reachable through the route table for the first time, so
     the comment at `src/backend/http/server.test.ts:8-11` — which states that no request can
     reach the hook because everything in the table is guarded — stops being true and must be
     corrected. Note the pipeline is not throw-*free*: `transpile.ts:22` reads the file with
     `await Bun.file(path).text()` **outside** the `try` that wraps `transformSync`, so an I/O
     failure does propagate out of the handler. That is why the hook is the backstop rather
     than `guard`, and it is unchanged from today — a throw out of `fetch` reached the same hook.
     `docs/backend.md:34-36` ("New routes must be wrapped in `guardAll` in whichever route file
     owns them") therefore needs an exception written into it.

6. **`GET /api` is fixed by adding a literal `'/api'` key to `notFoundRoute()`.**
   - Why: Bun's `/api/*` pattern does not match the bare prefix `/api`, so it falls to the
     static half and is answered with `index.html` — an API URL replying with the SPA page.
   - Impact: measured — a literal `/api` key wins over `/*`, coexists with `/api/*`, applies to
     every verb, and does **not** swallow `/apix`, which still reaches the static half.

7. **The SPA fallback gains a trailing-slash check:**
   `extname(pathname) === '' && !pathname.endsWith('/')`.
   - Why: today `/css/` resolves to `src/frontend/css/index.html`, misses, has no extension, and
     is therefore answered with the SPA page — the fallback masking a real miss, which is the
     exact thing the extension test was written to prevent.
   - Impact: `/` is unaffected, because `src/frontend/index.html` exists and is served by the
     existence check above the fallback; the fallback is never reached for `/`.

8. **Bun 1.4.2's directory routes (`{ dir: './public' }`, `serve.d.ts:594-633`) are not used.**
   - Why: they serve files verbatim off the filesystem. This frontend is TypeScript on disk and
     JavaScript on the wire — `.ts` must go through `transpileModule` per request.
   - Impact: none; recorded so the option is not re-litigated.

## Current State

`serveOptions(repo)` (`src/backend/http/server.ts:18-24`) hands `Bun.serve` three options. Bun
tries the declared `routes` patterns first and calls `fetch` only when none matched:

```
                    Bun.serve({ routes, fetch, error })
                                  |
                 +----------------+-----------------+
                 |                                  |
          routes: apiRoutes(repo)            fetch: serveStatic
          /api/health                        http/static.ts:8-57
          /api/stats/...                     |
          /api/exercises/...                 +-- method not GET/HEAD -> 405 text/plain
          /api/workouts/...                  +-- resolveVendorPath hit
          /api/sets/...                      |     missing on disk -> 500 "run `bun install`"
          /api/*   (spread last)             |     exists          -> 200 text/css, max-age=3600
                                             +-- resolveStaticPath null -> 404
                                             +-- "/" or trailing "/" -> append index.html
                                             +-- exists? .ts -> transpileModule()
                                             |           else -> 200, Bun-inferred type, no-cache
                                             +-- extname(pathname) === '' -> SPA index.html
                                             +-- 404
```

```
src/backend/
├── paths.ts                 FRONTEND_DIR, VENDOR_FILES (private), resolveVendorPath,
│                            resolveStaticPath  — the only place a URL becomes a path
├── transpile.ts             transpileModule(): .ts on disk -> .js on the wire
└── http/
    ├── server.ts:18-24      { routes: apiRoutes(repo), fetch: serveStatic, error }
    ├── routes.ts:17-26      apiRoutes(repo) — six spreads, notFoundRoute() last
    ├── static.ts:8-57       serveStatic  <- the thing that is not a route
    ├── static.test.ts       8 tests, end-to-end over HTTP
    └── routes/
        ├── shared.ts        RouteTable, Handler, guard, guardAll
        ├── meta.routes.ts   /api/health, and /api/* in notFoundRoute()
        └── {stats,exercise,workout,set}.routes.ts (+ their *.test.ts)
```

Two consequences of that shape, both recorded as open questions in the research document:

- `/api/*` does not match the bare path `/api`, so `GET /api` falls through and answers
  `200 text/html` with the single-page app.
- `/css/` resolves to a directory with no `index.html`, misses, and is answered by the SPA
  fallback rather than a 404.

## Desired End State

There is no `fetch`. Every URL the server answers is a declared pattern, and the least specific
of them is the static one:

```
                       Bun.serve({ routes, error })
                                  |
                      routes: allRoutes(repo)
                                  |
   most specific  +---------------+----------------+---------------------+
                  |               |                |                     |
          /api/health      /api/workouts/:id   /vendor/pico.css        /api
          /api/stats/...   /api/sets/:id       { GET, HEAD }           /api/*
          ...              ...                 serveVendor             json 404
                                                    |
                                     an unmatched verb falls through --+
                                                                       |
   least specific                                                      v
                                                              /*  serveFrontend
                                                              (bare fn: owns the 405)
```

```
src/backend/
├── paths.ts                          VENDOR_FILES now exported
└── http/
    ├── server.ts                     { routes: allRoutes(repo), error }  — no fetch
    ├── routes.ts                     allRoutes(repo) — seven spreads, staticRoutes() last
    └── routes/
        ├── static.routes.ts          staticRoutes(), serveVendor, serveFrontend
        ├── static.routes.test.ts     the static tests, moved and extended
        └── meta.routes.ts            /api/health, plus /api and /api/* in notFoundRoute()
```

`src/backend/http/static.ts` and `src/backend/http/static.test.ts` are gone.

### Behaviour table

Mostly the research document's measured table
(`docs/agents/research/2026-09-11-static-file-serving.md:257-271`), with the three intended
changes marked. Four rows come from elsewhere: `GET /vendor/pico.scss` and `GET /nope.ts` are
existing expectations in `static.test.ts:34-37,46-48`, while `POST /vendor/pico.css` and
`GET /apix` were measured while writing this plan.

| Request                         | Before                      | After                       |
| ------------------------------- | --------------------------- | --------------------------- |
| `GET /`                         | 200 `text/html`, no-cache   | unchanged                   |
| `GET /index.html`               | 200 `text/html`, no-cache   | unchanged                   |
| `GET /main.ts`                  | 200 `text/javascript`       | unchanged                   |
| `GET /css/app.css`              | 200 `text/css`, no-cache    | unchanged                   |
| `HEAD /vendor/pico.css`         | 200 `text/css`, max-age=3600| unchanged                   |
| `POST /vendor/pico.css`         | 405 `text/plain`            | unchanged (falls to `/*`)   |
| `GET /vendor/pico.scss`         | 404                         | unchanged                   |
| `GET /workouts`                 | 200 `text/html`             | unchanged                   |
| `GET /css` (no slash)           | 200 `text/html`             | unchanged                   |
| `GET /apix`                     | 200 `text/html`             | unchanged                   |
| `GET /api/`, `GET /api/nope`    | 404 `application/json`      | unchanged                   |
| `GET /favicon.ico`, `/nope.ts`  | 404 `text/plain`            | unchanged                   |
| `GET /%2e%2e/package.json`      | 404 `text/plain`            | unchanged                   |
| `POST /`, `OPTIONS /`           | 405 `text/plain`            | unchanged                   |
| **`GET /api`**                  | 200 `text/html`             | **404 `application/json`**  |
| **`POST /api`**                 | 405 `text/plain`            | **404 `application/json`**  |
| **`GET /css/`, `/components/`** | 200 `text/html`             | **404 `text/plain`**        |

`POST /api` changes because the literal `/api` key is a bare guarded handler that claims every
verb, so the request no longer falls through to the static half's method gate. That is the
right answer — `/api` is an API URL, and `/api/` has always replied with the JSON 404 for any
verb — but it is a third behaviour change, not a side effect worth discovering later.

## Abstractions and Code Reuse

Nothing new is invented. `RouteTable` from `routes/shared.ts` types the new table; `paths.ts`
keeps both resolvers and stays the only place a URL becomes a filesystem path; `transpile.ts` is
untouched, and its doc comment's contract — that the caller has already resolved the path inside
`src/frontend/` — is still honoured, by `serveFrontend` instead of `serveStatic`.

The static handlers are typed `(req: Request) => Promise<Response>` rather than reusing
`Handler` from `shared.ts`: `Handler` takes a `ParamRequest` for parameterised `/api` patterns,
and these routes declare no parameters. Verified with `bunx tsc --noEmit` that a
`(req: Request) => Promise<Response>` is assignable into `RouteTable`, that `Object.fromEntries`
produces an assignable table, and that the whole shape typechecks under `strict` plus
`noUncheckedIndexedAccess`.

- `src/backend/`
  - `paths.ts` — export the vendor allowlist so route keys can be generated from it
    - `VENDOR_FILES` — gains `export`; contents and both resolvers unchanged
  - `http/`
    - `static.ts` — **deleted**
    - `static.test.ts` — **deleted** (moved)
    - `server.ts` — drops `fetch` and the `serveStatic` import
      - `GainzServeOptions` — loses its `fetch` property
      - `serveOptions` — returns `{ routes: allRoutes(repo), error }`
    - `server.test.ts` — correct the comment that claims the error hook is unreachable
    - `routes.ts` — spreads the static table too
      - `apiRoutes` — renamed `allRoutes`; docstring rewritten
    - `routes/static.routes.ts` — **new**. The whole static surface.
      - `staticRoutes` — `{ ...vendorRoutes(), '/*': serveFrontend }`
      - `vendorRoutes` — one `{ GET, HEAD }` entry per `VENDOR_FILES` key
      - `serveVendor` — the vendor branch, its 500, and its two explicit headers
      - `serveFrontend` — method gate, path resolution, directory index, `.ts`, file, SPA
    - `routes/static.routes.test.ts` — **new**. The moved tests plus the new cases.
    - `routes/meta.routes.ts` — docstring correction in Phase 1; a literal `/api` key in Phase 2
    - `routes/meta.routes.test.ts` — a case for the bare `/api` prefix
- `docs/backend.md` — the static half is a route; the specificity correction; the `guardAll`
  exception; renamed symbols and moved test paths
- `TODO.md` — remove line 10

## Logging & Observability

No change. The only log line on this path is `transpile.ts:30`'s
`gainz: could not transpile <path>`, and `transpile.ts` is not touched. `errorResponse` still
writes `Unhandled error:` to stderr for a non-`HttpError` reaching the error hook.

## Implementation

### Phase 1: Move static serving into a route file

Dependencies: None.

A pure restructuring. Every response stays byte-identical, so the existing suite plus the
research document's measured table is the regression net: anything that differs is a bug in the
move, not a decision.

**Tasks**:

- [x] `src/backend/paths.ts:23` — add `export` to `VENDOR_FILES`. Leave the contents, the
      docstring and both resolvers exactly as they are.

- [x] Create `src/backend/http/routes/static.routes.ts`. Move the body of `serveStatic`
      (`src/backend/http/static.ts:8-57`) into it, split at the vendor branch, keeping every
      existing comment with the code it explains.

      ```ts
      /**
       * The static half of the server, as routes: `src/frontend/` under `/*`, plus one route
       * per entry of the vendor allowlist in `paths.ts`.
       *
       * `/*` is the least specific pattern in the table, so it is reached only when no `/api`
       * pattern and no vendor URL matched — Bun matches by specificity, not by declaration
       * order. It is a bare function rather than a `{ GET, HEAD }` map because a map answers an
       * unmatched verb with an empty 404, and this route owns the 405 for the whole server.
       */
      import { extname, resolve } from 'node:path';
      import { FRONTEND_DIR, VENDOR_FILES, resolveStaticPath, resolveVendorPath } from '../../paths.ts';
      import { transpileModule } from '../../transpile.ts';
      import type { RouteTable } from './shared.ts';

      export function staticRoutes(): RouteTable {
        return { ...vendorRoutes(), '/*': serveFrontend };
      }

      /** One route per allowlisted vendor URL, so the table names every file it will serve. */
      function vendorRoutes(): RouteTable {
        return Object.fromEntries(
          Object.keys(VENDOR_FILES).map((url) => [url, { GET: serveVendor, HEAD: serveVendor }]),
        );
      }
      ```

- [x] In the same file, write `serveVendor`. `resolveVendorPath` returning `null` means the
      package is not installed at all, which answers 404 as it does today; a specifier that
      resolves to a file that is not on disk stays the 500.

      ```ts
      async function serveVendor(req: Request): Promise<Response> {
        const vendor = resolveVendorPath(new URL(req.url).pathname);
        if (!vendor) {
          // The specifier would not resolve: the package is not installed. Today's 404.
          return new Response('Not found', { status: 404 });
        }
        const file = Bun.file(vendor);
        if (!(await file.exists())) {
          return new Response('Vendor stylesheet missing — run `bun install`', { status: 500 });
        }
        // Versioned by the lockfile rather than the URL, but it only changes on install.
        return new Response(file, {
          headers: { 'Content-Type': 'text/css;charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      }
      ```

- [x] In the same file, write `serveFrontend` — `serveStatic` minus the vendor branch, with
      `isRoot` renamed `isDirectory` because that is what it tests. Keep the `Content-Type`
      comment (`static.ts:41-45`) verbatim; it is the reasoning, not a restatement.

      ```ts
      async function serveFrontend(req: Request): Promise<Response> {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return new Response('Method not allowed', { status: 405 });
        }
        const { pathname } = new URL(req.url);
        const resolved = resolveStaticPath(pathname);
        if (!resolved) {
          return new Response('Not found', { status: 404 });
        }
        const isDirectory = pathname === '/' || pathname.endsWith('/');
        const candidate = isDirectory ? resolve(resolved, 'index.html') : resolved;
        // ... existence check, .ts branch, file branch, SPA fallback, 404 — all unchanged
      }
      ```

- [x] Delete `src/backend/http/static.ts`.

- [x] `src/backend/http/routes.ts` — rename `apiRoutes` to `allRoutes`, import `staticRoutes`
      from `./routes/static.routes.ts`, and spread it last. Rewrite the docstring: it currently
      claims "Everything lives under /api; the frontend is served as static files by the server
      module", and that order matters at the ends. Both are now wrong — say instead that the
      table covers the whole URL surface, and that Bun matches by specificity, so the spread
      order is for readers.

- [x] `src/backend/http/server.ts` — drop the `serveStatic` import, remove `fetch` from
      `GainzServeOptions`, and return `{ routes: allRoutes(repo), error }`. The interface's
      existing comment about the port/unix union still applies and stays.

- [x] `src/backend/http/server.test.ts:8-11` — correct the comment. It explains that no request
      can reach the error hook because `guardAll` wraps the method maps and `guard` wraps the
      `/api/*` catch-all. The unguarded `/*` route now makes the hook reachable; say that, and
      that `serveFrontend` throws nothing deliberately — the only way through is an I/O failure
      in `transpile.ts:22`, which sits outside that module's `try` — which is why the test still
      calls the hook directly rather than trying to provoke it over HTTP.

- [x] `src/backend/http/routes/meta.routes.ts:14` — correct the `notFoundRoute()` docstring.
      It says "The /api catch-all. Spread last, so every named pattern wins over it", and
      `staticRoutes()` is now spread after it. Say instead that `/api/*` is matched only when no
      named `/api` pattern is more specific, which is Bun's rule rather than a property of the
      spread order. Done in this phase so Phase 1 leaves no comment stating something false.

- [x] Move `src/backend/http/static.test.ts` to `src/backend/http/routes/static.routes.test.ts`
      and fix its import to `'../../testing.ts'`. All eight existing tests keep their
      expectations unchanged.

- [x] Add to `static.routes.test.ts` a case pinning the 405, which nothing covers today and
      which is the reason `/*` is a bare function:

      ```ts
      test('answers a verb other than GET or HEAD with 405', async () => {
        for (const path of ['/', '/css/app.css', '/vendor/pico.css']) {
          const res = await api(path, { method: 'POST' });
          expect(res.status).toBe(405);
          expect(await res.text()).toBe('Method not allowed');
        }
      });
      ```

      `/vendor/pico.css` is the load-bearing case: it has its own `{ GET, HEAD }` route, and the
      405 can only come from falling through to `/*`.

- [x] Add to `static.routes.test.ts` a case for the SPA fallback, so the extension-less client
      route is pinned before Phase 3 narrows the rule around it:

      ```ts
      test('serves the index page for an extension-less client route', async () => {
        const res = await api('/workouts');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
      });
      ```

- [x] `docs/backend.md:6-13` — add `static.routes.ts` to the list of route files, and replace
      "The static half hangs off `http/server.ts` as its `fetch` fallback: `http/static.ts`
      (serves `src/frontend/` and the vendor allowlist)" with the route framing:
      `http/routes/static.routes.ts` is a route file like any other, `/*` for `src/frontend/`
      and one key per vendor allowlist entry, over `paths.ts`.

- [x] `docs/backend.md:21-24` — correct the last sentence of that paragraph. `routes.ts` still
      holds no handler code, but the `/api/*` catch-all is not spread last for correctness:
      record that Bun matches by specificity, measured on 1.4.2, and that the spread order is
      for readability.

- [x] `docs/backend.md:34-36` — write the exception into the `guardAll` rule. It currently reads
      "New routes must be wrapped in `guardAll` in whichever route file owns them", which
      decision 5 deliberately breaks. Scope the rule to the API routes and name the static route
      as the exception: it answers plain text, not JSON, so a thrown error belongs to the
      `error` hook in `server.ts` rather than to `guard`.

- [x] `docs/backend.md:74-80` — update the two-omissions paragraph: `static.ts` becomes
      `static.routes.ts`, and `src/backend/http/static.test.ts:39` becomes a line reference into
      `src/backend/http/routes/static.routes.test.ts` — re-derive the line number after the two
      new tests are appended rather than dropping the anchor, since the original cited a
      specific test. Add a third sentence recording why `/*` is a bare function handler and
      therefore owns the 405 for the whole server.

- [x] `TODO.md:10` — remove "Change static.ts to become an actual route, not a fetch fallback".

- [x] Leave `CLAUDE.md` as it stands. "`src/backend/http/routes/` holds one file per URL group,
      and a route belongs to the file its URL prefix names" is still true of `static.routes.ts`
      — it owns `/vendor/…` and `/*`. Recorded so the omission reads as a decision.

**Automated Verification**:

- [x] `bun test` passes, including the ten tests in `src/backend/http/routes/static.routes.test.ts`.
- [x] `bun test -t "answers a verb other than GET or HEAD with 405"` passes — the case proving
      an unmatched verb on the vendor route falls through to `/*`.
- [x] `bun run typecheck` passes — `serveOptions` returning an object with no `fetch` still
      satisfies `Bun.serve`, and the route table accepts a bare `(req: Request)` handler.
- [x] `bun run lint` and `bun run fmt:check` pass.
- [x] `rg -n "serveStatic|http/static\.ts" src/` returns nothing.
- [x] `rg -n "apiRoutes" src/` returns nothing.
- [x] `src/backend/http/static.ts` and `src/backend/http/static.test.ts` do not exist.

### Phase 2: Answer `GET /api` from the API catch-all

Dependencies: Phase 1.

`/api/*` does not match the bare prefix, so an API URL currently replies with the single-page
app. A literal key fixes it; measured to win over `/*`, to apply to every verb, and to leave
`/apix` on the static half.

**Tasks**:

- [x] `src/backend/http/routes/meta.routes.ts` — add `'/api'` to `notFoundRoute()` beside
      `'/api/*'`, with the same guarded handler, and extend the docstring to say why the bare
      prefix needs its own key.

      ```ts
      /** The /api catch-all. `/api/*` does not match the bare prefix, so `/api` needs its own key. */
      export function notFoundRoute(): RouteTable {
        const endpointNotFound = guard(() => errorResponse(notFound('Endpoint')));
        return {
          '/api': endpointNotFound,
          '/api/*': endpointNotFound,
        };
      }
      ```

- [x] `src/backend/http/routes/meta.routes.test.ts` — add a case for the bare prefix, asserting
      both the JSON body and that `/apix` is untouched:

      ```ts
      test('the bare /api prefix returns a JSON 404, but /apix does not', async () => {
        const res = await api('/api');
        expect(res.status).toBe(404);
        expect((await body<ErrorBody>(res)).error).toContain('not found');
        // Every verb, not just GET: the key claims the URL before the static method gate.
        expect((await api('/api', { method: 'POST' })).status).toBe(404);
        expect((await api('/apix')).headers.get('content-type')).toContain('text/html');
      });
      ```

      The `POST` assertion pins the third behaviour change: today the bare prefix falls through
      to the static half and answers `405 Method not allowed`.

**Automated Verification**:

- [x] `bun test -t "the bare /api prefix returns a JSON 404, but /apix does not"` passes.
- [x] `bun test` passes — in particular the existing `/api/nope` and `/api/health` cases are
      unaffected by the new key.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

### Phase 3: Stop the SPA fallback masking a directory with no index

Dependencies: Phase 1.

`/css/` resolves to `src/frontend/css/index.html`, misses, has no file extension, and is
therefore answered with the SPA page. The extension test exists precisely so a miss is not
masked; a trailing slash is a request for a directory, not a client route, so it belongs on the
same side of that test as `/nope.ts`.

**Tasks**:

- [x] `src/backend/http/routes/static.routes.ts` — narrow the SPA fallback in `serveFrontend`
      to exclude trailing-slash paths, reusing the `isDirectory` flag computed above it:

      ```ts
      // Unknown path without a file extension: let the single-page app route it. A trailing
      // slash asked for a directory index that is not there, so it is a miss, not a route.
      if (extname(pathname) === '' && !isDirectory) {
        const index = Bun.file(resolve(FRONTEND_DIR, 'index.html'));
        if (await index.exists()) {
          return new Response(index, { headers: { 'Cache-Control': 'no-cache' } });
        }
      }
      ```

      `/` is unaffected: `src/frontend/index.html` exists and is returned by the existence check
      above, so `/` never reaches this branch.

- [x] `src/backend/http/routes/static.routes.test.ts` — add a case covering both directions of
      the rule:

      ```ts
      test('a trailing-slash directory with no index is a 404, but the path without one is not', async () => {
        for (const path of ['/css/', '/components/']) {
          expect((await api(path)).status).toBe(404);
        }
        // No trailing slash: still an extension-less client route for the single-page app.
        const res = await api('/css');
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toContain('text/html');
      });
      ```

- [x] `docs/backend.md:70-72` — extend the "static serving is deliberately narrow" paragraph
      (**not** the two-omissions paragraph Phase 1 edits) with the directory rule: a trailing
      slash asks for `index.html` in that directory, and a directory without one is a 404 rather
      than the SPA page, so the fallback cannot mask a miss.

**Automated Verification**:

- [x] `bun test -t "a trailing-slash directory with no index is a 404, but the path without one is not"` passes.
- [x] `bun test` passes — the root, `/workouts`, and `/api/` cases are all unaffected.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [ ] `bun start`, open `http://localhost:3000/`, and confirm the dashboard renders styled —
      Pico from `/vendor/pico.css`, `/css/app.css`, and the lazily imported component scripts
      and stylesheets all arrive. Navigate to an exercise so a lazily loaded view and its chart
      are fetched, then reload on a deep client route such as `/workouts` and confirm the SPA
      fallback still serves the page.

## Implementation Notes

All three phases went in as written; nothing in the plan had to be adapted. Two things worth
recording:

- The behaviour table in this document was re-measured against a real server on port 0 after
  Phase 3, all 22 rows, and every one matched — including `GET /api` and `POST /api` answering
  the JSON 404 and `/css/` and `/components/` answering a plain-text 404, while `/apix` and
  `/css` stay on the static half with the single-page app.
- `docs/backend.md`'s anchor into the HEAD test survived the move unchanged: the two tests added
  in Phase 1 and the one added in Phase 3 all sit below it, so
  `src/backend/http/routes/static.routes.test.ts:39` is still the test it names.

The suite ends at 57 tests, with `bun run typecheck`, `bun run lint` and `bun run fmt:check`
clean.

## References

- `docs/agents/research/2026-09-11-static-file-serving.md` — the research this plan is built on,
  including the measured behaviour table used as the regression net for Phase 1 and the two open
  questions resolved in Phases 2 and 3
- `src/backend/http/static.ts:8-57` — `serveStatic`, the pipeline being moved
- `src/backend/http/server.ts:18-24` — `serveOptions`, where `fetch` is wired and removed
- `src/backend/http/routes.ts:17-26` — `apiRoutes`, becoming `allRoutes`
- `src/backend/http/routes/meta.routes.ts:14-19` — `notFoundRoute()`, its docstring corrected in
  Phase 1 and its `/api` key added in Phase 2
- `src/backend/paths.ts:23-25` — `VENDOR_FILES`, gaining `export`
- `src/backend/http/routes/shared.ts:4` — `RouteTable`, the type the new table is written against
- `src/backend/transpile.ts:21-32` — `transpileModule`; note `Bun.file(path).text()` at `:22` is
  outside the `try`, which is why the static route needs the `error` hook as a backstop
- `node_modules/bun-types/serve.d.ts:594-642` — `DirectoryRouteOptions` (considered, rejected)
  and `Routes`, whose value union permits a bare handler function
- `docs/backend.md:6-13,21-24,34-36,70-72,74-80` — the five passages this plan edits
- `TODO.md:10` — the item this plan closes
