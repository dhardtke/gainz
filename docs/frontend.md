### Frontend (`public/`)

`js/base.js` holds `GzElement` (open shadow root, `data-action` click/submit delegation,
`template()`/`render()`), the escaping `html` tagged template, and `define()`. `js/styles.js`,
`theme.js`, `router.js` (hash router), `api.js`, `format.js` are the rest of the shared layer.

Each component is a directory `public/components/<tag>/` holding `<tag>.js` and `<tag>.css`, found
by convention. A component module ends with `await define("<tag>", TheClass)` — there is no
manifest. **That top-level `await` is load-bearing**: it makes "module loaded" also mean
"stylesheet loaded", which is what lets `gz-app` lazily `import()` a route view and still paint it
styled on the first frame.

Only the five route views listed in `VIEWS` in `gz-app.js` are dynamically imported. **A component
a view renders inside itself must stay a static import in that view's module** — otherwise
property assignments land on an un-upgraded element and permanently shadow the class accessors,
leaving it blank with no error.

All interpolation goes through the `html` template, which escapes; use `raw()` only for markup
another `html` call produced.

The frontend is typed in JSDoc and checked by `bun run typecheck` — `tsconfig.json` turns on
`checkJs` and includes `public`. The shapes the API returns are declared in `js/types.js` and
pulled into a module with `/** @import { … } from "../../js/types.js" */`; they mirror the
interfaces in `src/repo.ts` **by hand**, because `public/` is served to the browser as-is and
never reaches into the server's source — so a column renamed there has to be renamed here too.
Shapes local to one module — a view's `#state` union, the chart's points — are declared in that
module. `GzChart` and `GzSetRow` are exported so a view can type the element it drives; the
other nine components stay private to their module.
