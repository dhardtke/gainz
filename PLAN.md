# Plan: JSDoc types for the frontend

## Context

`public/` is a no-build-step frontend: plain ES modules and custom elements that the browser
loads exactly as written. That has kept it dependency-free, but nothing verifies the shapes
flowing through it. `bun run typecheck` covers the backend only — `tsconfig.json` has
`"include": ["src", "test"]` and `"checkJs": false` — so the eleven components pass workouts,
sets and exercises around as untyped objects. Rename a column in `src/repo.ts` and the
frontend fails as a blank cell in the browser rather than as an error in CI.

Every module already carries prose JSDoc, and it is good prose; what none of it carries is a
single type tag (a repo-wide grep for `@param|@returns|@typedef|@type` returns zero real hits).
This change adds a type layer to the documentation that is already there, and puts `tsc`
behind it so the annotations cannot rot.

Two decisions are settled:

- **Standalone typedefs.** `public/` declares its own entity shapes in a new
  `public/js/types.js`. It does not reach into `src/repo.ts`. The frontend stays
  self-contained, at the cost of shapes that must be kept in step with the backend by hand.
- **Enforced.** `tsconfig.json` gets `"checkJs": true` and `"public"` in `include`, so
  `bun run typecheck` fails on a bad annotation.

Nothing about the runtime changes in principle. JSDoc is comments, `types.js` is an empty
module, and the browser is served the same bytes it is served today — with one exception in
`base.js`, called out under Risks.

## Baseline

`tsc` run over `public/` with the project's compiler options today reports **260 errors in 16
of the 18 files** (`main.js` and `gz-stat-tile.js` are already clean). That is the work:

| Count | Code             | What it is                                                                           |
| ----- | ---------------- | ------------------------------------------------------------------------------------ |
| 121   | TS7006/7019/7031 | implicit `any` parameters — the bulk, and mechanical                                 |
| 67    | TS2339           | property missing on `{}` / `never` / `{status: string}` — untyped state and entities |
| 16    | TS2531           | `this.shadowRoot` is `ShadowRoot \| null`                                            |
| 7     | TS18046          | `catch (error)` is `unknown`                                                         |
| 7     | TS2353           | state object literals not assignable to the inferred initial shape                   |
| 4 + 4 | TS7032/7008      | setters and private array fields without a type                                      |
| 4     | TS7053           | index access on an object literal (`ESCAPES[char]`, `params[key]`)                   |
| ~30   | misc             | `noUncheckedIndexedAccess` on `match[i]`, `route.params.id`, `values.name`           |

Per file, worst first: `gz-workout-detail` 43, `gz-set-row` 34, `base.js` 31, `api.js` 28,
`gz-workout-list` 23, `gz-exercise-detail` 23, `gz-exercise-list` 18, `format.js` 12,
`gz-toast` 10, `gz-dashboard` 8, `gz-chart` 8, `gz-app` 6, then `theme.js`, `styles.js`,
`router.js` and `gz-theme-toggle` at 4 each.

The backend typechecks clean today and stays clean: `checkJs` only affects `.js`, and `src/`
and `test/` are TypeScript. `bun-types` alongside the DOM lib was verified to produce no
conflict — the error count is identical with and without `--types bun-types`.

## The convention

One idiom everywhere, so the codebase reads consistently:

- Shapes shared by more than one module live in `public/js/types.js` as `@typedef`.
- A module that uses them pulls them in with a single `@import` line at the top, next to the
  real imports. TypeScript 5.9 supports this and it stays out of the way:

  ```js
  import { api } from "../../js/api.js";
  import { define, GzElement, html } from "../../js/base.js";

  /** @import { ExerciseWithStats, LiftSet, WorkoutWithSets } from "../../js/types.js" */
  ```

- Shapes used by exactly one module (a view's `#state`, the chart's scale) are declared
  `@typedef` in that module, above the class.
- **Type tags do not displace the prose.** Where a block comment explains _why_, the tags go
  after it in the same block. Short one-line comments stay one-line and grow a separate tag
  block only where the type is not obvious from the name.

## 1. `public/js/types.js`

A real `.js` module rather than a `.d.ts`: it sits in a directory of hand-written ES modules
with no build step, and a `.d.ts` there would be the only file in `public/` the browser could
not execute. It ends with `export {};` so it is a module, and nothing ever imports it at
runtime — `@import` lives in a comment and is erased. (The static server will hand out
`/js/types.js` if asked, the same as any file under `public/`; it is a few hundred bytes of
comments and is never requested.)

Entities mirror `src/repo.ts` exactly. Composition uses intersections rather than repeating
fields:

```js
/**
 * The shapes the gainz REST API returns, written out for the frontend.
 *
 * These mirror the interfaces in `src/repo.ts` by hand — `public/` is served to
 * the browser as-is and does not reach into the server's source. Changing a
 * column there means changing it here; `bun run typecheck` will not catch the
 * drift for you.
 */

/**
 * @typedef {object} Exercise
 * @property {number} id
 * @property {string} name
 * @property {string | null} muscle_group
 * @property {string | null} notes
 * @property {string} created_at
 */

/**
 * @typedef {Exercise & {
 *   set_count: number,
 *   workout_count: number,
 *   last_performed_on: string | null,
 *   best_weight: number | null,
 * }} ExerciseWithStats
 */

/**
 * @typedef {object} LiftSet
 * @property {number} id
 * @property {number} workout_id
 * @property {number} exercise_id
 * @property {string} exercise_name
 * @property {number} reps
 * @property {number} weight
 * @property {string | null} notes
 * @property {number} position
 * @property {string} created_at
 */

/** @typedef {Workout & { sets: LiftSet[] }} WorkoutWithSets */

/**
 * @typedef {object} WorkoutPage
 * @property {WorkoutWithStats[]} items
 * @property {number} total
 * @property {number} limit
 * @property {number} offset
 */

/**
 * @typedef {object} ExerciseProgress
 * @property {Exercise} exercise
 * @property {SessionPoint[]} sessions
 * @property {(LiftSet & { performed_on: string }) | null} best_set
 */

export {};
```

Full list to declare: `Exercise`, `ExerciseWithStats`, `Workout`, `WorkoutWithStats`,
`WorkoutWithSets`, `LiftSet`, `SessionPoint`, `Summary`, `WorkoutPage`, `ExerciseProgress`,
`ExerciseInput`, `WorkoutInput`, `SetInput`. Field-for-field from `src/repo.ts:4-74`, plus
`Summary` from `Repo.summary()` (`workout_count`, `set_count`, `total_reps`, `total_volume`,
`exercise_count`, `last_performed_on: string | null`, `workouts_last_30_days`,
`volume_last_30_days`).

Encode the create/update asymmetry: `workouts.create` and `workouts.get` return
`WorkoutWithSets`, `workouts.update` returns plain `Workout`. `gz-workout-list.js:60` reads
`workout.sets.length` off a create result and would break if that were flattened.

## 2. `public/js/api.js`

`request` is the one place where an unchecked cast is honest — it hands back whatever the
server sent. Make it generic so every `api.*` method names its own return type and call sites
get real types for free:

```js
/**
 * @template T
 * @param {"GET" | "POST" | "PATCH" | "DELETE"} method
 * @param {string} path
 * @param {unknown} [body]
 * @returns {Promise<T>} whatever the endpoint returns; `null` for a 204.
 */
async function request(method, path, body) {
```

The four helpers thread the parameter through:

```js
/** @type {<T>(path: string) => Promise<T>} */
const get = (path) => request("GET", path);
```

Methods are arrow functions in an object literal, so the tag block goes on the property:

```js
export const api = {
  /** @returns {Promise<Summary>} */
  summary: () => get("/stats/summary"),

  workouts: {
    /**
     * @param {{ limit?: number, offset?: number }} [page]
     * @returns {Promise<WorkoutPage>}
     */
    list: ({ limit = 50, offset = 0 } = {}) => get(`/workouts?limit=${limit}&offset=${offset}`),

    /** @returns {Promise<WorkoutWithSets>} */
    create: (input) => post("/workouts", input),

    /** @returns {Promise<Workout>} the header only — no `sets`. */
    update: (id, patchBody) => patch(`/workouts/${id}`, patchBody),
  },
};
```

`ApiError` needs its three fields declared so `error.status` narrows at call sites:

```js
export class ApiError extends Error {
  /**
   * @param {string} message
   * @param {number} status HTTP status, or 0 when the request never left.
   * @param {unknown} details
   */
  constructor(message, status, details) {
```

## 3. `public/js/base.js`

Four things here, in order of how much they buy:

**`this.shadowRoot` (16 errors).** `Element.shadowRoot` is `ShadowRoot | null` and stays that
way however the constructor is written. Do **not** redeclare `shadowRoot` as a JSDoc-typed
class field — a class field shadows the inherited accessor with `undefined` at runtime and
breaks the app. Instead keep the shadow root in a private field:

```js
export class GzElement extends HTMLElement {
  /** @type {ShadowRoot} */
  #root;

  constructor() {
    super();
    this.#root = this.attachShadow({ mode: "open" });
    // …
  }

  /** The component's shadow root, non-null from the constructor onward. */
  get root() {
    return this.#root;
  }
```

`base.js` then uses `this.#root` internally and all 16 nulls disappear.
`gz-workout-detail.js:30` is the only use outside the base class and becomes
`this.root.addEventListener("sets-changed", …)`.

**The duck-typed hooks.** `handleAction`, `handleSubmit` and `afterRender` are called through
`?.` on the base class but only ever defined by subclasses, so TS reports "Property does not
exist". Declare them as optional members on `GzElement`:

```js
/**
 * Subclass hooks. Declared here so the base class may call them; each is
 * optional and none is defined on `GzElement` itself.
 *
 * @type {((action: string, element: HTMLElement, event: Event) => void) | undefined}
 */
handleAction;
```

Careful: writing `handleAction;` **is** a class field and initialises to `undefined`. That is
harmless here — there is no inherited member to shadow and the base class already tests with
`?.` — but it must be confirmed in the browser. If it misbehaves, the fallback is an
`@typedef` for the hook signature plus a `/** @type {GzElement & Hooks} */` cast at the three
call sites inside the constructor and `render()`: more local, no runtime field at all.

**`html` and friends.**

```js
/**
 * @param {TemplateStringsArray} strings
 * @param {...unknown} values
 * @returns {RawHtml}
 */
export function html(strings, ...values) {
```

`interpolate` needs an explicit `@returns {string}` because it recurses (TS7023).
`escapeHtml`'s `ESCAPES[char]` needs the map typed `@type {Record<string, string>}`, and
`noUncheckedIndexedAccess` then makes the lookup `string | undefined` — use
`(char) => ESCAPES[char] ?? char`, which is also a genuine (if unreachable) correctness fix.
`strings[i + 1]` in the loop hits the same rule; `?? ""` is the honest guard.

**`$` / `$$` generic**, so views can ask for the element type they expect without a cast:

```js
  /**
   * @template {Element} [T=Element]
   * @param {string} selector
   * @returns {T | null}
   */
  $(selector) {
    return this.#root.querySelector(selector);
  }
```

**`formData`** returns `Record<string, string>`, with the body skipping non-string entries
(the app has no file inputs, so this changes no behaviour and makes the type honest). Under
`noUncheckedIndexedAccess` a `Record` lookup is `string | undefined`, so each of the four call
sites names the fields of its own form — which doubles as documentation of the form contract:

```js
const values = /** @type {{ name: string, muscle_group: string, notes: string }} */ (this.formData(form));
```

**`define`** takes `@param {string} name` and `@param {CustomElementConstructor} ctor`.

## 4. Components

The same pattern in all eleven; the specifics below are the ones that are not mechanical.

**View state as a discriminated union.** Every view holds `#state` and every `template()`
already early-returns on `status`, which is exactly the shape TypeScript narrows:

```js
/**
 * @typedef {{ status: "loading" }
 *   | { status: "ready", workout: WorkoutWithSets }
 *   | { status: "error", message: string }} WorkoutDetailState
 */

class GzWorkoutDetail extends GzElement {
  /** @type {WorkoutDetailState} */
  #state = { status: "loading" };
```

One consequence: `gz-workout-detail.js:142` reads `this.#state.workout?.sets` in
`afterRender()` without narrowing first. Add the same guard `gz-exercise-detail` already uses
— `if (this.#state.status !== "ready") return;` — rather than weakening the type.

**`catch (error)`** is `unknown`. The narrowing is the same everywhere and is a real
robustness fix, not just a type fix:

```js
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.#state = { status: "error", message };
      if (!(error instanceof ApiError) || error.status !== 404) toastError(error);
    }
```

`toastError` takes `@param {unknown} error` and does the same test internally.

**Element handles.** `document.createElement("gz-chart")` and `this.$("gz-chart")` return
`HTMLElement`/`Element`, but `gz-exercise-detail` assigns `.series`/`.unit` and
`gz-workout-detail` assigns `.set`/`.exercises`/`.index`. Export the two classes that have a
property API — `export class GzChart` and `export class GzSetRow`, alongside the existing
`await define(…)` — and cast at the point of use:

```js
/** @import { GzChart } from "../gz-chart/gz-chart.js" */

const chart = /** @type {GzChart | null} */ (this.$("gz-chart"));
```

Exporting the class adds a new export to a module whose only job so far was the side effect,
so keep the `await define(…)` line last and unchanged — the load-bearing top-level await
documented in `docs/frontend.md` must not move. The other nine components keep their classes
private.

**Setters.** Write-only accessors are legal; the tag goes on the setter:

```js
  /** @param {LiftSet} value */
  set set(value) {
```

`gz-chart` needs `@typedef {{ label: string, value: number, hint?: string }} ChartPoint`, its
`#series` typed `@type {ChartPoint[]}`, and `#scale()`'s returned closures annotated.

**`session[metric.key]`** in `gz-exercise-detail` indexes a `SessionPoint` with a union key.
Type the table so the key is a union rather than `string`:

```js
/** @typedef {"est_one_rep_max" | "top_weight" | "total_volume"} MetricKey */

/** @type {{ key: MetricKey, label: string, unit: string, hint: string }[]} */
const METRICS = [/* … */];
```

`METRICS[0]` is then `… | undefined` under `noUncheckedIndexedAccess`; the existing
`?? METRICS[0]` fallback needs one more step — hoisting a `DEFAULT_METRIC` guarded once, or
typing the table as a non-empty tuple.

**`route.params.id`** is `string | undefined` (index signature). `gz-app.js:67,76` passes it
straight to `setAttribute`, which wants a `string` — use `route.params.id ?? ""`, or type
`Route["params"]` per route name if that proves clean.

**`gz-toast`** assigns `this.onToast` dynamically in `connectedCallback`; declare it as a
typed field on the class. Also `@typedef {"info" | "success" | "error"} ToastKind` and use it
for `toast(message, kind)` and the item list.

**`theme.js`** exports `THEMES` — type it `@type {readonly ["light", "dark"]}` so `setTheme`
can take `@param {"light" | "dark"} theme` and `THEMES.includes(stored)` narrows the
`string | null` coming out of `localStorage`.

**`router.js`**: `@typedef` the route-name union and the `Route` shape; `params[key]` and
`match[index + 1]` need the `noUncheckedIndexedAccess` guard.

## 5. Config and order of work

`tsconfig.json`:

```json
  "checkJs": true,
  "include": ["src", "test", "public"]
```

Work bottom-up so each step can be verified before the next. `bunx tsc --noEmit` reports
errors in unconverted files throughout, so the check at each step is "no errors in the files
touched so far" until the last step, where the whole run must be clean.

1. `public/js/types.js` — new file, nothing depends on it yet.
2. The leaf shared layer: `format.js`, `theme.js`, `styles.js`, `router.js` (24 errors).
3. `api.js` (28) — unlocks real types in every view.
4. `base.js` (31) — the `#root` refactor plus the hooks; touches `gz-workout-detail.js:30`.
5. Small components: `gz-stat-tile` (already clean, annotate anyway), `gz-theme-toggle`,
   `gz-toast`, `gz-chart`, `gz-app`, `gz-dashboard` (36 total).
6. The big views: `gz-exercise-list`, `gz-workout-list`, `gz-exercise-detail`, `gz-set-row`,
   `gz-workout-detail` (113 total).
7. Flip `checkJs` and `include` in `tsconfig.json`; get the whole run clean.

Flipping the config last keeps `bun run typecheck` green on `main` at every commit, which
suits committing directly to `main`. Reasonable commits: one for `types.js` plus the shared
layer, one for `base.js`, one for the small components, one for the big views, and a final one
for the config and the docs.

## 6. Docs

- `README.md` line 27, script table: `bun run typecheck` — "Type-checks the backend" becomes
  "Type-checks the backend and the frontend's JSDoc types".
- `AGENTS.md` line 15 (`CLAUDE.md` is a symlink to it):
  `bun run typecheck        # typechecking (src + test)` becomes `(src + test + public)`.
- `README.md`'s `## Layout` section lists every `public/` file; add `js/types.js`.
- `docs/frontend.md` gains a short paragraph, in the voice of the file:

  > The frontend is typed in JSDoc and checked by `bun run typecheck` — `tsconfig.json` turns
  > on `checkJs` for `public/`. The API's shapes are declared in `js/types.js` and pulled in
  > with `/** @import { … } from "../../js/types.js" */`; they mirror the interfaces in
  > `src/repo.ts` by hand, because `public/` is served to the browser as-is and never reaches
  > into the server's source. Shapes local to one module — a view's `#state` union, the
  > chart's points — are declared in that module.

## 7. Verification

```sh
bun run typecheck   # must be clean: 0 errors across src, test and public
bun test            # API suite; unaffected, but proves nothing regressed
bun run lint        # oxlint over the repo
bun run fmt:check   # oxfmt did not want to reflow the new comment blocks
```

None of the above executes a line of frontend code, and the two runtime-visible edits (`#root`,
the declared hook fields) live in the base class every component extends. So run the app:

```sh
bun run seed && bun start   # http://localhost:3000
```

Click through every view and confirm each still paints and works: the dashboard tiles; the
workout list with "load more" paging and creating a session; a workout's detail — add a set,
edit it, duplicate it, delete it, edit the header; the exercise list with add and edit; an
exercise's progress page with all three metric buttons swapping the chart. Toggle the theme
both ways, and check the browser console is clean. An un-upgraded custom element fails
silently — exactly what `docs/frontend.md` warns about — so a blank view is the failure mode
to watch for.

## Risks

- **`base.js` is the one place where the types force a runtime change.** The `#root` field and
  the declared hook fields are the only edits here that alter emitted behaviour, and they sit
  in the class all eleven components extend. If the declared-field form of the hooks causes
  trouble, fall back to the cast form described in section 3.
- **`types.js` can drift from `src/repo.ts` silently.** That is the accepted cost of keeping
  `public/` self-contained; the comment at the top of the file says so, and the API tests
  still cover the server's side of the contract.
- **`noUncheckedIndexedAccess` is the noisiest rule here** — roughly thirty of the errors come
  from it. Each wants a real guard rather than a cast; where a guard would be pure noise,
  prefer restructuring the data (a tuple type for `METRICS`) over a `/** @type */` escape.
- Effort is around 260 errors across 18 files, most of them mechanical `@param` tags.
