# Frontend (`src/frontend/`)

`index.html` is the only page: it links Pico and `css/app.css`, applies a stored theme in a small
inline script before the first paint, and loads `main.ts` as a module. `main.ts` imports the
`gz-app` shell and redirects a hashless visit to `#/`, so the address bar always shows a real
route.

`base.ts` holds `GzElement` (open shadow root, `data-action` click/submit delegation,
`template()`/`render()`), the escaping `html` tagged template, and `define()`. `styles.ts`,
`theme.ts`, `router.ts` (hash router), `api.ts`, `format.ts` are the rest of the shared layer.

Each component is a directory `src/frontend/components/<tag>/` holding `<tag>.ts` and `<tag>.css`,
found by convention: `styles.ts` fetches the stylesheet once into a `CSSStyleSheet` that every
instance adopts by reference. A component module ends with `await define('<tag>', TheClass)` —
there is no manifest, and adding a component is creating the directory with both files. **That
top-level `await` is load-bearing**: it makes "module loaded" also mean "stylesheet loaded", which
is what lets `gz-app` lazily `import()` a route view and still paint it styled on the first frame.

Only the five route views listed in `VIEWS` in `gz-app.ts` are dynamically imported. **A component
a view renders inside itself must stay a static import in that view's module** — otherwise
property assignments land on an un-upgraded element and permanently shadow the class accessors,
leaving it blank with no error.

All interpolation goes through the `html` template, which escapes, so notes and exercise names are
safe to display; use `raw()` only for markup another `html` call produced.

The shapes the API returns are declared in `types.ts` and pulled in with a type-only import, which
the transpiler strips whole, so that module is never fetched at runtime. They are written out **by
hand** rather than imported from `../src/backend/db/repos`, even though a type-only import would be
erased too: the frontend is a client of an HTTP API, so what it should be pinned to is the wire
format it expects, not the server's internal row types. Sharing them would absorb a renamed column
as a quiet refactor instead of surfacing it as the API change it is — and `bun run typecheck` will
not catch that drift for you.

Shapes local to one module — a view's `#state` union, the chart's points — are declared in that
module. `GzChart` and `GzSetRow` are exported so a view can type the element it drives; the
other nine components stay private to their module.

## Loading

The frontend is TypeScript on disk and JavaScript on the wire. `src/backend/transpile.ts` runs
each module through `Bun.Transpiler` as it is requested — around 76 µs per file, the whole
frontend in under two milliseconds — and hands the result back as `text/javascript`. Nothing is
written to disk and nothing is bundled: specifiers are left untouched, so a module imports
`'./format.ts'` and the browser fetches the file of that name, and editing a module and reloading
is the whole edit loop. `src/frontend/` is the web root, so a module's URL is its path below it:
`src/frontend/components/gz-app/gz-app.ts` is served at `/components/gz-app/gz-app.ts`.

The transpiler **erases types without checking them**, and throws only when a file will not parse.
A type error transpiles happily and ships; `bun run typecheck` is the only gate that catches it. A
file that does not parse comes back as a 500 naming it, which the toast then reports.

A route's script and stylesheet arrive the first time that route is opened, and never otherwise.
Opening the dashboard fetches five component scripts and five stylesheets; the chart is downloaded
only once you open an exercise. Two pieces make that safe: `define()` awaits the component's
stylesheet before registering the element, and a top-level `await` blocks the modules that import
it — so `await import('…/gz-exercise-detail.ts')` in `gz-app` resolves only when that view _and_
everything it renders have their scripts and their CSS. A lazily loaded page is fully styled on
its first paint; there is no flash to guard against.

Only the shell (`gz-app`, `gz-toast`, `gz-theme-toggle`) and Pico plus `shared.css` load up front.
`gz-app` keeps the outgoing view on screen while the next one loads, guards against two
navigations resolving out of order, and reports a failed import through the toast.

## Theming

`src/frontend/theme.ts` holds the preference and mirrors it onto `<html>`; `base.ts` mirrors it
onto every component host too, because Pico can only reach a shadow root through `:host`. There
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
`src/backend/paths.ts` — installing a package never publishes anything the app did not ask to
serve. The build is the `pico.orange` theme; swapping themes is a one-line change to
`VENDOR_FILES`.
