---
date: 2026-10-01T08:31:03.223286+00:00
git_commit: ca87763d20d82948c7698ff6e8b92ce93b90eda2
branch: main
topic: 'Reduce component sizes to at most 150 RLOC'
tags: [plan, frontend, components, refactoring, tests]
status: implemented
---

# PLAN: Reduce component sizes to at most 150 RLOC

Bring every frontend component module (`gz-*.component.ts`) down to at most 150 RLOC — lines that
are neither blank nor comments. Shared behavior moves up into a new `GzView` base class for the
five route views first; children are then extracted only where a coherent chunk is left, which is
in the two detail views.

Sizes on `ca87763`, `.ts` only, tests excluded:

```
RLOC  component
 287  features/workouts/gz-workout-detail          ← over
 275  features/exercises/gz-exercise-detail        ← over
 150  features/workouts/gz-workout-list
 140  features/workouts/internal/gz-set-row
 132  features/exercises/gz-exercise-list
 119  features/exercises/internal/gz-chart
  97  app/gz-app · 91 gz-dashboard · 70 gz-header · 65 gz-theme-toggle · 45 gz-pagination · 22 gz-tile
```

## Acceptance Criteria

- Every `src/frontend/**/gz-*.component.ts` is at most 150 RLOC, checked once by the PowerShell
  count in Phase 3. No size test or lint rule is added.
- `src/frontend/ui/view.ts` exports `GzView<Data>`, an abstract `GzElement` subclass that goes
  loading → ready | error on connect, toasts a load error unless it is a 404, settles `ready` even
  on error, and offers `numericAttribute(name)`, which throws when the attribute is missing.
- `ready` moves from `GzElement` to `GzView`; `gz-app` awaits it only for a `GzView`.
- The five route views (`gz-dashboard`, `gz-workout-list`, `gz-exercise-list`,
  `gz-workout-detail`, `gz-exercise-detail`) extend `GzView`; every other component still extends
  `GzElement`.
- `gz-workout-list` shows only the error message when its load fails, like the other views.
- The detail views read their id through `numericAttribute()`; their `observedAttributes`,
  `attributeChangedCallback` and id fields are gone. The route files are unchanged.
- `gz-exercise-detail` composes the new `internal/gz-progress-chart` (which owns the metric
  switch) and `internal/gz-session-table`, and no longer keeps an `#edits` draft. The chosen
  metric still survives saving the details form.
- `gz-workout-detail` composes the new `internal/gz-add-set-form`, which derives its preselection
  from the workout's current last set, creates a new exercise when asked, and emits `set-logged`;
  the parent puts focus back in the weight field after the reload.
- `useFetch()` gains `respondTo('<METHOD> <url>', status, body)`; `testing.ts` gains
  `useToasts()`.
- New tests: `ui/view.test.ts`; one characterization test file per detail view, written before
  its split and passing unchanged after it; one test file per new child component.
- `docs/frontend.md` describes `GzView`, the moved `ready` and the three new children.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test --parallel` pass.

## Technical Key Decisions and Tradeoffs

1. **Approach:** lift shared behavior into a base class first, then extract child components where
   a coherent chunk remains.
   - Why: most of each detail view's size is duplication between the two of them (load state
     machine, loading/error templates, id attribute handling).
   - Impact: one new base class and three new internal components; no file is split for the line
     count alone.
2. **Two levels, `GzElement` → `GzView`:** the five route views extend `GzView`; the shell
   (`gz-app`, `gz-header`, `gz-theme-toggle`) and property- or attribute-fed children
   (`gz-tile`, `gz-pagination`, `gz-set-row`, `gz-chart`, the new children) stay on `GzElement`.
   - Why: only the route views fetch their own data. Folding the lifecycle into `GzElement`
     would give seven components state and a type parameter they ignore.
   - Impact: `ready` moves to `GzView`, the only class that ever replaces it.
3. **Public hooks, `abstract` class:** `GzView` follows `GzElement`'s idiom of public overridable
   hooks — `load()`, `readyTemplate()`, `errorTemplate()`, `loadingText` — plus a read-only
   `data` getter. Its own state stays a `#` field.
   - Why: `src/` uses `#` names rather than `private`/`protected`, and a subclass cannot reach a
     `#` field. `load` rather than `fetch`, which would read like the global.
   - Impact: `load` and `readyTemplate` are `abstract`, so a view missing one fails
     `bun run typecheck`. This is the first `abstract` in `src/`.
4. **Id via `numericAttribute()`, no attribute observation:**
   - Why: `gz-app` calls `route.view(params)` on every route change
     (`gz-app.component.ts:57-60`), so a connected view never sees its id change and the
     reload-on-change branch never runs.
   - Impact: about 25 RLOC less per detail view; routes and tests keep setting the attribute
     before connecting.
5. **One error rule for every view:** toast unless the error is an `ApiError` with status 404.
   `gz-workout-list` loses its header-and-form-on-error special case.
   - Why: the lists and dashboard never get a 404, so nothing visible changes for them, and one
     `ViewState<Data>` union replaces the shape-shifting `WorkoutListState`.
6. **`gz-exercise-detail` → `gz-progress-chart` + `gz-session-table`:**
   - Why: they are its two self-contained blocks; once `gz-progress-chart` owns `#metric`, a
     metric switch re-renders only the chart card, so the parent's `#edits` draft — which exists
     only because that switch re-rendered the whole view — can go.
   - Impact: `gz-chart` stays the generic label/value plotter. `.metric-switch` and
     `.up`/`.down`/`td.name` CSS move to the new children. A save still re-renders the parent and
     so recreates `gz-progress-chart`; to keep today's behavior of the chosen metric surviving a
     save, the child emits `metric-change` and the parent remembers it in `#metric` **without
     re-rendering**, handing it back as the child's `metric` in `afterRender`.
7. **`gz-workout-detail` → `gz-add-set-form`, preselection derived from `sets.at(-1)`:**
   - Why: a logged set makes the parent reload and re-render, which recreates the child, so the
     child cannot keep a `#draft`.
   - Impact: behavior change — the form always starts from the workout's current last set.
     Opening a workout with sets now prefills weight and reps too, not only the exercise; and a
     row's "+1", edit or delete (which reload the view through `sets-changed`) now move the
     preselection to whatever set is last afterwards, where today only a set logged through the
     form changed it. The parent keeps `#edits`, because every logged set still re-renders it
     while the details form may hold unsaved text.
8. **`set-logged`, not `sets-changed`, from the form:** the parent refocuses the weight field only
   after a set logged through the form, not after a row's "+1" or delete.
9. **List duplication stays:** the `page-change` listener and `#page()` are left duplicated in the
   two lists.
   - Why: both lists are under the target after `GzView`, and `ui/` cannot call `navigate()`.
10. **Characterization tests before each split:** each detail view gets a DOM test against its
    current behavior first; it must pass unchanged after the refactor.
    - Impact: `useFetch()` needs per-request answers keyed by method and URL (`gz-workout-detail`
      loads a workout and the exercise list, and `GET` and `POST /api/exercises` share a URL), and
      the toasts need a stub — no test touches `window.ot` today. Assertions that must survive a
      split are written so content moving into a child's shadow root changes only the test's
      query helper (e.g. focus is checked as `input.getRootNode().activeElement === input`).
11. **Size target checked once:** a PowerShell count in Phase 3, not a lasting test or lint rule.

## Current State

```
GzElement (ui/base.ts) ── root, ready, render/template/afterRender, data-action delegation,
│                         $, $$, emit, formData
├─ gz-dashboard        #state union, #load(), loading/error branches        (91)
├─ gz-workout-list     WorkoutListState keeps items on error, #load()        (150)
├─ gz-exercise-list    #state union, #load()                                (132)
├─ gz-workout-detail   #state, #load() (404 → no toast), observed           (287)
│   │                  workout-id + #id getter, #edits, #draft,
│   │                  #addSetTemplate, #prefillFrom, select/focus wiring
│   └─ gz-set-row      property-fed, emits sets-changed                     (140)
├─ gz-exercise-detail  #state, #load() (404 → no toast), observed           (275)
│   │                  exercise-id + #id getter, #edits, METRICS, #metric,
│   │                  #summaryTiles, metric-switch card, #sessionsTable
│   └─ gz-chart        property-fed (series, unit)                          (119)
└─ gz-app, gz-header, gz-theme-toggle, gz-tile, gz-pagination
```

`gz-app.component.ts:106` connects a `GzElement` view hidden and awaits `view.ready`
(`base.ts:23`, settled by default; a view replaces it with its first `#load()`).

## Desired End State

```
GzElement (ui/base.ts) ── unchanged, minus `ready`
├─ GzView<Data> (ui/view.ts, new) ── ready, #state, load(), readyTemplate(), errorTemplate(),
│  │                                  loadingText, data, reload(), numericAttribute()
│  ├─ gz-dashboard                                                         (~80)
│  ├─ gz-workout-list                                                      (~130)
│  ├─ gz-exercise-list                                                     (~118)
│  ├─ gz-workout-detail     header form + #edits, totals, sets, delete     (~130)
│  │   ├─ gz-set-row         unchanged                                     (140)
│  │   └─ gz-add-set-form    NEW: select, new-exercise field, prefill,     (~95)
│  │                         submit, emits set-logged, focusWeight()
│  └─ gz-exercise-detail    header form, tiles, delete                     (~110)
│      ├─ gz-progress-chart  NEW: METRICS, #metric, switch, wraps gz-chart (~70)
│      │   └─ gz-chart        unchanged                                    (119)
│      └─ gz-session-table   NEW: history table with 1RM deltas, empty    (~50)
└─ gz-app (awaits ready only for GzView), gz-header, gz-theme-toggle, gz-tile, gz-pagination
```

The UI looks the same apart from these changes:

- A workout's add-set form always starts from the workout's current last set: it opens prefilled
  with that set's weight and reps, and a row's "+1", edit or delete moves the preselection to
  whatever set is last afterwards.
- A failed workouts-list load shows the error line alone. Today it shows the header, the "New
  workout" form and an empty page, and never the message itself.

```
Add a set                                        before → after (workout whose last set is
┌──────────────────────────────────────────────┐                  Bench 80 kg × 5)
│ Exercise      Weight (kg)  Reps  Notes        │
│ [Bench    ▾]  [        ]   [  ]  [         ]  │  ← before: weight/reps empty
│ [Bench    ▾]  [ 80     ]   [5 ]  [         ]  │  ← after: prefilled from the last set
│                                   [Log set]   │
└──────────────────────────────────────────────┘
```

## Abstractions and Code Reuse

- `src/frontend/ui/`
  - `view.ts` — **new.** `ViewState<Data>`, `GzView<Data>`.
  - `view.test.ts` — **new.**
  - `base.ts` — `GzElement.ready` and its doc comment move to `GzView`.
- `src/frontend/testing.ts` — `FakeFetch.respondTo`, new `useToasts()`.
- `src/frontend/testing.test.ts` — tests for both.
- `src/frontend/app/gz-app.component.ts` — `#swapView` checks `instanceof GzView`.
- `src/frontend/features/stats/gz-dashboard.component.ts` — extends `GzView`.
- `src/frontend/features/workouts/`
  - `gz-workout-list.component.ts` — extends `GzView`; `WorkoutListState` removed.
  - `gz-workout-detail.component.ts` — extends `GzView`; add-set block moves out.
  - `gz-workout-detail.component.test.ts` — **new**, characterization.
  - `gz-workout-detail.component.css` — `.add-form` rules move out.
  - `internal/gz-add-set-form.component.{ts,css,test.ts}` — **new.**
- `src/frontend/features/exercises/`
  - `gz-exercise-list.component.ts` — extends `GzView`.
  - `gz-exercise-detail.component.ts` — extends `GzView`; chart card and table move out;
    `#edits` removed.
  - `gz-exercise-detail.component.test.ts` — **new**, characterization.
  - `gz-exercise-detail.component.css` — `.metric-switch`, `.up`, `.down`, `td.name` move out.
  - `internal/gz-progress-chart.component.{ts,css,test.ts}` — **new.**
  - `internal/gz-session-table.component.{ts,css,test.ts}` — **new.**
- `docs/frontend.md` — `GzView`, `ready`, new children, exported components, test helpers.

Reused unchanged: `html`/`raw`, `format.ts`, the facades, `gz-tile`, `gz-chart`, `gz-set-row`,
`gz-pagination`, `pagination.ts`, `useDom()`, `useGlobals()`. The new children follow
`gz-set-row`'s pattern: data arrives through setters the parent calls in `afterRender`, the child
writes through the facades itself, and it tells the parent with a composed event via `emit()`.

## Logging & Observability

No changes. Load errors are still reported through `toastError()`.

## Implementation

### Phase 1: `GzView` foundation and the list and dashboard views

Dependencies: None

Add `GzView`, the test helpers both later phases need, and move the three views without a
detail-specific concern onto it.

**Tasks**:

- [x] `src/frontend/testing.ts`: add `respondTo(request: string, status: number, body?: string)`
      to `FakeFetch`, where `request` is `'<METHOD> <url>'`, e.g. `'GET /api/exercises'`. A
      request whose method and URL both match gets that answer; anything else falls back to
      `respondWith`'s answer. Clear the answers in the existing `beforeEach`. The URL is the one
      `fetch` receives: `http.ts` prefixes `/api`, and `exerciseFacade.list()` without a limit is
      `/api/exercises` with no query — the same URL as `POST /api/exercises`, hence the method.
- [x] `src/frontend/testing.ts`: add `useToasts(): string[]`, which before each test sets
      `window.ot = { toast }` recording each message into the returned array (the fake returns a
      `document.createElement('output')`, since `Window.ot.toast` is typed to return an
      `HTMLElement`), and after each test restores the previous `window.ot` and empties the array.
      Bun has no `window`; under `useDom()` it is happy-dom's window object, not `globalThis`, so
      set the property on `window` itself rather than through `useGlobals`. Its doc comment says
      it must be called after `useDom()`.
- [x] `src/frontend/testing.test.ts`: tests for `respondTo` (matching method and URL gets its
      answer, a different method on the same URL gets the fallback, cleared between tests) and,
      inside a `describe` that calls `useDom()` — the file's `describe('after useDom')` runs
      without a DOM — for `useToasts` (records `toast()` and `toastError()` messages).
- [x] `src/frontend/ui/view.ts`: add `ViewState<Data>` and `GzView<Data>`:

  ```ts
  export type ViewState<Data> = { status: 'loading' } | { status: 'ready'; data: Data } | { status: 'error'; message: string };

  /** Base class for a route view: an element that fetches its own data when connected. */
  export abstract class GzView<Data> extends GzElement {
    /** (doc comment moved from GzElement.ready) */
    ready: Promise<void> = Promise.resolve();
    #state: ViewState<Data> = { status: 'loading' };
    loadingText = 'Loading…';

    /** The loaded data, or undefined while loading or after an error. */
    get data(): Data | undefined { … }

    abstract load(): Promise<Data>;
    abstract readyTemplate(data: Data): RawHtml;

    errorTemplate(message: string): RawHtml {
      return html`<p class="error-text">${message}</p>`;
    }

    override connectedCallback(): void {
      super.connectedCallback();
      this.ready = this.reload();
    }

    /** Loads and renders; never rejects. A 404 is shown but not toasted. */
    async reload(): Promise<void> { … }

    override template(): RawHtml {
      // loading → <p aria-busy="true">${this.loadingText}</p>; error → errorTemplate; ready → readyTemplate
    }

    /** A numeric attribute its route set before connecting the view; throws when it is missing. */
    numericAttribute(name: string): number { … }
  }
  ```

  `reload()` keeps the last state on screen until the load settles, as `#load()` does today
  (it does not switch back to `loading`). `noImplicitOverride` is on, so every subclass writes
  `override load()`, `override readyTemplate()`, `override loadingText` and so on.
- [x] `src/frontend/ui/base.ts`: remove `ready` and its doc comment from `GzElement`.
- [x] `src/frontend/app/gz-app.component.ts`: `#swapView` checks `view instanceof GzView` (import
      from `../ui/view.ts`) and updates the comment above it. The not-found `<p>` and any other
      element are swapped in without waiting, as today.
- [x] `src/frontend/app/gz-app.component.test.ts:37`: the comment says "a view that is not a
      GzElement"; make it "not a GzView".
- [x] `src/frontend/ui/view.test.ts`: `useDom()`, `useToasts()`, then in `beforeAll`
      `await import('./view.ts')` and declare the test-only subclass **there** — a top-level
      `class extends GzView` would need a static import, which evaluates `extends HTMLElement`
      before `useDom()` has run. Register it with `customElements.define('gz-test-view', …)`
      directly. Its `load()` returns a promise the test resolves or rejects. Cover: renders `loadingText` while loading; renders
      `readyTemplate` and exposes `data` once loaded; error renders `errorTemplate` with the
      message and toasts it; an `ApiError` 404 renders the message without a toast; `ready`
      resolves after an error; `reload()` re-renders with new data; `numericAttribute` returns the
      number and throws naming the tag and attribute when missing.
- [x] `src/frontend/features/stats/gz-dashboard.component.ts`: extend
      `GzView<{ summary: SummaryDto; workouts: WorkoutWithStatsDto[] }>`; `load()` holds the
      `Promise.all`; `readyTemplate` is the current ready markup; `loadingText = 'Loading your log…'`.
      Remove `DashboardState`, `#state`, `#load`, `connectedCallback`, `template`.
- [x] `src/frontend/features/workouts/gz-workout-list.component.ts`: extend
      `GzView<{ items: WorkoutWithStatsDto[]; total: number; page: number }>`. `connectedCallback`
      keeps only the `page-change` listener plus `super.connectedCallback()`. Remove
      `WorkoutListState`, `#state`, `#load`. The default `errorTemplate` replaces the
      header-and-form error rendering.
- [x] `src/frontend/features/exercises/gz-exercise-list.component.ts`: same as the workout list.
      The failed-`position()` fallback calls `this.reload()` instead of `#load()`.
- [x] `docs/frontend.md`: add `view.ts` to the `ui/` line of the tree and to the `ui/` paragraph
      (`GzView` with its hooks and `numericAttribute`); in Loading, say `ready` lives on `GzView`,
      that a view replaces it with its first `reload()`, and that `gz-app` waits only for a
      `GzView`, which `gz-app` now imports, so `ui/view.ts` (with `http/errors.ts` and
      `ui/toast.ts`) joins what loads up front; in the shapes paragraph ("Shapes local to one module — a view's `#state`
      union …"), say the views' state is `GzView`'s `ViewState<Data>` and drop the `#state`
      example; in Tests, "the two stubs" becomes three, and `respondTo` and `useToasts()` are
      described next to `useFetch()`.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/ui/view.test.ts` passes.
- [x] `bun test --parallel src/frontend/testing.test.ts` passes.
- [x] `bun test --parallel src/frontend/app/gz-app.component.test.ts` passes.
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test --parallel` pass.

**Manual Verification**:

- [x] With `bun run start:dev`, the dashboard, `/workouts`, `/workouts?page=2` and `/exercises`
      load and page as before, and switching between them does not flash a "Loading…" line.
- [x] With the server stopped after the page loaded, navigating to `/workouts` shows only the
      error line and a toast.

### Phase 2: Split `gz-exercise-detail`

Dependencies: Phase 1

Pin the view's behavior, move it onto `GzView`, and extract the chart card and the history table.

**Tasks**:

- [x] `src/frontend/features/exercises/gz-exercise-detail.component.test.ts` (**new**, written
      and passing **before** any change to the view): `useDom()`, `useFetch()`, `useToasts()`;
      mount `gz-exercise-detail` with `exercise-id="7"` set before appending, answer
      `/api/exercises/7/progress` with an `ExerciseProgressDto` of two or more sessions. Cover:
      heading shows the name; four tiles; the chart card heading reads "Estimated 1RM"; clicking
      the "Volume" switch changes the heading and `aria-pressed`; text typed into the name field
      (set `.value` and dispatch a bubbling `input` event, which is what fills `#edits` today)
      survives that switch; after switching to "Volume", saving the form keeps "Volume"
      selected; the history table lists sessions newest first, linking each date to
      `/workouts/<id>`, with an up/down delta; no sessions shows "No sets logged for this
      exercise yet."; submitting the form sends `PATCH /api/exercises/7` with the trimmed
      values; a 404 shows the message and the "Back to all exercises" link without a toast.
      Query through the view's shadow root and, where content moves to a child, through the
      child's `shadowRoot` — write a small helper in the test so the post-split change is the
      helper alone, not the assertions.
- [x] `src/frontend/features/exercises/internal/gz-session-table.component.ts` (**new**): exported
      `GzSessionTableComponent extends GzElement`; `set sessions(value: SessionPointDto[])`
      stores and re-renders when connected; template is the current `#sessionsTable` card, or the
      `.empty` "No sets logged for this exercise yet." line when there are no sessions.
- [x] `.../internal/gz-session-table.component.css` (**new**): `.up`, `.down` and `td.name`,
      moved from `gz-exercise-detail.component.css`.
- [x] `src/frontend/features/exercises/internal/gz-progress-chart.component.ts` (**new**):
      exported `GzProgressChartComponent extends GzElement`; holds `MetricKey`, `Metric`,
      `METRICS` and `#metric`; setters `metric` (store only; unknown keys fall back to
      `METRICS[0]`) and `sessions` (store and re-render when connected; the parent sets it
      last); handles the `metric` action by re-rendering itself and emitting `metric-change` with
      the key; before `sessions` arrives it renders the card with an empty chart; template is the current chart card (heading, switch buttons,
      `<gz-chart>`, hint); `afterRender` sets the chart's `unit` and `series`. Statically imports
      `./gz-chart.component.ts`.
- [x] `.../internal/gz-progress-chart.component.css` (**new**): `.metric-switch`, moved from
      `gz-exercise-detail.component.css`.
- [x] `src/frontend/features/exercises/gz-exercise-detail.component.ts`: extend
      `GzView<ExerciseProgressDto>`; `load()` returns
      `exerciseFacade.progress(this.numericAttribute('exercise-id'))`;
      `loadingText = 'Loading progress…'`; override `errorTemplate` to add the back link;
      `readyTemplate` renders header form, tiles, `<gz-progress-chart>` and
      `<gz-session-table>`; `afterRender` hands both children `sessions` (and the chart its
      `metric` first); a `metric-change` listener added in `connectedCallback` stores the key in
      `#metric` without re-rendering; the delete action reads the name from `this.data`. Remove
      `ExerciseDetailState`, `ReadyState`, `METRICS` and the switch markup,
      `#exerciseId`, `observedAttributes`, `attributeChangedCallback`, `get #id`, `#load`,
      `#edits` and its `input` listener (the form renders `exercise`'s values directly), and the
      import of `gz-chart`. Statically import both new children.
- [x] `src/frontend/features/exercises/gz-exercise-detail.component.css`: keep only `.tiles`.
- [x] `src/frontend/features/exercises/internal/gz-session-table.component.test.ts` (**new**):
      rows newest first; delta class `up` for an increase, `down` for a decrease, none on the
      oldest row; empty state; setting `sessions` again re-renders.
- [x] `src/frontend/features/exercises/internal/gz-progress-chart.component.test.ts` (**new**):
      default metric is Estimated 1RM with `aria-pressed="true"`; clicking another switches heading,
      hint and pressed state and emits `metric-change` with its key; a `metric` set before
      `sessions` is shown; the inner `gz-chart` receives one point per session with the chosen
      metric's values.
- [x] Characterization test: change only its query helper to reach into the children's shadow
      roots; every assertion passes unchanged.
- [x] `docs/frontend.md`: add `gz-progress-chart` and `gz-session-table` to the
      `exercises/internal/` line of the tree; in the paragraph on exported components, name them
      beside `GzChartComponent` and `GzSetRowComponent`; drop `gz-exercise-detail` from the list
      of modules with id-shaped state (its id now comes through `numericAttribute()`).

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/exercises` passes, including the
      characterization test unchanged apart from its query helper.
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test --parallel` pass.

**Manual Verification**:

- [x] On `/exercises/<id>` the page looks as before: tiles, chart with metric switch, history
      table with colored deltas; switching the metric keeps unsaved text in the details form,
      and saving the form keeps the chosen metric.

### Phase 3: Split `gz-workout-detail` and check the target

Dependencies: Phase 1 and Phase 2 (the final RLOC check covers `gz-exercise-detail`, and the
docs task assumes Phase 2's edits)

Pin the view's behavior, move it onto `GzView`, and extract the add-set form.

**Tasks**:

- [x] `src/frontend/features/workouts/gz-workout-detail.component.test.ts` (**new**, written and
      passing **before** any change to the view): `useDom()`, `useFetch()` with `respondTo` for
      `/api/workouts/3` (a `WorkoutWithSetsDto` with sets for two exercises) and `/api/exercises`,
      `useToasts()`. Cover: heading and date line; one `gz-set-row` per set; the totals badges;
      the exercise select preselects the last set's exercise; choosing "＋ New exercise…" reveals
      the name field; submitting "Add a set" sends `POST /api/workouts/3/sets` with numeric
      `exerciseId`, `weight`, `reps`, then reloads and focuses the weight field (asserted as
      `weight.getRootNode().activeElement === weight`, so it holds once the input lives in the
      child's shadow root); with "New exercise" and a name it sends `POST /api/exercises` first
      (answered through `respondTo('POST /api/exercises', …)`) and uses the returned id; with
      "New exercise" and no name it toasts "Give the new exercise a name" and posts nothing; text
      typed into the details form (`.value` plus a bubbling `input` event) survives that reload; saving the details form sends
      `PATCH /api/workouts/3`; a 404 shows the message and "Back to all workouts" without a
      toast. Do not assert the weight/reps prefill on open — it changes in this phase. Use a
      query helper as in Phase 2.
- [x] `src/frontend/features/workouts/internal/gz-add-set-form.component.ts` (**new**): exported
      `GzAddSetFormComponent extends GzElement`, holding `NEW_EXERCISE`. Setters `workoutId`,
      `exercises` and `sets` store their value; only `sets` re-renders, and the parent sets it
      last (doc comment says so, as `gz-set-row` does for `set`). Until `sets` has been set it
      renders nothing, as `gz-set-row` does without a set — it connects, and renders once, while
      the parent's `innerHTML` is assigned, before `afterRender` hands it data. The template is the current
      "Add a set" section; the preselection is the last set's exercise, else the first exercise,
      else `NEW_EXERCISE`, and weight/reps start from the last set. `afterRender` wires the
      select's `change` (toggle the new-exercise field, prefill from that exercise's last set).
      `handleSubmit` creates the exercise when needed, posts the set through `setFacade`, and
      emits `set-logged`. A public `focusWeight()` focuses the weight input.
- [x] `.../internal/gz-add-set-form.component.css` (**new**): the `.add-form` field widths, moved
      from `gz-workout-detail.component.css`.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.ts`: extend
      `GzView<{ workout: WorkoutWithSetsDto; exercises: ExerciseDto[] }>`; `load()` reads
      `this.numericAttribute('workout-id')` and holds the `Promise.all`;
      `loadingText = 'Loading workout…'`; override `errorTemplate` for the back link. Keep the
      header form with `#edits`, totals, sets list, delete action and the `sets-changed` listener.
      Listen for `set-logged`: set a `#focusAddSet` flag and `reload()`. `afterRender` hands
      `gz-add-set-form` `workoutId`, `exercises`, then `sets`, and calls `focusWeight()` when the
      flag is set. Remove `NEW_EXERCISE`, `#draft`, `#focusAfterRender`, `#prefillFrom`,
      `#addSetTemplate`, the add-set submit branch, the select wiring, `#workoutId`,
      `observedAttributes`, `attributeChangedCallback`, `get #id`, `#state`, `#load`. Statically
      import the new child.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.css`: keep `.totals` and
      `.sets`.
- [x] `src/frontend/features/workouts/internal/gz-add-set-form.component.test.ts` (**new**):
      preselects and prefills from the last set; with no sets preselects the first exercise with
      empty numbers; with no exercises preselects "New exercise" with the name field shown;
      changing the select prefills from that exercise's last set; submit posts the set and emits
      `set-logged` (heard on `document.body`); a failed post toasts and emits nothing;
      `focusWeight()` focuses the weight input.
- [x] Characterization test: change only its query helper to reach into `gz-add-set-form`'s
      shadow root; every assertion passes unchanged.
- [x] `docs/frontend.md`: add `gz-add-set-form` to the `workouts/internal/` line of the tree and
      to the sentence on what `features/workouts/internal/` keeps; say the form creates a new
      exercise through `exerciseFacade` while `gz-workout-detail` still fills the exercise list
      for it and the rows; name `GzAddSetFormComponent` among the exported children; drop
      `gz-workout-detail` from the list of modules with id-shaped state and name
      `gz-add-set-form` (its `workoutId`) beside `gz-exercise-list`.
- [x] Count RLOC once, from the repository root:

  ```powershell
  Get-ChildItem src/frontend -Recurse -Filter 'gz-*.component.ts' | ForEach-Object {
    $block = $false; $n = 0
    foreach ($l in Get-Content $_.FullName) {
      $t = $l.Trim()
      if ($block) { if ($t -match '\*/') { $block = $false }; continue }
      if ($t -eq '' -or $t.StartsWith('//')) { continue }
      if ($t.StartsWith('/*')) { if ($t -notmatch '\*/') { $block = $true }; continue }
      $n++
    }
    [pscustomobject]@{ RLOC = $n; File = $_.Name }
  } | Sort-Object RLOC -Descending | Format-Table -AutoSize
  ```

  If a component is over 150, trim it within the decisions above (e.g. a template helper) and
  record what was done in Implementation Notes.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/features/workouts` passes, including the
      characterization test unchanged apart from its query helper.
- [x] The RLOC count shows every `gz-*.component.ts` at 150 or less.
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test --parallel` pass.

**Manual Verification**:

- [x] On `/workouts/<id>`, logging a set keeps the exercise, weight and reps, focuses the weight
      field, and keeps unsaved text in the details form; "+1" and delete on a row do not move
      focus.
- [x] Opening a workout with sets prefills weight and reps from its last set, and deleting the
      last set moves the preselection to the set now last; a new workout with no exercises in the
      catalog offers the "New exercise" field straight away.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- **Phase 1, interim `ready`:** removing `ready` from `GzElement` broke the two detail views,
  which still assigned it. Until Phases 2 and 3 moved them onto `GzView` they started their load
  with `void this.#load()`, so `gz-app` swapped them in without waiting for a while.
- **`useFetch()` under `useDom()`:** it recorded headers with `new Headers(…).toJSON()`, which
  happy-dom's `Headers` lacks, so every stubbed request failed as "Could not reach the gainz
  server" once a test used both. It now uses `Object.fromEntries(new Headers(…))`. No earlier test
  combined the two.
- **Characterization detail:** an unpressed metric button renders `aria-pressed=""`, not
  `"false"` (`html` drops a `false`), so the tests assert "not `true`".
- **Focus after a logged set:** instead of a `#focusAddSet` flag read in `afterRender`, the
  `set-logged` listener calls `focusWeight()` once `reload()` has settled. Behavior is the same
  and the field is gone.
- **RLOC trim (Phase 3 count):** the first count was 166 for `gz-workout-detail` and 151 for
  `gz-exercise-detail`. Trimmed by: the focus change above; destructuring the details form's
  values; a flatter `afterRender` in both; and a `backLink` property hook on `GzView` (beside
  `loadingText`), whose default `errorTemplate` renders the link below the message, replacing
  the two identical `errorTemplate` overrides. Final: 148 and 140, every component at most 150.

## References

- `docs/frontend.md` — components, loading, `ready`, import boundaries, tests
- `src/frontend/ui/base.ts` — `GzElement`
- `src/frontend/app/gz-app.component.ts:85-133` — the view swap that awaits `ready`
- `src/frontend/features/workouts/workouts.routes.ts`, `exercises.routes.ts` — id attributes
- `src/frontend/testing.ts` — `useDom()`, `useFetch()`, `useGlobals()`
- `docs/agents/plans/2026-09-15-hash-names-instead-of-private.md` — why `#` names, not `private`
- `docs/agents/plans/2026-09-29-dom-tests-with-happy-dom.md` — the component test harness
