# Frontend (`src/frontend/`)

`base.ts` holds `GzElement` (open shadow root, `data-action` click/submit delegation,
`template()`/`render()`), the escaping `html` tagged template, and `define()`. `styles.ts`,
`theme.ts`, `router.ts` (hash router), `api.ts`, `format.ts` are the rest of the shared layer.

Each component is a directory `src/frontend/components/<tag>/` holding `<tag>.ts` and `<tag>.css`, found
by convention. A component module ends with `await define('<tag>', TheClass)` — there is no
manifest. **That top-level `await` is load-bearing**: it makes "module loaded" also mean
"stylesheet loaded", which is what lets `gz-app` lazily `import()` a route view and still paint it
styled on the first frame.

Only the five route views listed in `VIEWS` in `gz-app.ts` are dynamically imported. **A component
a view renders inside itself must stay a static import in that view's module** — otherwise
property assignments land on an un-upgraded element and permanently shadow the class accessors,
leaving it blank with no error.

All interpolation goes through the `html` template, which escapes; use `raw()` only for markup
another `html` call produced.

The frontend is TypeScript, served as JavaScript. `src/backend/transpile.ts` runs each module
through `Bun.Transpiler` on request; specifiers are left untouched, so a module imports
`'./format.ts'` and the browser fetches the file of that name. Types are **erased, not checked** — `bun run typecheck`
is the only gate, and a type error will transpile and ship.

The shapes the API returns are declared in `types.ts` and pulled in with
`import type { … } from '../../types.ts'`, which the transpiler strips whole, so that module is
never fetched at runtime. They are written out **by hand** rather than imported from
`../src/backend/db/repo`, even though a type-only import would be erased too: the frontend is a client
of an HTTP API, so what it should be pinned to is the wire format it expects, not the server's
internal row types.
Sharing them would absorb a renamed column as a quiet refactor instead of surfacing it as the API
change it is — and `bun run typecheck` will not catch that drift for you.

Shapes local to one module — a view's `#state` union, the chart's points — are declared in that
module. `GzChart` and `GzSetRow` are exported so a view can type the element it drives; the
other nine components stay private to their module.
