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
