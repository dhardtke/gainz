---
date: 2026-09-14T19:27:22+00:00
git_commit: 3a90d298b63f9bd2bc8dd7ccdfe7f1dc15618f5d
branch: main
topic: 'Organise the frontend by feature, with facades in front of per-feature API clients'
tags: [plan, frontend, features, facades, components, styles, oxlint, refactor]
status: ready
---

# PLAN: A feature-organised frontend

Today `src/frontend/` is organised by kind: six flat shared modules at its root, two stylesheets
in `css/`, and eleven components in `components/<tag>/`, all reading data through one `api` object
in `api.ts` that covers every resource. The backend, by contrast, is organised by feature, with a
public front door (`<feature>.facade.ts`) and a private `internal/`.

This plan gives the frontend the same shape. `features/exercises/`, `features/workouts/` and
`features/stats/` each own their route views, their child components and a private API client
behind a facade; what belongs to no feature moves to `app/` (the shell), `http/` (the request
plumbing) and `ui/` (the component foundation and widgets used by several features). Six oxlint
overrides, enforcing four boundaries, make them a check. Behaviour and markup do not change.

Built on `docs/agents/research/2026-09-14-frontend-structure.md`.

## Acceptance Criteria

- `src/frontend/components/`, `src/frontend/api.ts` and `src/frontend/css/` no longer exist; every
  frontend module sits in `app/`, `ui/`, `http/` or `features/<exercises|workouts|stats>/`, with
  `index.html` and `main.ts` at the root.
- Each feature publishes exactly one `<feature>.facade.ts` at its root, holding thin classes that
  delegate to `internal/*.api.ts`, and exports ready instances: `workoutFacade`, `setFacade`,
  `exerciseFacade`, `statsFacade`.
- Components reach data only through facades; only facades import `internal/*.api.ts`; only
  `*.api.ts` modules import `http/http.ts`.
- `bun run lint` fails when:
  - a module under `features/<a>/` imports `features/<b>/internal/`;
  - a module under `app/`, `ui/`, `http/` or `main.ts` imports any `internal/`;
  - any `gz-*.ts` component imports a `*.api.ts` or `http/http.ts`;
  - a module under `ui/` or `http/` imports `features/` or `app/`.
- A component's stylesheet is found from its own module URL (`define(tag, ctor, import.meta.url)`),
  not from its tag name, and every `gz-*.ts` has a `.css` beside it — held by a test.
- Every route, view, child component, toast and the theme switch behave exactly as before; lazy
  route loading still paints styled on the first frame.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.
- `docs/frontend.md`, the `src/frontend/` entry in `AGENTS.md` and the overrides sentence in
  `docs/backend.md` describe the new structure.

## Technical Key Decisions and Tradeoffs

1. **The backend's shape: views and facade at the feature root, API clients and child components
   in `internal/`.**
   - Why: the route views are the feature's entry points (what `gz-app` imports), exactly as the
     backend's `*.routes.ts` are; `internal/` means the same thing on both sides.
   - Impact: `gz-set-row` moves to `features/workouts/internal/`, `gz-chart` to
     `features/exercises/internal/`.

2. **Three features matching the backend; `stats` owns the dashboard.**
   - Why: the directory names read the same on both halves; the dashboard's own data is the
     summary, and it borrows recent workouts through `workoutFacade`.
   - Impact: `features/stats/gz-dashboard.ts` imports `../workouts/workouts.facade.ts`. `meta` and
     `static` have no frontend counterpart.

3. **Facades are thin classes, exported as ready instances; no composition root.**
   - Why: there is nothing to inject, custom elements cannot take constructor arguments, and a
     composition root would statically pull every feature's API module into every view.
   - Impact: composition across facades (workout detail loading a workout and the exercise list)
     stays in the component, as it stays in the backend controller.

4. **API classes split by URL prefix, facades by entity, with the backend's verbs.**
   - Why: `workout.api.ts` owns every `/api/workouts/**` URL as `workout.routes.ts` does;
     `SetFacade.create(workoutId, dto)` mirrors the backend `SetFacade`. `get` stays `get` — a
     fetch that throws on 404 needs no `require`.
   - Impact: call sites rename: `api.workouts.remove` → `workoutFacade.delete`,
     `api.workouts.addSet` → `setFacade.create`, `api.summary` → `statsFacade.summary`.
     `SetFacade` takes both `WorkoutApi` (for `createSet`) and `SetApi`.

5. **Non-feature code in `app/`, `http/`, `ui/`.**
   - Why: `http/` matches the backend's name and job; `ui/` avoids a `src/frontend/shared/` beside
     the unrelated types-only `src/shared/`.
   - Impact: `http/http.ts` holds `get`/`post`/`patch`/`remove`; `http/errors.ts` holds `ApiError`
     and `errorMessage`, so components can import the errors without reaching the request helpers.

6. **`define(name, ctor, moduleUrl)` finds the stylesheet beside the module.**
   - Why: a tag no longer implies a path. `Bun.Transpiler` preserves `import.meta.url` (verified:
     `new URL('./a.css', import.meta.url)` survives transpiling unchanged).
   - Impact: `loadStyles(tagName, moduleUrl)` derives the href by swapping `.ts` for `.css`, and
     records tag → href so `stylesFor(localName)` stays synchronous.

7. **Flat `.ts` + `.css` pairs, no per-component directories.**

8. **Lint overrides list every pattern their files need.** oxlint applies the last matching
   override's `no-restricted-imports` options in full rather than merging them (verified in a
   scratch config), so a component override repeats its directory override's patterns.

9. **Out of scope:** the stale `src/shared/shared.test.ts` reference in `docs/frontend.md` and
   `transpile.test.ts`, the barrel-import TODO in `src/shared/dto/index.ts`, and any behaviour or
   markup change. `docs/agents/` documents are not edited.

## Current State

```
src/frontend/
├── index.html            links /vendor/pico.css, /css/app.css; loads /main.ts
├── main.ts               import './components/gz-app/gz-app.ts'
├── base.ts               GzElement, html, define(name, ctor)  → loadStyles(name)
├── styles.ts             BASE_HREFS ['/vendor/pico.css', '/css/shared.css']
│                         componentHref(tag) = /components/<tag>/<tag>.css     (styles.ts:21)
├── theme.ts  router.ts  format.ts
├── api.ts                request<T>, ApiError, errorMessage, one `api` object  (api.ts:103-140)
├── css/{app,shared}.css
└── components/<tag>/<tag>.{ts,css}  × 11
```

Every component imports `api` directly:

```
gz-dashboard ─────── api.summary, api.workouts.{list,create}
gz-workout-list ──── api.workouts.{list,create,remove}
gz-workout-detail ── api.workouts.{get,update,remove,addSet}, api.exercises.{list,create}, ApiError
gz-set-row ───────── api.workouts.addSet, api.sets.{update,remove}
gz-exercise-list ─── api.exercises.{list,create,update,remove}
gz-exercise-detail ─ api.exercises.progress, ApiError
gz-toast ─────────── errorMessage
```

Frontend URLs are hard-coded in `static.routes.test.ts:20,40,53,67-72`,
`internal/transpile.test.ts:10,22-23,33,37,44`, `index.html:16,30,34`, `base.ts:53` and
`docs/frontend.md`. `.oxlintrc.json` has no frontend overrides.

## Desired End State

```
src/frontend/
├── index.html                    links /vendor/pico.css, /ui/app.css; loads /main.ts
├── main.ts                       import './app/gz-app.ts'
├── app/                          the shell
│   ├── gz-app.ts  gz-app.css     VIEWS → import('../features/<f>/gz-<view>.ts')
│   ├── gz-theme-toggle.ts  .css
│   └── router.ts
├── http/
│   ├── http.ts                   get / post / patch / remove  (request<T> private)
│   └── errors.ts                 ApiError, errorMessage
├── ui/                           what any component may use
│   ├── base.ts  styles.ts  theme.ts  format.ts
│   ├── app.css  shared.css
│   ├── gz-toast.ts  gz-toast.css
│   └── gz-stat-tile.ts  gz-stat-tile.css
└── features/
    ├── exercises/
    │   ├── exercises.facade.ts             ExerciseFacade, exerciseFacade
    │   ├── gz-exercise-list.ts  .css       view #/exercises
    │   ├── gz-exercise-detail.ts  .css     view #/exercises/:id
    │   └── internal/
    │       ├── exercise.api.ts             ExerciseApi   /api/exercises/**
    │       └── gz-chart.ts  gz-chart.css
    ├── workouts/
    │   ├── workouts.facade.ts              WorkoutFacade, SetFacade, workoutFacade, setFacade
    │   ├── gz-workout-list.ts  .css        view #/workouts
    │   ├── gz-workout-detail.ts  .css      view #/workouts/:id
    │   └── internal/
    │       ├── workout.api.ts              WorkoutApi    /api/workouts/**
    │       ├── set.api.ts                  SetApi        /api/sets/**
    │       └── gz-set-row.ts  gz-set-row.css
    └── stats/
        ├── stats.facade.ts                 StatsFacade, statsFacade
        ├── gz-dashboard.ts  .css           view #/
        └── internal/
            └── stats.api.ts                StatsApi      /api/stats/**
```

Data flow for one call, and who may import whom:

```
gz-workout-detail ──► workoutFacade.get(id) ──► WorkoutApi.get(id) ──► http.get('/workouts/1') ──► fetch
      │                 (features/workouts/)      (internal/)             (http/http.ts)
      ├──► exerciseFacade.list()     cross-feature: facade only, never ../exercises/internal/
      ├──► ui/base.ts, ui/format.ts, ui/gz-toast.ts, app/router.ts, http/errors.ts
      └──► ./internal/gz-set-row.ts  ──► setFacade.create / update / delete
```

## Abstractions and Code Reuse

- `src/frontend/http/`
  - `http.ts` - new; `request<T>` moves here verbatim from `api.ts:57-92` (module-private), with the
    `get` / `post` / `patch` / `remove` helpers from `api.ts:94-100` now exported
  - `errors.ts` - new; `ApiError` and `errorMessage` move here verbatim from `api.ts:21-44`
- `src/frontend/ui/`
  - `styles.ts` - `componentHref` removed; `loadStyles(tagName, moduleUrl)` records
    `tagName → moduleUrl.replace(/\.ts$/, '.css')`; `stylesFor(tagName)` looks the href up;
    `BASE_HREFS` becomes `['/vendor/pico.css', '/ui/shared.css']`
  - `base.ts` - `define(name, ctor, moduleUrl)` passes `moduleUrl` to `loadStyles`; class doc
    comment's example path updated
- `features/<f>/internal/<entity>.api.ts` - new classes whose method bodies are today's `api`
  object entries, one line each, e.g. `list({ limit = 50, offset = 0 } = {}): Promise<WorkoutPageDto>`
- `features/<f>/<f>.facade.ts` - new classes taking their API through a parameter property
  (`constructor(private readonly api: WorkoutApi) {}`, as `.oxlintrc.json` requires
  `parameter-properties: parameter-property`), each method one delegating line
- `.oxlintrc.json` - six new `overrides` entries (see Phase 1)

Existing abstractions are reused unchanged: `GzElement`, `html`/`raw`, the `data-action`
delegation, `toast()`/`toastError()`, the router, the formatters, the static feature and the DTOs.

## Logging & Observability

No change. `styles.ts` keeps its `console.error('gainz: could not load stylesheet …')` path, now
naming the module-relative href (e.g. `http://localhost:3000/features/workouts/internal/gz-set-row.css`).

## Implementation

Moves use `git mv` so history follows the files. Relative import specifiers are rewritten to the
new depth; each file keeps its existing specifier form (`shared/dto` vs `shared/dto/index.ts`).

### Phase 1: Foundation — `app/`, `http/`, `ui/`, stylesheet lookup and lint rules

Dependencies: None

Move everything that belongs to no feature into its final home, split the request plumbing out of
`api.ts`, switch stylesheet lookup to the module URL, and add every lint override. The five views
and two child components stay in `components/` for now, and `api.ts` keeps only the `api` object.

**Tasks**:

- [ ] `git mv` `src/frontend/{base,styles,theme,format}.ts` → `src/frontend/ui/`
- [ ] `git mv` `src/frontend/css/app.css` and `css/shared.css` → `src/frontend/ui/`; remove `css/`
- [ ] `git mv` `components/gz-toast/gz-toast.{ts,css}` and `components/gz-stat-tile/gz-stat-tile.{ts,css}` → `ui/`
- [ ] `git mv` `components/gz-app/gz-app.{ts,css}`, `components/gz-theme-toggle/gz-theme-toggle.{ts,css}` and `src/frontend/router.ts` → `app/`
- [ ] Create `src/frontend/http/errors.ts` with `ApiError` and `errorMessage` from `api.ts:21-44`
- [ ] Create `src/frontend/http/http.ts` with `request<T>` (private) and exported `get`, `post`, `patch`, `remove` from `api.ts:57-100`, importing `ApiError` from `./errors.ts`; reword the two comments that point at "the methods on `api` below" (`api.ts:50`, `api.ts:87`) to point at the API classes' method declarations
- [ ] Reduce `src/frontend/api.ts` to its DTO/flavor type imports plus the `api` object, importing `get`/`post`/`patch`/`remove` from `./http/http.ts`
- [ ] `ui/styles.ts`: replace `componentHref` with a `hrefs: Map<string, string>` filled by `loadStyles(tagName, moduleUrl)`; `stylesFor(tagName)` reads `sheets.get(hrefs.get(tagName))`; `BASE_HREFS` → `'/ui/shared.css'`; update the module doc comment
      ```ts
      export function loadStyles(tagName: string, moduleUrl: string): Promise<void> {
        const href = moduleUrl.replace(/\.ts$/, '.css');
        hrefs.set(tagName, href);
        …
      }
      ```
- [ ] `ui/base.ts`: `define(name, ctor, moduleUrl: string)` calls `loadStyles(name, moduleUrl)`; update the `GzElement` doc comment example to `ui/gz-stat-tile.css` beside `ui/gz-stat-tile.ts`
- [ ] Change all eleven `await define('<tag>', Class)` calls to `await define('<tag>', Class, import.meta.url)`
- [ ] Rewrite imports in every moved module and every remaining `components/*/*.ts`: `base`/`format`/`theme` → `ui/`, `router` → `app/router.ts`, `gz-toast`/`gz-stat-tile` → `ui/`, `ApiError`/`errorMessage` → `http/errors.ts` (`gz-toast` included); `ui/format.ts` imports `../../shared/flavors.ts`
- [ ] `app/gz-app.ts`: `./gz-theme-toggle.ts`, `../ui/gz-toast.ts`; `VIEWS` specifiers become `../components/<tag>/<tag>.ts` for now
- [ ] `main.ts`: `import './app/gz-app.ts'`
- [ ] `index.html`: `<link rel="stylesheet" href="/ui/app.css" />`; comments name `src/frontend/ui/theme.ts` and `src/frontend/ui/styles.ts`
- [ ] `.oxlintrc.json`: append these overrides, in this order (later entries replace earlier ones for files both match):
      ```jsonc
      { "files": ["src/frontend/features/**/*.ts"],
        "patterns": ["../**/internal/**"],
        "message": "A feature reaches another feature through its facade, never its internal/." },
      { "files": ["src/frontend/features/**/gz-*.ts"],
        "patterns": ["../**/internal/**", "**/*.api.ts", "**/http/http.ts"],
        "message": "Components read data through a facade." },
      { "files": ["src/frontend/main.ts", "src/frontend/app/**/*.ts"],
        "patterns": ["**/internal/**"],
        "message": "Only a feature may reach its own internal/." },
      { "files": ["src/frontend/app/**/gz-*.ts"],
        "patterns": ["**/internal/**", "**/*.api.ts", "**/http/http.ts"],
        "message": "Components read data through a facade." },
      { "files": ["src/frontend/ui/**/*.ts", "src/frontend/http/**/*.ts"],
        "patterns": ["**/internal/**", "**/features/**", "**/app/**"],
        "message": "ui/ and http/ are the foundation; they may not depend on what uses them." },
      { "files": ["src/frontend/ui/**/gz-*.ts"],
        "patterns": ["**/internal/**", "**/features/**", "**/app/**", "**/*.api.ts", "**/http/http.ts"],
        "message": "ui/ components are foundation and read no data." }
      ```
      (shorthand: each entry is `"rules": { "no-restricted-imports": ["error", { "patterns": [{ "group": [...], "message": "..." }] }] }`, as the existing backend overrides are written)
- [ ] `static.routes.test.ts`: stylesheet test paths → `/ui/app.css`, `/ui/shared.css`, `/app/gz-app.css`; HEAD test → `/ui/format.ts`; 405 test → `/ui/app.css`; trailing-slash test → `['/ui/', '/app/']` and the no-slash case → `/ui`
- [ ] `static.routes.test.ts`: add `test('serves a stylesheet beside every component module', …)` — `new Bun.Glob('**/gz-*.ts').scan(FRONTEND_DIR)` (import `FRONTEND_DIR` from `./internal/paths.ts`), and for each file request `'/' + file.replaceAll('\\', '/').replace(/\.ts$/, '.css')` (scan yields backslashes on Windows), expecting 200 and `text/css`; also expect at least eleven files were found
- [ ] `internal/transpile.test.ts`: `/format.ts` → `/ui/format.ts`; `main.ts` assertion → `./app/gz-app.ts`; the specifier assertion on `gz-chart.ts` → `from "../../ui/format.ts"`
- [ ] `docs/frontend.md`: rewrite the opening two paragraphs and the component-directory paragraph for `app/`, `http/`, `ui/` and `define(tag, ctor, import.meta.url)` (the CSS sits beside the module and is found from its URL — still no manifest); update the Loading example URL to `src/frontend/app/gz-app.ts` → `/app/gz-app.ts`; "Only the shell … and Pico plus `ui/shared.css` load up front"; Theming names `src/frontend/ui/theme.ts` and `ui/base.ts`; add a paragraph describing the four import boundaries `bun run lint` enforces
- [ ] `docs/backend.md:84`: "The `overrides` block in `.oxlintrc.json` holds three rules" → says the backend's three and points to `docs/frontend.md` for the frontend's
- [ ] `docs/backend.md:176`: the cited `static.routes.test.ts:39` → the HEAD test's new line number after the edits above
- [ ] `docs/styling-guidelines.md:6-7`: `css/app.css` / `css/shared.css` → `ui/app.css` / `ui/shared.css`, and a component's `.css` sits beside its `.ts`

**Automated Verification**:

- [ ] `bun test src/backend/features/static` passes, including the new stylesheet-beside-module test
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] `bun start`, open `/`: header, theme toggle, dashboard stat tiles and toasts render styled on first paint; switching theme and every nav link still work

### Phase 2: Workouts feature

Dependencies: Phase 1

Give workouts and sets an API client and a facade, and move the two workout views and the set row
into the feature. Other components switch their workout and set calls to the facades.

**Tasks**:

- [ ] Create `features/workouts/internal/workout.api.ts` — `export class WorkoutApi` with `list({ limit, offset })`, `get(id)`, `create(dto)`, `update(id, dto)`, `delete(id)`, `createSet(workoutId, dto)`, bodies taken from `api.workouts` (`api.ts:120-133`); keep the `update` doc comment about the missing `sets`
- [ ] Create `features/workouts/internal/set.api.ts` — `export class SetApi` with `update(id, dto)`, `delete(id)` from `api.sets` (`api.ts:135-139`)
- [ ] Create `features/workouts/workouts.facade.ts`
      ```ts
      export class WorkoutFacade {
        constructor(private readonly api: WorkoutApi) {}
        list(page?: { limit?: number; offset?: number }): Promise<WorkoutPageDto> { return this.api.list(page); }
        get / create / update / delete
      }
      export class SetFacade {
        constructor(private readonly workouts: WorkoutApi, private readonly sets: SetApi) {}
        create(workoutId: WorkoutId, dto: CreateSetDto): Promise<LiftSetDto> { return this.workouts.createSet(workoutId, dto); }
        update / delete  → this.sets
      }
      const workoutApi = new WorkoutApi();
      export const workoutFacade = new WorkoutFacade(workoutApi);
      export const setFacade = new SetFacade(workoutApi, new SetApi());
      ```
- [ ] `git mv` `components/gz-workout-list/gz-workout-list.{ts,css}` and `components/gz-workout-detail/gz-workout-detail.{ts,css}` → `features/workouts/`
- [ ] `git mv` `components/gz-set-row/gz-set-row.{ts,css}` → `features/workouts/internal/`
- [ ] `gz-workout-list.ts`: `api.workouts.list/create/remove` → `workoutFacade.list/create/delete` from `./workouts.facade.ts` (same depth as before, so only sibling imports change)
- [ ] `gz-workout-detail.ts`: `api.workouts.get/update/remove` → `workoutFacade.get/update/delete`, `api.workouts.addSet` → `setFacade.create`; `api.exercises.*` still from `../../api.ts` until Phase 3; `GzSetRow` type and side-effect import from `./internal/gz-set-row.ts`
- [ ] `internal/gz-set-row.ts`: `api.workouts.addSet` → `setFacade.create`, `api.sets.update/remove` → `setFacade.update/delete`, imported from `../workouts.facade.ts`; it is one level deeper, so the rest become `../../../ui/base.ts`, `../../../ui/format.ts`, `../../../ui/gz-toast.ts`, `../../../../shared/dto/index.ts`
- [ ] `components/gz-dashboard/gz-dashboard.ts`: `api.workouts.list/create` → `workoutFacade.list/create` from `../../features/workouts/workouts.facade.ts`; `api.summary` unchanged
- [ ] `app/gz-app.ts` `VIEWS`: `workouts` → `../features/workouts/gz-workout-list.ts`, `workout` → `../features/workouts/gz-workout-detail.ts`
- [ ] `api.ts`: remove the `workouts` and `sets` groups and their now-unused type imports
- [ ] `internal/transpile.test.ts`: the strip-type-imports test requests `/features/workouts/internal/gz-set-row.ts`
- [ ] `docs/frontend.md`: describe a feature — facade at the root, views beside it, API classes (one per URL prefix) and child components in `internal/`, facades exported as instances with no composition root — using workouts as the example; the "a component a view renders inside itself must stay a static import" rule now names `internal/`

**Automated Verification**:

- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] On `#/workouts`: create, repeat, load more and delete a workout; on `#/workouts/:id`: edit the header, log a set, `+1`, edit and delete a set, delete the workout; start a workout from the dashboard

### Phase 3: Exercises feature

Dependencies: Phase 2

Same treatment for exercises: API client, facade, two views and the chart.

**Tasks**:

- [ ] Create `features/exercises/internal/exercise.api.ts` — `export class ExerciseApi` with `list()`, `get(id)`, `progress(id)`, `create(dto)`, `update(id, dto)`, `delete(id)` from `api.exercises` (`api.ts:106-118`)
- [ ] Create `features/exercises/exercises.facade.ts` — `ExerciseFacade` delegating each method, and `export const exerciseFacade = new ExerciseFacade(new ExerciseApi())`
- [ ] `git mv` `components/gz-exercise-list/gz-exercise-list.{ts,css}` and `components/gz-exercise-detail/gz-exercise-detail.{ts,css}` → `features/exercises/`
- [ ] `git mv` `components/gz-chart/gz-chart.{ts,css}` → `features/exercises/internal/`
- [ ] `internal/gz-chart.ts`: one level deeper, so its imports become `../../../ui/base.ts` (both lines) and `../../../ui/format.ts`
- [ ] `gz-exercise-list.ts`: `api.exercises.list/create/update/remove` → `exerciseFacade.list/create/update/delete`
- [ ] `gz-exercise-detail.ts`: `api.exercises.progress` → `exerciseFacade.progress`; `GzChart` type and side-effect import from `./internal/gz-chart.ts`
- [ ] `features/workouts/gz-workout-detail.ts`: `api.exercises.list/create` → `exerciseFacade.list/create` from `../exercises/exercises.facade.ts`; drop the `api.ts` import
- [ ] `app/gz-app.ts` `VIEWS`: `exercises` and `exercise` → `../features/exercises/…`
- [ ] `api.ts`: remove the `exercises` group, its unused type imports, and the now-unused `post`/`patch`/`remove` imports
- [ ] `internal/transpile.test.ts`: both `gz-chart` requests → `/features/exercises/internal/gz-chart.ts`, specifier assertion → `from "../../../ui/format.ts"`
- [ ] `docs/frontend.md`: note the cross-feature case — workout detail reads exercises through `exerciseFacade`, never `exercises/internal/`

**Automated Verification**:

- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] On `#/exercises`: create, edit, cancel and delete an exercise; on `#/exercises/:id`: the chart draws and each metric switch redraws it; on `#/workouts/:id`: the exercise select lists exercises and "new exercise" creates one inline

### Phase 4: Stats feature and cleanup

Dependencies: Phase 3

Move the dashboard into `stats`, delete what is left of the old layout, and finish the docs.

**Tasks**:

- [ ] Create `features/stats/internal/stats.api.ts` — `export class StatsApi { summary(): Promise<SummaryDto> }` from `api.ts:104`
- [ ] Create `features/stats/stats.facade.ts` — `StatsFacade.summary()` and `export const statsFacade = new StatsFacade(new StatsApi())`
- [ ] `git mv` `components/gz-dashboard/gz-dashboard.{ts,css}` → `features/stats/`
- [ ] `gz-dashboard.ts`: `api.summary` → `statsFacade.summary`; `workoutFacade` from `../workouts/workouts.facade.ts`; `gz-stat-tile` from `../../ui/gz-stat-tile.ts`
- [ ] `app/gz-app.ts` `VIEWS`: `dashboard` → `../features/stats/gz-dashboard.ts`
- [ ] Delete `src/frontend/api.ts` and the now-empty `src/frontend/components/`
- [ ] `docs/frontend.md`: final pass — a tree of `app/`, `http/`, `ui/`, `features/`; the type-import paragraph's example specifiers become those from a feature view (`'../../../shared/dto/index.ts'`) and an API class (`'../../../../shared/dto/index.ts'`), leaving its `shared.test.ts` sentence as is; the flavored-ids paragraph names the `*.api.ts` classes and facades instead of `api.ts`, and `format.ts` as `ui/format.ts`; "GzChart and GzSetRow are exported" unchanged; no remaining mention of `components/`, `css/` or `api.ts`
- [ ] `AGENTS.md`: extend the `src/frontend/` entry — organised like the backend: `features/<feature>/` owns its route views and a `<feature>.facade.ts` at its root and keeps its `*.api.ts` classes and child components in `internal/`; `app/` is the shell and router, `http/` the request helpers, `ui/` the component foundation and widgets several features use; `bun run lint` fails if a feature reaches another's `internal/` or a component reaches an `*.api.ts` or `http/http.ts`; the index line for `docs/frontend.md` becomes "features and facades, components, import boundaries, loading, theming, and why a module's URL is its path"

**Automated Verification**:

- [ ] `src/frontend/components/` and `src/frontend/api.ts` do not exist: `Test-Path src/frontend/components, src/frontend/api.ts` prints `False` twice
- [ ] No source or doc outside `docs/agents/` names the old layout: in PowerShell, ``git grep -nE 'frontend/components|/components/gz-|css/(app|shared)\.css|frontend/(api|base|styles|theme|router|format)\.ts|[./]/api\.ts|`api\.ts`' -- src docs AGENTS.md ':!docs/agents'`` prints nothing
- [ ] `bun test` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

**Manual Verification**:

- [ ] With the browser's network tab open, load `/` fresh: the dashboard paints styled with no flash, and `gz-chart.ts`/`.css` are not fetched until an exercise is opened
- [ ] Click through `#/`, `#/workouts`, a workout, `#/exercises`, an exercise and an unknown hash (`#/nope`); stop the server and navigate to an unvisited route to see the failed-import toast while the old view stays

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/research/2026-09-14-frontend-structure.md` — the frontend as it stands at `3a90d29`
- `docs/agents/plans/2026-09-12-feature-facades.md` — the backend facades this mirrors
- `src/backend/features/workouts/workouts.facade.ts` — `WorkoutFacade` / `SetFacade` naming and shape
- `src/frontend/api.ts:57-140` — `request<T>` and the `api` object being split
- `src/frontend/styles.ts:19-76` — stylesheet lookup being changed
- `src/frontend/components/gz-app/gz-app.ts:24-30` — `VIEWS`
- `src/backend/features/static/static.routes.test.ts`, `internal/transpile.test.ts` — URL-bound tests
- `.oxlintrc.json:129-176` — existing override style
- `docs/frontend.md`, `docs/backend.md:84`, `AGENTS.md`
