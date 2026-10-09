---
date: 2026-10-06T13:57:26.517065+00:00
git_commit: 64f3972d67d876713f54269bb999d91c0800aeb4
branch: main
topic: 'Bundle the frontend in the build'
tags: [plan, frontend, static, build, preloads, loading, styles]
status: implemented
---

# PLAN: Bundle the frontend in the build

The frontend reaches the browser one module per URL in every mode. Unbundled, the browser learns of
a module only once it has fetched and parsed the module importing it, so the server works to undo
that waterfall: `page.ts` walks the static import graph to write `<link rel="modulepreload">`s and a
`data-lazy-preloads` JSON map, `app/preload.ts` turns that map into links when a view opens, and
every route repeats its view's specifier in a `module` field so `gz-app` can name it. That is about
300 lines of code and tests solving a problem a bundle does not have: the whole frontend bundles to
71 KB whitespace-minified, 18 KB gzipped.

This plan bundles the frontend into one file in `bun run build` only, served at `/main.ts`, with
every component stylesheet inlined into it as text, and then deletes the preloads. Dev, hot reload
and the tests keep one module and one stylesheet per URL, where the waterfall runs over localhost.
The built page then requests `/main.ts`, Oat and the two app stylesheets, and nothing else up front.

## Acceptance Criteria

- `bun run build` embeds the frontend as one bundle at `/main.ts`, whitespace-minified and without
  a source map, and embeds no other `.ts` module; `src/frontend/index.html` is unchanged.
- The bundle carries every `*.component.css` as text, and in it every component adopts the sheet
  beside its own module without requesting any component `.css`; Oat and `ui/shared.css` are still
  fetched as today.
- A lazily imported view still runs only when its route is first opened.
- A module the bundle reaches that does not parse fails the build, naming the file.
- The index page, in dev and in the build, carries no `<link rel="modulepreload">`, no
  `data-lazy-preloads` map and no preload the server writes; `index.html`'s own Oat and
  `shared.css` preloads stay.
- `app/preload.ts`, `RouteDef.module` and every route's `module:` are gone; `gz-app` awaits
  `view()` without preloading.
- `bun run start:dev`, hot reload (CSS swapped in place included) and the tests keep serving one
  module and one stylesheet per URL.
- `docs/frontend.md` and `docs/backend.md` describe the new loading; no file in `docs/agents/` is edited.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test --parallel` pass.

## Technical Key Decisions and Tradeoffs

1. **Bundle only in the build:** dev, `bun start` and the tests stay unbundled.
   - Why: the edit loop (save, reload) and in-place CSS hot reload rely on one file per URL, and on
     localhost a waterfall costs next to nothing.
   - Impact: two loading paths, so the bundle gets its own test that runs it under happy-dom.
     `bun start` from source on a real network loads as a waterfall; production only ever runs
     `gainz.js`.
2. **Stylesheet lookup in the bundle:** a `Bun.build` plugin replaces `import.meta.url` in each
   module with that module's own URL path as a string literal (`"/ui/tile/gz-tile.component.ts"`).
   - Why: no component changes, and "the stylesheet sits beside its module" still holds.
     `loadStyles` already takes the path through `new URL(moduleUrl, location.href)`. Measured: without
     the plugin all 18 components asked for the bundle's own URL. With it, each asked for its own sheet.
   - Impact: the plugin lives in a new `static/internal/bundle.ts`. The replace is textual, so it
     would also rewrite an `import.meta.url` in a string. Once Phase 2 deletes the routes'
     `import.meta.resolve(…)`, `bundle.test.ts` enforces that the bundle contains no `import.meta` at all.
3. **Component stylesheets inlined into the bundle, through a swapped stub module:**
   `ui/inline-styles.ts` is committed as `export const INLINE_STYLES = {}`. The bundle plugin
   replaces it with a map from every `*.component.css` URL path to its text, and `load()` in
   `ui/styles.ts` fills a sheet from that map when it has the path and fetches otherwise.
   - Why: in a bundle each `await define(…)` holds back the next module until its sheet is in hand,
     so fetched sheets would arrive one round trip after another. From a string there is no round
     trip, and no preload is needed. It is the trick `src/backend/shared/embedded.ts` already plays on
     the backend. Each component still gets its own `CSSStyleSheet`. One merged sheet would apply
     every component's `:host` rules to every component.
   - Impact: the bundle grows by 12.7 KB raw, about 4 KB gzipped, and a CSS-only change invalidates
     it. Dev's map is empty, so dev fetches and hot-swaps sheets exactly as today. "No CSS in
     JavaScript" (`docs/styling-guidelines.md`) is about source and still holds: the CSS lives in
     `.css` files, and only the build output carries it as text.
4. **Oat, `ui/shared.css` and `ui/app.css` stay fetched.**
   - Why: Oat and `shared.css` are also linked in the document for the light DOM, so inlining them
     would download them twice (Oat alone is 31.7 KB, 7.1 KB gzipped). `app.css` is document-only.
   - Impact: `index.html` keeps its links and its two hand-written fetch preloads. `styles.ts` keeps
     fetching `BASE_HREFS`.
5. **The bundle is served at `/main.ts`, and no other module is embedded.**
   - Why: one `index.html` and one `page.ts` for dev and the build, with no "built or not" branch.
   - Impact: the built server 404s every other `.ts`. The odd part is that `/main.ts` names a bundle,
     not that file. Component `.css` files stay embedded and served, which is harmless and keeps the
     build serving every URL dev serves except modules.
6. **Whitespace-only minification, no source map.**
   - Why: the same choice the build makes today, so names survive in every trace, the toast
     included, which no source map would fix. Full minification would save only 2.7 KB gzipped.
   - Impact: `transpileModule`'s `minify` option loses its only caller and goes.
7. **The preload machinery goes entirely, with no replacement.**
   - Why: production has no waterfall left to undo, and dev's runs over localhost.
   - Impact: `page.ts` keeps versioning and the import map only, and `PageSource` keeps only `tags`.
8. **A module the bundle does not reach is not checked by the build.**
   - Why: it never ships. One the bundle reaches still fails the build, naming the file, through
     `Bun.build`'s own parse error.
   - Impact: the build's "module that does not parse" test moves to `bundle.test.ts` and bundles a
     broken entry directly.
9. **Bundle first, then remove the preloads.**
   - Why: production is never left with neither, which matters because pushes to `main` deploy.
   - Impact: between the phases dev still writes preloads, and the built page's are empty (the
     bundle has no relative static imports for the walk to find).

## Current State

```
index.html, as page.ts renders it (dev and build alike)
  <script type="importmap">  every .ts/.css/vendor URL → ?v=<tag>
  <link rel="preload" as=fetch> oat.css, shared.css          ← hand-written in index.html
  <link rel="modulepreload"> × shell graph                    ← walk() over static imports
  <link rel="preload" as=fetch> × .css beside each shell module
  <script data-lazy-preloads> { view → its files }            ← lazyFiles()
  <script type="module" src="/main.ts?v=…">

gz-app #viewElement ─► preloadModule(route.module) ─► route.view() ─► import('./gz-x.component.ts')
                       app/preload.ts                  routes.test: module == import literal

define(tag, ctor, import.meta.url) ─► styles.ts loadStyles: <module path>.ts → .css ─► fetch by version

Build: embed.ts transpiles every module (whitespace-minified), one per URL, then renderPage()
```

- `src/backend/features/static/internal/page.ts:47-141` — `walk`, `withSheets`, `lazyFiles`, `preloadTags`
- `src/backend/features/static/internal/web-files.ts:75-104` — `#pageSource()`, with `module()` for the walk
- `src/backend/features/static/internal/embed.ts:27-76` — `embedWebRoot`, transpiles every `.ts`
- `src/frontend/app/preload.ts` — `preloadModule()`
- `src/frontend/app/gz-app.component.ts:86-102` — `#viewElement` calls `preloadModule`
- `src/frontend/app/router.ts:16-20` — `RouteDef.module`
- `src/frontend/features/*/…routes.ts` — six `module: import.meta.resolve(…)` lines
- `src/frontend/ui/styles.ts:58-77` — `load(href, refill)`, the one place a sheet is fetched
- `src/frontend/ui/styles.ts:87-99` — `loadStyles(tagName, moduleUrl)`

## Desired End State

```
index.html, as page.ts renders it (dev and build alike)
  <script type="importmap">  every versioned URL the web root serves → ?v=<tag>
  <link rel="preload" as=fetch> oat.css, shared.css          ← hand-written, unchanged
  <script type="module" src="/main.ts?v=…">

dev / bun start / tests:  /main.ts → transpiled main.ts, importing the rest one URL at a time;
                          INLINE_STYLES = {} → every component sheet fetched beside its module
built gainz.js:           /main.ts → the whole frontend, one ESM file; lazy views wrapped by Bun,
                          run on first import(); every import.meta.url → its module's own path;
                          INLINE_STYLES = { '/ui/tile/gz-tile.component.css': '…', … }

define(tag, ctor, import.meta.url) ─► loadStyles ─► load(href): INLINE_STYLES[href] ?? fetch
gz-app #viewElement ─► route.view() ─► import(…)
```

## Abstractions and Code Reuse

- `src/backend/features/static/internal`
  - `bundle.ts` — **new**. `bundleFrontend(entry)`: `Bun.build` with one plugin that rewrites
    `import.meta.url` and fills `ui/inline-styles.ts`; whitespace minification, no source map;
    wraps a failure in an `Error` naming the file and logs it through `log.error('static', …)`, as
    `transpileModule` does
  - `bundle.test.ts` — **new**
  - `embed.ts` — embeds the bundle at `/main.ts` instead of every module
  - `transpile.ts` — drops the `minify` option and `minifier`
  - `page.ts` — (Phase 2) loses the graph walk and the lazy map; `PageSource` keeps only `tags`
  - `web-files.ts` — (Phase 2) `#pageSource()` loses `module`
- `src/backend/features/static/static.facade.ts` — `embed()` doc comment
- `src/scripts/build.ts` — header comment
- `src/scripts/build-bundle.probe.ts` — **new**, a child process: a fresh happy-dom window that imports the bundle and reports what it did
- `src/scripts/build-bundle.test.ts` — **new**, runs the probe on the embedded bundle
- `src/frontend/ui`
  - `inline-styles.ts` — **new**, the committed empty stub
  - `styles.ts` — `load()` reads `INLINE_STYLES` first
- `src/frontend/app` (Phase 2)
  - `preload.ts`, `preload.test.ts` — deleted
  - `gz-app.component.ts` — `#viewElement` without `preloadModule`
  - `router.ts` — `RouteDef.module` deleted
  - `routes.ts` — comment
- `src/frontend/features/{auth,exercises,stats,workouts}/*.routes.ts` — (Phase 2) `module:` lines deleted
- `src/frontend/index.html` — (Phase 2) comment only

Reused as they are: `contentTag`, `isVersioned`/`isShipped`, the import map, `StaticController`,
`EmbeddedWebFiles`, `define()`, `reloadSheet()`, `useDom()`'s global walk (mirrored by the probe).

## Logging & Observability

A bundle failure logs one error line in the existing `static` area, as a transpile failure does today:

```
static could not bundle src/frontend/__broken.ts:1:19: Unexpected =
```

## Implementation

### Phase 1: Bundle the frontend, stylesheets inlined, in the build

Dependencies: None

`bun run build` embeds one bundle at `/main.ts` that carries every component stylesheet. Dev is
unchanged: its stub map is empty and it still writes the preloads, which Phase 2 removes.

**Tasks**:

- [x] New `src/frontend/ui/inline-styles.ts`, with a doc comment saying the build replaces this
      module (see `bundle.ts`), that dev fetches every sheet because the map is empty, and that it
      mirrors `src/backend/shared/embedded.ts`:
      ```ts
      /** Component stylesheet URL path → its text. Filled only in a built bundle. */
      export const INLINE_STYLES: Readonly<Record<string, string>> = {};
      ```
- [x] `src/frontend/ui/styles.ts`: in `load(href, refill)`, take the text from
      `INLINE_STYLES[href]` when it is there, and fetch as today otherwise. A refill (hot reload)
      only happens in dev, where the map is empty, so it is unaffected. Extend the header: in a
      built bundle a component's sheet is carried as text and never fetched; Oat and `shared.css`
      always are.
- [x] New `src/backend/features/static/internal/bundle.ts`, with a header saying why the build
      bundles, why `import.meta.url` is rewritten and why component sheets are inlined:
      ```ts
      const INLINE_STYLES = resolve(FRONTEND_DIR, 'ui', 'inline-styles.ts');

      const frontend: BunPlugin = {
        name: 'gainz-frontend',
        setup(build) {
          build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
            if (path === INLINE_STYLES) {
              return { contents: `export const INLINE_STYLES = ${JSON.stringify(await componentStyles())};`, loader: 'ts' };
            }
            return { contents: (await Bun.file(path).text()).replaceAll('import.meta.url', JSON.stringify(urlOf(path))), loader: 'ts' };
          });
        },
      };

      export async function bundleFrontend(entry = resolve(FRONTEND_DIR, 'main.ts')): Promise<string> {
        try {
          const result = await Bun.build({ entrypoints: [entry], target: 'browser', format: 'esm',
            minify: { whitespace: true }, sourcemap: 'none', plugins: [frontend] });
          return await result.outputs[0].text();
        } catch (cause) { /* name the file, log, rethrow */ }
      }
      ```
      `urlOf(path)` is `/${relative(FRONTEND_DIR, path).replaceAll('\\', '/')}` (Windows separators).
      `componentStyles()` globs `**/*.component.css` under `FRONTEND_DIR`, which yields `ui\…` on
      Windows, and maps each URL path to its text. Compare `path` to `INLINE_STYLES` after
      `resolve()`, so separators and casing match what `Bun.build` hands `onLoad`; the bundle test
      catches a mismatch. `Bun.build` throws an `AggregateError` ("Bundle failed") whose `errors` are
      `BuildMessage`s with `position.file`, `position.line` and `position.column`. Turn the first
      into `src/frontend/<url>:<line>:<column>: <message>`, log it as `could not bundle <that>`, and
      throw an `Error` with the same text.
- [x] New `src/backend/features/static/internal/bundle.test.ts`:
  - "rewrites every import.meta.url to its module's own path": the bundle of `main.ts` contains no
    `import.meta.url`, and does contain `"/app/gz-app.component.ts"` and
    `"/features/exercises/internal/gz-chart.component.ts"`
  - "carries every component stylesheet": for each `**/*.component.css`, the bundle contains its
    URL path as a key (`"/ui/tile/gz-tile.component.css"`)
  - "a module that does not parse fails, naming the file": write `src/frontend/__broken.ts` with
    `export const oops: = ;`, pass it as the entry, `bundleFrontend(resolve(FRONTEND_DIR, '__broken.ts'))`
    (the default `main.ts` never reaches it), and assert that it rejects with
    `/src\/frontend\/__broken\.ts/` and logs one error line starting `static could not bundle `
    (via `useLogs()`, as the build test does today); unlink it in `finally`
- [x] `src/backend/features/static/internal/embed.ts`: skip every `.ts` in the web-root walk and
      set `pages['/main.ts'] = { body: await bundleFrontend(), type: MODULE_TYPE }`. The header
      becomes: the build carries every non-module file plus one bundle of the frontend at `/main.ts`.
      The `transpileModule` import goes.
- [x] `src/backend/features/static/internal/transpile.ts`: delete `minifier` and the `options`
      parameter. The header now says the build bundles instead (see `bundle.ts`), and that serving
      from source stays a transformation.
- [x] `src/backend/features/static/static.facade.ts`: `embed()` doc becomes "Every servable
      frontend file, the modules as one whitespace-minified bundle at `/main.ts` that carries the
      component stylesheets, plus the vendor files."
- [x] `src/scripts/build.ts`: the header's "the frontend stays one module per URL, never bundled"
      becomes "the frontend as one bundle at `/main.ts`".
- [x] `src/scripts/build.test.ts`:
  - replace "serves each module at its own URL…" with "serves the frontend as one
    whitespace-minified bundle at /main.ts, and no other module". `/main.ts` is
    `text/javascript`, equals `embedded.pages['/main.ts'].body`, contains `customElements.define`
    and `"/ui/tile/gz-tile.component.ts"`, has no `: string` (no frontend string literal contains
    one, checked while planning, so a match could only be a leftover type annotation), no
    `sourceMappingURL` and no `import.meta.url`, and `/app/gz-app.component.ts`, `/ui/format.ts`,
    `/ui/inline-styles.ts` and `/features/exercises/internal/gz-chart.component.ts` answer 404
  - "preloads the shell modules and stylesheets…": the bundle has no relative static imports, so
    the built page carries no `modulepreload` and an empty `data-lazy-preloads` map (`{}`). Assert
    that, and that `index.html`'s `/vendor/oat.css?v=` and `/ui/shared.css?v=` preloads are served
    for good. Phase 2 deletes the map assertion.
  - "keeps the path guards": `/ui/../main.ts` still answers 200 (it normalizes to the bundle)
  - delete `describe('a module that does not parse')` (moved to `bundle.test.ts`) and its now-unused
    imports (`unlink`, `useLogs`, `useTempDir`). `FRONTEND` stays; other tests use it.
- [x] New `src/scripts/build-bundle.probe.ts`, run as a child process with the bundle's path as its
      argument. It cannot run in the test's own process: `useDom()` shares one happy-dom window
      across every test file in a process, so `gz-app.component.test.ts` may already have defined
      `gz-app`. `define()` would then return early, and the checks would depend on file order. The
      probe creates its own `GlobalWindow({ url: 'http://localhost/' })` and installs its globals
      the way `useDom()` does. Its `fetch` records every URL, answers `.css` with an empty 200 and
      `/api/*` with an empty 200 JSON. It then `import()`s the bundle by `pathToFileURL`, records the
      defined tags, the requested URLs and the number of `cssRules` in the last sheet `gz-app`'s
      shadow root adopts (its own). Then it appends a `<gz-app>`, awaits
      `customElements.whenDefined('gz-dashboard')` (capped at 5 s), records again, and prints
      `{ beforeMount, afterMount }` as JSON on stdout. Lint and typecheck cover it like any script.
- [x] New `src/scripts/build-bundle.test.ts`. It writes the bundle from
      `createStaticFacade().embed()` (no server needed) into a `useTempDir()` directory, runs
      `process.execPath build-bundle.probe.ts <path>` with `Bun.spawn`, and parses its stdout:
  - "defines the shell, each component with its own stylesheet from the bundle": before mounting,
    `gz-app`, `gz-header`, `gz-theme-toggle` and `gz-breadcrumbs` are defined, the `.css` requests
    are exactly `/vendor/oat.css` and `/ui/shared.css`, and `gz-app`'s own sheet has rules (the
    fetch stub answers every `.css` empty, so rules can only have come from the bundle)
  - "runs a lazily imported view only when its route opens, still fetching no component sheet":
    before mounting `gz-dashboard` is not defined; after mounting it is, and the `.css` requests are
    still exactly Oat and `shared.css`
- [x] `docs/backend.md`, "Single-file build": replace "with each module transpiled ahead of time
      with whitespace minified… because bundling would change `import.meta.url` and break the `.ts`
      → `.css` lookup… A module that does not parse fails the build, naming the file." The
      replacement says the modules are bundled into one whitespace-minified ESM file at `/main.ts`
      by `internal/bundle.ts`, with no source map, so names survive in every trace. Its plugin
      rewrites each `import.meta.url` to the module's own path, which keeps the lookup working, and
      fills `ui/inline-styles.ts` with every component stylesheet, the way the build fills
      `embedded.ts`. A module the bundle reaches that does not parse fails the build, naming the
      file; one it does not reach is not shipped. Bun wraps a dynamically imported module so it
      still runs on first import. `build-bundle.test.ts` runs the bundle under happy-dom, in a
      child process.
- [x] `docs/backend.md`, elsewhere:
  - the static feature's internals lists (around lines 80-82 and 277) gain `bundle.ts`
  - "Tests are end-to-end over HTTP, with nine exceptions" (around line 243) gains `bundle.test.ts`
    and `build-bundle.test.ts`, with the count updated
  - the "logging happens at the edges" list (around line 384) gains `bundle.ts`
  - the logging table (around line 402) gains a row: `static | error | could not bundle <file>: <message> | bundle.ts`
- [x] `docs/frontend.md`:
  - file tree (line 13 area): `ui/` lists `inline-styles.ts`
  - "Loading", first paragraph: "Nothing is written to disk and nothing is bundled" becomes
    "Served from source, nothing is written to disk and nothing is bundled". "A deployed build…
    serves these same modules from memory instead — transpiled once at build time with whitespace
    minified, still one module per URL — and a module that does not parse fails the build rather
    than answering 500" becomes: a deployed build serves the whole frontend as one bundle at
    `/main.ts`, carrying every component stylesheet as text (see "Single-file build" in
    `docs/backend.md`). A lazily imported view still runs only when first opened.
  - wherever it says a component's sheet is fetched beside its module, add that in a built bundle it
    comes from `INLINE_STYLES` instead
  - "Tests": next to the note that every test file shares one happy-dom window in-process, add
    that the bundle test runs in a child process for that reason
- [x] `docs/styling-guidelines.md`, "No CSS in JavaScript": add that the build's inlining of
      component stylesheets into the bundle is output, not source, and does not bend the rule.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/static/internal/bundle.test.ts` passes
- [x] `bun test --parallel src/scripts/build-bundle.test.ts` passes
- [x] `bun test --parallel src/scripts/build.test.ts` passes
- [x] `bun test --parallel src/frontend` passes (dev styles path unchanged)
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass
- [x] `bun test --parallel` passes

**Manual Verification**:

- [x] `bun run build`, then run `dist/gainz.js`: in a browser, the dashboard, a workout, an exercise
      with its chart and the login page each load styled on their first paint. The network panel
      shows `/main.ts`, Oat, `shared.css` and `app.css`, and no component `.css`.
- [x] Under `bun run start:dev`, a component `.css` save still restyles the page in place.

### Phase 2: Remove the preloads

Dependencies: Phase 1

Production no longer needs any preload the server writes. Delete the graph walk, the lazy map,
`preload.ts` and the routes' `module`. Dev runs as a waterfall over localhost.

**Tasks**:

- [x] `src/backend/features/static/internal/page.ts`: delete `scanner`, `Graph`, `walk`,
      `withSheets`, `lazyFiles`, `preloadTags` and the `posix` import; delete `PageSource.module`.
      `renderPage` writes only the import map, once, before the first module script. `scriptJson`
      stays for it. The header loses "announces the page's module graph… one round trip" (lines
      2-4) and its **Preloads** paragraph. In their place, one sentence: a deployed build is one
      bundle, so the page has no graph to announce.
- [x] `src/backend/features/static/internal/web-files.ts`: `#pageSource()` returns `tags` only, and
      its doc comment no longer mentions modules.
- [x] `src/backend/features/static/internal/embed.ts`: the `renderPage` source passes `tags` only.
- [x] `src/frontend/index.html`: in the comment above the stylesheets, delete "The server inserts
      the same kind of preload for every module main.ts imports statically, and for the stylesheet
      beside each, and"; keep that it serves every URL here but the icon's and the manifest's by a
      version.
- [x] Delete `src/frontend/app/preload.ts` and `src/frontend/app/preload.test.ts`.
- [x] `src/frontend/app/gz-app.component.ts`: drop the `preloadModule` import and the
      `if (match.route.module …)` block; the `#viewElement` doc becomes "Builds the element for a route."
- [x] `src/frontend/app/router.ts`: delete `RouteDef.module` and its doc comment.
- [x] `src/frontend/features/auth/auth.routes.ts`, `exercises/exercises.routes.ts`,
      `stats/stats.routes.ts`, `workouts/workouts.routes.ts`: delete each `module: import.meta.resolve(…)` line.
- [x] `src/frontend/app/routes.ts`: the comment keeps that a view is fetched the first time its
      route opens and that awaiting it means the page is ready; drop "its `import()` specifier is a
      literal so the server can find it and map the view's graph for `preload.ts`".
- [x] `src/frontend/app/routes.test.ts`: delete "every route names the module its view imports, for the preloads".
- [x] `src/backend/features/static/static.routes.test.ts`, `describe('preloads')`: replace its four
      tests with:
  - "announce no module graph": the page contains neither `rel="modulepreload"` nor `data-lazy-preloads`
  - "the page's own preloads name stylesheets that exist": the former "name only stylesheets that
    exist", which now sees exactly `index.html`'s Oat and `shared.css` preloads; delete the unused
    `modules` helper
- [x] Same file, `describe('versions')` "the import map comes before anything that loads a module":
      only the `<script type="module"` comparison stays.
- [x] `src/backend/features/static/internal/bundle.test.ts`: "rewrites every import.meta.url…" now
      asserts no `import.meta` at all. `src/scripts/build.test.ts`: the bundle assertion likewise,
      and the preload test drops its empty-map assertion in favor of "no `data-lazy-preloads`".
- [x] `src/frontend/ui/styles.ts`: the `versioned()` doc comment (line 35) still holds; leave its
      `import.meta.resolve()` mention (a comment explaining a rejected alternative).
- [x] `docs/frontend.md`:
  - file tree: drop `preload.ts`
  - the routes paragraph (around line 163): drop "beside a `module` naming that same file through
    `import.meta.resolve()`, for the preloads (see "Loading")"
  - "Loading": drop `app/preload.ts` from the shell list. Replace the two preload paragraphs
    ("Unbundled, that shell would arrive as a waterfall…" and "A lazily loaded view would be the
    same waterfall…") with one: served from source, modules and stylesheets arrive a level of
    imports at a time, which over localhost costs next to nothing, and the deployed bundle has no
    waterfall at all. Keep that `index.html` preloads Oat and `shared.css` for `fetch()`, and why
    `crossorigin` is load-bearing there. The old measurements go.
  - the versioning paragraph: "as `styles.ts` and `preloadModule()` do" becomes "as `styles.ts`
    does"; "The preloads name the same versioned URLs" becomes "`index.html`'s preloads name the
    same versioned URLs"
- [x] `docs/backend.md`: in "Pages", delete the module-graph preload paragraph (`modulepreload`,
      `scanImports`, `data-lazy-preloads`) and the "announces the page's module graph" clause,
      and drop "the modules" from the `PageSource` paragraph. Replace the `static.routes.test.ts`
      sentence about preloads being closed under static imports with: the page announces no module
      graph, and every version is the tag its plain URL's ETag carries. In "Single-file build",
      replace "and so can the preloads (see "Preloads" above), inserted once every module has been
      transpiled" with the page being rendered once every file is embedded.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/static/static.routes.test.ts` passes
- [x] `bun test --parallel src/backend/features/static/internal/bundle.test.ts` passes, with no `import.meta` in the bundle
- [x] `bun test --parallel src/frontend/app` passes without `preload.test.ts` or the `module` test
- [x] `bun test --parallel src/scripts` passes
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass
- [x] `bun test --parallel` passes
- [x] Grep over `src/` excluding `*.test.ts` finds no `preloadModule`, `data-lazy-preloads`,
      `modulepreload`, `module: import.meta` or `lazyPreloads`. Tests may still name them, to assert
      they are absent.

**Manual Verification**:

- [x] Under `bun run start:dev`, the dashboard, a workout, an exercise with its chart, and the login
      page each load styled on their first paint.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Measured while planning (Bun 1.4.2): the bundle of `src/frontend/main.ts` is 71 KB
  whitespace-minified (18.4 KB gzipped), 55 KB fully minified (15.7 KB). The component stylesheets
  are 12.7 KB (4.1 KB gzipped); Oat is 31.7 KB (7.1 KB). A probe run under happy-dom defined `gz-app`
  without `gz-dashboard`. Without the `import.meta.url` rewrite every component requested the
  bundle's own URL as its stylesheet, and with it each requested its own. The only `import.meta` left
  after the rewrite were the routes' `import.meta.resolve(…)` for `module`, which Phase 2 deletes.
- An unreached `import.meta.resolve(…)` in the Phase 1 bundle resolves against the bundle's URL, so
  `preloadModule()` finds no entry in the (empty) map and does nothing.
- Implemented 2026-10-06. The bundle test's broken module is `src/frontend/__broken-bundle.ts`, not
  `__broken.ts`: `transpile.test.ts` writes and unlinks a `__broken.ts` of its own, and under
  `--parallel` the two would race over one file.
- The probe writes its report with `process.stdout.write`: the global walk installs happy-dom's
  `console`, so `console.log` printed nothing.

## References

- `docs/frontend.md` — "Loading", "Hot reload", "Tests"
- `docs/backend.md` — "Pages", "Single-file build", "Logging"
- `docs/styling-guidelines.md` — "No CSS in JavaScript"
- `src/backend/shared/embedded.ts` — the stub-swapped-by-the-build pattern `inline-styles.ts` follows
- `docs/agents/plans/2026-09-29-single-file-build.md` — the build this changes
- Bun bundler plugins: `onLoad` (https://bun.sh/docs/bundler/plugins)
