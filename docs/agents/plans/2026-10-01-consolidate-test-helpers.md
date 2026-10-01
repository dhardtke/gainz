---
date: 2026-10-01T11:21:49.446487+00:00
git_commit: d863a1bd659c6ee2c27bd0a6990a1978a9013e88
branch: main
topic: 'Consolidate the duplicate test helpers'
tags: [plan, tests, testing, fixtures, happy-dom, build]
status: implemented
---

# PLAN: Consolidate the duplicate test helpers

`docs/agents/research/2026-10-01-duplicate-test-helpers.md` found the same helpers written out in
several test files: `thrown()` and `opens()` on the backend, the set-creating POST in four route
tests, and some twenty DOM and DTO helpers across the frontend's component tests. This plan moves
each into one shared home: technical helpers into the two `testing.ts` harnesses, domain data into
per-feature `*.fixtures.ts` modules on both halves. The frontend fixtures are kept out of the
single-file build like every other test-only file.

## Acceptance Criteria

- `src/backend/testing.ts` exports `thrown()` and `opens()`; `exercises.facade.test.ts`,
  `workouts.facade.test.ts`, `dev.routes.test.ts` and `scripts/build.test.ts` import them and define
  neither.
- `src/backend/features/workouts/workouts.fixtures.ts` exports
  `createSet(post, workoutId, set: CreateSetDto): Promise<LiftSetDto>`, which POSTs to
  `/api/workouts/:id/sets`, asserts `201` and returns the body. The 13 inline set POSTs that are not
  themselves under test use it; `workout.routes.test.ts:102,104` stay inline.
- `exercise.routes.test.ts:108` creates its workouts with `createWorkout(post, date)`.
- `src/frontend/testing.ts` exports `shadow`, `find`, `text`, `mount`, `type`, `choose`, `submit`,
  `settle` and `collect`, and `FakeFetch` gains `sent()`; `src/frontend/testing.test.ts` covers each.
- No frontend test file defines its own copy of those helpers. Local helpers that remain are one-offs
  or one-line wrappers built on them; the two detail views keep a local `mountView()` that stubs
  their API answers.
- `src/frontend/features/exercises/exercises.fixtures.ts` exports `exercise()` and `session()`, and
  `src/frontend/features/workouts/workouts.fixtures.ts` exports `set()`, each taking one
  `Partial<Dto>` of overrides over fixed defaults; every former copy and `gz-progress-chart`'s inline
  `SessionPointDto` literals use them.
- `isEmbedded()` in `src/backend/features/static/internal/embed.ts` leaves `*.fixtures.ts` out of
  the single-file build, and `scripts/build.test.ts` asserts a fixtures URL answers `404`.
- Left unchanged: the rejection-capture pattern (`http.test.ts` `rejection()`, `testing.test.ts:24`,
  `build.test.ts:185`), `withDev()`, `build.test.ts`'s `get()`, its per-`describe` temp directory,
  and its inline socket URL.
- No existing assertion changes, except that the 13 set POSTs and the two workout POSTs in
  `exercise.routes.test.ts`'s progress loop now assert `201`; the test count grows
  only by the new `testing.test.ts` cases.
- `docs/backend.md` and `docs/frontend.md` describe the new helpers, the fixtures and the build
  exclusion.
- `bun test --parallel`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **Scope: backend helpers, frontend DOM helpers and frontend DTO builders; not the local harness
   copies.**
   - Why: `withDev()` documents why it cannot use `useServer()`, `get()` targets a spawned process,
     and the build test's temp directory spans a `describe`, not a test.
   - Impact: those stay as they are, as does the rejection-capture pattern, whose three uses sit on
     three sides of the import boundaries.
2. **Frontend DOM helpers go into `src/frontend/testing.ts`, not a new module.**
   - Why: `isEmbedded()` already excludes exactly `/testing.ts`; a `testing/` folder would need a
     production filter change and a new import line in every test.
   - Impact: the file grows to roughly 300 lines; test files only gain imported names.
3. **Frontend DTO builders go into per-feature `<feature>.fixtures.ts`, as on the backend.**
   - Why: `docs/backend.md` keeps domain data out of the technical harness; the frontend follows.
   - Impact: `isEmbedded()` gains a `*.fixtures.ts` condition, guarded by `build.test.ts`; the
     workouts tests import `exercise()` from the exercises feature root, which no lint rule fences.
4. **Builders take one object of overrides over fixed defaults.**
   - Why: one signature fits every caller, including `gz-progress-chart`'s literals that vary in
     every field.
   - Impact: each call site passes every value its assertions read; the defaults are the values the
     copies already fix, and `gz-exercise-detail`'s unasserted `1200 + workoutId` volume goes.
5. **`createSet(post, workoutId, set: CreateSetDto)` asserts `201`.**
   - Why: the body passes straight through as the request DTO (`notes` included), and the two
     existing fixtures assert `201` too.
   - Impact: 13 call sites become slightly stricter; the two that test a `400` stay inline.
6. **`find<T>` and `mount<T>` take a type parameter used once.**
   - Why: the same convenience `$<T>` in `ui/base.ts:74-81` offers, letting a caller name the element
     type its markup produces.
   - Impact: one `no-unnecessary-type-parameters` suppression each, and `mount`'s single
     `no-unsafe-type-assertion` suppression replaces the four per-file ones.
7. **Local functions that would shadow a shared name are renamed.**
   - Why: a file cannot import `mount` and declare its own.
   - Impact: `mountView`, `mountForm`, `mountChart`, `mountTable`, `mountPager`, `mountToggle`.

## Current State

```
src/backend/testing.ts            useServer{api,post,patch}, useTempDir, body, at, tables
src/backend/features/
  exercises/exercises.fixtures.ts createExercise(post, name?)
  workouts/workouts.fixtures.ts   createWorkout(post, performedOn?)

duplicated on the backend
  thrown(fn)        exercises.facade.test.ts:6-16      workouts.facade.test.ts:8-18
  opens(socket)     dev.routes.test.ts:42-55           scripts/build.test.ts:12-25
  POST …/sets ×15   workout.routes ×9, set.routes ×2, exercise.routes ×3, stats.routes ×1

src/frontend/testing.ts           useGlobals, useFetch{requests,respondWith,respondTo,failWith},
                                  useToasts, useDom

duplicated on the frontend (component tests)
  root / childRoot / addSetRoot   gz-workout-detail, gz-exercise-detail
  query-or-throw ×~10             field ×3, exerciseSelect ×2, metric button ×2, addSetForm,
                                  detailsForm, pagination button, theme-toggle button, app link anchor
  type, settle(10)                gz-workout-detail, gz-exercise-detail (+ inline sleeps in add-set-form)
  submit / choose                 gz-workout-detail, gz-exercise-detail, gz-add-set-form
  text(host, sel)                 gz-tile, view
  create + attrs + append         gz-tile, view, gz-pagination, gz-add-set-form, gz-progress-chart,
                                  gz-session-table, gz-theme-toggle (+ cast suppression ×4)
  body event collectors           gz-pagination pageChanges, gz-add-set-form setsLogged,
                                  gz-progress-chart inline
  POST body filter                gz-workout-detail posts(), gz-add-set-form inline
  exercise() / set() / session()  two copies each, with different signatures

src/backend/features/static/internal/embed.ts:12-14
  isEmbedded(url) = !/dev/**  &&  url !== '/testing.ts'  &&  !*.test.ts
```

## Desired End State

```
src/backend/testing.ts            useServer, useTempDir, body, at, tables, thrown, opens
src/backend/features/workouts/workouts.fixtures.ts
                                  createWorkout(post, performedOn?)
                                  createSet(post, workoutId, set: CreateSetDto)

src/frontend/testing.ts           useGlobals, useFetch{…, sent}, useToasts, useDom,
                                  shadow, find, text, mount, type, choose, submit, settle, collect
src/frontend/features/exercises/exercises.fixtures.ts   exercise(overrides?), session(overrides?)
src/frontend/features/workouts/workouts.fixtures.ts     set(overrides?)

isEmbedded(url) = !/dev/**  &&  url !== '/testing.ts'  &&  !*.test.ts  &&  !*.fixtures.ts
```

A component test then reads:

```ts
import { find, mount, settle, shadow, submit, type, useDom, useFetch } from '../../testing.ts';
import { exercise } from '../exercises/exercises.fixtures.ts';
import { set } from './workouts.fixtures.ts';

const addSetForm = (view: HTMLElement): HTMLFormElement =>
  find(shadow(find(shadow(view), 'gz-add-set-form')), "form[data-action='add-set']");

test('logs a set', async () => {
  const view = await mountView();
  field(addSetForm(view), 'weight').value = '102.5';
  field(addSetForm(view), 'reps').value = '3';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toEqual([{ exerciseId: 2, weight: 102.5, reps: 3, notes: '' }]);
});
```

## Abstractions and Code Reuse

The backend helpers move verbatim. `createSet` follows `createExercise`/`createWorkout` exactly
(`TestServer['post']`, `body<T>()`, `expect(res.status).toBe(201)`) and takes `CreateSetDto` from
`src/shared/dto/set.ts` as its body. The frontend `find`/`mount` mirror `ui/base.ts`'s `$<T>`, and
`sent()` reuses the `'<METHOD> <url>'` naming of `respondTo()`.

- `src/backend/`
  - `testing.ts` - add `thrown()` (imports `HttpError`) and `opens()`
  - `features/exercises/exercises.facade.test.ts` - import `thrown`, drop the local copy
  - `features/workouts/workouts.facade.test.ts` - import `thrown`, drop the local copy
  - `features/dev/dev.routes.test.ts` - import `opens`, drop the local copy
  - `features/workouts/workouts.fixtures.ts` - add `createSet`
  - `features/workouts/workout.routes.test.ts` - 7 set POSTs → `createSet`
  - `features/workouts/set.routes.test.ts` - 2 set POSTs → `createSet`
  - `features/exercises/exercise.routes.test.ts` - 3 set POSTs → `createSet`, `:108` → `createWorkout`
  - `features/stats/stats.routes.test.ts` - 1 set POST → `createSet`
  - `features/static/internal/embed.ts` - `isEmbedded` also skips `*.fixtures.ts`
- `src/scripts/build.test.ts` - import `opens`, drop the local copy; assert a fixtures URL is `404`
- `src/frontend/`
  - `testing.ts` - add the DOM helpers and `FakeFetch.sent`
  - `testing.test.ts` - cases for each new helper
  - `features/exercises/exercises.fixtures.ts` - new; `exercise()`, `session()`
  - `features/workouts/workouts.fixtures.ts` - new; `set()`
  - `features/workouts/gz-workout-detail.component.test.ts` - shared helpers and fixtures
  - `features/workouts/internal/gz-add-set-form.component.test.ts` - shared helpers and fixtures
  - `features/exercises/gz-exercise-detail.component.test.ts` - shared helpers and fixtures
  - `features/exercises/internal/gz-progress-chart.component.test.ts` - shared helpers and `session()`
  - `features/exercises/internal/gz-session-table.component.test.ts` - shared helpers and `session()`
  - `ui/tile/gz-tile.component.test.ts` - shared `mount`, `text`
  - `ui/view.test.ts` - shared `mount`, `text`
  - `ui/pagination/gz-pagination.component.test.ts` - shared `mount`, `collect`
  - `app/gz-theme-toggle.component.test.ts` - shared `mount`, `find`, `shadow`
  - `app/gz-app.component.test.ts` - shared `mount`, `settle(0)`, `find`, `shadow`
- `docs/backend.md` - the `testing.ts` paragraph and the embed exclusion list
- `docs/frontend.md` - the Tests section

## Logging & Observability

None; this is a test-only refactor plus one build filter condition.

## Implementation

### Phase 1: Backend helpers and `createSet`

Dependencies: None

Move the two duplicated backend helpers into the harness and give sets a fixture.

**Tasks**:

- [x] `src/backend/testing.ts`: add `thrown()` and `opens()`, moved verbatim from
      `exercises.facade.test.ts:6-16` and `dev.routes.test.ts:42-55` (keeping `opens`'s doc comment); import
      `HttpError` from `./http/errors.ts`. Give `thrown` a doc comment: "Runs `fn` and returns the
      `HttpError` it throws, failing the test if it throws nothing or something else."
- [x] `src/backend/features/exercises/exercises.facade.test.ts` and
      `src/backend/features/workouts/workouts.facade.test.ts`: import `thrown` from `../../testing.ts`,
      delete the local function and the now-unused `HttpError` import.
- [x] `src/backend/features/dev/dev.routes.test.ts`: import `opens` from `../../testing.ts`, delete
      the local function. `withDev`, `socketUrl` and `occurrences` stay.
- [x] `src/scripts/build.test.ts`: import `opens` alongside `body, useTempDir` from
      `../backend/testing.ts`, delete the local function.
- [x] `src/backend/features/workouts/workouts.fixtures.ts`: add
      ```ts
      export async function createSet(post: TestServer['post'], workoutId: WorkoutId, set: CreateSetDto): Promise<LiftSetDto> {
        const res = await post(`/api/workouts/${workoutId}/sets`, set);
        expect(res.status).toBe(201);
        return body<LiftSetDto>(res);
      }
      ```
      importing `WorkoutId` from `../../../shared/flavors.ts` and `CreateSetDto`, `LiftSetDto` from
      `../../../shared/dto/set.ts`.
- [x] `src/backend/features/workouts/workout.routes.test.ts`: replace the set POSTs at `:25`, `:34`,
      `:35`, `:66`, `:67`, `:84-89`, `:90` with `createSet(post, workout.id, { exerciseId: exercise.id, … })`
      (`source.id` at `:34-35`); `:25` keeps its `const set =` and drops `body<LiftSetDto>(…)`. Keep
      `:102` and `:104` inline. Drop the `LiftSetDto` import if unused.
- [x] `src/backend/features/workouts/set.routes.test.ts`: replace `:14` and `:27` with
      `const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 })`.
- [x] `src/backend/features/exercises/exercise.routes.test.ts`: replace `:67` with `createSet`; in
      the loop at `:104-111`, use `const workout = await createWorkout(post, date)`, push
      `await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight })` and call
      `createSet` for the lighter set. Drop the `WorkoutWithSetsDto` import if unused.
- [x] `src/backend/features/stats/stats.routes.test.ts`: replace `:13` with `createSet`.
- [x] `docs/backend.md` (paragraph at line 72): list `testing.ts`'s hooks as `useServer()`,
      `useTempDir()`, `body()`, `at()`, `tables()`, `thrown()` and `opens()`, and add `createSet` in
      `workouts/workouts.fixtures.ts` beside `createWorkout`.

**Automated Verification**:

- [x] `bun test --parallel src/backend src/scripts` passes with the same number of tests as before
- [x] `rg -n "function (thrown|opens)\(" src --glob "*.test.ts"` finds nothing
- [x] A search for `}/sets` in `src/backend/**/*.test.ts` finds only `workout.routes.test.ts:102,104`
      (the two `400` cases)
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

### Phase 2: Frontend DOM helpers

Dependencies: None

Add the shared DOM helpers to the frontend harness and rewrite the component tests on them.

**Tasks**:

- [x] `src/frontend/testing.ts`: add, each with a one-line doc comment:
      ```ts
      /** The open shadow root of `host`, failing the test if it has none. */
      export function shadow(host: Element): ShadowRoot  // throws `${host.localName} has no shadow root`

      // Same once-used type parameter as ui/base.ts's $<T>, for the same reason.
      // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
      export function find<T extends Element = Element>(root: ParentNode, selector: string): T
                                                           // throws `nothing matches ${selector}`

      export function text(host: Element, selector: string): string | undefined
                                                           // host.shadowRoot?.querySelector(selector)?.textContent

      /** Creates `tag` with `attributes` set before it is appended to the body, so its first render
       *  shows them: happy-dom skips attributeChangedCallback for attributes present at upgrade. */
      // oxlint-disable-next-line typescript/no-unnecessary-type-parameters
      export function mount<T extends HTMLElement = HTMLElement>(tag: string, attributes: Record<string, string> = {}): T
                                                           // one no-unsafe-type-assertion suppression on the cast

      export function type(input: HTMLInputElement, value: string): void     // value + bubbling 'input'
      export function choose(select: HTMLSelectElement, value: string): void // value + bubbling 'change'
      export function submit(form: Element): void          // bubbling, cancelable 'submit'

      /** Long enough for a view's requests, all answered at once by useFetch(), to land and render. */
      export async function settle(ms = 10): Promise<void>

      /** The details of each `event` CustomEvent heard on the body, outside every shadow root. */
      export function collect(event: string): unknown[]
      ```
- [x] `src/frontend/testing.ts`: add to `FakeFetch` and `useFetch()`
      `sent: (request: string) => unknown[]` — the bodies of the recorded requests named
      `'<METHOD> <url>'`, documented beside `respondTo`.
- [x] `src/frontend/testing.test.ts`: add a `describe('DOM helpers')` under `useDom()` covering:
      `shadow` returns an open root and throws naming the tag without one; `find` returns the match
      and throws naming the selector; `mount` sets attributes before `connectedCallback` sees them and
      appends to the body; `type`/`choose`/`submit` fire bubbling `input`/`change`/cancelable `submit`;
      `collect` records `CustomEvent` details dispatched on a child; `text` reads from the shadow root.
      Add a `useFetch` case: `sent('POST /api/x')` returns only the bodies of matching requests.
- [x] `gz-workout-detail.component.test.ts`: import the helpers and delete the local `settle`,
      `root`, `type`, `choose` and `submit`; `posts(url)` call sites become `fake.sent('POST <url>')`.
      Rename `mount` to `mountView` (stubs both answers, then shared
      `mount('gz-workout-detail', { 'workout-id': '3' })` and `settle()`). `addSetRoot`, `addSetForm`,
      `detailsForm`, `field` and `exerciseSelect` stay as one-line wrappers over `find`/`shadow`;
      `choose(view, v)` call sites become `choose(exerciseSelect(view), v)`. `focused` stays as is,
      and so does the "no POST at all" filter at `:198`. The 404 test at `:223-233` uses shared
      `mount(...)` and `settle()`.
- [x] `gz-exercise-detail.component.test.ts`: same treatment: delete `settle`, `root`, `type`;
      `childRoot` becomes `shadow(find(shadow(view), tag))`; `metricButton`, `field` become wrappers
      over `find`; `submitDetails(view)` becomes `submit(find(shadow(view), "form[data-action='save-exercise']"))`;
      `mount` → `mountView`; the 404 test uses `mount(...)` and `settle()`.
- [x] `gz-add-set-form.component.test.ts`: `mount` → `mountForm` on shared `mount<GzAddSetFormComponent>`;
      `field`, `exerciseSelect` over `find`/`shadow`; local `submit` deleted, call sites
      `submit(find(shadow(form), 'form'))`; `:100-102` → `choose(exerciseSelect(form), '1')`;
      `setsLogged()` → `collect('set-logged')` with `.toHaveLength(n)`; `Bun.sleep(10)` → `settle()`;
      the POST filter at `:113-115` stays as it is, because it asserts that no other URL was posted to.
- [x] `gz-progress-chart.component.test.ts`: `mount` → `mountChart` on shared `mount`; `button`
      over `find`/`shadow`; the inline listener at `:54-59` → `collect('metric-change')`.
- [x] `gz-session-table.component.test.ts`: `mount` → `mountTable` on shared `mount`.
- [x] `gz-tile.component.test.ts`: delete `mount` and `text`, use the shared ones directly.
- [x] `view.test.ts`: `mount` → `mountView` (resets `pending`, then shared `mount<TestView>('gz-test-view', attributes)`);
      delete `text`.
- [x] `gz-pagination.component.test.ts`: `mount` → `mountPager` on shared `mount` with
      `page`/`pages`/`noun` attributes; `pageChanges()` → `collect('page-change')`; `button` keeps its
      text match.
- [x] `gz-theme-toggle.component.test.ts`: `mount` → `mountToggle`, returning
      `find<HTMLButtonElement>(shadow(mount('gz-theme-toggle')), 'button')`.
- [x] `gz-app.component.test.ts`: `settle` deleted, call sites `settle(0)`; `mountApp` uses shared
      `mount('gz-app')`; `link` keeps its attribute loop (it appends into the app's `<main>`, not the
      body) and finds the anchor with `find<HTMLAnchorElement>(shadow(host), 'a')`.
- [x] `docs/frontend.md` (Tests section, after the paragraph on the three stubs): describe the DOM
      helpers — `mount()` sets attributes before appending for the happy-dom reason already given,
      `shadow()`/`find()` fail the test instead of returning null, `type`/`choose`/`submit` dispatch
      the events a user's input would, `settle()` waits for faked requests to render, `collect()`
      hears composed events on the body, and `sent()` reads back request bodies by the same
      `'<METHOD> <url>'` name as `respondTo()`.

**Automated Verification**:

- [x] `bun test --parallel src/frontend` passes; the count grows only by the new `testing.test.ts` cases
- [x] `rg -n "^(async )?function (settle|root|type|text|submit|choose|childRoot|pageChanges|setsLogged|posts)\(" src/frontend --glob "*.test.ts"` finds nothing
- [x] `rg -n "no-unsafe-type-assertion -- registered in beforeAll" src/frontend` finds nothing
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

### Phase 3: Frontend DTO fixtures

Dependencies: Phase 1 (`build.test.ts`) and Phase 2 (the same component test files are edited)

Move the DTO builders into per-feature fixtures and keep those out of the build.

**Tasks**:

- [x] `src/backend/features/static/internal/embed.ts`: `isEmbedded` also returns false for
      `url.endsWith('.fixtures.ts')`; doc comment becomes "Hot reload is off in a built file, and
      tests and their fixtures never ship."
- [x] `src/scripts/build.test.ts`: add `'/features/exercises/exercises.fixtures.ts'` to the URL list
      of "carries neither the dev client nor anything test-only" (`:143`). Before that loop, assert
      `await Bun.file(join(FRONTEND, 'features', 'exercises', 'exercises.fixtures.ts')).exists()` is
      `true`, so the `404` proves the exclusion rather than a missing or misspelled file.
- [x] `src/frontend/features/exercises/exercises.fixtures.ts`: new, with the doc comment
      `/** Test-only. Exercise data for any feature's component tests; never embedded in the build. */`:
      ```ts
      export function exercise(overrides: Partial<ExerciseDto> = {}): ExerciseDto {
        return { id: 1, name: 'Bench Press', muscleGroup: null, notes: null, createdAt: '2026-08-01T10:00:00Z', ...overrides };
      }

      export function session(overrides: Partial<SessionPointDto> = {}): SessionPointDto {
        return { workoutId: 1, performedOn: '2026-09-01', setCount: 3, totalReps: 15, totalVolume: 1200, topWeight: 80, estOneRepMax: 90, ...overrides };
      }
      ```
- [x] `src/frontend/features/workouts/workouts.fixtures.ts`: new, same doc comment shape:
      ```ts
      export function set(overrides: Partial<LiftSetDto> = {}): LiftSetDto {
        const id = overrides.id ?? 1;
        return { id, workoutId: 3, exerciseId: 1, exerciseName: '', reps: 5, weight: 60, notes: null, position: id, createdAt: '2026-09-20T10:00:00Z', ...overrides };
      }
      ```
- [x] `gz-workout-detail.component.test.ts`: delete `exercise`/`set`; `exercise({ id: 1, name: 'Bench Press' })`,
      `exercise({ id: 2, name: 'Back Squat' })`, `exercise({ id: 9, name: 'Incline Press' })`;
      `set({ id: 11, exerciseId: 1, exerciseName: 'Bench Press', weight: 80 })`, `…12…82.5`,
      `set({ id: 13, exerciseId: 2, exerciseName: 'Back Squat', weight: 100 })`.
- [x] `gz-add-set-form.component.test.ts`: delete `exercise`/`set`; `exercise({ id: 1, name: 'Bench Press' })`,
      `exercise({ id: 2, name: 'Back Squat' })`; `set({ id: 11, exerciseId: 1, weight: 80, reps: 5 })`,
      `set({ id: 12, exerciseId: 1, weight: 82.5, reps: 4 })`, `set({ id: 13, exerciseId: 2, weight: 100, reps: 6 })`.
- [x] `gz-exercise-detail.component.test.ts`: delete `session`; `SESSIONS` becomes
      `session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 })`, `…2…'2026-09-08'…95`,
      `…3…'2026-09-15'…92.5`; `progress()` stays local and builds its exercise with
      `exercise({ id: 7, name: 'Bench Press', muscleGroup: 'Chest' })`.
- [x] `gz-session-table.component.test.ts`: delete `session`; calls pass `workoutId`,
      `performedOn: '2026-09-0N'` and `estOneRepMax` explicitly.
- [x] `gz-progress-chart.component.test.ts`: `SESSIONS` becomes
      `[session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 }), session({ workoutId: 2, performedOn: '2026-09-08', setCount: 4, totalReps: 20, totalVolume: 1700, topWeight: 85, estOneRepMax: 95 })]`.
- [x] `docs/backend.md` (embed paragraph at line 268): the excluded files become `dev/**`,
      `testing.ts`, `*.test.ts` and `*.fixtures.ts`.
- [x] `docs/frontend.md` (Tests section): add that domain test data lives in each feature's
      `<feature>.fixtures.ts` — `exercise()` and `session()` in exercises, `set()` in workouts — as
      builders taking overrides over fixed defaults, mirroring the backend's fixtures, and that the
      build leaves them out.

**Automated Verification**:

- [x] `bun test --parallel` passes, including `scripts/build.test.ts`'s fixtures `404` case
- [x] `rg -n "^function (exercise|set|session)\(" src/frontend --glob "*.test.ts"` finds nothing
- [x] `rg -n "SessionPointDto" src/frontend/features/exercises/internal/gz-progress-chart.component.test.ts`
      finds nothing
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Phases 2 and 3 were done in one pass, so each component test was rewritten once; their checks all ran against the combined result.
- `gz-exercise-detail`'s `submitDetails(view)` stays as a one-line wrapper over `submit(find(...))`, since two tests call it. `childRoot` is inlined into `chartRoot`/`tableRoot`.
- `gz-app`'s comment on why `settle(0)` suffices moved into `mountApp()`.
- Test count: 355 before, 366 after (the 11 new `testing.test.ts` cases).

## References

- `docs/agents/research/2026-10-01-duplicate-test-helpers.md`
- `docs/agents/plans/2026-09-12-feature-test-fixtures.md`
- `src/backend/testing.ts`, `src/frontend/testing.ts`
- `src/backend/features/static/internal/embed.ts`
- `src/frontend/ui/base.ts:74-86`
- `docs/backend.md`, `docs/frontend.md`
