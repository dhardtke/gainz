# Frontend (`src/frontend/`)

`index.html` is the only page: it links Oat and `ui/app.css`, applies a stored theme in a small
inline script before the first paint, loads Oat's `oat.js` deferred, and `main.ts` as a module. `main.ts` only imports the
`app/gz-app.component.ts` shell. Routes are real paths such as `/workouts/3`, and the server answers
each with `index.html` because it carries no extension.

```
src/frontend/
├── index.html  main.ts
├── dev/        hot.ts (development only)
├── app/        gz-app, gz-header, gz-theme-toggle, router.ts, routes.ts
├── http/       http.ts (get/post/patch/remove), errors.ts (ApiError, errorMessage)
├── ui/         base.ts, view.ts, html.ts, styles.ts, theme.ts, format.ts, app.css, shared.css, toast.ts, tile/, pagination/
└── features/
    ├── exercises/  exercises.routes.ts, exercises.facade.ts, gz-exercise-list, gz-exercise-detail
    │   └── internal/  exercise.api.ts, gz-chart, gz-progress-chart, gz-session-table
    ├── workouts/   workouts.routes.ts, workouts.facade.ts, gz-workout-list, gz-workout-detail
    │   └── internal/  workout.api.ts, set.api.ts, gz-set-row, gz-add-set-form
    └── stats/      stats.routes.ts, stats.facade.ts, gz-dashboard
        └── internal/  stats.api.ts
```

What belongs to no feature sits in four directories. `dev/` holds `hot.ts`, the hot-reload client
the server injects only in development; nothing imports it, and it is deliberately not one of the
import boundaries below. `app/` is the shell: `gz-app`, the
`gz-header` it renders at the top with the `gz-theme-toggle` inside it, `router.ts`, a generic path router that names no route, and
`routes.ts`, which spreads the features' route lists into the one `ROUTES` table. `http/` is the request
plumbing: `http.ts` holds the `get`/`post`/`patch`/`remove` helpers over `fetch`, and `errors.ts`
holds `ApiError` and `errorMessage`, kept apart so a component can catch an error without being
able to make a request. `ui/` is what any component may use: `base.ts` with `GzElement` (open
shadow root, `data-action` click/submit delegation, `template()`/`render()`) and `define()`;
`view.ts` with `GzView`, the abstract base of the five route views, which loads on connect
through its `load()` hook and renders `loadingText`, then `readyTemplate()` or `errorTemplate()`
(the message, and `backLink` below it when a view sets one),
and whose `numericAttribute()` reads the id attribute a route sets, throwing when it is missing;
`html.ts` with the escaping `html` tagged template and `raw()`; `styles.ts`, `theme.ts` and `format.ts`; the document stylesheet
`app.css` and the utilities in `shared.css`; `toast.ts`, whose `toast()` and `toastError()` show Oat's toasts
through `ot.toast()`; `tile/gz-tile`, the stat tile several views use; and `pagination/`, the paged lists' page
arithmetic in `pagination.ts` beside `gz-pagination`, their pager.

A component is a pair of files side by side, `gz-<name>.component.ts` and `gz-<name>.component.css`, in whichever
directory owns it. A component module ends with `await define('<tag>', TheClass, import.meta.url)`,
and `styles.ts` swaps the module URL's `.ts` for `.css` to find the stylesheet, fetches it once
into a `CSSStyleSheet`, and every instance adopts it by reference — there is no manifest, and a tag
name implies no path. A test in `static.routes.test.ts` requests the `.css` beside every
`gz-*.component.ts`, so a component without its stylesheet fails the suite rather than painting unstyled.
**That top-level `await` is load-bearing**: it makes "module loaded" also mean "stylesheet loaded",
which is what lets a route's `view()` lazily `import()` its view and still have it paint styled on
the first frame.

Everything else is a feature, shaped like its backend counterpart and named the same:
`exercises`, `workouts` and `stats`, which owns the dashboard. `features/workouts/` keeps its
route views, `gz-workout-list` and `gz-workout-detail`, at its root beside `workouts.facade.ts`,
the feature's front door, and keeps what only it uses in `internal/`: one API class per URL prefix
— `workout.api.ts` owns every `/api/workouts/**` URL, `set.api.ts` every `/api/sets/**` one — and
the `gz-set-row` and `gz-add-set-form` child components. The facade module holds thin classes named after entities,
`WorkoutFacade` and `SetFacade`, whose methods delegate one line each and use the backend's verbs
(`SetFacade.create(workoutId, dto)` posts to `/api/workouts/:id/sets` through `WorkoutApi`). It
exports ready instances, `workoutFacade` and `setFacade`, rather than having a composition root:
custom elements cannot take constructor arguments, there is nothing to inject, and a root that
built every facade would statically pull every feature's API module into every view. A component
reads data only through a facade; composition across facades stays in the component, as it stays
in the backend controller. That holds across features too: `gz-workout-detail` loads a workout
through `workoutFacade` and the exercises for its rows' and `gz-add-set-form`'s selects through
`exerciseFacade` from `features/exercises/` — `list()` without a `limit`, the unpaged list, so a
select offers every exercise — never through anything in `exercises/internal/`, and
`gz-add-set-form` creates a new exercise through `exerciseFacade` too; `gz-dashboard` takes its
summary from `statsFacade` and its recent workouts from `workoutFacade`.

`gz-set-row` leads with a done toggle, an `.icon.small` button that is `.outline` while the set is
not done and Oat's default fill once it is, with `aria-pressed` to match. A click PATCHes
`{ done }` through `setFacade` and emits `sets-changed`, like every other change to a row, so the
view reloads rather than patching the row. A done row mirrors the backend's lock: it leaves out
Edit and ×, keeps +1, and mutes its exercise and load. `gz-workout-detail` adds an "x/y done"
badge to its totals once the session has sets, and swaps it for a success "✓ Done" badge when the
workout is done; `gz-workout-list` shows that "✓ Done" badge on done workouts' cards only.

A feature's routes live in `<f>.routes.ts` beside its facade, the way the backend keeps one
`*.routes.ts` per feature and spreads them in `src/backend/http/routes.ts`. Each route is a regex
`pattern`, the `keys` naming its capture groups, and a `view(params)` that `import()`s the view
module and returns `new GzXComponent()`, setting any id attribute before handing it back. `gz-app` matches
the current path against `ROUTES` and awaits the matching route's `view()` without knowing which
route it is; when nothing matches it shows its own not-found message. A route may also carry
`nav: { path, label }`, and `gz-header` builds the header from those, in the order `app/routes.ts`
spreads the features — so adding a list page needs no edit in `app/` beyond a new feature's spread.
`gz-app` renders `gz-header` above its `<main>`; the header's host is the sticky element, because a
`<header>` inside its shadow root would be only as tall as its host and could never stick.
The header is a flex `<nav>`: the brand on the left, then the page links in `--muted-foreground`,
with `aria-current="page"` and `--foreground` on the current page, then a thin divider and the
theme toggle. Below 560 px the links render a second time inside Oat's `<ot-dropdown>` — a
`.ghost.icon` hamburger with `popovertarget` and a `<menu popover>` of `role="menuitem"` links —
and CSS shows one list at a time rather than a resize listener choosing. `ot-dropdown` works
inside the header's shadow root because it uses no shadow DOM of its own, queries only its own
children, and a `popovertarget` ID resolves within its tree; it positions the menu, closes it on
Esc or an outside click, and moves between items with the arrow keys. `gz-header` subscribes to
`onRouteChange` itself, and on every route change its `nav a[data-path]` loop marks the current
page in both lists and closes the menu if it is open. A route file only
`import type`s `RouteDef` from `app/router.ts`, so it loads up front at almost no cost and reaches
its views only through `import()`.

Links are plain `<a href="/…">`. `gz-app` listens for clicks on its host, finds the anchor through
`composedPath()` because the views' and the header's shadow roots retarget the event, and routes it through
`navigate()` when `router.ts`'s `linkPath` says it is a plain same-origin click on an
extension-less, non-`/api` path without query or fragment; anything else — a modifier click, a
`target`, `download` — is left to the browser. `navigate()` pushes a history entry (none when
already on that path and query) and dispatches `popstate`, so links, `navigate()` and Back/Forward
all reach `gz-app` and `gz-header` through `onRouteChange`. A route path must therefore stay
extension-less and must not name a file under `src/frontend/`.

The workouts and exercises lists each show one page of `PAGE_SIZE` (10) items at a time, and the page lives in the URL
as `?page=N`, with page 1 as the bare path, so Back from a detail view, a reload and Back/Forward
all land on the same page. Because `linkPath` leaves a link with a query to the browser, which would
be a full page load, the `gz-pagination` component renders Oat's pagination `menu.buttons` group
out of buttons. It cannot call `navigate()` because `ui/` may not import `app/`: a click emits a
composed `page-change` event carrying the page number, and the list turns it into its own URL and
calls `navigate()`; `gz-app` rebuilds the view on the route change, so a list reads
`location.search` only when it connects. `ui/pagination/pagination.ts` holds the pieces, none of which touch
the DOM: `parsePage` reads `?page=` (anything but a positive integer is page 1), `pageCount`,
`pageOffset`, `pagePath` and `pageItems` (the first page, the last and the current one ±1, with a
gap for a hole of two or more), which the component renders. `pageOffset` caps the offset at
`MAX_OFFSET`, the largest the API accepts, so even `?page=99999999` is a valid request whose `total`
fills the header, and `pageCount` stops at the last page that cap can reach. A page past
`pageCount`, given as `gz-pagination`'s `page` and `pages` attributes, shows "No <noun> on this
page." with a Go to page 1 button in place of the pager, and the list leaves out its cards. Adding an exercise navigates to the page that now holds it, found through
`exerciseFacade.position()`; should that request fail after the exercise was created, the list
reloads the page it is on instead.

A list item opens its entity the same way, and on the whole card rather than on the words: the
card is `shared.css`'s `article.open-card`, and its hit area is the anchor's own `::after` stretched
across the card. Because the overlay is part of the anchor, it is still a link — `gz-app` routes it,
Ctrl- and middle-click open a tab, and the keyboard reaches it — where a click handler on the card
would be none of those things. A button on a card sits in `.actions`, which is positioned so it
paints above the overlay and takes its own click; a click there carries no anchor in its composed
path, so `gz-app` leaves it alone.

`bun run lint` holds five import boundaries in `.oxlintrc.json`. A module under `features/<a>/` may
not import `features/<b>/internal/`. Nothing under `app/`, `ui/`, `http/` or `main.ts` may import
any `internal/`. No component may import an `*.api.ts` module or `http/http.ts`. Nothing
under `ui/` or `http/` may import `features/` or `app/`, because they are the foundation the rest is
built on. And a feature's `*.routes.ts` may not import `internal/`, an `*.api.ts`, a `*.facade.ts`,
`http/` or `ui/`, because it loads on every page. oxlint applies only the last matching override's
`no-restricted-imports` options rather than merging them, so an override for components or route
files repeats the patterns of its directory's override. The rule also checks `import()` calls,
which is why it cannot forbid a route file's static import of a `gz-*.component.ts` view without forbidding
the lazy one too.

Only the route views reached through the features' `*.routes.ts` are dynamically imported. **A component
a view renders inside itself — a feature's `internal/` child, or a `ui/` widget — must stay a
static import in that view's module** — otherwise property assignments land on an un-upgraded
element and permanently shadow the class accessors, leaving it blank with no error.

All interpolation goes through the `html` template, which escapes, so notes and exercise names are
safe to display; use `raw()` only for markup another `html` call produced.

The shapes the API returns are declared once in `src/shared/dto/`, the single declaration of the
wire format, one file per feature and no barrel, and both halves of the app import the file that
declares a shape with a type-only import — the frontend as `'../../../shared/dto/workout.ts'` from
a feature view, `'../../../../shared/dto/workout.ts'` from an API class. The transpiler strips such an import whole, so the module is never fetched at runtime, and that is
load-bearing: `src/shared/` sits **outside the web root**, so a surviving specifier would be a 404.
Everything under `src/shared/` must therefore stay free of runtime code — `flavors.ts` as much as
the DTOs.

What the frontend is pinned to is still the wire format rather than the server's row types: the
backend translates its rows into these DTOs in each feature's translator and the wire is camelCase
where the database is snake_case, so a renamed column cannot arrive here as a silent refactor. It
just no longer costs a hand-written second copy to say so.

That wire format also names its ids and dates: `WorkoutId`, `ExerciseId`, `LiftSetId`,
`Iso8601Date` and `Iso8601DateTime`, declared in `src/shared/flavors.ts` and used by the frontend's
own signatures too — the parameters of the `*.api.ts` classes and the facades, `ui/format.ts`'s
date helpers, and the id-shaped state in
`gz-exercise-list` and `gz-add-set-form` (its `workoutId`). So the API client cannot be handed
the wrong entity's id, and a `createdAt` cannot reach a formatter that expects a `YYYY-MM-DD` day.
A plain `number` still assigns into a flavor, which is why `Number(element.dataset.id)` needs no
cast on the way in.

Shapes local to one module — a view's loaded data, the chart's points — are declared in that
module; what a view is doing with that data is `GzView`'s `ViewState<Data>`. The five route views are exported so their route file can construct them with `new`, which
keeps each tag name written only in its `define()`. `GzChartComponent`, `GzProgressChartComponent`, `GzSessionTableComponent`, `GzSetRowComponent`
and `GzAddSetFormComponent` are exported so their parent can type the element it drives; the other five components stay private to their module.

## Loading

The frontend is TypeScript on disk and JavaScript on the wire. `src/backend/features/static` runs
each module through `Bun.Transpiler` as it is requested — around 76 µs per file, the whole
frontend in under two milliseconds — and hands the result back as `text/javascript`. Nothing is
written to disk and nothing is bundled: specifiers are left untouched, so a module imports
`'../../ui/format.ts'` and the browser fetches the file of that name, and editing a module and reloading
is the whole edit loop. A deployed build (`bun run build`) serves these same modules from memory
instead — transpiled once at build time with whitespace minified, still one module per URL — and a
module that does not parse fails the build rather than answering 500. `src/frontend/` is the web
root, so a module's URL is its path below it: `src/frontend/app/gz-app.component.ts` is served at
`/app/gz-app.component.ts`.

The transpiler **erases types without checking them**, and throws only when a file will not parse.
A type error transpiles happily and ships; `bun run typecheck` is the only gate that catches it. A
file that does not parse comes back as a 500 naming it, which the toast then reports.

A route's script and stylesheet arrive the first time that route is opened, and never otherwise.
Opening the dashboard fetches five component scripts and five stylesheets; the chart is downloaded
only once you open an exercise. Two pieces make that safe: `define()` awaits the component's
stylesheet before registering the element, and a top-level `await` blocks the modules that import
it — so the `await import('./gz-exercise-detail.component.ts')` in the exercise route's `view()` resolves
only when that view _and_ everything it renders have their scripts and their CSS. A lazily loaded
page is fully styled on its first paint; there is no flash of unstyled content to guard against.

Only the shell (`gz-app`, `gz-header`, `gz-theme-toggle`) with `ui/view.ts`, `http/errors.ts` and
`ui/toast.ts`, which `gz-app` imports, `app/routes.ts` with the three feature route files, and Oat
plus `ui/shared.css` load up front. `gz-app` guards against two
navigations resolving out of order and reports a failed import through the toast.

Styled is not the same as ready, though: a view fetches its data once connected, and until then
it renders a "Loading…" line. Swapped in straight away, every page switch would collapse the page
to that line for a frame or two and expand it again. So `gz-app` keeps the outgoing view on screen
until the incoming one is ready. It connects the new view `hidden` beside the old one, awaits its
`ready` promise, then removes the old view, reveals the new one and scrolls to the top. `ready`
lives on `GzView` and starts out settled; a view replaces it with its first `reload()` on connect,
which catches its own errors so the promise never rejects. `gz-app` waits only for a `GzView`;
anything else, such as its not-found line, is swapped in straight away. The wait is capped at
300 ms (`SLOW_VIEW_MS`), after which a slow API shows the view's loading state rather than a
navigation that seems to do nothing. Two details hold this together. `shared.css` sets
`:host([hidden]) { display: none }`, because its own `:host { display: block }` outranks the
browser's `[hidden]` rule. And the swap removes the other children rather than calling
`replaceChildren(view)`, because moving an already connected view reconnects it and it would fetch
a second time.

## Hot reload

`bun run start:dev` sets `GAINZ_DEV=1`, and the server then injects `dev/hot.ts` into the index page
and opens `/dev/ws`, over which it pushes one message per file saved under `src/frontend/` (the
backend half is described in `docs/backend.md`). `bun start` does neither, and neither does a built
`dist/gainz.js`, whatever `GAINZ_DEV` says.

Saving a `.css` restyles the page in place, with no reload and no lost form state or scroll
position. That costs nothing because every component adopts its `CSSStyleSheet` objects by
reference: `reloadSheet` in `ui/styles.ts` refetches into the **same** object, and every live
instance picks the change up without re-rendering. A stylesheet in the document rather than a
shadow root — `ui/app.css`, and Oat's `oat.css` `<link>` — is swapped for a fresh `<link>`, the old one
removed only once the new one has loaded. A stylesheet the page has never fetched reloads the page.

Saving a `.ts` or `index.html` reloads the page, because a module cannot be evaluated a second time:
`customElements.define` throws on a tag it already knows, and `define()` returns early for one, so a
re-run module would quietly keep the old class. Before reloading, `hot.ts` sends a `HEAD` for the
module; a file that will not parse answers 500, and rather than reload into a blank page the client
reports it through the toast and waits for the next save.

**`styles.ts` keys its sheets by pathname.** `loadStyles` receives a module's absolute
`import.meta.url`, but `BASE_HREFS` are pathnames and the server reports a change as a pathname, so
the key is normalized to `/ui/tile/gz-tile.component.css`. Revert that and every component stylesheet
silently misses the lookup and falls back to a full reload, while `shared.css` keeps swapping and
hides the regression.

Bun's own HMR is not used. It exists only behind its bundler, which would rewrite the page's scripts
and stylesheets to hashed bundle URLs and break the module-URL-is-its-path property `styles.ts`
finds a component's stylesheet by. With no `import.meta.hot.accept()` handlers it would full-reload
anyway.

## Theming

`src/frontend/ui/theme.ts` holds the preference and sets it as `data-theme` on `<html>` alone.
`ui/app.css` turns that attribute into `color-scheme: light` or `color-scheme: dark`. Oat colors
every token with `light-dark()` under `:root { color-scheme: light dark }`, and `color-scheme` is
an inherited property, so the choice reaches every shadow root with no per-host mirroring. With no
attribute set, Oat's `light dark` follows the system.
The control is `gz-theme-toggle`, an icon-only `<button>` in the header that calls `toggleTheme()`.
It holds a sun and a moon SVG and shows the sun in light mode and the moon in dark mode, and its
`aria-label` flips between "Turn on dark mode" and "Turn off dark mode". A theme change toggles the
icons' `hidden` attributes and the label in place, without re-rendering the button and dropping its
focus.

A visitor who has never touched the theme toggle is seeded from `prefers-color-scheme` once, at load.
The first flip stores an explicit choice that wins from then on, so the page does not follow the
operating system around afterwards.

Oat is served from `node_modules` at `/vendor/oat.css` and `/vendor/oat.js` through an explicit
allowlist in `src/backend/features/static` — installing a package never publishes anything the app
did not ask to serve. A single-file build carries both files inside it and serves them at the same
URLs.

## Tests

The frontend's tests run under `bun test` with the backend's, in the same process. Most need no DOM
and run without one: the `html` template's escaping, `format.ts`, the router, the paging
arithmetic, the theme preference, the HTTP client and the URL each facade method requests. That is
why `html.ts` is its own module rather than part of `base.ts`: importing `base.ts` evaluates `class
extends HTMLElement` and, through `styles.ts`, a top-level `fetch` of the stylesheets.

A component test calls `useDom()` from `src/frontend/testing.ts`, which installs a
[happy-dom](https://github.com/capricorn86/happy-dom) window's globals for that file and puts
Bun's back after its last test. It is per file rather than a `bunfig.toml` preload because the
backend's route tests make real requests and need Bun's own `fetch`, `Response` and `URL`, all of
which the window replaces. There is one window for the whole process, created by the first file that
asks: bun caches a component module across files, so the class it registered keeps extending that
window's `HTMLElement` and stays in that window's `customElements`, and a fresh window would leave
later files with neither. Between tests `useDom()` empties `document.body` and `localStorage`.

Because a static import runs before any hook, a component test `await import()`s the component in
`beforeAll`, after `useDom()`, and then creates it by tag name and reads its open `shadowRoot`.
Under `useDom()`, `fetch` answers a `.css` URL with an empty `200`, so stylesheets load silently,
and rejects anything else with an error naming the method and URL; a test that needs an API
answer puts `useFetch()` on top. A test sets a component's attributes before appending it, because
happy-dom does not call `attributeChangedCallback` for attributes already present at upgrade.
happy-dom has no popovers, so `gz-header`'s dropdown is not tested, and with every sheet empty no
test asserts styling. `gz-app`'s tests use only paths no route matches, so no feature view or API
is loaded, and its hidden/`ready` view swap is not covered yet.

`src/frontend/testing.ts` also holds the three stubs. `useFetch()` replaces `fetch` with one that
records each request and answers `200 {}` unless told otherwise: `respondWith()` sets the answer
for every request, and `respondTo('GET /api/exercises', …)` one for a single method and URL, which
a view that loads from two URLs needs. `useToasts()`, called after `useDom()`, replaces Oat's
`window.ot` and returns the messages `toast()` and `toastError()` showed. `useGlobals()` installs whatever
browser global a test needs and puts back what was there after every test — which matters because
bun test runs every file in one process, and the backend's route tests make real requests. A module
that reads the browser when it loads, as `theme.ts` reads the stored choice, is imported with a
query string (`./theme.ts?3`) so each test gets a fresh instance evaluated against its own stubs.
A component test that imports the plain `ui/theme.ts` instead shares its state with the component,
so it resets the theme before each test.

Beside the stubs, `testing.ts` holds the DOM helpers every component test shares. `mount(tag,
attributes)` creates an element and sets its attributes before appending it to the body, for the
happy-dom reason above. `shadow()` and `find()` fail the test with a message naming the host or the
selector instead of returning null, so a test reads `find(shadow(view), 'h1')` without a guard.
`type()`, `choose()` and `submit()` dispatch the bubbling `input`, `change` and cancelable `submit`
events a user's input would. `settle()` waits long enough for a view's faked requests, all answered
at once, to land and render. `collect('page-change')` returns the details of each composed custom
event heard on the body, outside every shadow root, and `useFetch()`'s `sent('POST /api/…')` reads
back the bodies of the requests made under the same `'<METHOD> <url>'` name `respondTo()` uses.

Domain test data lives in each feature's test-only `<feature>.fixtures.ts`, mirroring the backend's
fixtures: `exercise()` and `session()` in `features/exercises/`, `set()` in `features/workouts/`.
Each builds a DTO from fixed defaults and one object of overrides, so a call site names exactly the
values its assertions read. The single-file build leaves `*.fixtures.ts` out, as it does tests.

oxfmt formats the markup inside an `html` tagged template, so a test that compares exact output
keeps its template free of markup and interpolates the parts it needs instead.
