---
date: 2026-09-14T18:43:46+00:00
git_commit: 3a90d298b63f9bd2bc8dd7ccdfe7f1dc15618f5d
branch: main
topic: "How the frontend as a whole is structured"
tags: [research, codebase, frontend, components, routing, styling, theming, static-serving]
status: complete
---

# Research: How the frontend as a whole is structured

## Research Question

How is the frontend, as a whole, structured?

## Summary

The frontend is a single-page app written as TypeScript ES modules and native custom elements, with
no framework, no bundler and no build output. `src/frontend/` is the web root: the backend's
`static` feature serves each file at the URL of its path, running `.ts` files through
`Bun.Transpiler` on request (types erased, specifiers untouched). Pico CSS 2 (orange theme) is the
only runtime dependency and is served from `node_modules` at `/vendor/pico.css`.

It is organised in three layers:

1. **Document and entry** — `index.html` (the only page) and `main.ts`, which imports the `gz-app`
   shell.
2. **Shared layer** — six flat modules at the root of `src/frontend/`: `base.ts` (the `GzElement`
   base class, the escaping `html` template, `define()`), `styles.ts` (constructable stylesheet
   cache), `theme.ts` (light/dark preference), `router.ts` (hash router), `api.ts` (fetch client)
   and `format.ts` (display helpers). Plus two global stylesheets in `css/`.
3. **Components** — eleven custom elements, one directory each under `components/<tag>/` holding
   `<tag>.ts` and `<tag>.css`. They split into a shell (`gz-app`, `gz-toast`, `gz-theme-toggle`),
   five route views loaded on demand, and three child components rendered inside views
   (`gz-stat-tile`, `gz-set-row`, `gz-chart`).

The wire types come from `src/shared/` (`dto/` and `flavors.ts`), which sits outside the web root
and is reached only through `import type`, erased at transpile time.

```
src/frontend/
├── index.html                  the only page: no-flash theme script, Pico + app.css, main.ts
├── main.ts                     imports gz-app, redirects a hashless URL to #/
├── base.ts                     GzElement, html``/raw()/escapeHtml, define()
├── styles.ts                   fetches CSS into CSSStyleSheet objects; stylesFor()/loadStyles()
├── theme.ts                    light/dark preference, localStorage, gz-theme-change event
├── router.ts                   hash routes → { name, params, path }; navigate(), onRouteChange()
├── api.ts                      request<T>() over fetch('/api…'), ApiError, the `api` object
├── format.ts                   UNIT, number/weight/volume/date/relative-day/delta formatters
├── css/
│   ├── app.css                 document-level: pins --pico-font-size, sizes <gz-app>
│   └── shared.css              adopted into every shadow root: layout/form/badge/table utilities
└── components/
    ├── gz-app/                 shell: header nav, <main> view slot, footer, <gz-toast>
    ├── gz-toast/               toast stack + exported toast()/toastError()
    ├── gz-theme-toggle/        dark-mode switch
    ├── gz-dashboard/           view  #/
    ├── gz-workout-list/        view  #/workouts
    ├── gz-workout-detail/      view  #/workouts/:id   (renders gz-set-row)
    ├── gz-exercise-list/       view  #/exercises
    ├── gz-exercise-detail/     view  #/exercises/:id  (renders gz-chart, gz-stat-tile)
    ├── gz-stat-tile/           attribute-driven headline number
    ├── gz-set-row/             one logged set, view/edit in place (exported class)
    └── gz-chart/               SVG line chart with HTML axis labels (exported class)

src/shared/                     not web-served; types only
├── dto/{index,error,exercise,meta,set,stats,workout}.ts
└── flavors.ts                  WorkoutId, ExerciseId, LiftSetId, Iso8601Date, Iso8601DateTime

src/backend/features/static/    serves the frontend
├── static.routes.ts            vendor URLs + '/*'
└── internal/
    ├── static.controller.ts    file lookup, .ts → transpile, SPA fallback, 405
    ├── paths.ts                FRONTEND_DIR, VENDOR_FILES allowlist, traversal guard
    └── transpile.ts            Bun.Transpiler({ loader: 'ts', target: 'browser' })
```

### Module graph (static imports; dashed = dynamic `import()`)

```
index.html
  ├─ /vendor/pico.css, /css/app.css   (document <link>s)
  └─ main.ts
       └─ gz-app ──┬─ base.ts ──┬─ styles.ts   (top-level await: pico.css + shared.css)
                   │            └─ theme.ts
                   ├─ router.ts
                   ├─ gz-toast ──── api.ts
                   ├─ gz-theme-toggle ── theme.ts
                   │
                   ├╌╌> gz-dashboard ───────── api, format, router, gz-toast, gz-stat-tile
                   ├╌╌> gz-workout-list ────── api, format, router, gz-toast
                   ├╌╌> gz-workout-detail ──── api, format, router, gz-toast, gz-set-row
                   ├╌╌> gz-exercise-list ───── api, format, gz-toast
                   └╌╌> gz-exercise-detail ─── api, format, gz-toast, gz-chart, gz-stat-tile

gz-set-row → api, format, gz-toast        gz-chart → format        gz-stat-tile → base only
```

## Detailed Findings

### Document and entry point

- `index.html` is the only HTML file (`src/frontend/index.html:1-45`). An inline classic script
  reads `localStorage['gainz:theme']` and sets `data-theme` on `<html>` before first paint
  (`index.html:14-27`); the key is duplicated from `theme.ts:22` deliberately. It links
  `/vendor/pico.css` and `/css/app.css`, loads `/main.ts` as a module (`index.html:33-35`), and the
  body is just `<gz-app>` plus a `<noscript>` notice.
- `main.ts` imports `./components/gz-app/gz-app.ts` and, if `location.hash` is empty, calls
  `location.replace('#/')` (`main.ts:6-11`).

### Serving: the backend `static` feature

- `staticRoutes()` registers one `{ GET, HEAD }` route per `VENDOR_FILES` key and a catch-all
  `'/*'` (`src/backend/features/static/static.routes.ts:13-20`). `'/*'` is a bare function so it
  owns the 405 for non-GET/HEAD verbs (`static.controller.ts:28-30`).
- `FRONTEND_DIR` is `<repo>/src/frontend` (`internal/paths.ts:6-7`). `resolveStaticPath` decodes the
  path, rejects NUL bytes and anything resolving outside `FRONTEND_DIR` (`paths.ts:34-50`).
- `VENDOR_FILES` maps `/vendor/pico.css` → `@picocss/pico/css/pico.orange.min.css`, resolved with
  `Bun.resolveSync` (`paths.ts:15-29`); served as `text/css` with `max-age=3600`
  (`static.controller.ts:10-25`).
- `StaticController.frontend` (`static.controller.ts:27-64`): a directory path gets `index.html`; a
  `.ts` file is transpiled and returned as `text/javascript` with `no-cache`; other existing files
  are returned with Bun's inferred content type and `no-cache`; an unknown extensionless,
  non-directory path falls back to `index.html`; everything else is 404.
- `transpileModule` uses one shared `Bun.Transpiler({ loader: 'ts', target: 'browser' })`, returns
  `null` (→ 500 "Could not transpile <file>") on a parse error (`internal/transpile.ts:13-30`).
  Import specifiers are left as written, so `import './format.ts'` makes the browser fetch
  `/format.ts`.

### `base.ts` — the component foundation

- `html` tagged template (`base.ts:39-45`) escapes every interpolated value through `escapeHtml`
  (`base.ts:16-20`); `null`/`undefined`/`false` render as empty, arrays are joined, and `RawHtml`
  instances (from `raw()` or a nested `html` call) pass through unescaped (`base.ts:22-33`).
- `GzElement extends HTMLElement` (`base.ts:56-171`):
  - Constructor attaches an open shadow root, sets `adoptedStyleSheets = stylesFor(localName)`, and
    installs two delegated listeners: a click on any `[data-action]` element calls
    `handleAction(action, element, event)`; a submit of a `form[data-action]` calls
    `preventDefault()` then `handleSubmit(action, form, event)` (`base.ts:65-85`).
  - `connectedCallback` mirrors the theme onto the host, subscribes to theme changes once, then
    `render()` (`base.ts:92-100`); `disconnectedCallback` unsubscribes (`base.ts:103-106`).
  - `render()` assigns `String(this.template())` to the shadow root's `innerHTML` and calls
    `afterRender()` (`base.ts:113-116`). Rendering is whole-shadow-root replacement.
  - Helpers: `root` getter, `$`/`$$` shadow-scoped queries, `emit(name, detail)` dispatching a
    bubbling, composed `CustomEvent`, and `formData(form)` returning trimmed string fields
    (`base.ts:88-170`).
- `define(name, ctor)` awaits `loadStyles(name)` and then calls `customElements.define`, skipping
  already-defined names (`base.ts:183-191`). Every component module ends with
  `await define('<tag>', Class)` at top level.

### `styles.ts` — stylesheets as shared `CSSStyleSheet` objects

- `BASE_HREFS = ['/vendor/pico.css', '/css/shared.css']` are fetched behind a module-level
  `await Promise.all(...)` (`styles.ts:19,46`), so any module importing `base.ts` waits for them.
- A component's sheet is at `/components/<tag>/<tag>.css` by convention (`styles.ts:21`).
  `loadStyles` fetches it at most once, deduplicating concurrent calls via a `pending` map
  (`styles.ts:53-62`).
- A failed fetch logs to the console and stores an empty sheet rather than throwing
  (`styles.ts:38-43`).
- `stylesFor(tag)` synchronously returns `[pico, shared, own]` (`styles.ts:69-76`); it can be
  synchronous because `define()` has already awaited `loadStyles`.

### `theme.ts` — light/dark

- `Theme = 'light' | 'dark'`; initial value is the stored choice, else `prefers-color-scheme`
  (`theme.ts:19-54`).
- `setTheme` stores to `localStorage`, sets `data-theme` on `<html>`, dispatches `gz-theme-change`
  on `window` (`theme.ts:65-79`). `applyThemeTo(el)` sets the attribute on one element
  (`theme.ts:61-63`); the module also applies it to `<html>` on load (`theme.ts:92`).
- `GzElement.connectedCallback` applies the theme to each host and listens for changes, because
  Pico reaches inside a shadow root only via `:host` (explained in `theme.ts:1-17` and
  `docs/frontend.md` "Theming").

### `router.ts` — hash routing

- `ViewName = 'dashboard' | 'workouts' | 'workout' | 'exercises' | 'exercise'`, plus `'notfound'`
  (`router.ts:6-8`).
- `ROUTES` is a regex table: `/`, `/workouts`, `/workouts/(\d+)`, `/exercises`,
  `/exercises/(\d+)`, captured into `params.id` (`router.ts:18-24`).
- `currentRoute()` reads `location.hash` (`router.ts:26-41`); `navigate(path)` sets the hash, or
  re-dispatches `hashchange` when already there so the view reloads (`router.ts:43-51`);
  `onRouteChange` wraps `hashchange` (`router.ts:54-59`); `isActive` does prefix matching for nav
  highlighting (`router.ts:62-65`).
- Most navigation is plain `<a href="#/…">` links in templates; `navigate()` is called after
  mutations (creating/deleting a workout).

### `api.ts` — REST client

- `request<T>(method, path, body?)` fetches `/api${path}`, JSON-encodes a body, parses a JSON
  response (empty → `null`), and throws `ApiError(message, status, details)` on transport failure
  (status 0) or non-2xx, taking `error`/`details` from the body when present (`api.ts:57-92`). The
  success body is cast to `T` (`api.ts:91`).
- `errorMessage(unknown)` turns any thrown value into display text (`api.ts:42-44`).
- `api` is a single object grouped by resource (`api.ts:103-140`): `summary()`,
  `exercises.{list,get,progress,create,update,remove}`,
  `workouts.{list,get,create,update,remove,addSet}`, `sets.{update,remove}`. Each method's return
  type names a DTO from `src/shared/dto`; id parameters use the flavored types from
  `src/shared/flavors.ts`.

### `format.ts` — display helpers

- `UNIT = 'kg'` (`format.ts:7`), used by views for labels.
- `formatNumber`, `formatWeight` (0 → "bodyweight"), `formatVolume` (tonnes ≥ 10 000),
  `formatDate`/`formatShortDate` (via `Intl.DateTimeFormat`, taking `Iso8601Date`), `relativeDay`,
  `plural`, `todayIso` (local timezone), `formatDelta` (`format.ts:19-125`).

### Global CSS

- `css/app.css` is linked by the document only: pins `--pico-font-size: 100%` and makes `gz-app` a
  full-height block (`app.css:6-23`).
- `css/shared.css` is adopted into every shadow root after Pico (`shared.css:1-8`). It sets
  `:host { display: block; font-size: inherit }` (`shared.css:10-22`) and provides utility classes
  used across components: `.stack`, `.stack-sm`, `.row`, `.row-between`, `.grow`, `.fields`/
  `.field`, `.muted`, `.mono`, `.nowrap`, `.error-text`, `.badge`, `.empty`, `button.compact`,
  `button.danger`, `td/th.num` (`shared.css:26-170`). All colours come from Pico custom properties.
- Each component's own `.css` holds only that component's rules (e.g. `gz-app.css`: sticky header,
  compact nav buttons, brand, main/footer spacing).

### Components

All extend `GzElement`, render via `template()`, and handle events through `data-action`.

**Shell (loaded eagerly with `gz-app`)**

- `gz-app` (`components/gz-app/gz-app.ts`): renders header nav (`NAV`, `gz-app.ts:8-12`), an empty
  `<main class="container">`, a footer and `<gz-toast>` once (`gz-app.ts:159-187`). `VIEWS` maps
  each `ViewName` to a dynamic `import()` of its view module (`gz-app.ts:24-30`). On render and on
  every `hashchange`, `#renderView` updates nav `aria-current`/`outline` synchronously, scrolls to
  top, and calls `#swapView` (`gz-app.ts:110-133`). `#swapView` awaits the import, creates the
  element (setting `workout-id`/`exercise-id` attributes for detail routes, or a `<p>` for
  `notfound`, `gz-app.ts:59-100`), discards the result if a newer navigation started (token check,
  `gz-app.ts:148-150`), and `replaceChildren`s `<main>`. A failed import is reported via
  `toastError` and the old view stays (`gz-app.ts:138-145`).
- `gz-toast` (`components/gz-toast/gz-toast.ts`): exports `toast(message, kind)` and
  `toastError(error)`, which dispatch a `gz-toast` event on `window` (`gz-toast.ts:28-35`); the
  element listens for it, keeps an item list, auto-dismisses after 3 s (6 s for errors) and supports
  a dismiss button (`gz-toast.ts:37-97`). Augments `WindowEventMap` for typing
  (`gz-toast.ts:21-25`). Any module can toast without a DOM reference.
- `gz-theme-toggle` (`components/gz-theme-toggle/gz-theme-toggle.ts`): a Pico `role="switch"`
  checkbox calling `setTheme`; keeps `checked` in sync via property rather than re-render
  (`gz-theme-toggle.ts:24-44`).

**Route views (dynamically imported)**

Each view holds a private `#state` discriminated by `status: 'loading' | 'ready' | 'error'`, calls
`#load()` from `connectedCallback`, sets state, and calls `render()`. Mutations call the API, toast
the outcome, and either reload or `navigate()`.

| Tag                   | Route             | Loads                                               | Actions / forms                                                                             |
| --------------------- | ----------------- | --------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `gz-dashboard`        | `#/`              | `api.summary()` + `workouts.list({limit:5})`        | `start-workout` → create today's workout, navigate (`gz-dashboard.ts:32-42`)                |
| `gz-workout-list`     | `#/workouts`      | `workouts.list` paged by 25, appending (`:31-41`)   | form `create`; `load-more`, `repeat` (`copyFromWorkoutId`), `delete` (`:43-98`)             |
| `gz-workout-detail`   | `#/workouts/:id`  | `workouts.get(id)` + `exercises.list()` (`:87-103`) | `toggle-header`, `delete-workout`, `repeat-exercise`; forms `save-workout`, `add-set` (`:105-196`) |
| `gz-exercise-list`    | `#/exercises`     | `exercises.list()`                                  | form `create`/`save`; `edit`, `cancel`, `delete` with inline edit row (`:32-97`)            |
| `gz-exercise-detail`  | `#/exercises/:id` | `exercises.progress(id)` (`:82-92`)                 | `metric` switches the plotted series (`:94-103`)                                            |

- The two detail views observe their id attribute (`observedAttributes`), store it, and expose it
  through a private `get #id()` that converts to the flavored id and throws if absent
  (`gz-workout-detail.ts:50-77`, `gz-exercise-detail.ts:49-75`). They suppress the toast for a 404
  and show an inline error with a back link instead.
- `gz-workout-detail` keeps a `#draft` of the last logged set to prefill the add-set form, supports
  a `__new__` sentinel option to create an exercise inline (`gz-workout-detail.ts:25,43-47,169-195`),
  computes per-exercise totals client-side (`#breakdown`, `:334-352`), and refocuses the weight
  input after logging (`:220-224`).

**Child components (statically imported by the view that renders them)**

- `gz-stat-tile` (`components/gz-stat-tile/gz-stat-tile.ts`): purely attribute-driven — observes
  `label`, `value`, `hint` and re-renders on change. Used by `gz-dashboard` and
  `gz-exercise-detail`.
- `gz-set-row` (`components/gz-set-row/gz-set-row.ts`, exported `GzSetRow`): property-driven
  (`set`, `exercises`, `index` setters, `:21-35`). Parent `gz-workout-detail` renders
  `<gz-set-row data-id data-index>` and assigns the properties in `afterRender`
  (`gz-workout-detail.ts:204-210`). The row edits/duplicates/deletes via the API itself and emits a
  composed `sets-changed` event (`gz-set-row.ts:57-102`), which the parent listens for on its shadow
  root to reload (`gz-workout-detail.ts:81-83`).
- `gz-chart` (`components/gz-chart/gz-chart.ts`, exported `GzChart` and `ChartPoint`):
  property-driven (`series`, `unit`). Draws gridlines, an area path and a polyline in an SVG with
  `preserveAspectRatio="none"`, and renders axis ticks and point dots as absolutely positioned HTML
  using fractional coordinates shared by both (`gz-chart.ts:63-158`). Points are spaced by index,
  not date. `gz-exercise-detail` sets `unit` and `series` in `afterRender`
  (`gz-exercise-detail.ts:105-118`).

### Data flow between components

```
                    window events
  any module ── toast()/toastError() ──► 'gz-toast' ──► <gz-toast>
  gz-theme-toggle ── setTheme() ──────► 'gz-theme-change' ──► every GzElement host (data-theme)
  <a href="#/…"> / navigate() ────────► 'hashchange' ──► <gz-app>#renderView

                    parent → child
  gz-app ── attribute workout-id / exercise-id ──► detail views
  views ── attributes label/value/hint ──► gz-stat-tile
  gz-workout-detail ── properties set/exercises/index (afterRender) ──► gz-set-row
  gz-exercise-detail ── properties unit/series (afterRender) ──► gz-chart

                    child → parent
  gz-set-row ── emit('sets-changed') (bubbles, composed) ──► gz-workout-detail #load()
```

There is no global store; each view fetches its own data from `api` on connect and after every
mutation.

### Types and the shared contract

- Components import DTO types from `src/shared/dto` and flavored ids/dates from
  `src/shared/flavors.ts` with `import type`, which the transpiler strips
  (`transpile.test.ts:36-40` asserts `shared/dto` does not survive).
- Specifiers vary: `api.ts` and some components import `'../shared/dto'` / `'../../../shared/dto'`
  (directory), others `'../../../shared/dto/index.ts'`. `src/shared/dto/index.ts` is a type-only
  barrel (with a `// TODO remove barrel imports`, `index.ts:18`).
- Local types stay in their module (view state unions, `ExerciseTotals`, `Metric`, `ChartPoint`).
  Only `GzChart`, `ChartPoint` and `GzSetRow` are exported from component modules, so views can
  type the elements they drive; the other component classes are module-private.

### Tooling as it applies to the frontend

- One root `tsconfig.json` covers all of `src` with `lib: ["ESNext", "DOM", "DOM.Iterable"]`,
  `allowImportingTsExtensions`, `verbatimModuleSyntax`, `strict`, `noUncheckedIndexedAccess`,
  `noEmit` (`tsconfig.json:1-18`). `bun run typecheck` (`tsc --noEmit`) is the only type gate.
- `.oxlintrc.json` overrides target backend routes, controllers and translators only; there is no
  frontend-specific override.
- There are no `*.test.ts` files under `src/frontend/`; frontend-related tests are the backend's
  `static.routes.test.ts`, `internal/paths.test.ts` and `internal/transpile.test.ts`.

## Code References

- `src/frontend/index.html:14-35` - no-flash theme script, stylesheet links, module entry
- `src/frontend/main.ts:6-11` - shell import and `#/` redirect
- `src/frontend/base.ts:39-45` - `html` escaping tagged template
- `src/frontend/base.ts:56-171` - `GzElement` base class
- `src/frontend/base.ts:183-191` - `define()` awaiting the component stylesheet
- `src/frontend/styles.ts:19-76` - stylesheet cache, base sheets, `stylesFor`
- `src/frontend/theme.ts:54-92` - theme state, persistence, change event
- `src/frontend/router.ts:18-65` - route table and router functions
- `src/frontend/api.ts:57-140` - `request<T>` and the `api` object
- `src/frontend/format.ts:7-125` - formatters
- `src/frontend/css/shared.css:10-170` - per-shadow-root utilities
- `src/frontend/components/gz-app/gz-app.ts:24-30` - `VIEWS` lazy-import table
- `src/frontend/components/gz-app/gz-app.ts:110-157` - route rendering and view swap
- `src/frontend/components/gz-toast/gz-toast.ts:28-35` - global `toast()` API
- `src/frontend/components/gz-workout-detail/gz-workout-detail.ts:198-225` - wiring `gz-set-row` in `afterRender`
- `src/frontend/components/gz-set-row/gz-set-row.ts:57-102` - `sets-changed` emission
- `src/frontend/components/gz-chart/gz-chart.ts:97-158` - SVG + HTML chart template
- `src/backend/features/static/static.routes.ts:13-20` - static route table
- `src/backend/features/static/internal/static.controller.ts:27-75` - file serving, transpile, SPA fallback
- `src/backend/features/static/internal/paths.ts:15-50` - vendor allowlist and traversal guard
- `src/backend/features/static/internal/transpile.ts:13-30` - `Bun.Transpiler` wrapper

## Architecture Documentation

- **No build step.** Source files are served one-to-one; the only transformation is per-request type
  erasure. A module's URL equals its path under `src/frontend/`.
- **Native custom elements + shadow DOM.** Every UI piece is a `GzElement` subclass with an open
  shadow root; there is no virtual DOM or diffing — `render()` replaces `innerHTML`.
- **Convention over registration.** A component is a directory with `<tag>.ts` and `<tag>.css`;
  the stylesheet URL is derived from the tag name and the element registers itself at the bottom of
  its module. There is no component manifest.
- **Top-level `await define()`** makes a component module's evaluation complete only once its CSS
  is loaded, so awaiting a view's `import()` yields a fully styled subtree (`docs/frontend.md`
  "Loading").
- **Lazy routes, static children.** Only the five views in `VIEWS` are dynamically imported; child
  components are static imports of the view that uses them.
- **Styling stack per shadow root:** Pico → `shared.css` → component CSS, adopted by reference.
  No CSS in JavaScript except computed inline `style` positions in `gz-chart`.
- **Declarative event wiring** via `data-action` attributes and base-class delegation, with
  `handleAction`/`handleSubmit` switches in each component.
- **Cross-cutting communication through `window` events** (`gz-toast`, `gz-theme-change`,
  `hashchange`) and composed custom events from child to parent (`sets-changed`).
- **Data in:** attributes for primitive inputs (ids, tile text), properties for structured data
  (set rows, chart series), assigned in `afterRender`.
- **State per view**, as a `status`-discriminated union; refetch after each mutation instead of
  patching local state.
- **Escaping by default** through `html`; `raw()` is used for nested `html` output and one SVG
  polyline string in `gz-chart`.
- **Types-only shared contract** from `src/shared/`, erased before reaching the browser.

## Open Questions

- `docs/frontend.md` and `src/shared/dto/index.ts:9` refer to `src/shared/shared.test.ts` as the
  test that asserts every file under `src/shared/` transpiles to nothing, and
  `transpile.test.ts:39` points to it too; no such file exists in the repository at this commit.
- The count in `docs/frontend.md` of what opening the dashboard fetches ("five component scripts
  and five stylesheets") was not verified against a browser network log.
