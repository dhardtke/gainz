# Frontend (`src/frontend/`)

`index.html` is the only page: it links Pico and `ui/app.css`, applies a stored theme in a small
inline script before the first paint, and loads `main.ts` as a module. `main.ts` only imports the
`app/gz-app.component.ts` shell. Routes are real paths such as `/workouts/3`, and the server answers
each with `index.html` because it carries no extension.

```
src/frontend/
├── index.html  main.ts
├── dev/        hot.ts (development only)
├── app/        gz-app, gz-header, gz-theme-toggle, router.ts, routes.ts
├── http/       http.ts (get/post/patch/remove), errors.ts (ApiError, errorMessage)
├── ui/         base.ts, html.ts, styles.ts, theme.ts, format.ts, app.css, shared.css, gz-toast, gz-tile
└── features/
    ├── exercises/  exercises.routes.ts, exercises.facade.ts, gz-exercise-list, gz-exercise-detail
    │   └── internal/  exercise.api.ts, gz-chart
    ├── workouts/   workouts.routes.ts, workouts.facade.ts, gz-workout-list, gz-workout-detail
    │   └── internal/  workout.api.ts, set.api.ts, gz-set-row
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
`html.ts` with the escaping `html` tagged template and `raw()`; `styles.ts`, `theme.ts` and `format.ts`; the document stylesheet
`app.css` and the utilities in `shared.css`; and the two widgets several views use, `gz-toast` and
`gz-tile`.

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
the `gz-set-row` child component. The facade module holds thin classes named after entities,
`WorkoutFacade` and `SetFacade`, whose methods delegate one line each and use the backend's verbs
(`SetFacade.create(workoutId, dto)` posts to `/api/workouts/:id/sets` through `WorkoutApi`). It
exports ready instances, `workoutFacade` and `setFacade`, rather than having a composition root:
custom elements cannot take constructor arguments, there is nothing to inject, and a root that
built every facade would statically pull every feature's API module into every view. A component
reads data only through a facade; composition across facades stays in the component, as it stays
in the backend controller. That holds across features too: `gz-workout-detail` loads a workout
through `workoutFacade` and fills its exercise select through `exerciseFacade` from
`features/exercises/`, never through anything in `exercises/internal/`; `gz-dashboard` takes its
summary from `statsFacade` and its recent workouts from `workoutFacade`.

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
The header is a Pico `<nav>`: the brand on the left, then the page links as plain `secondary`
links, with `contrast` and `aria-current="page"` on the current page, then a thin divider and the
theme toggle. Both classes are Pico's own; the swap is there because Pico's nav hides the underline
its `aria-current` styling relies on, so the attribute alone barely shows. Below 560 px the links
render a second time inside a Pico `<details class="dropdown">` behind a hamburger, and CSS shows
one list at a time rather than a resize listener choosing. `gz-header` subscribes to `onRouteChange` itself, and
on every route change its `nav a[data-path]` loop highlights both lists and it closes the dropdown. Inside the dropdown Pico sets
the link colour itself, so there the current page shows through Pico's `aria-current` background. A route file only
`import type`s `RouteDef` from `app/router.ts`, so it loads up front at almost no cost and reaches
its views only through `import()`.

Links are plain `<a href="/…">`. `gz-app` listens for clicks on its host, finds the anchor through
`composedPath()` because the views' and the header's shadow roots retarget the event, and routes it through
`navigate()` when `router.ts`'s `linkPath` says it is a plain same-origin click on an
extension-less, non-`/api` path without query or fragment; anything else — a modifier click, a
`target`, `download` — is left to the browser. `navigate()` pushes a history entry (none when
already on that path) and dispatches `popstate`, so links, `navigate()` and Back/Forward all reach
`gz-app` and `gz-header` through `onRouteChange`. A route path must therefore stay extension-less
and must not name a file under `src/frontend/`.

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
`gz-workout-detail`, `gz-exercise-detail` and `gz-exercise-list`. So the API client cannot be handed
the wrong entity's id, and a `createdAt` cannot reach a formatter that expects a `YYYY-MM-DD` day.
A plain `number` still assigns into a flavor, which is why `Number(element.dataset.id)` needs no
cast on the way in.

Shapes local to one module — a view's `#state` union, the chart's points — are declared in that
module. The five route views are exported so their route file can construct them with `new`, which
keeps each tag name written only in its `define()`. `GzChartComponent` and `GzSetRowComponent` are exported so a
view can type the element it drives; the other five components stay private to their module.

## Loading

The frontend is TypeScript on disk and JavaScript on the wire. `src/backend/features/static` runs
each module through `Bun.Transpiler` as it is requested — around 76 µs per file, the whole
frontend in under two milliseconds — and hands the result back as `text/javascript`. Nothing is
written to disk and nothing is bundled: specifiers are left untouched, so a module imports
`'../../ui/format.ts'` and the browser fetches the file of that name, and editing a module and reloading
is the whole edit loop. `src/frontend/` is the web root, so a module's URL is its path below it:
`src/frontend/app/gz-app.component.ts` is served at `/app/gz-app.component.ts`.

The transpiler **erases types without checking them**, and throws only when a file will not parse.
A type error transpiles happily and ships; `bun run typecheck` is the only gate that catches it. A
file that does not parse comes back as a 500 naming it, which the toast then reports.

A route's script and stylesheet arrive the first time that route is opened, and never otherwise.
Opening the dashboard fetches five component scripts and five stylesheets; the chart is downloaded
only once you open an exercise. Two pieces make that safe: `define()` awaits the component's
stylesheet before registering the element, and a top-level `await` blocks the modules that import
it — so the `await import('./gz-exercise-detail.component.ts')` in the exercise route's `view()` resolves
only when that view _and_ everything it renders have their scripts and their CSS. A lazily loaded
page is fully styled on its first paint; there is no flash to guard against.

Only the shell (`gz-app`, `gz-header`, `gz-toast`, `gz-theme-toggle`), `app/routes.ts` with the three feature
route files, and Pico plus `ui/shared.css` load up front. `gz-app` keeps the outgoing view on screen while the next one loads, guards against two
navigations resolving out of order, and reports a failed import through the toast.

## Hot reload

`bun run start:dev` sets `GAINZ_DEV=1`, and the server then injects `dev/hot.ts` into the index page
and opens `/dev/ws`, over which it pushes one message per file saved under `src/frontend/` (the
backend half is described in `docs/backend.md`). `bun start` does neither.

Saving a `.css` restyles the page in place, with no reload and no lost form state or scroll
position. That costs nothing because every component adopts its `CSSStyleSheet` objects by
reference: `reloadSheet` in `ui/styles.ts` refetches into the **same** object, and every live
instance picks the change up without re-rendering. A stylesheet in the document rather than a
shadow root — `ui/app.css`, and Pico's `<link>` — is swapped for a fresh `<link>`, the old one
removed only once the new one has loaded. A stylesheet the page has never fetched reloads the page.

Saving a `.ts` or `index.html` reloads the page, because a module cannot be evaluated a second time:
`customElements.define` throws on a tag it already knows, and `define()` returns early for one, so a
re-run module would quietly keep the old class. Before reloading, `hot.ts` sends a `HEAD` for the
module; a file that will not parse answers 500, and rather than reload into a blank page the client
reports it through the toast and waits for the next save.

**`styles.ts` keys its sheets by pathname.** `loadStyles` receives a module's absolute
`import.meta.url`, but `BASE_HREFS` are pathnames and the server reports a change as a pathname, so
the key is normalised to `/ui/gz-tile.component.css`. Revert that and every component stylesheet
silently misses the lookup and falls back to a full reload, while `shared.css` keeps swapping and
hides the regression.

Bun's own HMR is not used. It exists only behind its bundler, which would rewrite the page's scripts
and stylesheets to hashed bundle URLs and break the module-URL-is-its-path property `styles.ts`
finds a component's stylesheet by. With no `import.meta.hot.accept()` handlers it would full-reload
anyway.

## Theming

`src/frontend/ui/theme.ts` holds the preference and mirrors it onto `<html>`; `ui/base.ts` mirrors
it onto every component host too, because Pico can only reach a shadow root through `:host`. There
are two states, and one Pico rule covers each:

| Host `data-theme` | Rule that matches                                                                                       | Result                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `light`           | `:host(:not([data-theme=dark]))`                                                                        | forced light                                    |
| `dark`            | none — Pico ships a bare `[data-theme=dark]`, which cannot match a host from inside its own shadow root | colours inherit from `<html data-theme="dark">` |

The second row works because custom properties inherit and Pico's base `:host,:root` block sets no
colours, only typography and spacing. Any component added later gets this for free from
`GzElement`.

The control is `gz-theme-toggle`, an icon-only `<button>` in the header that calls `toggleTheme()`.
It shows a sun in light mode and a moon in dark mode, and its `aria-label` flips between "Turn on
dark mode" and "Turn off dark mode". The template paints the current state, so a dark page loads as
a moon with nothing to animate; after that a theme change toggles the SVG's `moon` class and the
label in place, letting its stylesheet morph one icon into the other without re-rendering the button
and dropping its focus.

A visitor who has never touched the theme toggle is seeded from `prefers-color-scheme` once, at load.
The first flip stores an explicit choice that wins from then on, so the page does not follow the
operating system around afterwards.

Pico is served from `node_modules` at `/vendor/pico.css` through an explicit one-file allowlist in
`src/backend/features/static` — installing a package never publishes anything the app did not ask to
serve. The build is the pico default theme; swapping themes is a one-line change to
`VENDOR_FILES`.

## Tests

The frontend's tests run under `bun test` with the backend's, and there is no DOM there: no
`HTMLElement`, `document`, `window` or `localStorage`. So they cover what does not need one — the
`html` template's escaping, `format.ts`, the router, the theme preference, the HTTP client and the
URL each facade method requests — and nothing yet mounts a component. That is also why `html.ts`
is its own module rather than part of `base.ts`: importing `base.ts` evaluates `class extends
HTMLElement` and, through `styles.ts`, a top-level `fetch` of the stylesheets.

`src/frontend/testing.ts` holds the two stubs they use. `useFetch()` replaces `fetch` with one that
records each request and answers `200 {}` unless told otherwise. `useGlobals()` installs whatever
browser global a test needs and puts back what was there after every test — which matters because
bun test runs every file in one process, and the backend's route tests make real requests. A module
that reads the browser when it loads, as `theme.ts` reads the stored choice, is imported with a
query string (`./theme.ts?3`) so each test gets a fresh instance evaluated against its own stubs.

oxfmt formats the markup inside an `html` tagged template, so a test that compares exact output
keeps its template free of markup and interpolates the parts it needs instead.
