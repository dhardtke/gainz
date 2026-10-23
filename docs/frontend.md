# Frontend (`src/frontend/`)

The rules every change follows, then the patterns and gotchas the code does not make obvious.

No build step: `index.html` is the only page and loads `main.ts`, which imports the
`app/gz-app.component.ts` shell. Routes are real extension-less paths (`/workouts/3`) that the
server answers with `index.html`. A module's URL is its path below `src/frontend/`.

## Layout

```
src/frontend/
├── index.html  main.ts  manifest.webmanifest  testing.ts
├── icons/      the app icon
├── dev/        hot.ts, the hot-reload client (development only, imported by nothing)
├── app/        gz-app shell, gz-header, gz-breadcrumbs, gz-theme-toggle, router.ts, routes.ts, tab-title.ts
├── http/       http.ts (get/post/put/patch/remove), errors.ts (ApiError, errorMessage)
├── ui/         what any component may use
└── features/<feature>/
    ├── <feature>.routes.ts  <feature>.facade.ts  route views and components other features render
    └── internal/            *.api.ts classes and what only this feature uses
```

Features: `exercises`, `workouts`, `stats` (dashboard and Statistics page), `weight`, `auth` (login).

`ui/` holds: `base.ts` (`GzElement`: open shadow root, `data-action` click/submit delegation,
`template()`/`render()`; `define()`), `view.ts` (`GzView`), `editable-row.ts` (`GzEditableRow`,
`keepRowFocus()`), `html.ts` (`html`, `raw()`), `styles.ts`, `theme.ts`, `format.ts` (display
formats, `todayIso()`, `daysBefore()`), `toast.ts` (`toast()`, `toastError()`), `modal.ts`
(`GzModal`), `confirm/` (`confirmAction()`), `pagination/`, `tile/gz-tile`, `chart/gz-chart`,
`app.css` (document styles, tokens) and `shared.css` (utilities, also linked in the document).

`app/` reaches features only through their route lists, except `gz-header`, which imports
`auth.facade.ts` for Log out.

## Components

- A component is `gz-<name>.component.ts` + `gz-<name>.component.css` side by side. The module ends
  with `await define('<tag>', TheClass, import.meta.url)`; `styles.ts` swaps `.ts` for `.css` to
  find the sheet and every instance adopts it. A test fails any component without its `.css`.
- **The top-level `await` is load-bearing**: "module loaded" means "stylesheet loaded", so a lazily
  imported view paints styled on its first frame.
- Route views (except `gz-login`) extend `GzView`: `load()` on connect, `loadingText`,
  `readyTemplate()`/`errorTemplate()`, `titleFor(data)`/`pageTitle`, `reload()`, `show(data)`
  (render without loading), `replaceData(data)` (store only, for views patching their own DOM),
  `numericAttribute()`. It emits `page-title` after each.
- All interpolation goes through `html`, which escapes; `raw()` only for markup another `html` call
  produced.
- Export a component class only when another module needs it (route views are exported so their
  route file can `new` them, keeping the tag name only in `define()`).
- List items are `shared.css`'s `article.open-card`: the title anchor's `::after` covers the card,
  so it stays a real link; buttons go in `.actions`, which paints above the overlay.

### Saving without re-rendering

Autosaving fields (set rows, weigh-in rows, workout details) never re-render the view: replacing the
focused field would close a phone's keyboard. Instead the view stores data with `replaceData()` and
patches only what holds no field (headings, totals, summaries), hands rows their new data (a row's
setter skips rendering when handed what it already holds), and `gz-add-set-form` gets
`updateSets()`. When a re-render is unavoidable, carry focus with `focusedField()`/`restoreField()`
(`keepRowFocus()`) and carry typed text (e.g. the add-set form's `draft`, the view's `#edits`).
Remembered UI state that survives re-renders (open accordion, open `<details>`) lives in view fields.

A row runs its requests one after another, so a blur save lands before a following done toggle.

## Features and facades

- One API class per URL prefix in `internal/` (`workout.api.ts` owns `/api/workouts/**`).
- The facade module exports ready instances (`workoutFacade`, `setFacade`) of thin classes whose
  methods delegate in one line and use the backend's verbs. No composition root.
- A component reads data only through facades, including other features' facades — never another
  feature's `internal/`. Composition across facades stays in the component.
- Components another feature renders sit at the feature root (`gz-workout-card`,
  `gz-muscle-group-icon`, `gz-weight-tile`).

## Routing

- Routes live in `<feature>.routes.ts`: a regex `pattern`, its `keys`, a `view(params)` that
  `import()`s the view and returns `new GzXComponent()` with any id attribute set, plus optional
  `title`, `parents` (`{ path, label }` crumbs, detail pages only) and `nav` (header link).
  `app/routes.ts` spreads them in header order.
- Links are plain `<a href="/…">`; `gz-app` intercepts plain same-origin clicks on extension-less,
  non-`/api` paths without query or fragment (`linkPath`) and calls `navigate()`. A link with a query
  is a full page load, so query-changing controls (pagination, month, range, filters) are buttons
  that emit a composed event; the owner calls `navigate()` or `history.pushState()` (to update in
  place without remounting).
- Breadcrumbs are derived from the matched route, never history; parents link to bare list paths.
  The current crumb and `document.title` come from the view's `pageTitle`, falling back to the
  route's `title`. `APP_TITLE` must match `index.html`'s `<title>` (tested).
- `gz-app` keeps the old view until the new one's `ready` resolves (capped at `SLOW_VIEW_MS`, 300
  ms). It removes the old children rather than `replaceChildren(view)`, which would reconnect and
  refetch. `shared.css` sets `:host([hidden]) { display: none }`.
- The view is `gz-app`'s light-DOM child shown through a `<slot>`, so password managers can find the
  login form. The header host is sticky with fixed height `--header-height` (in `app.css`).

## Import boundaries

`bun run lint` holds these in `.oxlintrc.json`:

- A module under `features/<a>/` may not import `features/<b>/internal/`.
- Nothing under `app/`, `ui/`, `http/` or `main.ts` may import any `internal/`.
- No component may import an `*.api.ts` or `http/http.ts`.
- `ui/` and `http/` may not import `features/` or `app/` (so `http.ts` signals 401 with the
  `gz:unauthorized` event instead of navigating).
- A `*.routes.ts` may not import `internal/`, `*.api.ts`, `*.facade.ts`, `http/` or `ui/`; it only
  `import type`s `RouteDef`.

oxlint applies only the last matching override's `no-restricted-imports`, so a narrower override
repeats its directory's patterns.

**Only route views are dynamically imported. A component a view renders must be a static import in
that view's module** — otherwise property assignments land on an un-upgraded element, shadow the
class accessors, and it renders blank with no error.

## Types

- Wire types come from `src/shared/dto/` (one file per feature, no barrel) and flavors from
  `src/shared/flavors.ts`, always with `import type`. `src/shared/` is outside the web root, so a
  surviving runtime import would 404: **`src/shared/` must stay free of runtime code**. Values the
  frontend needs (e.g. `MUSCLE_GROUPS`) are its own copy, pinned by a test on each side.
- Use flavored ids and dates in API classes, facades, `format.ts` and component state.
- Shapes local to one module are declared in that module.

## Feature notes

- **Auth**: a 401 navigates to `/login?next=…`; `toastError()` stays silent for 401.
  `authFacade.enabled()` reads the `#auth-status` JSON the server embeds. `gz-login` is a plain
  `GzElement` (a hidden form would be ignored by password managers), renders its form in light DOM,
  and uses its own `submit` listener (happy-dom doesn't deliver slotted events to the shadow root).
  `nextPath()` only accepts same-origin paths.
- **Paging**: `?page=N` (page 1 is the bare path), `PAGE_SIZE` 10; the arithmetic is in
  `ui/pagination/pagination.ts` (`parsePage`, `pageCount`, `pageOffset` capped at `MAX_OFFSET`,
  `pagePath`, `pageItems`). Exercise filters are read/written by `parseExerciseFilter`/`exercisesPath`
  in `exercises/internal/exercise-filter.ts`.
- **Exercise kinds** change the UI: bodyweight hides the weight field (disabled inputs are not
  posted, so the API stores 0) and speaks in reps; assisted labels weight as assistance (less is
  better, `lowerIsBetter`) and uses effective volume. The client has no body weight, so it shows
  reps instead of volume for both.
- **Workout page**: `#openExerciseId` (accordion, `<details name="exercises">` in the view's own
  shadow root), `#detailsOpen`, `#barValue` (progress bar slide animation), `LastSessionCache` owned
  by the view because every render creates a new `gz-add-set-form`. Done locks mirror the backend:
  a row's `locked` is set before its `set`.
- **Stats**: `PROGRESSION_THRESHOLD` (2.5%) and `LEVELS` in `stats/internal/progression.ts` are the
  one place the buckets are defined. `RECENT_DAYS` is in `stats/internal/dates.ts`.
- **Weight**: range math in `weight/internal/range.ts` (loads 6 extra days for the 7-day average),
  trend math in `weight/internal/trend.ts`, EufyLife CSV parsing in `weight/internal/eufy.ts`.

## Loading

- Served from source, each module is transpiled on request; specifiers are untouched. **The
  transpiler erases types without checking them** — `bun run typecheck` is the only type gate. A file
  that does not parse is a 500 naming it.
- A deployed build serves one bundle at `/main.ts` and one `/main.css` (see "Single-file build" in
  `docs/backend.md`).
- The server versions every URL through an import map, so `import.meta.url` carries `?v=`; anything
  keyed by a module's URL uses its pathname (as `styles.ts` does).
- `index.html` preloads `/vendor/oat.css` and `/ui/shared.css` for `fetch`; the `crossorigin` there
  is load-bearing.

## Hot reload

`bun run start:dev` only. Saving a `.css` refetches into the same `CSSStyleSheet`, so it restyles
in place; a `.ts`, `index.html`, manifest or icon reloads the page (a module can't be re-evaluated:
`define()` returns early for a known tag). **`styles.ts` keys sheets by pathname** — break that and
component sheets silently fall back to full reloads.

## Theming

`ui/theme.ts` sets `data-theme` on `<html>`; `app.css` turns it into `color-scheme`, and Oat's
`light-dark()` tokens follow into every shadow root. Brand tokens are overridden in `app.css`, and
`ui/contrast.test.ts` checks them against WCAG AA. The `theme-color` values live in three places —
`--card` in `app.css`, the inline script in `index.html` and `THEME_COLORS` in `theme.ts` — kept
equal by `theme.test.ts`.

## Installing

`manifest.webmanifest`, no service worker. The PNG icons are rasterized by hand whenever an SVG
changes: in Chromium, draw the SVG onto a canvas with `drawImage(img, 0, 0, size, size)` and save
`toBlob(…, 'image/png')` — `icon-192.png` and `icon-512.png` from `icon.svg`,
`icon-maskable-512.png` from `icon-maskable.svg`. `static.routes.test.ts` checks the sizes.

## Tests

- Tests without a DOM need nothing (`html.ts` is separate from `base.ts` so it can be imported
  without one).
- Component tests call `useDom()` from `src/frontend/testing.ts` (one happy-dom window per process,
  installed per file, since backend tests need Bun's own `fetch`). `await import()` the component
  in `beforeAll` after `useDom()`. `fetch` answers `.css` with an empty 200 and rejects anything
  else; use `useFetch()` with `respondWith()`/`respondTo('GET /api/…', …)` and read requests with
  `sent('POST /api/…')`.
- Set attributes before appending (happy-dom skips `attributeChangedCallback` at upgrade): use
  `mount(tag, attributes)`.
- Find elements only by `data-testid` via `find(shadow(view), testId('heading'))`; assert classes on
  elements found that way. Test ids are unique per shadow root.
- Helpers: `type()`, `choose()`, `submit()`, `settle()`, `openDialog()` (call right after the click),
  `collect('event-name')`, `useToasts()` (after `useDom()`), `useGlobals()`.
- A module that reads the browser on load (e.g. `theme.ts`) is imported with a query string
  (`./theme.ts?3`) for a fresh instance per test.
- Domain test data comes from `<feature>.fixtures.ts` builders (`exercise()`, `session()`, `set()`)
  taking one overrides object.
- `bun fmt` reformats markup inside `html` templates, so exact-output tests interpolate their parts.
- Not testable under happy-dom: popovers, styling, `gz-app`'s hidden/`ready` swap.
