---
date: 2026-09-11T09:15:21+00:00
git_commit: 27eb98c84e92f0e8923d03813ebc7b9be9170f74
branch: main
topic: 'How static files are served in the backend'
tags: [research, codebase, backend, static-files, bun-serve, transpile, paths, vendor-allowlist]
status: complete
---

# Research: How static files are served in the backend

## Research Question

How are static files served in the backend?

## Summary

Static serving is the `fetch` fallback of `Bun.serve`. `src/backend/http/server.ts:18-24` builds
the server options as `{ routes: apiRoutes(repo), fetch: serveStatic, error: … }`, so Bun tries the
API route table first and only calls `serveStatic` when no declared route pattern matched. The API
surface is data (an object literal of URL patterns); the static surface is one imperative function,
`serveStatic` in `src/backend/http/static.ts:8-57`, reached as the fallback.

Three modules carry the whole of it, and they are deliberately split by concern:

- `src/backend/paths.ts` — **the only place a URL becomes a filesystem path.** It exports
  `FRONTEND_DIR`, the `VENDOR_FILES` allowlist, `resolveVendorPath()` and `resolveStaticPath()`.
- `src/backend/http/static.ts` — the request pipeline: method check, vendor branch, path resolution,
  directory-index handling, the `.ts` transpile branch, the plain-file branch, the SPA fallback.
- `src/backend/transpile.ts` — `transpileModule()`, which runs one frontend `.ts` file through a
  module-level `Bun.Transpiler` and answers with `text/javascript`.

Everything the backend is allowed to read over HTTP is decided in `paths.ts`: the `src/frontend/`
directory behind a path-escape guard, plus a hand-written one-entry allowlist of individual files
inside `node_modules`. Nothing is bundled, nothing is written to disk, and there is no output
directory — `src/frontend/` is the web root, so a module's URL is its path below it.

```
src/backend/
├── main.ts                      entry point: Bun.serve({ port, ...serveOptions(repo) })
├── paths.ts                     FRONTEND_DIR, VENDOR_FILES, resolveVendorPath, resolveStaticPath
├── transpile.ts                 Bun.Transpiler wrapper; .ts on disk → .js on the wire
├── transpile.test.ts            type erasure, untouched specifiers, the 500-on-parse-error path
└── http/
    ├── server.ts                serveOptions(repo) — wires serveStatic in as `fetch`
    ├── routes.ts                the /api route table (tried before the fallback)
    ├── static.ts                serveStatic(req) — the whole static pipeline
    ├── static.test.ts           root, traversal, stylesheets, vendor, HEAD, 404s
    └── routes/meta.routes.ts    the `/api/*` catch-all, spread last

src/frontend/                    the web root — served verbatim except that .ts is transpiled
├── index.html                   the single page; also the SPA fallback body
├── css/{app,shared}.css
└── components/<tag>/<tag>.{ts,css}
```

The request pipeline, in the order `static.ts` writes it:

```
                       Bun.serve
                           |
          +----------------+----------------+
          |                                 |
     routes (apiRoutes)                fetch fallback
     /api/health, /api/…               serveStatic(req)
     /api/* catch-all (last)                 |
                                             |
                            GET or HEAD? ----+---- no --> 405 "Method not allowed"
                                             | yes
                            resolveVendorPath(pathname)
                                 hit --------+---> file exists? --> 200 text/css, max-age=3600
                                             |     missing?     --> 500 "run `bun install`"
                                 miss        |
                            resolveStaticPath(pathname)
                                 null -------+---> 404 "Not found"   (escape / bad encoding / NUL)
                                 path        |
                         "/" or trailing "/"?+---> append index.html
                                             |
                            Bun.file(candidate).exists()?
                                 yes --------+---> .ts  --> transpileModule() --> text/javascript
                                             |     else --> 200, Bun-inferred type, no-cache
                                 no          |
                            extname(pathname) === ''?
                                 yes --------+---> src/frontend/index.html   (SPA fallback)
                                 no  --------+---> 404 "Not found"
```

## Detailed Findings

### Wiring: how the static half is reached

`serveOptions(repo)` (`src/backend/http/server.ts:18-24`) returns the three options this app gives
`Bun.serve`: the route table from `apiRoutes(repo)`, `fetch: serveStatic`, and an `error` hook that
renders a thrown error through `errorResponse`. `main.ts:13` spreads that into
`Bun.serve({ port, ...serveOptions(repo) })`, and `src/backend/testing.ts:65` spreads the same
object into a server on port 0 — so the tests exercise the real static pipeline, not a stand-in.

Bun matches the declared `routes` patterns first; `fetch` runs only when none matched. Because
`notFoundRoute()` (`src/backend/http/routes/meta.routes.ts:15-19`) is spread last and declares
`/api/*`, every path under `/api/` is answered by the API half as a JSON `{ error }` body and never
reaches `serveStatic`.

One measured consequence of Bun's pattern matching: `/api/*` matches `/api/` and `/api/anything`,
but **not** the bare path `/api`. A `GET /api` therefore falls through to `serveStatic`, has no file
extension, and is answered with `index.html` by the SPA fallback (200, `text/html`). `GET /api/` is
a JSON 404 from the catch-all.

### `paths.ts` — the one place a URL becomes a filesystem path

`REPO_ROOT` (`src/backend/paths.ts:14`) is derived from the module's own location,
`resolve(fileURLToPath(new URL('../..', import.meta.url)))`, and the comment above it records that
this only holds while the file sits directly in `src/backend/`. `FRONTEND_DIR`
(`src/backend/paths.ts:15`) is `resolve(REPO_ROOT, 'src', 'frontend')`.

`VENDOR_FILES` (`src/backend/paths.ts:23-25`) is a `Record<string, string>` from URL path to package
specifier, with exactly one entry:

```ts
const VENDOR_FILES: Record<string, string> = {
  '/vendor/pico.css': '@picocss/pico/css/pico.orange.min.css',
};
```

`resolveVendorPath(pathname)` (`src/backend/paths.ts:27-37`) looks the pathname up in that map,
returns `null` on a miss, and otherwise hands the specifier to `Bun.resolveSync(specifier, REPO_ROOT)`
inside a `try`/`catch` that returns `null` if resolution throws. The module docstring states why this
is an allowlist of single files rather than a served directory: installing a package never exposes
anything the app did not ask to publish.

`resolveStaticPath(pathname)` (`src/backend/paths.ts:42-58`) is the escape guard, and runs four
checks in order:

1. `decodeURIComponent(pathname)` inside a `try`/`catch` — a malformed escape returns `null`
   (`:43-48`).
2. A NUL byte in the decoded path returns `null` (`:49-51`).
3. The path is joined as `resolve(FRONTEND_DIR, '.' + normalize(decoded))` (`:53`) — the leading `.`
   makes the normalised absolute-looking path relative to the frontend directory.
4. The result must be `FRONTEND_DIR` itself or start with `FRONTEND_DIR + sep`; anything else
   returns `null` (`:54-56`).

Decoding before normalising is what makes the guard hold against an encoded traversal:
`src/backend/http/static.test.ts:50-55` asks for `/%2e%2e/backend/http/server.ts` and
`/%2e%2e/backend/transpile.ts` — encoded on purpose, so the URL parser cannot normalise the
traversal away before `resolveStaticPath` sees it — and expects 404 for both.

### `static.ts` — the request pipeline

`serveStatic(req)` (`src/backend/http/static.ts:8-57`) runs these stages:

**Method check** (`:9-11`). Anything that is not `GET` or `HEAD` gets a plain-text 405
`Method not allowed`. Measured: `POST /` and `OPTIONS /` both answer 405. There is no further
special-casing of `HEAD` — Bun strips the body itself and leaves the headers alone, which
`src/backend/http/static.test.ts:39-44` holds in place by asserting a `HEAD /format.ts` carries
`text/javascript` with an empty body.

**Vendor branch** (`:15-25`). `resolveVendorPath(pathname)` is consulted before anything touches
`src/frontend/`. A hit that does not exist on disk answers **500** with
`Vendor stylesheet missing — run \`bun install\`` rather than a 404, because a missing vendor file
means the install is broken, not that the URL was wrong. A hit that exists is the one response in
the whole function that sets `Content-Type` by hand — `text/css;charset=utf-8` — and the one with a
non-`no-cache` policy: `public, max-age=3600`. The inline comment records the reasoning: the file is
versioned by the lockfile rather than by the URL, but it only changes on install.

**Path resolution** (`:27-30`). `resolveStaticPath(pathname)` returning `null` is a plain-text 404.

**Directory index** (`:32-33`). `isRoot` is `pathname === '/' || pathname.endsWith('/')`; when true,
`index.html` is appended to the resolved directory. This is the only directory-index rule — a
trailing-slash path under a directory that holds no `index.html` falls through to the existence
check below and then to the SPA fallback (measured: `/css/` answers with `index.html`, not a listing
and not a 404).

**Existence and the `.ts` branch** (`:35-47`). `Bun.file(candidate).exists()` decides the branch.
When the file exists and `extname(candidate) === '.ts'`, the request is handed to
`transpileModule(candidate)`. Any other existing file is returned as
`new Response(file, { headers: { 'Cache-Control': 'no-cache' } })` — deliberately with **no explicit
`Content-Type`**. The comment at `:41-45` records why: `new Response(Bun.file(x))` already carries
the type Bun infers from the extension off a complete MIME database, so a hand-written map here
would be a subset of that and would drift as `src/frontend/` grows. `no-cache` (revalidate) is
chosen because the app is a single page whose assets carry hash-free URLs.

**SPA fallback** (`:49-55`). If nothing exists at the resolved path *and* `extname(pathname) === ''`,
`src/frontend/index.html` is served with `Cache-Control: no-cache`. The extension test is what keeps
this from masking real misses: a missing `.css`, `.js` or `.ts` is a 404, while an extension-less
path is treated as a client route. Measured: `/workouts`, `/components` and `/css` all answer 200
`text/html` with the index page; `/favicon.ico` and `/nope.ts` answer 404.

Anything reaching the end of the function is a plain-text 404 (`:56`).

### `transpile.ts` — TypeScript on disk, JavaScript on the wire

One transpiler instance is created at module scope and reused across requests
(`src/backend/transpile.ts:15`):

```ts
const transpiler = new Bun.Transpiler({ loader: 'ts', target: 'browser' });
```

`transpileModule(path)` (`src/backend/transpile.ts:21-37`) reads the file with `Bun.file(path).text()`,
runs `transformSync`, and answers with `Content-Type: text/javascript;charset=utf-8` and
`Cache-Control: no-cache`. On a throw it logs `gainz: could not transpile <path>` to the console and
answers **500** with `Could not transpile <basename>` (`:27-32`); the comment explains the choice —
a syntax error would otherwise reach the browser as a blank view, so the file is named and
`gz-app`'s failed-import path turns it into a toast.

The docstring at `:3-14` records the property the no-build-step frontend rests on: Bun's transpiler
only **erases types** — it does not resolve or rewrite import specifiers — so `import './format.ts'`
reaches the browser unchanged and asks for the file that actually exists on disk. It also records
the gap that follows: types are erased, not checked, so a type error transpiles happily and ships,
and `bun run typecheck` is the gate.

The contract on `path` is written into the function's own doc comment (`:17-20`): the path has
already been resolved inside `src/frontend/` by the caller, which is where the traversal guard
lives. `transpileModule` performs no validation of its own.

### What the frontend asks for, and therefore what is served

`src/frontend/index.html` is the only page. Its `<head>` issues exactly three subresource requests
(`:33-35`): `/vendor/pico.css`, `/css/app.css`, and `<script type="module" src="/main.ts">`. The
favicon is a `data:image/svg+xml` URI (`:10-13`), so no `/favicon.ico` request is made, and the
theme-priming script at `:14-27` is inline precisely because it must run before any module has
loaded.

From there the URL-is-the-path rule does the rest. `src/frontend/styles.ts:19` names the two sheets
every component adopts, `/vendor/pico.css` and `/css/shared.css`, fetched up front behind a
top-level `await` (`:46`). `componentHref` (`:21`) derives a component's stylesheet URL from its tag
name — `/components/<tag>/<tag>.css` — so `styles.ts:27-44` fetches it by convention with no
manifest anywhere. `define()` in `src/frontend/base.ts:183-191` awaits that fetch before registering
the element, which is why a lazily imported route view arrives already styled.

A component module imported at runtime therefore causes exactly two static requests: its `.ts`
(transpiled on the way out) and its `.css` (served as a file, with Bun's inferred `text/css`).

### Tests

Two files cover the static half end-to-end over HTTP, both built on `useServer()` from
`src/backend/testing.ts`:

`src/backend/http/static.test.ts` covers the root serving `index.html` as `text/html` (`:7-12`),
traversal below `src/frontend/` returning 404 (`:14-17`), the app stylesheets including a component
sheet (`:19-25`), Pico at the fixed vendor path with `Pico CSS` in the body (`:27-32`), the
allowlist exposing only that one file — `/vendor/pico.scss` and
`/node_modules/@picocss/pico/package.json` are both 404 (`:34-37`) — `HEAD` carrying headers with an
empty body (`:39-44`), a missing `.ts` returning 404 (`:46-48`), and the encoded-traversal cases
(`:50-55`).

`src/backend/transpile.test.ts` covers type erasure (`:9-19`), specifiers left untouched so a URL
names a real file (`:21-24`), the entry point `index.html` names (`:26-34`), a types-only module
erasing to an empty body (`:36-41`), type-only imports being stripped so `types.ts` is never fetched
at runtime (`:43-46`), the load-bearing top-level `await define(…)` surviving transpilation
(`:48-51`), and a deliberately broken file written into `src/frontend/` answering 500 with its own
name (`:53-63`).

### Measured behaviour

Run against a real server on port 0 at commit `27eb98c` (Bun, `@types/bun` 1.4.2):

| Request                     | Status | `Content-Type`             | `Cache-Control`         |
| --------------------------- | ------ | -------------------------- | ----------------------- |
| `GET /`                     | 200    | `text/html;charset=utf-8`  | `no-cache`              |
| `GET /index.html`           | 200    | `text/html;charset=utf-8`  | `no-cache`              |
| `GET /main.ts`              | 200    | `text/javascript;charset=utf-8` | `no-cache`         |
| `GET /css/app.css`          | 200    | `text/css;charset=utf-8`   | `no-cache`              |
| `HEAD /vendor/pico.css`     | 200    | `text/css;charset=utf-8`   | `public, max-age=3600`  |
| `GET /workouts`             | 200    | `text/html;charset=utf-8`  | `no-cache`              |
| `GET /css` and `GET /css/`  | 200    | `text/html;charset=utf-8`  | `no-cache`              |
| `GET /components`           | 200    | `text/html;charset=utf-8`  | `no-cache`              |
| `GET /api`                  | 200    | `text/html;charset=utf-8`  | `no-cache`              |
| `GET /api/`, `GET /api/nope`| 404    | `application/json;charset=utf-8` | —                 |
| `GET /favicon.ico`          | 404    | `text/plain;charset=utf-8` | —                       |
| `GET /%2e%2e/package.json`  | 404    | `text/plain;charset=utf-8` | —                       |
| `POST /`, `OPTIONS /`       | 405    | `text/plain;charset=utf-8` | —                       |

## Code References

- `src/backend/http/server.ts:18-24` — `serveOptions(repo)`; `fetch: serveStatic` is the wiring
- `src/backend/main.ts:13` — `Bun.serve({ port, ...serveOptions(repo) })`
- `src/backend/testing.ts:63-67` — the same options on port 0, so tests drive the real pipeline
- `src/backend/http/routes/meta.routes.ts:15-19` — `/api/*`, spread last, keeps `/api/…` off the fallback
- `src/backend/http/static.ts:8-57` — `serveStatic`, the entire static request pipeline
- `src/backend/http/static.ts:9-11` — the `GET`/`HEAD` gate and the 405
- `src/backend/http/static.ts:15-25` — the vendor branch, its 500, and its two explicit headers
- `src/backend/http/static.ts:27-33` — resolution and the trailing-slash `index.html` rule
- `src/backend/http/static.ts:35-47` — the `.ts` branch, and the deliberate absence of `Content-Type`
- `src/backend/http/static.ts:49-55` — the extension-less SPA fallback
- `src/backend/paths.ts:14-15` — `REPO_ROOT` from `import.meta.url`, and `FRONTEND_DIR`
- `src/backend/paths.ts:23-25` — `VENDOR_FILES`, the one-entry `node_modules` allowlist
- `src/backend/paths.ts:27-37` — `resolveVendorPath`, `Bun.resolveSync` inside a `try`/`catch`
- `src/backend/paths.ts:42-58` — `resolveStaticPath`: decode, NUL check, normalise, prefix check
- `src/backend/transpile.ts:15` — the module-level `Bun.Transpiler`, reused across requests
- `src/backend/transpile.ts:21-37` — `transpileModule`, its headers, and the 500 on a parse error
- `src/backend/http/static.test.ts:1-56` — the static-serving test file
- `src/backend/transpile.test.ts:1-64` — the transpilation test file
- `src/frontend/index.html:33-35` — the three subresources the page asks for
- `src/frontend/styles.ts:19-21` — the base hrefs and the `/components/<tag>/<tag>.css` convention
- `src/frontend/base.ts:183-191` — `define()`, which awaits the stylesheet before registering
- `docs/backend.md:70-81` — the documented static-serving policy and its two deliberate omissions
- `docs/frontend.md:39-63` — the documented loading model the static half implements

## Architecture Documentation

**One place converts a URL to a path.** `paths.ts` holds `FRONTEND_DIR`, the vendor map and both
resolvers; `static.ts` never calls `resolve()` on anything derived from a request except to append
`index.html` to an already-resolved path. `transpile.ts` documents in its own comment that it
relies on the caller having done the resolution.

**Allowlist first, then guard.** Third-party files come from an explicit URL→specifier map; the app's
own files come from one directory behind a decode/NUL/prefix check. Adding a second vendor file
means adding a line to `VENDOR_FILES` — `docs/backend.md:70-72` states this as the rule.

**Routing is data; static serving is code.** The API surface is an object literal assembled by
`apiRoutes()`; the static surface is an imperative function reached only when that table does not
match.

**The frontend is transformed, not built.** `.ts` is transpiled per request at the URL its source
lives at. That is why `serveStatic` branches on `extname` rather than consulting a manifest, and why
there is no output directory to serve from.

**Cache policy is per class of asset.** `no-cache` for everything under `src/frontend/`, including
transpiled modules, because the URLs carry no hash; `public, max-age=3600` for the vendor stylesheet,
which is versioned by the lockfile and changes only on install.

**Content types are inferred, not enumerated.** The single hand-written `Content-Type` on the static
path is the vendor stylesheet's; everything else comes from `Bun.file`'s extension inference, with
`transpileModule` setting `text/javascript` because the file on disk says `.ts`.

**Errors distinguish "wrong URL" from "broken install".** A missing app file is 404; a vendor file
that resolves but is not on disk is 500 naming `bun install`; a file that will not parse is 500
naming the file.

## Open Questions

- `GET /api` (no trailing slash) is answered by the SPA fallback with `index.html` rather than by the
  `/api/*` catch-all, because Bun's `/api/*` pattern does not match the bare prefix. Whether that
  path is meant to reach the static half is not recorded anywhere in the code or the docs.
- A trailing-slash request for a directory with no `index.html` (`/css/`, `/components/`) is answered
  with the SPA fallback page rather than a 404. The directory-index rule at `static.ts:32-33` and the
  fallback at `:49-55` combine to produce this; no comment or test addresses the combination.
- `docs/agents/research/2026-09-10-server-and-src-layout.md` documents this same subject against the
  earlier layout, when `serveStatic`, `VENDOR_FILES` and both resolvers all lived in
  `backend/src/server.ts`. Commit `016f95c` ("refactor(backend): Introduce various layers") split
  them into `src/backend/http/static.ts` and `src/backend/paths.ts`; the older document's paths are a
  record of that earlier state.
