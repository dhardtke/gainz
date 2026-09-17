---
date: 2026-09-17T08:40:01.970596+00:00
git_commit: 267839e2d9863c37729d1ea3d5f401cc8ce16285
branch: main
topic: 'Hot reload for the frontend'
tags: [plan, dev, static, frontend, styles, websocket]
status: ready
---

# PLAN: Hot reload for the frontend

Today the frontend edit loop is "save, switch to the browser, press reload". This plan removes the
reload: a development-only file watcher pushes each change over a WebSocket, a stylesheet change
restyles every live component in place, and anything else reloads the page for you.

The request that started this was "use Bun's HMR". Bun's browser HMR turned out not to be reachable
from this architecture — see decision 1 — so this builds the same behaviour out of `fs.watch`, a
`Bun.serve` WebSocket and `CSSStyleSheet.replace()`, which is what Bun's own CSS reloader does
underneath.

## Acceptance Criteria

- `bun run start:dev` serves `index.html` with exactly one injected
  `<script type="module" src="/dev/hot.ts"></script>`; `bun start` serves it byte-identical to today
  and registers no `/dev/ws` route, so a WebSocket opened there never connects.
- Saving any `.css` under `src/frontend/` restyles every live component instance with no page
  reload, no navigation, and no loss of form state or scroll position.
- Saving a `.ts` or `index.html` under `src/frontend/` reloads the page at the same path.
- Saving a `.ts` that does not parse shows the transpile failure in a toast and leaves the page as
  it is; the next parsing save reloads.
- Editing a backend file — which restarts the process under `bun --watch` — drops and silently
  restores the socket without reloading the page.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass.

## Technical Key Decisions and Tradeoffs

1. **Build the reload over a plain `Bun.serve` WebSocket rather than adopting Bun's HMR.**
   - Why: Bun's browser HMR exists only behind its bundler. The documented way in is
     `import index from "./index.html"` passed to `routes` with `development: { hmr: true }`
     (`node_modules/bun-types/docs/bundler/fullstack.mdx:6-20`), which bundles the `<script>` and
     `<link>` targets and rewrites them to `/index-[hash].js` and `/index-[hash].css`
     (`fullstack.mdx:104-118`). That hashing breaks `styles.ts`'s `import.meta.url` → `.css`
     lookup, the twelve component-stylesheet assertions in `static.routes.test.ts`, and the
     one-module-per-file-at-its-own-URL property the frontend rests on. With no framework and no
     `import.meta.hot.accept()` handlers, Bun would full-reload anyway:
     "When no modules call `import.meta.hot.accept()` … the page reloads when the file updates"
     (`node_modules/bun-types/docs/bundler/hot-reloading.mdx:93-97`).
   - Impact: per-request transpiling is untouched, no dependency is added, and no build step
     appears. The cost is that the watcher, the socket and the client are ours to maintain.

2. **A `.css` change swaps in place; everything else reloads.**
   - Why: every component adopts its `CSSStyleSheet` objects *by reference*
     (`src/frontend/ui/base.ts:23`), so re-`replace()`ing one restyles every live instance with no
     re-render. Re-evaluating a component module cannot work at all: `customElements.define` throws
     on re-registration, and `define()` already early-returns when the tag exists
     (`src/frontend/ui/base.ts:122-130`), so a re-evaluated module would silently keep the old class.
   - Impact: two changes in `styles.ts`, both load-bearing. `load()` must mutate the sheet already
     in its map rather than construct a new one, or components keep adopting the stale object. And
     the map's keys must be normalised to pathnames — see decision 9.

9. **`styles.ts` keys its `sheets` map by pathname, not by the module URL it is handed.**
   - Why: today the two `BASE_HREFS` are keyed by pathname (`'/ui/shared.css'`) while every
     component sheet is keyed by `import.meta.url` with the extension swapped — which in a browser
     is absolute, `http://localhost:3000/ui/gz-tile.component.css`. The watcher reports a pathname.
     Without normalising, `reloadSheet('/ui/gz-tile.component.css')` misses all twelve component
     sheets, finds no `<link>` either because they are adopted-only, and quietly falls back to a
     full reload — Phase 2 would degrade to Phase 1 for exactly the case it exists for, while the
     two base sheets kept working and masked it.
   - Impact: one normalisation in `loadStyles`, which also changes what `hrefs` stores. `stylesFor`
     needs no change because it looks the key up through the same map.

3. **Development is gated on `GAINZ_DEV=1`, set by the `start:dev` script.**
   - Why: gating on `NODE_ENV !== 'production'` — the default Bun itself uses for `development` —
     would give plain `bun start` a file watcher and an open WebSocket route.
   - Impact: `devRoutes()` returns `{}` and no script tag is injected when the variable is unset,
     so production behaviour is decided by one explicit switch.

4. **The script tag is injected with `HTMLRewriter`, not written into `index.html`.**
   - Why: `index.html` stays free of dev-only markup, and the bytes production serves do not change.
   - Impact: injection lives in one new `#html()` helper in `StaticController`. Note there is no
     "directory index" branch to hook: `frontend()` rewrites `/` into `<root>/index.html` and then
     serves it through the *generic plain-file branch*, the same line that serves every `.css`. So
     the helper is reached from two places — that branch, gated on `extname(candidate) === '.html'`,
     and the single-page-app fallback — which between them cover three URL shapes: `/`,
     `/index.html`, and every extension-less client route. The ETag is computed after injection, so
     dev and production tags differ; `/` and `/workouts` still share a tag, which is what
     `static.routes.test.ts:114` asserts.

5. **The watcher starts on the first WebSocket connection and closes on the last.**
   - Why: no watcher lifecycle has to be threaded through `main.ts`'s shutdown, and no watcher is
     left running in the test suite once a test closes its socket.
   - Impact: the connection set and the `FSWatcher` are module-level state in `dev/internal/hub.ts`.
     That is a deviation from the backend's habit of constructing a facade per route file, which
     exists because every other facade needs a `DB`; this one needs none. `DevFacade` itself stays
     thin and constructible twice — `devRoutes()` and `staticRoutes()` each build their own — with
     the shared state behind it in `internal/`.

6. **`websocket` is always passed to `Bun.serve`; only the route is gated.**
   - Why: spreading the option in conditionally flips `Bun.serve`'s options union between
     `FetchOrRoutes` and `FetchOrRoutesWithWebSocket` (`node_modules/bun-types/serve.d.ts:653-740`)
     and fights the typechecker for no runtime gain.
   - Impact: production carries one handler object that no route can reach. It also means
     `RouteTable` must move from `Bun.Serve.Routes` to `Bun.Serve.RoutesWithUpgrade`, whose handlers
     return `Response | void | undefined`. `Response` is assignable to that, so every existing
     feature's route table keeps typechecking unchanged.

7. **The dev feature learns the web root through a new `static.facade.ts`, not by importing
   `static/internal/paths.ts`.**
   - Why: `FRONTEND_DIR` is the static feature's knowledge, and the house rule is that a feature is
     reached through its facade. Duplicating the five-levels-up repo-root resolution in the dev
     feature would give `paths.test.ts` a second copy to fail to guard.
   - Impact: `static` gains the first facade it has ever had, with one method.

8. **A changed `.ts` is checked with a `HEAD` before the page reloads.**
   - Why: a half-typed file already 500s from `StaticController.#module`. Reloading into that gives
     a blank view and costs the page's state on every typo.
   - Impact: the client makes one extra request per `.ts` change, and the failure is reported
     through the existing `gz-toast`.

## Current State

```
browser                          Bun.serve (src/backend/http/server.ts)
   │
   ├── GET /                     ──► staticRoutes() '/*' ──► StaticController.frontend()
   │      index.html                                          └─ Bun.file → bytes + ETag
   │      ├─ <link href="/vendor/pico.css">   ──► VENDOR_FILES allowlist → node_modules
   │      ├─ <link href="/ui/app.css">        ──► Bun.file
   │      └─ <script type=module src="/main.ts">
   │
   ├── GET /main.ts              ──► extname === '.ts' ──► Bun.Transpiler.transformSync
   │      import './app/gz-app.component.ts'   ← specifier left UNTOUCHED
   ├── GET /app/gz-app.component.ts             ~76 µs each, nothing written to disk
   └── GET /app/gz-app.component.css            ← fetched by styles.ts from import.meta.url
                                                  with `.ts` swapped for `.css`
```

Three properties hold this together, and all three survive this plan:

1. A module's URL is its path on disk. No bundle, no hashing, no manifest.
2. `import.meta.url` is load-bearing: `styles.ts:59` derives a component's stylesheet href from it,
   and `define()` awaits that fetch before registering the element, which is what lets a lazily
   imported route paint styled on its first frame.
3. `src/shared/` sits outside the web root and survives only because type-only imports are erased.

Stylesheets reach the page by two different routes today, and both need handling:

| Sheet                        | How it is loaded                            | Where it lives            |
| ---------------------------- | ------------------------------------------- | ------------------------- |
| `/ui/app.css`                | `<link>` in `index.html`                     | document only             |
| `/vendor/pico.css`           | `<link>` in `index.html` **and** `styles.ts` | document + adopted        |
| `/ui/shared.css`             | `styles.ts` `BASE_HREFS`                     | adopted only              |
| `gz-*.component.css` (× 12)  | `styles.ts` `loadStyles()` per component     | adopted only              |

The frontend already needs no server restart — a saved `.ts` is transpiled on the next request. The
`bun --watch` in `start:dev` is there for the backend. The only thing missing is the reload.

## Desired End State

```
  bun run start:dev                          bun start
  GAINZ_DEV=1                                (unset)
      │                                          │
      ▼                                          ▼
  devRoutes() → { '/dev/ws': upgrade }       devRoutes() → {}
  StaticController injects the tag           no injection; bytes as today
      │
      ▼
  browser loads /dev/hot.ts ──ws──► hub.attach()
                                      └─ first client: fs.watch(webRoot, recursive)

  save src/frontend/ui/gz-tile.component.css
      └─► changeFor('ui\\gz-tile.component.css') → { swap: '/ui/gz-tile.component.css' }
          └─► ws ─► hot.ts
                └─► reloadSheet(href): the SAME CSSStyleSheet object is replace()d
                    └─► every adopting instance restyles. No reload, no re-render.

  save src/frontend/ui/app.css
      └─► { swap: '/ui/app.css' }
          └─► not in styles.ts's map → the document <link> is swapped for a fresh one

  save src/frontend/features/workouts/gz-workout-list.component.ts
      └─► { reload: '/features/workouts/gz-workout-list.component.ts' }
          └─► HEAD it → 200 → location.reload()
                      → 500 → toastError(…), page keeps its state

  edit a backend file → --watch restarts → socket closes
      └─► retry 250ms, 500ms, 1s, 2s (cap) → reconnected, page untouched
```

## Abstractions and Code Reuse

Reused as they are:

- `RouteTable` and the one-`*.routes.ts`-per-URL-group registry in `http/routes.ts`.
- `StaticController.#respond`, which already gives every response an ETag and `Cache-Control:
  no-cache`. That is why re-`fetch()`ing a stylesheet returns fresh bytes with no cache-busting
  query: the browser must revalidate, and a changed file answers 200.
- `styles.ts`'s `sheets` map, which already holds one entry per adopted sheet — the lookup a swap
  needs, once its keys are normalised to one shape (decision 9).
- `toastError` from `ui/gz-toast.component.ts`, already rendered by `gz-app`.
- The existing pattern in `static.routes.test.ts:145` of writing a scratch file into `FRONTEND_DIR`
  and unlinking it in a `finally`. Note `useServer()` itself is **not** reusable here: it builds the
  server in its own `beforeEach`, and `GAINZ_DEV` has to be set before the route table is built.

New:

- `src/backend/features/dev/`
  - `dev.routes.ts` — `devRoutes(): RouteTable`, `{}` unless enabled, otherwise `'/dev/ws'`.
  - `dev.facade.ts` — `DevFacade` (`enabled`, `injectClient`, `upgrade`, `webSocket`) and
    `createDevFacade()`. `webSocket()` is on the facade rather than reached directly out of
    `internal/` by `http/server.ts`, for the same reason decision 7 gives `static` a facade.
  - `dev.routes.test.ts` — gating, injection, and the WebSocket round trip.
  - `internal/`
    - `hub.ts` — the connection set, the lazy `fs.watch`, the per-path debounce, `broadcast`.
    - `changes.ts` — `changeFor(relativePath): Change | null`, pure and the only classifier.
    - `changes.test.ts`
    - `dev.controller.ts` — `DevController.upgrade`.
    - `ws.ts` — `devWebSocket(): Bun.WebSocketHandler<undefined>`, re-exposed through the facade.
- `src/backend/features/static/static.facade.ts` — `StaticFacade.webRoot()`, `createStaticFacade()`.
- `src/frontend/dev/hot.ts` — the client. Not a component, so it adopts no stylesheet and has no
  `.css` sibling; `static.routes.test.ts`'s `gz-*.component.ts` glob does not see it. It declares
  its own `Change` type and validates incoming messages with a runtime guard rather than importing
  the backend's — the frontend declares its own types, and `src/shared/` is the wire contract for
  DTOs, not a place for a dev-only message shape.

Changed:

- `src/backend/http/routing.ts`
  - `RouteTable` — `Bun.Serve.Routes` → `Bun.Serve.RoutesWithUpgrade`.
- `src/backend/http/server.ts`
  - `startServer` — passes `websocket: devWebSocket()`.
- `src/backend/http/routes.ts`
  - `allRoutes` — spreads `devRoutes()` ahead of `staticRoutes()`.
- `src/backend/features/static/internal/static.controller.ts`
  - `StaticController` — takes a `DevFacade`; new `#html()` helper reached from the plain-file
    branch (gated on `.html`) and from the single-page-app fallback.
- `src/backend/features/static/static.routes.ts`
  - `staticRoutes` — builds the controller with `createDevFacade()`.
- `src/backend/main.ts`
  - `main` — one startup line when hot reload is on.
- `src/frontend/ui/styles.ts`
  - `load` — reuses the sheet already in `sheets` instead of constructing a new one.
  - `loadStyles` — keys on the module URL's **pathname** (decision 9), and de-duplicates on
    `pending` alone, because `sheets.has` is now true before the fetch settles.
  - `reloadSheet` — new export.
- `package.json` — `start:dev` sets `GAINZ_DEV=1`.
- `docs/backend.md` — the `dev` feature; and the two existing statements the plan falsifies: that
  `meta` and `static` have "no facade", and that every facade belongs to a data-owning feature.
- `docs/frontend.md` — the new "Hot reload" section; the directory tree, which gains `dev/`; and the
  sentence saying what belongs to no feature sits in "three" directories, now four.

## Logging & Observability

Server, once at startup when enabled, under the existing database line:

```
gainz is running on http://localhost:3000/
  database: …/data/gainz.sqlite
  hot reload: on
```

Server, from the hub, so it is visible whether a browser is actually attached:

```
gainz: hot reload watching src/frontend/
gainz: hot reload idle
```

Browser console, mirroring the shape of Bun's own `[Bun] Hot-module-reloading socket connected`:

```
gainz: hot reload connected
gainz: swapped /ui/gz-tile.component.css
gainz: reloading for /features/workouts/gz-workout-list.component.ts
```

A failed transpile is not a console-only event: it goes through `toastError`, so it is visible
without the devtools open.

## Implementation

### Phase 1: Reload on every change, end to end

Dependencies: None.

Stand up the whole pipe — gating, watcher, socket, injection, client — with the client doing nothing
cleverer than `location.reload()` on any message. This phase is useful on its own: it ends the
manual reload. Phase 2 only makes the response to a change smarter.

**Tasks**:

- [ ] Add `src/backend/features/static/static.facade.ts` with a one-method facade over the web root,
      so the dev feature never reaches into `static/internal/`.

      ```ts
      export class StaticFacade {
        webRoot(): string { return FRONTEND_DIR; }
      }
      export function createStaticFacade(): StaticFacade { return new StaticFacade(); }
      ```

- [ ] Add `src/backend/features/dev/internal/changes.ts` with the only classifier in the feature.
      `fs.watch` yields a path relative to the watched directory, with backslashes on Windows. The
      allowlist is not defensive programming: a measured run (see Implementation Notes) shows the
      watcher also reports bare *directory* names such as `ui`, which must not be mistaken for a
      file. Anything outside the three known extensions returns `null`, which also covers an
      editor's swap file or backup.

      ```ts
      export type Change = { swap: string } | { reload: string };

      export function changeFor(relativePath: string): Change | null {
        const url = `/${relativePath.replaceAll('\\', '/')}`;
        if (url.endsWith('.css')) return { swap: url };
        if (url.endsWith('.ts') || url.endsWith('.html')) return { reload: url };
        return null;
      }
      ```

- [ ] Add `src/backend/features/dev/internal/hub.ts`: the module-level connection set, the lazy
      watcher, a 25 ms per-path debounce and `broadcast`. The debounce is required, not a
      precaution: a measured run shows one save producing `rename` + `change` for a new file and two
      `change` events for an existing one (see Implementation Notes). `unref()` the watcher so it
      can never hold the process open, and close it when the last client leaves.

      ```ts
      const clients = new Set<ServerWebSocket<undefined>>();
      let watcher: FSWatcher | null = null;
      const timers = new Map<string, Timer>();

      export function attach(ws, webRoot: string): void {
        clients.add(ws);
        if (clients.size === 1) { /* watch(webRoot, { recursive: true }, …) ; unref() */ }
      }
      export function detach(ws): void {
        clients.delete(ws);
        if (clients.size === 0) { /* close the watcher, clear the timers */ }
      }
      ```

- [ ] Add `src/backend/features/dev/internal/ws.ts` with `devWebSocket()` returning a
      `Bun.WebSocketHandler<undefined>`. `message` is required by the type; the client never sends,
      so it is a no-op with a comment saying so.

- [ ] Add `src/backend/features/dev/internal/dev.controller.ts` with `upgrade(req, server)`:
      `server.upgrade(req)` and return `undefined`, or a 426 when the request is not an upgrade.

- [ ] Change `RouteTable` in `src/backend/http/routing.ts` to
      `Bun.Serve.RoutesWithUpgrade<undefined, string>`. Do this **before** writing `dev.routes.ts`:
      a handler returning `undefined` does not satisfy `Bun.Serve.Routes`, so the tree would not
      typecheck in between.

- [ ] Add `src/backend/features/dev/dev.facade.ts`: `DevFacade` with `enabled`
      (`process.env.GAINZ_DEV === '1'`, read per call so a test can flip it), `upgrade(...)`
      delegating to the controller, `webSocket()` re-exposing `devWebSocket()` so `http/server.ts`
      never reaches into `internal/`, and `injectClient(html)` which returns the bytes untouched
      when disabled and otherwise appends the tag to `<head>`.

      ```ts
      const CLIENT_TAG = '<script type="module" src="/dev/hot.ts"></script>';

      async injectClient(html: Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
        if (!this.enabled) return html;
        const rewritten = new HTMLRewriter()
          .on('head', { element: (el) => { el.append(CLIENT_TAG, { html: true }); } })
          .transform(new Response(html));
        return rewritten.bytes();
      }
      ```

- [ ] Add `src/backend/features/dev/dev.routes.ts` with `devRoutes(): RouteTable` returning `{}`
      unless enabled, otherwise `'/dev/ws'`. `/dev/ws` is more specific than `/*`, so it wins
      without any ordering care; `/dev/hot.ts` still falls through to `/*` and is served by the
      transpiler like any other module.

- [ ] Pass `websocket: createDevFacade().webSocket()` in `startServer`
      (`src/backend/http/server.ts`). Add a comment saying why a serve option, not a route, has to
      name a feature at all.

- [ ] Spread `devRoutes()` into `allRoutes()` ahead of `staticRoutes()`, keeping the file's
      least-specific-last reading order.

- [ ] Give `StaticController` a `DevFacade` constructor parameter and route the index-page responses
      through a new `#html()` helper that injects before hashing. There is no directory-index branch
      to hook: `/` is rewritten to `<root>/index.html` and served by the generic plain-file branch,
      so gate that branch on `extname(candidate) === '.html'`. The single-page-app fallback calls
      `#html()` directly. Together they cover `/`, `/index.html` and every client route.

- [ ] Build the controller with `createDevFacade()` in `staticRoutes()`.

- [ ] Add `src/frontend/dev/hot.ts`: connect, reload on any message, reconnect with a
      250/500/1000/2000 ms backoff that resets on open. Declare `Change` locally — the frontend
      declares its own types rather than importing the backend's, and this shape is dev-only, not
      wire contract — and validate each message with a runtime type guard rather than a cast, since
      `typescript/no-unsafe-type-assertion` is on.

      ```ts
      const WS_URL = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/dev/ws`;
      // Phase 2 replaces this with the swap/reload split.
      function apply(_change: Change): void { location.reload(); }
      ```

- [ ] Set `GAINZ_DEV=1` on `start:dev` in `package.json`. Bun's script runner handles the inline
      assignment on Windows, so no `cross-env` is needed.

      ```json
      "start:dev": "GAINZ_DEV=1 bun --watch src/backend/main.ts"
      ```

- [ ] Print `  hot reload: on` from `main.ts` when the facade is enabled, and nothing when it is not.

- [ ] Add `src/backend/features/dev/internal/changes.test.ts` covering the mapping and the
      classification: a nested `.css` path, the Windows backslash separator, a `.ts` and an
      `index.html`, a bare directory name (`'ui'` → `null`), and an unknown extension (`null`).

- [ ] Add `src/backend/features/dev/dev.routes.test.ts` with its own `withDev(enabled, fn)` helper
      that sets `process.env.GAINZ_DEV`, opens an in-memory database and a port-0 server, and
      restores both in a `finally`. Do not use `useServer()` here: the env var has to be set before
      the route table is built, and a leaked variable would break `static.routes.test.ts`, which
      runs in the same process.

      - [ ] `devRoutes()` is empty and `GET /` carries no `/dev/hot.ts` when the variable is unset.
      - [ ] `GET /` carries the tag exactly once when it is set, and `GET /workouts` carries it too.
      - [ ] A WebSocket opened at `/dev/ws` fails to connect when the variable is unset. Assert the
            connection, not the status code: with no route registered, `/dev/ws` is extension-less
            and therefore answered **200 with `index.html`** by the single-page-app fallback, which
            is correct behaviour and not a 404.
      - [ ] A client connected to `/dev/ws` receives `{ swap: '/__hot.css' }` after a write to
            `__hot.css` in the web root, unlinked in a `finally`. Race the message against a ~2 s
            timeout so a missed watcher event fails as a test rather than hanging the suite.

- [ ] Add one assertion to `static.routes.test.ts` that the served index page contains no
      `/dev/hot.ts`, so a future default-on mistake is caught where production behaviour is asserted.

- [ ] Document the `dev` feature in `docs/backend.md`: what it owns, that it is off unless
      `GAINZ_DEV=1`, that the watcher follows the connection rather than the process, and why
      `websocket` is on the server while the route is gated.

- [ ] Correct the two statements in `docs/backend.md` the new `static.facade.ts` falsifies: that
      "`meta` and `static` have controllers but no facade", and that every facade belongs to a
      data-owning feature. `static` now has a facade with no table behind it.

- [ ] Update `docs/frontend.md`'s directory tree and the sentence that says what belongs to no
      feature sits in "three" directories — `dev/` makes it four. The five import boundaries are
      unchanged: `dev/` is deliberately not one of them.

**Automated Verification**:

- [ ] `bun test src/backend/features/dev/` passes, including the WebSocket round trip.
- [ ] `bun test src/backend/features/static/static.routes.test.ts` passes unchanged, in particular
      the shared-ETag and 405 assertions.
- [ ] `bun test` passes.
- [ ] `bun run typecheck` passes — this is what proves the `RouteTable` change leaves all six
      existing route tables valid.
- [ ] `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [ ] `bun run start:dev`, open the app, and confirm `gainz: hot reload connected` in the browser
      console and `gainz: hot reload watching src/frontend/` in the terminal.
- [ ] Save any frontend file and watch the page reload by itself.
- [ ] Save a backend file; the terminal restarts, the page does not reload, and the browser console
      shows a reconnect rather than an error loop.
- [ ] `bun start` and confirm the page source has no `/dev/hot.ts`, the terminal prints no hot-reload
      line, and the browser console stays silent — nothing tries to open a socket.

### Phase 2: Hot CSS and the broken-file toast

Dependencies: Phase 1.

Turn the blunt reload into the two behaviours that make the loop worth having: a stylesheet swaps in
place, and a file that does not parse reports itself instead of blanking the page.

**Tasks**:

- [ ] Normalise the `sheets` key in `loadStyles` to a pathname, so the twelve component sheets are
      keyed the same way as the two `BASE_HREFS` and the same way the watcher reports a change.
      Without this the rest of the phase is dead code for every component — see decision 9.

      ```ts
      // A pathname, not the absolute import.meta.url: BASE_HREFS are pathnames and
      // dev/hot.ts is told which path changed, so every key must be the same shape.
      const href = new URL(moduleUrl, location.href).pathname.replace(/\.ts$/, '.css');
      ```

- [ ] Rework `load()` in `src/frontend/ui/styles.ts` to reuse the sheet already in `sheets`. This is
      the whole mechanism: components hold the object, so it must be the object that changes.

      ```ts
      async function load(href: string): Promise<void> {
        const sheet = sheets.get(href) ?? new CSSStyleSheet();
        sheets.set(href, sheet);
        try {
          const response = await fetch(href);
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          await sheet.replace(await response.text());
        } catch (cause) {
          console.error(`gainz: could not load stylesheet ${href}`, cause);
          await sheet.replace('');
        }
      }
      ```

      Name the behaviour change this brings: today a failure installs a *fresh* empty sheet and can
      only happen once, at startup. Now a failed re-fetch blanks the live sheet, so a component
      goes unstyled until the next good save. That is the right trade for a dev-only path — an
      unstyled component is easier to diagnose than a stale one — and it keeps the existing
      "carry on loudly rather than throw" contract in the comment above it.

- [ ] Fix the de-duplication `load()`'s new shape breaks: `loadStyles` currently returns early on
      `sheets.has(href)`, which is now true before the fetch settles, so a second caller would be
      told the sheet was ready while it was still empty. Key it on `pending` alone, which already
      holds one promise per href for the lifetime of the page.

      ```ts
      export function loadStyles(tagName: string, moduleUrl: string): Promise<void> {
        const href = moduleUrl.replace(/\.ts$/, '.css');
        hrefs.set(tagName, href);
        let promise = pending.get(href);
        if (!promise) { promise = load(href); pending.set(href, promise); }
        return promise;
      }
      ```

- [ ] Export `reloadSheet(href)` from `styles.ts`, returning whether the href was one it tracks so
      the client can fall back for a stylesheet the page has never loaded. Keep it beneath a comment
      saying it exists for `dev/hot.ts` and is inert otherwise.

      ```ts
      export async function reloadSheet(href: string): Promise<boolean> {
        if (!sheets.has(href)) return false;
        await load(href);
        return true;
      }
      ```

- [ ] Replace `apply()` in `src/frontend/dev/hot.ts` with the split:

      ```ts
      async function apply(change: Change): Promise<void> {
        if ('swap' in change) return swapCss(change.swap);
        // The transpiler 500s on a file that will not parse; do not reload into that.
        const probe = await fetch(change.reload, { method: 'HEAD' });
        if (!probe.ok) { toastError(new Error(`Could not transpile ${change.reload}`)); return; }
        location.reload();
      }
      ```

- [ ] Add `swapCss(url)` covering both ways a stylesheet reaches the page: the adopted sheets
      through `reloadSheet`, and any document `<link>` whose pathname matches. A `<link>` cannot be
      made to re-fetch by reassigning the same href, so insert a fresh one carrying a query the
      static route ignores, and remove the old one on its `load` so there is no unstyled frame. When
      neither applies — a brand-new stylesheet the page has never fetched — fall back to a reload.

      ```ts
      async function swapCss(url: string): Promise<void> {
        const swapped = await reloadSheet(url);
        const links = [...document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]')]
          .filter((link) => new URL(link.href).pathname === url);
        links.forEach(swapLink);
        if (!swapped && links.length === 0) location.reload();
      }
      ```

- [ ] Add a "Hot reload" section to `docs/frontend.md` between "Loading" and "Theming": that a `.css`
      edit swaps and a `.ts` edit reloads, that adopting by reference is what makes the swap free,
      that `customElements.define` is why a module cannot be re-evaluated, and that Bun's own HMR was
      not used because it requires the bundler and would hash the URLs `styles.ts` depends on. Also
      record why `sheets` is keyed by pathname, since that is the non-obvious part of `styles.ts`
      and reverting it would make the swap fail silently.

**Automated Verification**:

- [ ] `bun test` passes — in particular `src/frontend/` tests that import `styles.ts` indirectly are
      unaffected, and the `loadStyles` de-duplication change breaks nothing.
- [ ] `bun run typecheck` passes.
- [ ] `bun run lint` passes.
- [ ] `bun run fmt:check` passes.
- [ ] `grep -c 'import.meta.hot' src/` returns 0 — this plan deliberately uses none of it, and a
      stray call would mean someone reached for the bundler path.

**Manual Verification**:

- [ ] With a workout's set form half filled in, save `gz-set-row.component.css` and confirm the
      style changes with the typed-in values still there and the scroll position unmoved.
- [ ] Save `ui/app.css` and confirm the document restyles with no flash of unstyled content.
- [ ] Save `ui/shared.css` — adopted by every component but linked by none — and confirm every view
      restyles.
- [ ] Introduce a syntax error in a component module, save, and confirm a toast appears and the page
      keeps its state; fix it, save, and confirm the page reloads.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

### Verified while planning, on Bun 1.4.2 / Windows

These were run as throwaway scripts before the plan was written, so the tasks above rest on measured
behaviour rather than on reading the types.

- `Bun.Serve.RoutesWithUpgrade<undefined, string>` resolves under that name, accepts both a
  `{ GET: … }` map and a bare `(req) => Promise<Response>` handler, and coexists with a `websocket`
  option while a `/dev/ws` handler returns `Response | undefined`. `tsc --noEmit` with this repo's
  flags reports nothing. This is the evidence for decision 6.
- `new HTMLRewriter().on('head', { element: (el) => el.append(tag, { html: true }) })
  .transform(new Response(bytes))` followed by `.bytes()` returns the document with the tag appended
  inside `</head>`, as decision 4 needs.
- A `GAINZ_DEV=1 bun run …` package script runs with the variable set on Windows through Bun's own
  shell. No `cross-env` is needed.
- `fs.watch(root, { recursive: true })` fires for nested files and reports paths relative to the
  root with backslashes. One `Bun.write` of a new file produced
  `rename ui\gz-tile.component.css`, `change ui\gz-tile.component.css`, `change ui`; a second write
  to the same file produced two more `change` events. So: the debounce is load-bearing, and the
  classifier must reject bare directory names.

### Caught in review, before implementation

A first draft of this plan assumed `styles.ts`'s `sheets` map was keyed by pathname throughout. It
is not: the two `BASE_HREFS` are, but every component sheet is keyed by `import.meta.url` with the
extension swapped, which in a browser is absolute
(`http://localhost:3000/ui/gz-tile.component.css`). `reloadSheet('/ui/gz-tile.component.css')` would
therefore have missed all twelve component sheets and fallen through to a full page reload, while
`shared.css` and `pico.css` kept swapping and hid the problem. Decision 9 and the first task of
Phase 2 exist because of this. If the normalisation is ever reverted, Phase 2 becomes an expensive
no-op rather than a visible failure — which is why the manual check uses a component stylesheet with
a half-filled form, not `app.css`.

### Known limitations, accepted

- `/vendor/pico.css` resolves inside `node_modules`, outside the watched web root, so editing Pico
  reports nothing. `swapCss` handles the URL generically if it ever arrives; watching `node_modules`
  is out of scope.
- `src/frontend/dev/hot.ts` is on disk in production and therefore reachable at `/dev/hot.ts`. It is
  inert — nothing imports it, nothing injects it, and the socket it would open does not exist.
- Nothing in the linter stops production code from importing `dev/hot.ts`. Sealing it would mean
  adding `**/dev/**` to all seven frontend `no-restricted-imports` overrides, because oxlint applies
  only the last matching override rather than merging them — a lot of config churn for a small risk.
  Deliberately skipped. `dev/` is a convention here, not an enforced boundary, and the five
  documented import boundaries stay five.
- The frontend tests run without a DOM, so `styles.ts`'s swap and `hot.ts`'s DOM work are covered by
  manual verification only. That matches the existing situation: nothing mounts a component today.
- The round-trip test depends on `fs.watch` timing. If it proves flaky on Windows, raise the timeout
  rather than deleting the test; it is the only thing that proves the watcher fires at all.

## References

- `node_modules/bun-types/docs/bundler/hot-reloading.mdx` — the `import.meta.hot` surface, the
  implemented/unimplemented table (`invalidate()` and `send()` are not implemented, `prune()`'s
  callback is never called), and the full-reload-without-`accept()` behaviour.
- `node_modules/bun-types/docs/bundler/fullstack.mdx` — HTML imports as routes, what
  `development: { hmr: true }` turns on, and the hashed output the bundler produces.
- `node_modules/bun-types/devserver.d.ts` — the typed `import.meta.hot`, for the record of what was
  not used.
- `node_modules/bun-types/serve.d.ts:635-740` — `BaseRouteValue`, `Routes` vs `RoutesWithUpgrade`,
  and the `websocket` option that selects between them.
- `node_modules/bun-types/docs/guides/read-file/watch.mdx` — `fs.watch` with `recursive: true`.
- `docs/frontend.md` — Loading, and why a module's URL is its path.
- `docs/backend.md` — features, routes, tests.
- `docs/agents/plans/2026-09-15-etag-revalidation-for-static-files.md` — the ETag and `no-cache`
  behaviour this plan relies on to make a re-`fetch()` return fresh bytes.
