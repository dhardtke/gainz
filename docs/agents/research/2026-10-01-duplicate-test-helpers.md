---
date: 2026-10-01T11:14:46.804286+00:00
git_commit: d863a1bd659c6ee2c27bd0a6990a1978a9013e88
branch: main
topic: "Duplicate functions / utils / helpers among the tests"
tags: [research, codebase, tests, testing, helpers, fixtures, happy-dom]
status: complete
---

# Research: Duplicate functions / utils / helpers among the tests

## Research Question

Research duplicate functions / utils / helpers among the tests.

## Summary

The suite has two shared harness modules, one per half, plus two per-feature fixture modules on the
backend:

- `src/backend/testing.ts` — `useServer()` (`api`, `post`, `patch`), `useTempDir()`, `body<T>()`,
  `at<T>()`, `tables()`
- `src/frontend/testing.ts` — `useGlobals()`, `useFetch()`, `useToasts()`, `useDom()`
- `src/backend/features/exercises/exercises.fixtures.ts` — `createExercise(post, name?)`
- `src/backend/features/workouts/workouts.fixtures.ts` — `createWorkout(post, performedOn?)`

Everything else is declared locally in each test file. Of the ~75 file-local helpers, a set of them
repeat across files, either byte-for-byte or with the same shape and a different selector or
signature. The repeats cluster in three places:

1. **Frontend component tests** (`*.component.test.ts`, `view.test.ts`): mount functions, shadow-root
   lookups, the "query or throw" pattern, DOM event dispatch (`type`, `submit`, `choose`), the
   attribute loop, `settle()`, DTO builders (`exercise`, `set`, `session`), event collectors, and
   recorded-request filters.
2. **Backend tests**: `thrown()` in both facade tests (identical), `opens()` in `dev.routes.test.ts`
   and `build.test.ts` (identical), the server lifecycle of `useServer()` repeated inline in
   `withDev()`, and `useServer().api` repeated as `get()` in `build.test.ts`.
3. **Inline patterns with no helper at all**: posting a set to `/api/workouts/:id/sets` (15 call
   sites in 4 route tests, no fixture), and capturing a promise rejection with
   `.then(() => null, (e) => e)` (3 files).

```
src/
├── backend/
│   ├── testing.ts                                    shared harness (backend + scripts)
│   ├── db/migrations.test.ts                         write, run, foreignKeysOn
│   └── features/
│       ├── dev/dev.routes.test.ts                    withDev, socketUrl, opens*, occurrences
│       ├── exercises/
│       │   ├── exercises.fixtures.ts                 createExercise
│       │   ├── exercises.facade.test.ts              thrown*
│       │   └── exercise.routes.test.ts               (set posts inline)
│       ├── static/static.routes.test.ts              tagOf
│       ├── stats/stats.routes.test.ts                (set posts inline)
│       └── workouts/
│           ├── workouts.fixtures.ts                  createWorkout
│           ├── workouts.facade.test.ts               thrown*, setup
│           ├── workout.routes.test.ts                (set posts inline)
│           └── set.routes.test.ts                    (set posts inline)
├── frontend/
│   ├── testing.ts                                    shared harness (frontend)
│   ├── http/http.test.ts                             rejection
│   ├── app/
│   │   ├── gz-app.component.test.ts                  settle, mountApp, link, click, notFound
│   │   └── gz-theme-toggle.component.test.ts         mount, icons
│   ├── features/
│   │   ├── exercises/
│   │   │   ├── gz-exercise-detail.component.test.ts  session, progress, settle*, mount, root*, childRoot,
│   │   │   │                                         field, type*, submitDetails, metricButton, …
│   │   │   └── internal/
│   │   │       ├── gz-progress-chart.component.test.ts  mount, heading, button, plotted
│   │   │       └── gz-session-table.component.test.ts   session, mount, rows
│   │   └── workouts/
│   │       ├── gz-workout-detail.component.test.ts   exercise*, set, settle*, mount, root*, field, type*,
│   │       │                                         submit, choose, exerciseSelect, focused, posts, …
│   │       └── internal/gz-add-set-form.component.test.ts  exercise*, set, mount, field, exerciseSelect,
│   │                                                       submit, setsLogged, newExerciseShown
│   └── ui/
│       ├── view.test.ts                              mount, text*
│       ├── tile/gz-tile.component.test.ts            mount, text*
│       └── pagination/gz-pagination.component.test.ts  mount, buttons, button, pageChanges
└── scripts/build.test.ts                             opens*, waitForUrl, get
                                                      (* = byte-identical copy exists in another file)
```

## Detailed Findings

### 1. Byte-identical copies

| Helper | Copies | Body |
| --- | --- | --- |
| `thrown(fn): HttpError` | `backend/features/exercises/exercises.facade.test.ts:6-16`, `backend/features/workouts/workouts.facade.test.ts:8-18` | Calls `fn`, returns the caught `HttpError`, rethrows anything else, throws `'Expected an HttpError'` if nothing was thrown |
| `opens(socket): Promise<boolean>` | `backend/features/dev/dev.routes.test.ts:42-55`, `scripts/build.test.ts:12-25` | Resolves `true` on `open`, `false` on `error`/`close`; same doc comment in both |
| `exercise(id, name): ExerciseDto` | `frontend/features/workouts/gz-workout-detail.component.test.ts:15-17`, `frontend/features/workouts/internal/gz-add-set-form.component.test.ts:15-17` | `{ id, name, muscleGroup: null, notes: null, createdAt: '2026-08-01T10:00:00Z' }` |
| `settle(): Promise<void>` (10 ms) | `gz-workout-detail.component.test.ts:45-48`, `gz-exercise-detail.component.test.ts:30-33` | `await Bun.sleep(10)`, same doc comment. `gz-add-set-form.component.test.ts:112,124` inlines `await Bun.sleep(10)`; `gz-app.component.test.ts:37-40` has a `settle()` that sleeps `0` |
| `type(input, value)` | `gz-workout-detail.component.test.ts:108-111`, `gz-exercise-detail.component.test.ts:90-93` | Sets `value`, dispatches a bubbling `input` event |
| `root(view): ShadowRoot` | `gz-workout-detail.component.test.ts:60-65`, `gz-exercise-detail.component.test.ts:44-49` | Returns `view.shadowRoot` or throws; only the tag name in the message differs |
| `text(el, selector)` | `frontend/ui/tile/gz-tile.component.test.ts:23-25`, `frontend/ui/view.test.ts:47-49` | `el.shadowRoot?.querySelector(selector)?.textContent`; parameter type differs (`HTMLElement` vs `TestView`) |

### 2. Same shape, different details

**Child shadow root lookup.** `gz-workout-detail.component.test.ts:68-74` `addSetRoot(view)` and
`gz-exercise-detail.component.test.ts:51-58` `childRoot(view, tag)` both do
`root(view).querySelector(tag)?.shadowRoot` and throw when absent; the workout version hard-codes
`gz-add-set-form`, the exercise version takes the tag and is wrapped by `chartRoot()` and
`tableRoot()` (`:61-68`).

**Field lookup by name.** Three `field()` functions query `[name='…']` and throw `no ${name} field`:

- `gz-workout-detail.component.test.ts:92-98` — `field(form, name)`, searches a form element
- `gz-exercise-detail.component.test.ts:82-88` — `field(view, name)`, searches `root(view)`
- `gz-add-set-form.component.test.ts:38-44` — `field(form, name)`, searches `form.shadowRoot`,
  selector `input[name='…']`

**Exercise select lookup.** `exerciseSelect()` in `gz-workout-detail.component.test.ts:100-106`
(inside the nested add-set form) and `gz-add-set-form.component.test.ts:46-52` (inside the
component's shadow root); same error message `'no exercise select'`.

**Button by data attribute.** `metricButton(view, metric)` in
`gz-exercise-detail.component.test.ts:74-80` and `button(chart, metric)` in
`gz-progress-chart.component.test.ts:33-39` both query `button[data-metric='${metric}']` and throw
`no ${metric} button`; one starts from the detail view's nested chart root, the other from the
chart's own shadow root.

**Query-or-throw.** Beyond the above, the pattern "`querySelector`, throw if null, return" appears in
`gz-workout-detail.component.test.ts` `addSetForm` (`:76-82`), `detailsForm` (`:84-90`),
`gz-pagination.component.test.ts` `button` (`:26-32`), `gz-theme-toggle.component.test.ts` `mount`
(`:21-29`), and `gz-app.component.test.ts` `link` (`:53-64`). The frontend has no shared generic for
it; the backend's `at()` (`backend/testing.ts:98-105`) is the analogous "fail instead of
possibly-absent" helper for arrays.

**Submit dispatch.** `new Event('submit', { bubbles: true, cancelable: true })` is dispatched by
`submit(form)` in `gz-workout-detail.component.test.ts:119-121`, `submitDetails(view)` in
`gz-exercise-detail.component.test.ts:95-99`, and `submit(form)` in
`gz-add-set-form.component.test.ts:58-60` — each from a different starting element.

**Change dispatch.** `choose(view, value)` in `gz-workout-detail.component.test.ts:113-117` sets a
select's value and dispatches `change`; `gz-add-set-form.component.test.ts:100-102` does the same
inline inside a test.

**Attribute loop on mount.** `for (const [name, value] of Object.entries(attributes))
el.setAttribute(name, value)` before `document.body.append(el)` appears in
`gz-tile.component.test.ts:14-21`, `view.test.ts:36-45` and `gz-app.component.test.ts:53-58`.
`gz-pagination.component.test.ts:11-20` sets its attributes one by one for the same reason (first
render sees them).

**Typed create-and-append mount.** `document.createElement(tag) as GzXComponent` (with the same
`oxlint-disable-next-line typescript/no-unsafe-type-assertion -- registered in beforeAll` comment),
`document.body.append()`, then property assignment, in:

- `gz-add-set-form.component.test.ts:28-36`
- `gz-progress-chart.component.test.ts:18-27`
- `gz-session-table.component.test.ts:16-22`
- `view.test.ts:36-45`

**Mount through the fake API.** `mount()` in `gz-workout-detail.component.test.ts:50-58` and
`gz-exercise-detail.component.test.ts:35-42` both call `fake.respondTo(…)`, create the element, set
an id attribute, append, `await settle()`, and return it.

**DTO builders.**

- `set()` — `gz-workout-detail.component.test.ts:19-21` takes
  `(id, exerciseId, exerciseName, weight)` with reps fixed at 5;
  `gz-add-set-form.component.test.ts:19-21` takes `(id, exerciseId, weight, reps)` with
  `exerciseName: ''`. Both fix `workoutId: 3`, `position: id`, `createdAt: '2026-09-20T10:00:00Z'`.
- `session()` — `gz-exercise-detail.component.test.ts:15-17` takes
  `(workoutId, performedOn, estOneRepMax)`; `gz-session-table.component.test.ts:12-14` takes
  `(workoutId, estOneRepMax)` and derives `performedOn`. `gz-progress-chart.component.test.ts:13-16`
  writes two `SessionPointDto` literals inline instead.

**Event collectors.** A function that adds a listener on `document.body` and returns a mutable
record:

- `pageChanges()` — `gz-pagination.component.test.ts:34-43`, collects `page-change` details
- `setsLogged()` — `gz-add-set-form.component.test.ts:62-69`, counts `set-logged`
- inline in `gz-progress-chart.component.test.ts:54-59`, collects `metric-change` details

**Recorded-request filters.** `posts(url)` in `gz-workout-detail.component.test.ts:129-131` filters
`fake.requests` by `POST` and URL and maps to bodies; `gz-add-set-form.component.test.ts:113` does
the same filter inline.

**Rejection capture.** `promise.then(() => null, (cause) => cause)` appears in
`frontend/http/http.test.ts:8-18` (wrapped as `rejection()`, which also asserts `ApiError`),
`frontend/testing.test.ts:24-27`, and `scripts/build.test.ts:185-188`. The backend's synchronous
counterpart is `thrown()` (section 1).

### 3. Backend harness re-implemented locally

- **Server lifecycle.** `withDev()` in `backend/features/dev/dev.routes.test.ts:16-36` repeats
  `openDatabase(':memory:')` → `startServer(db, 0)` → `server.stop(true)` → `db.close()` from
  `useServer()` (`backend/testing.ts:34-43`). Its doc comment (`:11-15`) records why it does not use
  `useServer()`: `GAINZ_DEV` must be set before the route table is built and must not leak.
- **Origin-prefixed fetch.** `get(path, init)` in `scripts/build.test.ts:89-91` is
  `fetch(\`${origin}${path}\`, init)`, the same body as `useServer().api` (`backend/testing.ts:45-47`),
  against a spawned built server rather than an in-process one.
- **Temp directory.** `scripts/build.test.ts:61,86` creates a directory with `mkdtempSync` in
  `beforeAll` and removes it with the same `rmSync(…, { recursive, force, maxRetries: 5, retryDelay: 20 })`
  options as `useTempDir()` (`backend/testing.ts:72-80`), which is per-test (`beforeEach`/`afterEach`).
  The same file uses `useTempDir()` for its second `describe` (`:179`).
- **WebSocket URL.** `socketUrl(origin)` in `dev.routes.test.ts:38-40` builds
  `origin.replace(/^http/, 'ws') + '/dev/ws'`; `build.test.ts:113` builds the same string inline.
- **Facade over a fresh database.** `exercises.facade.test.ts` calls
  `createExerciseFacade(openDatabase(':memory:'))` inline in each of its 5 tests (`:20,25,32,38,44`);
  `workouts.facade.test.ts:20-23` wraps the equivalent in `setup()`.

### 4. Fixtures that exist, and the one that does not

`createExercise` and `createWorkout` were moved out of `testing.ts` into their features by
`docs/agents/plans/2026-09-12-feature-test-fixtures.md`, and every route test uses them. There is no
fixture for sets: the request
`post(\`/api/workouts/${workout.id}/sets\`, { exerciseId: exercise.id, reps, weight })` is written
inline 15 times:

- `workout.routes.test.ts:25,34,35,66,67,84,90,102,104`
- `set.routes.test.ts:14,27`
- `exercise.routes.test.ts:67,109,110`
- `stats.routes.test.ts:13`

Four of those (`workout.routes.test.ts:25`, `set.routes.test.ts:14,27`, `exercise.routes.test.ts:109`)
wrap it in `body<LiftSetDto>(…)` to get the created set; the rest discard the response. None assert
the `201` the way the two existing fixtures do. Similarly, `exercise.routes.test.ts:108` posts a
workout inline instead of calling `createWorkout`, and `workout.routes.test.ts:46,51,55,60` reads
`(await body<WorkoutPageDto>(await api('/api/workouts'))).total` four times.

### 5. Helpers that are local and not repeated

For completeness, these appear in one file only: `migrations.test.ts` `write`, `run`,
`foreignKeysOn`; `dev.routes.test.ts` `occurrences`; `build.test.ts` `waitForUrl`;
`static.routes.test.ts` `tagOf`; `exercise.routes.test.ts` `indexOf`; `theme.test.ts` `htmlTheme`,
`load`, `FakeElement`; `router.test.ts` `view`; `format.test.ts` `local`; `gz-app.component.test.ts`
`notFound`, `click`; `gz-theme-toggle.component.test.ts` `icons`; `gz-progress-chart` `heading`,
`plotted`; `gz-session-table` `rows`; `gz-pagination` `buttons`; `gz-workout-detail` `focused`;
`gz-add-set-form` `newExerciseShown`; `gz-exercise-detail` `progress`, `chartHeading`.

## Code References

- `src/backend/testing.ts:29-66` — `useServer()` and its `api`/`post`/`patch`
- `src/backend/testing.ts:69-83` — `useTempDir()`
- `src/backend/testing.ts:92-112` — `body()`, `at()`, `tables()`
- `src/frontend/testing.ts:10-30` — `useGlobals()`
- `src/frontend/testing.ts:53-89` — `useFetch()` and `FakeFetch`
- `src/frontend/testing.ts:97-121` — `useToasts()`
- `src/frontend/testing.ts:143-199` — `useDom()`
- `src/backend/features/exercises/exercises.fixtures.ts:6-10` — `createExercise`
- `src/backend/features/workouts/workouts.fixtures.ts:6-10` — `createWorkout`
- `src/backend/features/exercises/exercises.facade.test.ts:6-16` / `src/backend/features/workouts/workouts.facade.test.ts:8-18` — `thrown()` ×2
- `src/backend/features/dev/dev.routes.test.ts:42-55` / `src/scripts/build.test.ts:12-25` — `opens()` ×2
- `src/backend/features/dev/dev.routes.test.ts:16-36` — `withDev()`, local server lifecycle
- `src/scripts/build.test.ts:89-91` — `get()`, same body as `api()`
- `src/frontend/features/workouts/gz-workout-detail.component.test.ts:15-131` — 15 local helpers
- `src/frontend/features/exercises/gz-exercise-detail.component.test.ts:15-99` — 13 local helpers
- `src/frontend/features/workouts/internal/gz-add-set-form.component.test.ts:15-69` — 8 local helpers
- `src/frontend/ui/tile/gz-tile.component.test.ts:23-25` / `src/frontend/ui/view.test.ts:47-49` — `text()` ×2
- `src/frontend/http/http.test.ts:8-18` — `rejection()`

## Architecture Documentation

- **Scope of each harness.** `src/backend/testing.ts` is imported by backend tests, the two
  `*.fixtures.ts` modules, and `src/scripts/build.test.ts` (`body`, `useTempDir`). It is not imported
  by any frontend test, and `src/frontend/testing.ts` is not imported by any backend or script test,
  so a helper used on both sides (e.g. rejection capture, `opens`) has no shared home today. The
  import boundaries enforced by `bun run lint` are described in `docs/frontend.md` and
  `docs/backend.md`.
- **Hook-registering helpers.** Every shared helper that needs setup/teardown is a `use*()` function
  that registers `beforeEach`/`afterEach` (or `beforeAll`/`afterAll`) from inside itself, so each
  calling file gets its own lifecycle (`backend/testing.ts:21-28` doc comment). File-local helpers
  are plain functions that close over the file's `fake` / `toasts` instances or take the element
  as a parameter.
- **Component registration.** Every component test imports its component with `await import()` in
  `beforeAll` after `useDom()` (`frontend/testing.ts:134-142`), so the `as GzXComponent` assertion in
  each typed `mount()` carries the same "registered in beforeAll" lint suppression.
- **Fixture placement.** Domain fixtures live in `<feature>.fixtures.ts` at the owning feature's root
  and take `post` as a parameter; `testing.ts` holds only technical hooks (per the 2026-09-12 plan
  and `docs/backend.md:72`).
- **Error-message conventions.** The frontend query-or-throw helpers all throw `Error` with a short
  `no <thing>` / `<tag> renders no <child>` message; `at()` on the backend uses
  `expected an element at index …`.

## Open Questions

- Whether `src/frontend/testing.ts` is meant to stay limited to global stubs (`useGlobals`,
  `useFetch`, `useToasts`, `useDom`) or also to hold DOM query/dispatch helpers; `docs/frontend.md`
  (around lines 281-310) describes only the stubs.
- Whether a helper shared by backend and scripts tests (`opens`) or by both halves (rejection capture)
  has an allowed location under the current lint boundaries; not checked against `.oxlintrc.json`.
