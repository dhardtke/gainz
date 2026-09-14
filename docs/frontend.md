# Frontend (`src/frontend/`)

`index.html` is the only page: it links Pico and `ui/app.css`, applies a stored theme in a small
inline script before the first paint, and loads `main.ts` as a module. `main.ts` imports the
`app/gz-app.ts` shell and redirects a hashless visit to `#/`, so the address bar always shows a
real route.

```
src/frontend/
├── index.html  main.ts
├── app/        gz-app, gz-theme-toggle, router.ts, routes.ts
├── http/       http.ts (get/post/patch/remove), errors.ts (ApiError, errorMessage)
├── ui/         base.ts, styles.ts, theme.ts, format.ts, app.css, shared.css, gz-toast, gz-stat-tile
└── features/
    ├── exercises/  exercises.routes.ts, exercises.facade.ts, gz-exercise-list, gz-exercise-detail
    │   └── internal/  exercise.api.ts, gz-chart
    ├── workouts/   workouts.routes.ts, workouts.facade.ts, gz-workout-list, gz-workout-detail
    │   └── internal/  workout.api.ts, set.api.ts, gz-set-row
    └── stats/      stats.routes.ts, stats.facade.ts, gz-dashboard
        └── internal/  stats.api.ts
```

What belongs to no feature sits in three directories. `app/` is the shell: `gz-app`, the
`gz-theme-toggle` in its header, `router.ts`, a generic hash matcher that names no route, and
`routes.ts`, which spreads the features' route lists into the one `ROUTES` table. `http/` is the request
plumbing: `http.ts` holds the `get`/`post`/`patch`/`remove` helpers over `fetch`, and `errors.ts`
holds `ApiError` and `errorMessage`, kept apart so a component can catch an error without being
able to make a request. `ui/` is what any component may use: `base.ts` with `GzElement` (open
shadow root, `data-action` click/submit delegation, `template()`/`render()`), the escaping `html`
tagged template and `define()`; `styles.ts`, `theme.ts` and `format.ts`; the document stylesheet
`app.css` and the utilities in `shared.css`; and the two widgets several views use, `gz-toast` and
`gz-stat-tile`.

A component is a pair of files side by side, `gz-<name>.ts` and `gz-<name>.css`, in whichever
directory owns it. A component module ends with `await define('<tag>', TheClass, import.meta.url)`,
and `styles.ts` swaps the module URL's `.ts` for `.css` to find the stylesheet, fetches it once
into a `CSSStyleSheet`, and every instance adopts it by reference — there is no manifest, and a tag
name implies no path. A test in `static.routes.test.ts` requests the `.css` beside every
`gz-*.ts`, so a component without its stylesheet fails the suite rather than painting unstyled.
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
module and returns `new GzX()`, setting any id attribute before handing it back. `gz-app` matches
the current path against `ROUTES` and awaits the matching route's `view()` without knowing which
route it is; when nothing matches it shows its own not-found message. A route may also carry
`nav: { path, label }`, and `gz-app` builds its header from those, in the order `app/routes.ts`
spreads the features — so adding a list page needs no edit in `app/` beyond a new feature's spread. A route file only
`import type`s `RouteDef` from `app/router.ts`, so it loads up front at almost no cost and reaches
its views only through `import()`.

`bun run lint` holds five import boundaries in `.oxlintrc.json`. A module under `features/<a>/` may
not import `features/<b>/internal/`. Nothing under `app/`, `ui/`, `http/` or `main.ts` may import
any `internal/`. No `gz-*.ts` component may import an `*.api.ts` module or `http/http.ts`. Nothing
under `ui/` or `http/` may import `features/` or `app/`, because they are the foundation the rest is
built on. And a feature's `*.routes.ts` may not import `internal/`, an `*.api.ts`, a `*.facade.ts`,
`http/` or `ui/`, because it loads on every page. oxlint applies only the last matching override's
`no-restricted-imports` options rather than merging them, so an override for components or route
files repeats the patterns of its directory's override. The rule also checks `import()` calls,
which is why it cannot forbid a route file's static import of a `gz-*.ts` view without forbidding
the lazy one too.

Only the route views reached through the features' `*.routes.ts` are dynamically imported. **A component
a view renders inside itself — a feature's `internal/` child, or a `ui/` widget — must stay a
static import in that view's module** — otherwise property assignments land on an un-upgraded
element and permanently shadow the class accessors, leaving it blank with no error.

All interpolation goes through the `html` template, which escapes, so notes and exercise names are
safe to display; use `raw()` only for markup another `html` call produced.

The shapes the API returns are declared once in `src/shared/dto/`, the single declaration of the
wire format, and both halves of the app import it with a type-only import — the frontend as
`'../../../shared/dto/index.ts'` from a feature view, `'../../../../shared/dto/index.ts'` from an
API class. The
transpiler strips such an import whole, so the module is never fetched at runtime, and that is
load-bearing: `src/shared/` sits **outside the web root**, so a surviving specifier would be a 404.
Everything under `src/shared/` must therefore stay free of runtime code — `flavors.ts` as much as
the DTOs — which `src/shared/shared.test.ts` holds in place by walking the directory recursively
and asserting every file there transpiles to nothing.

What the frontend is pinned to is still the wire format rather than the server's row types: the
backend translates its rows into these DTOs in each feature's `ports/` and the wire is camelCase
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
keeps each tag name written only in its `define()`. `GzChart` and `GzSetRow` are exported so a
view can type the element it drives; the other four components stay private to their module.

## Loading

The frontend is TypeScript on disk and JavaScript on the wire. `src/backend/features/static` runs
each module through `Bun.Transpiler` as it is requested — around 76 µs per file, the whole
frontend in under two milliseconds — and hands the result back as `text/javascript`. Nothing is
written to disk and nothing is bundled: specifiers are left untouched, so a module imports
`'../../ui/format.ts'` and the browser fetches the file of that name, and editing a module and reloading
is the whole edit loop. `src/frontend/` is the web root, so a module's URL is its path below it:
`src/frontend/app/gz-app.ts` is served at `/app/gz-app.ts`.

The transpiler **erases types without checking them**, and throws only when a file will not parse.
A type error transpiles happily and ships; `bun run typecheck` is the only gate that catches it. A
file that does not parse comes back as a 500 naming it, which the toast then reports.

A route's script and stylesheet arrive the first time that route is opened, and never otherwise.
Opening the dashboard fetches five component scripts and five stylesheets; the chart is downloaded
only once you open an exercise. Two pieces make that safe: `define()` awaits the component's
stylesheet before registering the element, and a top-level `await` blocks the modules that import
it — so the `await import('./gz-exercise-detail.ts')` in the exercise route's `view()` resolves
only when that view _and_ everything it renders have their scripts and their CSS. A lazily loaded
page is fully styled on its first paint; there is no flash to guard against.

Only the shell (`gz-app`, `gz-toast`, `gz-theme-toggle`), `app/routes.ts` with the three feature
route files, and Pico plus `ui/shared.css` load up front. `gz-app` keeps the outgoing view on screen while the next one loads, guards against two
navigations resolving out of order, and reports a failed import through the toast.

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

A visitor who has never touched the switch is seeded from `prefers-color-scheme` once, at load.
The first flip stores an explicit choice that wins from then on, so the page does not follow the
operating system around afterwards.

Pico is served from `node_modules` at `/vendor/pico.css` through an explicit one-file allowlist in
`src/backend/features/static` — installing a package never publishes anything the app did not ask to
serve. The build is the `pico.orange` theme; swapping themes is a one-line change to
`VENDOR_FILES`.
