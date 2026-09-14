---
date: 2026-09-14T20:07:58.636695+00:00
git_commit: 275e356361e1dbb0cace56e944bba780d97b5518
branch: main
topic: 'Per-feature route modules'
tags: [plan, frontend, router, gz-app, features, oxlint]
status: complete
---

# PLAN: Per-feature route modules

A route's URL pattern, its view's lazy import, the way that view is built and its header link are
today spelled out across four central lists in `app/`: the `ViewName` union and `ROUTES` in
`router.ts`, and `VIEWS`, the `#viewElement` switch and `NAV` in `gz-app.ts`. Adding a view means
editing all of them, and the view's tag name is written a second time outside its own module.

This plan moves each route into the feature that owns it, as `features/<f>/<f>.routes.ts`, the way
the backend already keeps one `*.routes.ts` per feature and spreads them in
`src/backend/http/routes.ts`. What stays central is `app/routes.ts`: one spread per feature.

A fully list-free registry is not possible without giving up lazy loading: a view cannot announce
its route before its module is fetched, and the browser has no `import.meta.glob`. The per-feature
route file is small, loaded up front, and reaches its views only through `import()`.

## Acceptance Criteria

- Each feature owns `features/<f>/<f>.routes.ts` listing its routes: pattern, param keys, a lazy
  `view(params)` that imports and constructs its view, and an optional header `nav` entry.
- `app/router.ts` names no route: it exports `RouteDef`, `matchRoute(routes, path)`,
  `currentPath()`, `navigate`, `onRouteChange` and `isActive`. `ViewName`, `RouteName`, `Route`,
  `ROUTES` and `currentRoute` are gone.
- `app/routes.ts` is the only central list: one spread per feature, whose order is the header order.
- `gz-app` has no `VIEWS`, no `#viewElement` switch, no `NAV` and no view tag names. It builds the
  header from `ROUTES` entries with `nav`, and shows the not-found message when nothing matches.
- The five route view classes are exported and built with `new`, so each tag is written only in
  its `define()`.
- Lazy loading, styled first paint, keeping the outgoing view while the next loads, the
  stale-navigation token and toasting a failed import behave exactly as before.
- `src/frontend/app/routes.test.ts` tests the real table under `bun test`.
- Lint forbids a feature route file from importing `internal/`, `*.api.ts`, `*.facade.ts`, `http/`
  or `ui/`.
- `docs/frontend.md` describes the route files, the new `app/` contents and five import boundaries.

## Technical Key Decisions and Tradeoffs

1. **Route entry shape:** `{ pattern, keys, view: (params) => Promise<Element>, nav? }`.
   - Why: import and construction always belong together, and the specifier stays a literal.
   - Impact: `gz-app` awaits `route.view(params)` without knowing which route it is.
2. **Construction by class:** the view classes are exported; `view` does `new GzX()` after its
   `import()`.
   - Why: the tag lives only in `define()`, and a wrong export name is a type error. `new` is safe
     because the module's top-level `await define(...)` has registered the element by the time
     `import()` resolves.
   - Impact: `export` on five classes. The detail views keep `observedAttributes` and receive their
     id through `setAttribute` before being connected, exactly as today.
3. **Generic router plus `app/routes.ts`:** `router.ts` holds the type and a pure matcher;
   `app/routes.ts` spreads the feature lists.
   - Why: mirrors `src/backend/http/routes.ts`, and the table is importable without a DOM — a
     test cannot import `gz-app.ts`, whose evaluation calls `define()` and extends `HTMLElement`.
   - Impact: feature route files `import type { RouteDef }` from `app/router.ts`; the import is
     erased, so there is no runtime cycle with the views that import `navigate`.
4. **Header nav from routes:** optional `nav: { path, label }`, ordered by `ROUTES`.
   - Why: a list page is added without touching `app/`; the order is the one spread line.
   - Impact: `NAV` is deleted. `nav.path` is explicit, because a regex cannot be turned back into
     an href.
5. **Lint boundary for route files:** a new oxlint override for
   `src/frontend/features/**/*.routes.ts`.
   - Why: a static import in a route file is fetched on every page load.
   - Impact: the override repeats the `features/**` pattern, since oxlint applies only the last
     matching override's `no-restricted-imports`.
6. **Naming:** `stats.routes.ts`, `workouts.routes.ts`, `exercises.routes.ts`, exporting
   `statsRoutes`, `workoutsRoutes`, `exercisesRoutes` — plural, like the facades.
7. **Out of scope:** replacing regex + `keys` with path templates such as `/workouts/:id`.

## Current State

```
main.ts ──► app/gz-app.ts ───────────────────────► app/router.ts
             NAV (3 links)              :8-12        ViewName union            :6
             VIEWS: ViewName → import() :24-30       RouteName = ViewName|'notfound' :8
             #viewElement switch        :59-100      ROUTES: pattern → name, keys :18-24
               name → createElement('gz-…')          currentRoute() / isActive()
               + setAttribute('…-id')                navigate() / onRouteChange()
             #renderView / #swapView    :110-157            ▲
             template(): header from NAV :159-187           │ navigate()
                │                                           │
                └┄┄ import() ┄┄► features/<f>/gz-<view>.ts ─┘
                                 class GzX (not exported)
                                 await define('gz-…', GzX, import.meta.url)
```

- `gz-app.ts:59-100`: awaits `VIEWS[route.name]()`, then switches on `route.name` to create the
  element; `notfound` builds `<p class="empty">Nothing lives at …</p>`.
- `gz-workout-detail.ts:52-79` and `gz-exercise-detail.ts:50-76` read `workout-id` /
  `exercise-id` through `observedAttributes`, and their `#id` doc comments name `router.ts` as the
  place that matches the id as `(\d+)`.
- `.oxlintrc.json:176-239` holds the frontend overrides; `docs/frontend.md:60-66` lists four
  boundaries.
- There are no frontend tests yet.

## Desired End State

```
main.ts ──► app/gz-app.ts
             ├─ imports ROUTES from app/routes.ts
             ├─ template(): header links = ROUTES with nav, in ROUTES order
             └─ #swapView: matchRoute(ROUTES, currentPath())
                  ├─ match → await match.route.view(match.params)
                  └─ null  → <p class="empty">Nothing lives at …</p>

app/routes.ts   ROUTES = [...statsRoutes, ...workoutsRoutes, ...exercisesRoutes]
                   │              │                  │
                   ▼              ▼                  ▼
features/stats/     features/workouts/     features/exercises/
  stats.routes.ts     workouts.routes.ts     exercises.routes.ts
   /  → Dashboard      /workouts  → nav        /exercises → nav
                       /workouts/:id           /exercises/:id
        ┊                    ┊                        ┊   import() + new GzX()
        ▼                    ▼                        ▼
  gz-dashboard.ts   gz-workout-list.ts        gz-exercise-list.ts
                    gz-workout-detail.ts      gz-exercise-detail.ts
                    (export class …)          (export class …)

app/router.ts   RouteDef, RouteMatch, matchRoute(), currentPath(), isActive(),
                navigate(), onRouteChange() — no route names
```

A feature route file, for reference:

```ts
import type { RouteDef } from '../../app/router.ts';

export const workoutsRoutes: RouteDef[] = [
  {
    pattern: /^\/workouts\/?$/,
    keys: [],
    view: async () => {
      const { GzWorkoutList } = await import('./gz-workout-list.ts');
      return new GzWorkoutList();
    },
    nav: { path: '/workouts', label: 'Workouts' },
  },
  {
    pattern: /^\/workouts\/(\d+)\/?$/,
    keys: ['id'],
    view: async ({ id }) => {
      const { GzWorkoutDetail } = await import('./gz-workout-detail.ts');
      const view = new GzWorkoutDetail();
      view.setAttribute('workout-id', id ?? '');
      return view;
    },
  },
];
```

The header is unchanged on screen:

```
┌────────────────────────────────────────────────────────────────────────┐
│ gainz lifting log            [Dashboard] [Workouts] [Exercises] [◐]    │
└────────────────────────────────────────────────────────────────────────┘
```

## Abstractions and Code Reuse

- `src/frontend/app/`
  - `router.ts` — drop the route list; become a generic matcher.
    - `ViewName`, `RouteName`, `Route`, `ROUTES`, `currentRoute` — removed
    - `RouteDef` — new: `{ pattern: RegExp; keys: string[]; view: (params: Record<string, string>) => Promise<Element>; nav?: { path: string; label: string } }`
    - `RouteMatch` — new: `{ route: RouteDef; params: Record<string, string> }`
    - `matchRoute(routes, path)` — new, the loop from `currentRoute`, returning `RouteMatch | null`
    - `currentPath()` — new, the hash without `#`, defaulting to `/`
    - `isActive` — reads `currentPath()`
    - `navigate`, `onRouteChange` — unchanged
  - `routes.ts` — new: `ROUTES` spreading the three feature lists.
  - `routes.test.ts` — new: matching against the real table, and the nav order.
  - `gz-app.ts` — `VIEWS`, the switch and (phase 2) `NAV` removed; views and header come from
    `ROUTES`. `#renderView`/`#swapView` keep their token, toast and keep-outgoing-view behaviour.
- `src/frontend/features/`
  - `stats/stats.routes.ts` — new: `/` → `GzDashboard`
  - `workouts/workouts.routes.ts` — new: `/workouts`, `/workouts/:id`
  - `exercises/exercises.routes.ts` — new: `/exercises`, `/exercises/:id`
  - `stats/gz-dashboard.ts`, `workouts/gz-workout-list.ts`, `workouts/gz-workout-detail.ts`,
    `exercises/gz-exercise-list.ts`, `exercises/gz-exercise-detail.ts` — `export` the class; the two
    detail views' `#id` comments name their feature's route file instead of `router.ts`.
- `.oxlintrc.json` — new override for `src/frontend/features/**/*.routes.ts`.
- `docs/frontend.md` — route files, `app/` contents, five boundaries, loading, exported classes.

Unchanged and reused: `define()` and `GzElement` in `ui/base.ts`, `toastError`, the render token,
`isActive`'s `/` special case, `navigate`'s re-dispatch of `hashchange`.

## Logging & Observability

No change. A failed view import is still reported through `toastError` in `#swapView`.

## Implementation

### Phase 1: Feature route modules drive the views

Dependencies: None

Move route patterns, lazy imports and view construction into the features, make the router
generic, and point `gz-app` at `ROUTES`. `NAV` stays for now.

**Tasks**:

- [x] `src/frontend/app/router.ts`: remove `ViewName`, `RouteName`, `Route`, `ROUTES` and
      `currentRoute`; add `RouteDef` (without `nav` yet), `RouteMatch`, `matchRoute(routes, path)`
      and `currentPath()`; make `isActive` read `currentPath()`. Keep the file's header comment on
      hash routing.
      ```ts
      export function matchRoute(routes: readonly RouteDef[], path: string): RouteMatch | null {
        for (const route of routes) {
          const match = route.pattern.exec(path);
          if (!match) {
            continue;
          }
          const params: Record<string, string> = {};
          route.keys.forEach((key, index) => {
            params[key] = match[index + 1] ?? '';
          });
          return { route, params };
        }
        return null;
      }
      ```
- [x] `src/frontend/features/stats/gz-dashboard.ts`: `export class GzDashboard`.
- [x] `src/frontend/features/workouts/gz-workout-list.ts`: `export class GzWorkoutList`.
- [x] `src/frontend/features/workouts/gz-workout-detail.ts`: `export class GzWorkoutDetail`; in the
      `#id` doc comment, replace "`router.ts` matches as `(\d+)`" with "`workouts.routes.ts`
      matches as `(\d+)`" and "gz-app sets the attribute" with "its route sets the attribute".
- [x] `src/frontend/features/exercises/gz-exercise-list.ts`: `export class GzExerciseList`.
- [x] `src/frontend/features/exercises/gz-exercise-detail.ts`: `export class GzExerciseDetail`;
      same two comment edits, naming `exercises.routes.ts`.
- [x] `src/frontend/features/stats/stats.routes.ts`: new, `statsRoutes` with `/^\/?$/` →
      `new GzDashboard()`.
- [x] `src/frontend/features/workouts/workouts.routes.ts`: new, `workoutsRoutes` with
      `/^\/workouts\/?$/` → `GzWorkoutList` and `/^\/workouts\/(\d+)\/?$/` (`keys: ['id']`) →
      `GzWorkoutDetail` with `workout-id` set before return (see Desired End State).
- [x] `src/frontend/features/exercises/exercises.routes.ts`: new, `exercisesRoutes` with
      `/^\/exercises\/?$/` → `GzExerciseList` and `/^\/exercises\/(\d+)\/?$/` (`keys: ['id']`) →
      `GzExerciseDetail` with `exercise-id` set before return.
- [x] `src/frontend/app/routes.ts`: new, `export const ROUTES: readonly RouteDef[] = [...statsRoutes,
      ...workoutsRoutes, ...exercisesRoutes];`. Carry over, in one short comment, the reason the
      `import()` specifiers in the feature files are literals (statically analysable) and that a
      view statically imports its own children, from the current `VIEWS` doc comment.
- [x] `src/frontend/app/gz-app.ts`: delete `VIEWS` and its comment; replace `#viewElement(route)`
      with `#viewElement(path)` that returns `match.route.view(match.params)` for a match, or the
      not-found `<p class="empty">` for `null`; `#renderView` reads `currentPath()` and passes the
      path to `#swapView`. Remove the now-meaningless exhaustiveness comments and the
      `throw new Error('Unhandled route')`. Keep the render token, `toastError`, the
      re-query of `main` and the synchronous nav update.
- [x] `.oxlintrc.json`: add, after the `src/frontend/features/**/gz-*.ts` override, an override
      for `src/frontend/features/**/*.routes.ts` with `no-restricted-imports` patterns
      `["**/internal/**", "**/*.api.ts", "**/*.facade.ts", "**/http/**", "**/ui/**"]` and the
      message `"A route file only lazily imports its own feature's views."`.
- [x] `src/frontend/app/routes.test.ts`: new, `describe('routes', …)` using `matchRoute(ROUTES, …)`:
  - [x] `'/'` and `''` resolve to the same route as each other, with no params (the dashboard).
  - [x] `/workouts` and `/workouts/` match one route with no params.
  - [x] `/workouts/12` matches with `params.id === '12'`; `/exercises/7` with `params.id === '7'`.
  - [x] `/workouts/12` and `/exercises/7` resolve to different routes, and neither to the list routes.
  - [x] `/workouts/abc`, `/nope` and `/exercises/7/extra` return `null`.
  - The test never calls a route's `view`: that would import a module extending `HTMLElement`,
    which `bun test` does not provide.
- [x] `docs/frontend.md`:
  - [x] tree (lines 8-21): `app/` gains `routes.ts`; each feature lists its `<f>.routes.ts`.
  - [x] `app/` paragraph (23-24): `router.ts` is a generic hash matcher, `routes.ts` spreads the
        feature route lists.
  - [x] feature paragraph (43-58): a feature's routes live in `<f>.routes.ts` beside its facade,
        each a pattern, param keys and a `view(params)` that `import()`s the view module and
        returns `new GzX()`; mirrors the backend's per-feature `*.routes.ts`.
  - [x] boundaries (60-66): "five import boundaries", adding that a feature route file may not
        import `internal/`, `*.api.ts`, `*.facade.ts`, `http/` or `ui/`, because it loads on every
        page.
  - [x] line 68: "Only the five route views listed in `VIEWS` in `gz-app.ts`" → the route views
        reached through the features' `*.routes.ts`.
  - [x] lines 100-102: the five route views are exported so their route file can construct them;
        `GzChart` and `GzSetRow` are exported for typing; the other four components stay private.
  - [x] Loading (118-128): `gz-app`'s `await import(…)` becomes a route's `view()`; the up-front
        load list adds `app/routes.ts` and the three feature route files.

**Automated Verification**:

- [x] `bun test src/frontend/app/routes.test.ts` passes.
- [x] `bun test` passes (including `serves a stylesheet beside every component module`).
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `ViewName`, `RouteName`, `VIEWS` and `currentRoute` no longer occur under `src/`.
- [x] No `createElement('gz-` remains in `src/frontend/app/gz-app.ts`.

**Manual Verification**:

- [x] With `bun start`, open `#/`, `#/workouts`, a workout, `#/exercises` and an exercise: each
      renders styled on first paint, and the network panel shows each view's script and
      stylesheet fetched only on its first visit.
- [x] `#/nope` shows "Nothing lives at /nope."
- [x] On a workout detail, adding a set still refreshes the view; the dashboard's recent-workout
      links still navigate.
- [x] With the server stopped after the shell loaded, clicking a not-yet-visited nav link keeps the
      current view and shows an error toast.

### Phase 2: Header built from routes

Dependencies: Phase 1

Routes that belong in the header say so, and `gz-app` renders the nav from `ROUTES`.

**Tasks**:

- [x] `src/frontend/app/router.ts`: add `nav?: { path: string; label: string }` to `RouteDef`.
- [x] `src/frontend/features/stats/stats.routes.ts`: `nav: { path: '/', label: 'Dashboard' }`.
- [x] `src/frontend/features/workouts/workouts.routes.ts`: list route gets
      `nav: { path: '/workouts', label: 'Workouts' }`.
- [x] `src/frontend/features/exercises/exercises.routes.ts`: list route gets
      `nav: { path: '/exercises', label: 'Exercises' }`.
- [x] `src/frontend/app/routes.ts`: note in the existing comment that spread order is the header
      order.
- [x] `src/frontend/app/gz-app.ts`: delete `NAV`; in `template()`, map
      `ROUTES.flatMap((route) => (route.nav ? [route.nav] : []))` into the same
      `<li><a role="button" class="secondary outline" href="#${path}" data-path="${path}">` markup.
      `#renderView`'s `aria-current`/`outline` loop is unchanged.
- [x] `src/frontend/app/routes.test.ts`: add a test that the nav entries of `ROUTES`, in order, are
      exactly `[{ path: '/', label: 'Dashboard' }, { path: '/workouts', label: 'Workouts' },
      { path: '/exercises', label: 'Exercises' }]`, and that each `nav.path` matches its own route
      through `matchRoute(ROUTES, nav.path)`.
- [x] `docs/frontend.md`: in the feature/route-file paragraph, a route may carry
      `nav: { path, label }`; `gz-app` builds its header from those, in the order `app/routes.ts`
      spreads the features, so adding a list page needs no edit in `app/` beyond a new feature's
      spread.

**Automated Verification**:

- [x] `bun test src/frontend/app/routes.test.ts` passes, including the nav order test.
- [x] `bun test` passes.
- [x] `bun run typecheck` passes.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `NAV` no longer occurs in `src/frontend/app/gz-app.ts`.

**Manual Verification**:

- [x] The header shows Dashboard, Workouts, Exercises in that order; the active page's button is
      solid on each of `#/`, `#/workouts`, `#/workouts/<id>`, `#/exercises`, `#/exercises/<id>`,
      and the theme toggle still sits last.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- A pre-implementation review suggested adding `**/gz-*.ts` to the route-file lint override, so a
  static import of a view would fail lint. oxlint's `no-restricted-imports` also checks
  `import()` calls, so that pattern flagged the lazy imports themselves; the override keeps the
  plan's pattern list, and `docs/frontend.md` says why.
- Per the same review, `docs/frontend.md` also had its sentence on the load-bearing top-level
  `await` (which named `gz-app`) and its last-match-override sentence updated.
- Phase 1 left `nav` out of the route files, since `RouteDef` gains it only in phase 2.

## References

- `src/frontend/app/gz-app.ts`, `src/frontend/app/router.ts` — the lists being replaced
- `src/backend/http/routes.ts` — the backend's per-feature route spread this mirrors
- `.oxlintrc.json` — frontend overrides and the last-match rule
- `docs/frontend.md` — frontend architecture, import boundaries, loading
- `docs/agents/plans/2026-09-14-feature-organised-frontend.md` — the feature layout this builds on
