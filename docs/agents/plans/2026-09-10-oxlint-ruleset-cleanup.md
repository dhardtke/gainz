---
date: 2026-09-10
git_commit: e86221a2d97be6f47ec1620107dc073c8d97ec4b
branch: main
topic: "Clear the remaining oxlint type-aware violations"
tags: [plan, oxlint, typescript, frontend, backend, tests]
status: implemented
---

# PLAN: Clear the remaining oxlint type-aware violations

The oxlint ruleset in the working tree (`.oxlintrc.json`, uncommitted) turns on the full
`typescript/*` type-aware set. `bun run lint` currently reports **161 errors across 25 files**.
The ruleset stays exactly as it is; the code changes to satisfy it.

Every fix below was probed against `bunx oxlint <file>` and `bunx tsc --noEmit` in throwaway files
before being written down, so the shapes in this plan are known to pass rather than assumed to.

## Acceptance Criteria

- [x] `bun run lint` exits 0 with every rule still enabled at `error`. One rule gained an option at
      the user's request — `strict-boolean-expressions` with `allowNullableString` — which replaced
      the `hasText`/`emptyToNull` helpers this plan first reached for.
- [x] `bun run typecheck` exits 0.
- [x] `bun test` passes.
- [x] `bun run fmt:check` passes.
- [x] At most the three `oxlint-disable-next-line` comments listed below, each with a reason.
      Exactly three were added, at the three predicted places.
- [x] No behavioural change to the API or the UI, except the two deliberate ones called out under
      *Technical Key Decisions* (defensive `Number()` coercions removed; empty summary rows now
      throw instead of silently answering `{}`).

## Current State

```
 rule                                count   where
 explicit-function-return-type          31   template()/partials, arrow helpers, main()
 no-unsafe-member-access                29   test/api.test.ts (await res.json() is `any`)
 strict-boolean-expressions             20   nullable string/boolean truthiness checks
 no-unsafe-type-assertion               15   `as string` ids, formData casts, api.ts, sql.ts
 no-unsafe-assignment                   13   test/api.test.ts, public/js/api.ts
 explicit-module-boundary-types         10   exported functions and public methods
 no-misused-promises                     8   async connectedCallback, signal handlers
 strict-void-return                      8   same sites as above
 no-unnecessary-type-conversion          8   redundant Number() on values already numbers
 non-nullable-type-assertion-style       6   `this.#workoutId as string`
 no-unsafe-argument                      4   toast detail, tests
 no-unnecessary-type-parameters          2   GzElement.$, buildUpdate's F
 parameter-properties                    1   RawHtml
 no-unsafe-call / no-unsafe-return       2   tests, api.ts
 no-explicit-any                         1   api.ts
 no-unnecessary-condition                1   gz-chart's unit setter
 switch-exhaustiveness-check             1   gz-app's route switch
 prefer-nullish-coalescing               1   gz-workout-list
```

Three clusters produce most of the noise, and each has one root cause:

1. **`await res.json()` is `any`** — Bun types `Body.json()` as `Promise<any>` (there is no generic
   overload), so every read of a response body in `test/api.test.ts` spreads `any` through 45
   errors, and `public/js/api.ts` funnels the same `any` through its `request()` helper.
2. **Nullable strings are checked for truthiness** — `if (!iso)`, `${notes ? … : ""}`,
   `values.title || null`. The rule allows plain `string`, so only the nullable sites are flagged.
3. **`#workoutId as string` / `formData(form) as { … }`** — assertions standing in for narrowing.

## Desired End State

The same code, with the places that quietly trusted a value now saying so in types:

- one text-predicate pair (`hasText` / `emptyToNull`) used by every nullable-string check in
  `public/`;
- ids narrowed once by a private getter instead of asserted at each use;
- a JSON-object type predicate on the backend instead of a cast;
- explicit return types on every exported function and every component template;
- promises entering void-returning slots wrapped in `void`, so nothing is fire-and-forget by
  accident;
- exactly three documented rule suppressions at genuine type-system boundaries.

## Technical Key Decisions and Tradeoffs

1. **Type predicates instead of assertions wherever a runtime check already exists.**
   - Why: `no-unsafe-type-assertion` accepts a predicate and rejects `as`; the check was already
     being performed, only its result was thrown away.
   - Impact: `src/http.ts` gains `isJsonObject`, and `readJsonObject` returns the narrowed value.
     Verified clean.

2. **Three suppressions, each at a boundary the type system genuinely cannot cross.**
   - `public/js/api.ts` — one `as T` where the server's response becomes the frontend's declared
     type. The module's own doc comment already frames `T` as "a promise the caller makes"; this is
     that promise, in one place, instead of twenty.
   - `test/api.test.ts` — one `as T` inside a `body<T>(res)` helper, for the same reason.
   - `public/js/base.ts` — `GzElement.$`'s `<T extends Element = Element>`, flagged by
     `no-unnecessary-type-parameters`. It mirrors `querySelector`'s own convenience generic; the
     alternative is nine `instanceof` narrowings at the call sites, two of them on custom-element
     classes that would have to be imported for the check.
   - Why not runtime validation instead: it would mean a schema library, and the project deliberately
     has none.
   - Impact: three `// oxlint-disable-next-line` comments, each with a `--` reason.

3. **Removing the redundant `Number()` calls is a real (accepted) behaviour change.**
   - Why: `no-unnecessary-type-conversion` fires because the values are already typed `number`.
     Removing the call means trusting the declared type rather than re-coercing a string the server
     should never send.
   - Impact: `formatWeight`, `formatVolume`, `formatDelta`, `gz-chart` and `gz-set-row` stop
     coercing. If the API ever sent `"60"` for a weight, the UI would now render `"60"` unformatted
     rather than silently repairing it. The typecheck gate is what keeps that honest.

4. **`stats.summary()` gets an explicit type and stops spreading possibly-null rows.**
   - Why: annotating the return type reveals that `{ ...totals, ...recent }` types every field as
     optional, because `.get()` returns `T | null`. Today a missing row would make
     `GET /api/stats/summary` answer `{}`.
   - Impact: the two row shapes become named interfaces, and a null row throws. Unreachable for
     these aggregate queries, which is why it is safe to add.

5. **`serveOptions` gets a hand-written options interface, not `Bun.Serve.Options`.**
   - Why: `Bun.Serve.Options<undefined>` typechecks as a return type but breaks
     `Bun.serve({ port, ...serveOptions(repo) })` — the union's `unix`/`port` XOR collapses. An
     explicit `{ routes; fetch; error }` interface works end-to-end. Verified both ways.
   - Impact: one small interface in `src/server.ts`; `apiRoutes` is annotated
     `Bun.Serve.Routes<undefined, string>`, which does work as an annotation.

6. **Typed custom events via `WindowEventMap` augmentation rather than a runtime guard.**
   - Why: the toast event is dispatched by this module and consumed by this module; a guard would be
     dead code. Declaration merging makes `event.detail` a `ToastDetail` for free, and types erase
     at transpile time so nothing reaches the browser.
   - Impact: a `declare global` block in `public/components/gz-toast/gz-toast.ts`.

## Abstractions and Code Reuse

- `public/js/format.ts` — **unchanged**. This plan originally added `hasText` and `emptyToNull` here
  and threaded them through every view; the user rejected that and asked for the rule to be
  configured instead. See *Revision: one rule option instead of two helpers* below. The module keeps
  exactly the ten exports it started with.
- `.oxlintrc.json` — `strict-boolean-expressions` carries one option,
  `{ "allowNullableString": true }`, which is what makes the helpers unnecessary.
- `public/js/base.ts` — `formData()` keeps returning `Record<string, string>`; callers read fields
  through `emptyToNull` / `?? ""` instead of asserting a shape. `noUncheckedIndexedAccess` already
  types those reads as `string | undefined`, which is the truth.
- `src/http.ts` — `isJsonObject` predicate, reused by `readJsonObject`.
- `gz-workout-detail` / `gz-exercise-detail` — a private `get #id(): string` getter each, replacing
  every `this.#workoutId as string` (6 sites) and `this.#exerciseId as string`.

## Implementation

### Phase 1: Shared helpers and type plumbing

Dependencies: None.

Everything later leans on these, and none of it changes behaviour.

**Tasks**:

- [x] `public/js/format.ts`: add `hasText` and `emptyToNull` (exported, documented). Use `hasText`
      for the three `if (!iso)` guards in `formatDate`, `formatShortDate`, `relativeDay`.
      Written as a type guard (`value is string`), so the narrowed value is usable in the branch.
- [x] `public/js/format.ts`: drop the redundant `Number()` calls at lines 29, 38 and 120
      (`formatWeight`, `formatVolume`, `formatDelta`). `formatNumber`'s own `Number(value)` stays —
      its parameter is nullable, so that conversion is real.
- [x] `src/http.ts`: add the predicate and use it; annotate the three factory arrows.
      ```ts
      function isJsonObject(value: unknown): value is Record<string, unknown> {
        return typeof value === "object" && value !== null && !Array.isArray(value);
      }
      export const badRequest = (message: string, details?: unknown): HttpError => …;
      ```
- [x] `src/repo/sql.ts`: drop the single-use `F` parameter (`fields: readonly Extract<keyof T, string>[]`)
      and replace the `as string | number | null` with a `typeof` check that throws a `TypeError`
      naming the table and column.
- [x] `src/repo/stats.ts`: extract `SummaryTotals` and `SummaryRecentActivity` interfaces, export
      `Summary = SummaryTotals & SummaryRecentActivity`, throw when either `.get()` returns null,
      annotate `summary(): Summary`.
- [x] `src/repo/index.ts`: re-export `Summary` and annotate `summary(): Summary`.
- [x] `src/server.ts`: add the `GainzServeOptions` interface and annotate `serveOptions`.
      ```ts
      interface GainzServeOptions {
        routes: Bun.Serve.Routes<undefined, string>;
        fetch: (req: Request) => Promise<Response>;
        error: (err: Error) => Response;
      }
      ```
- [x] `src/routes.ts`: annotate `apiRoutes(repo: Repo): Bun.Serve.Routes<undefined, string>`, and
      retype `guardAll` so the `as T` goes away — return `Record<string, Handler>` and let
      `Object.fromEntries` supply it. The index signature was accepted; the mapped-type fallback
      was not needed.
- [x] `public/js/base.ts`: `RawHtml`'s constructor becomes `constructor(readonly value: string) {}`
      (`parameter-properties`). Bun's transpiler lowers parameter properties correctly — verified.
- [x] `public/js/base.ts`: the `oxlint-disable-next-line typescript/no-unnecessary-type-parameters`
      comment on `$`, with the reason from decision 2.

**Automated Verification**:

- [x] `bunx oxlint public/js/format.ts public/js/base.ts src/http.ts src/repo src/routes.ts src/server.ts`
      reports only the errors assigned to later phases (return types, boolean expressions).
- [x] `bun run typecheck` passes.
- [x] `bun test` passes — `test/api.test.ts` exercises `serveOptions`, and `src/repo/stats.ts`
      changed. 52 pass, 0 fail.

### Phase 2: Explicit return types

Dependencies: Phase 1 (the `Summary` and serve types it introduces are needed here).

41 errors from `explicit-function-return-type` and `explicit-module-boundary-types`, at ~31 sites.
Mechanical, and worth doing in one pass so the rest of the phases read cleanly.

**Tasks**:

- [x] Annotate every component `template()` and markup partial `: RawHtml` — `gz-app` (149),
      `gz-chart` (96), `gz-dashboard` (43), `gz-exercise-detail` (102, 132, 173),
      `gz-exercise-list` (94, 119, 138), `gz-set-row` (103, 132), `gz-stat-tile` (13),
      `gz-theme-toggle` (43), `gz-toast` (69), `gz-workout-detail` (231, 274, 339).
      Import `RawHtml` as a type where a component does not already.
- [x] `public/js/styles.ts`: `componentHref` → `: string`.
- [x] `public/components/gz-toast/gz-toast.ts`: the `#onToast` arrow → `(event): void =>`.
- [x] `src/migrate.ts`: `main(): void`.
- [x] Not in the original list: `src/server.ts`'s `shutdown` arrow → `async (): Promise<void> =>`.
      It was flagged all along (as line 123); the phase's task list simply missed it.

**Automated Verification**:

- [x] `bunx oxlint 2>&1 | Select-String "explicit-(function-return-type|module-boundary-types)"`
      returns nothing — except `test/api.test.ts` 45 and 51, which Phase 8 owns.
- [x] `bun run typecheck` passes.

### Phase 3: Nullable truthiness

Dependencies: None. **Superseded** — see *Revision: one rule option instead of two helpers*. Every
task below was implemented as written, then reverted; the code now reads as it did before this plan
and the rule accepts it. The list is kept because it records what the rule was objecting to.

21 errors: 20 `strict-boolean-expressions` plus the one `prefer-nullish-coalescing`.

**Tasks** (all reverted):

- [x] ~~Backend, explicit comparisons: `src/server.ts` 24, 63, 75; `src/migrations.ts` 74, 84.~~
      Back to `!specifier`, `if (vendor)`, `!resolved`, `!rawVersion || !name`, `if (clash)`.
- [x] ~~`public/js/base.ts` 75 / 82: hoist the `dataset.action` reads into locals.~~ Back to
      `if (target instanceof HTMLElement && target.dataset.action)`.
- [x] ~~Frontend templates, via `hasText`.~~ Back to plain truthiness in all seven templates.
- [x] ~~`gz-workout-list` 72: `emptyToNull(element.dataset.title)`.~~ Now passes
      `element.dataset.title` straight through — see the revision note on why no conversion is
      needed at all.
- [x] `gz-app` 144: `main?.isConnected === true`. This one stays: `allowNullableString` does not
      cover a nullable *boolean*, where `false` and "absent" are genuinely different values.

**Automated Verification**:

- [x] `bunx oxlint 2>&1 | Select-String "strict-boolean-expressions|prefer-nullish-coalescing"`
      returns nothing.
- [x] `bun run typecheck` passes.

### Phase 4: Promises in void-returning slots

Dependencies: None (independent of 1–3; sequenced here to keep diffs legible).

16 errors: `no-misused-promises` and `strict-void-return` on the same eight sites.

**Tasks**:

- [x] `gz-dashboard` 15, `gz-exercise-list` 15, `gz-exercise-detail` 56, `gz-workout-detail` 58,
      `gz-workout-list` 26: make `connectedCallback` synchronous again —
      ```ts
      connectedCallback(): void {
        super.connectedCallback();
        void this.#load();
      }
      ```
      The base class declares `connectedCallback(): void`, and the custom-elements spec ignores the
      returned promise, so the `async` override was never awaited by anything.
- [x] `gz-workout-detail` 60: `this.root.addEventListener("sets-changed", () => { void this.#load(); })`.
- [x] `src/server.ts` 128 / 129: `process.on("SIGINT", () => { void shutdown(); })`, same for
      `SIGTERM`.

**Automated Verification**:

- [x] `bunx oxlint 2>&1 | Select-String "no-misused-promises|strict-void-return"` returns nothing.
- [x] `bun test` passes.

**Manual Verification**:

- [ ] `bun start`, then walk dashboard → workouts → a workout → exercises → an exercise. Each view
      still loads its data on first paint, and `Ctrl+C` still shuts the server down cleanly.

### Phase 5: Assertions in the components

Dependencies: Phase 1 (`emptyToNull`), Phase 2 (return types on the partials being touched).

21 errors: `no-unsafe-type-assertion` and `non-nullable-type-assertion-style`.

**Tasks**:

- [x] `gz-workout-detail`: add `get #id(): string` that throws when `#workoutId` is null, and use it
      at 68, 99, 119, 137 and 164. The comment explaining that `gz-app` sets the attribute before
      connection moves onto the getter, which is now where the invariant lives.
- [x] `gz-exercise-detail`: the same getter for `#exerciseId`, used at 65.
- [x] `gz-workout-list` 47, `gz-exercise-list` 31, `gz-set-row` 88, `gz-workout-detail` 133: drop
      the `as { … }` on `this.formData(form)` and read fields through `emptyToNull(values.x)` or
      `values.x ?? ""`. `required` inputs mean the values are present in practice; the types now
      admit that they might not be.
- [x] `gz-toast`: the `WindowEventMap` augmentation from decision 6, `#onToast` typed
      `((event: WindowEventMap[typeof EVENT]) => void) | null`, and `#onToast !== null` in
      `disconnectedCallback`. Removes the `no-unsafe-argument` error at 32, and the
      `event instanceof CustomEvent` check with it — the type now says what the event is.
- [x] Fallout from Phase 3, found here: `gz-app` 144's `main !== null && main.isConnected` then
      tripped `prefer-optional-chain`, which wants exactly what `strict-boolean-expressions`
      rejected. `main?.isConnected === true` satisfies both — the chain is back, and the condition
      is a boolean comparison rather than a nullable boolean. `no-unnecessary-boolean-literal-compare`
      leaves it alone because the operand really is `boolean | undefined`.

**Automated Verification**:

- [x] `bunx oxlint public 2>&1 | Select-String "no-unsafe|non-nullable"` returns nothing except
      `public/js/api.ts`, which Phase 7 owns.
- [x] `bun run typecheck` passes.

**Manual Verification**:

- [ ] Create a workout, edit its header, add a set, edit the set, delete it; create and edit an
      exercise. Every form still round-trips, and empty optional fields still clear rather than
      storing `""`.

### Phase 6: Redundant conversions, conditions and the route switch

Dependencies: None.

11 errors: `no-unnecessary-type-conversion` (5 remaining after Phase 1), `no-unnecessary-condition`,
`switch-exhaustiveness-check`, and the `no-unnecessary-type-parameters` site in `sql.ts` (already
handled in Phase 1 — confirm it is gone).

**Tasks**:

- [x] `gz-chart` 45, 68, 79: drop `Number(point.value)`; `ChartPoint.value` is `number`.
- [x] `gz-chart` 56: `this.#unit = value;` — the setter's parameter is `string`, so `?? ""` is dead.
- [x] `gz-set-row` 32: `this.#index = value || 0;` → `Number.isFinite(value) ? value : 0`, keeping
      the guard against `NaN` without the no-op conversion.
- [x] `gz-app` 61: replace `default:` with an explicit `case "notfound":`. `noFallthroughCasesInSwitch`
      and the exhaustive union then make a new route a compile error rather than a silent 404 view.

**Automated Verification**:

- [x] `bunx oxlint 2>&1 | Select-String "no-unnecessary"` returns nothing.
- [x] `bun run typecheck` passes.

**Manual Verification**:

- [ ] An exercise page with several logged sessions still draws its chart with the right axis
      labels, and `#/nonsense` still shows the "Nothing lives at …" view.

### Phase 7: The API client boundary

Dependencies: None.

7 errors in `public/js/api.ts`: the `any`, the two assertions, and the unsafe reads that follow.

**Tasks**:

- [x] Parse into `unknown` and narrow with `in` instead of optional-chaining an `any`
      (the local is named `errorBody`, not `body`, so it does not shadow the parameter):
      ```ts
      let data: unknown = null;
      try {
        data = text === "" ? null : JSON.parse(text);
      } catch {
        data = null;
      }

      if (!response.ok) {
        const body = typeof data === "object" && data !== null ? data : {};
        const message = "error" in body && typeof body.error === "string" ? body.error : `Request failed (${response.status})`;
        throw new ApiError(message, response.status, "details" in body ? body.details : undefined);
      }
      ```
      Verified clean — `in` narrowing needs no assertion.
- [x] Collapse the two assertions (`null as T` at the 204 branch and `return data`) into the single
      suppressed one, so the 204 case no longer needs its own. The early `status === 204` return went
      away entirely: `response.text()` on a 204 is `""`, which the parse step already turns into
      `null`, so one path now covers both:
      ```ts
      // The api methods below declare what each endpoint returns; this is the one place that
      // promise is asserted rather than proven.
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- server contract boundary
      return (response.status === 204 ? null : data) as T;
      ```
      Keep the early `response.status === 204` return only if it still reads better after the
      rewrite; the `text()`/`JSON.parse` path handles an empty body already.

**Automated Verification**:

- [x] `bunx oxlint public/js/api.ts` exits 0.
- [x] `bun run typecheck` passes.

**Manual Verification**:

- [ ] Stop the server with the app open and click a nav link: the toast still says "Could not reach
      the gainz server". Then POST a duplicate exercise name and confirm the 409's own message
      ("already exists") still reaches the toast rather than "Request failed (409)".

### Phase 8: The test suite

Dependencies: None.

46 errors — 45 in `test/api.test.ts`, 1 in `test/migrate.test.ts`. The last and largest phase, and
the one with no production risk.

**Tasks**:

- [x] Add the reader helper next to the existing `api` / `post` / `patch` helpers:
      ```ts
      /**
       * Reads a response body as the shape the endpoint documents. Bun types `json()` as `any`, so
       * the assertion has to happen somewhere; here it happens once, and each call site says which
       * shape it expects.
       */
      async function body<T>(res: Response): Promise<T> {
        const parsed: unknown = await res.json();
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- one place, see above
        return parsed as T;
      }
      ```
- [x] Import the row types the assertions need from `../src/repo`
      (`Exercise`, `ExerciseWithStats`, `LiftSet`, `Workout`, `WorkoutWithStats`, `SessionPoint`) and
      `Summary` from Phase 1. Declare the composite bodies the endpoints return locally, next to the
      helper — `type WorkoutDetail = Workout & { sets: LiftSet[] }`, `type WorkoutPage = { items: …;
      total: number; limit: number; offset: number }`, `type ErrorBody = { error: string }`,
      `type Progress = { exercise: Exercise; sessions: SessionPoint[]; best_set: LiftSet | null }`.
      These are the frontend's `public/js/types.ts` shapes; the tests are backend-side, so they read
      the backend's.
- [x] Rewrite the 45 flagged reads as `await body<…>(res)`, converting
      `createExercise` / `createWorkout` (45, 51) to use it too and giving both an explicit return
      type.
- [x] `test/migrate.test.ts` 156: replace `expect.arrayContaining` (which is typed `any`) with a
      loop of `expect(tables(real)).toContain(name)`.
- [x] Not in the original list but needed by it: an `at(items, index)` helper. Once a body is typed,
      `noUncheckedIndexedAccess` makes `detail.sets[1].position` and `progress.sessions[1].top_weight`
      possibly-undefined, and `toBeGreaterThan` / `toBeCloseTo` want a real number. `at` throws a
      message naming the index instead. `progress.best_set?.weight` needed no helper — `toBe`
      accepts a possibly-undefined value.

**Automated Verification**:

- [x] `bun test` passes — same 52 tests, same names. The expect() count rose 136 → 139 because the
      one `arrayContaining` call became four `toContain` assertions.
- [x] `bun run lint` exits 0 on the whole repository.
- [x] `bun run typecheck` passes.
- [x] `bun run fmt:check` passes. `bun run fmt` reformatted seven files, two of them
      (`public/js/router.ts`, `public/js/theme.ts`) carrying formatting debt that predates this plan.

## Commit Boundaries

The ruleset itself is still uncommitted, and it and the fixes are one story, but 161 fixes in one
commit is unreviewable. Suggested split, each commit green on `lint`, `typecheck` and `test`:

1. `chore: Turn on the type-aware oxlint rules` — `.oxlintrc.json` plus the small fixes already in
   the working tree (`gz-app`, `gz-theme-toggle`, `gz-toast`, `gz-workout-list`, `base.ts`,
   `router.ts`, `theme.ts`, `seed.ts`, `migrate.test.ts`). Note in the body that the rest of the
   tree follows.
2. `refactor: Narrow instead of asserting at the JSON and SQL boundaries` — Phase 1.
3. `chore: Declare the return type of every function` — Phase 2.
4. `refactor: Check nullable text explicitly` — Phase 3.
5. `fix: Stop returning promises where a void return is expected` — Phase 4.
6. `refactor: Narrow element ids and form values instead of asserting them` — Phase 5.
7. `chore: Drop redundant conversions and complete the route switch` — Phase 6.
8. `refactor: Parse API responses as unknown` — Phase 7.
9. `test: Read response bodies through one typed helper` — Phase 8.

Commit 1 is the only one where lint is *expected* to still fail, since it is what introduces the
rules; if that matters, fold it into commit 2 instead and keep the ruleset and the first fixes
together.

## Revision: one rule option instead of two helpers

The first implementation of Phase 3 satisfied `strict-boolean-expressions` by adding `hasText` and
`emptyToNull` to `public/js/format.ts` and calling them from every view. The user reviewed that and
rejected it: the rule should be configured to treat nullish and empty text alike, and the two
helpers should go.

That is a single option:

```json
"typescript/strict-boolean-expressions": ["error", { "allowNullableString": true }]
```

With it, a `string | null | undefined` is accepted in a boolean context exactly as a plain `string`
already was — `null`, `undefined` and `""` all read as "nothing here", which is what this codebase
means by an unset text field anyway. The option name comes from
`node_modules/oxlint/configuration_schema.json`; the rule has no option about null versus undefined
specifically, because it never distinguished them — it objected to nullable strings as a class.

What that let go, beyond the two functions:

- Every template returns to plain truthiness (`${workout.notes ? … : ""}`), and `format.ts`'s three
  date guards to `if (!iso)`.
- `base.ts` returns to `if (target instanceof HTMLElement && target.dataset.action)`, without the
  hoisted locals the helper-free version needed.
- The five backend comparisons revert to `!specifier`, `if (vendor)`, `!resolved`,
  `!rawVersion || !name` and `if (clash)`.
- **`emptyToNull` turned out to be unnecessary even on its own terms.** Its call sites were
  `x || null`, converting empty text to null before sending it. But `optionalString` on the server
  already normalises `""`, `null` and a missing key to the same stored `null`, and the frontend's
  input types declare these fields as `string | null | undefined`. So the call sites now pass the
  form value straight through: `title: values.title`. Verified against a running server — a create
  with `{"title":"","notes":""}` stores both as `null`, and clearing a set's notes with `""`
  clears it to `null`, which is what the helper was producing.
- One conversion does survive, in `gz-workout-list`'s create form:
  `performed_on: values.performed_on === "" ? todayIso() : values.performed_on`. An absent date
  defaults to today server-side, but an empty one is a 400
  (`"performed_on" is required and must be a non-empty string`), so the empty case has to be
  substituted client-side. Written as an `=== ""` comparison rather than `||` so that
  `prefer-nullish-coalescing` stays untouched — one rule changed, not two.

Net effect on the diff: `public/js/format.ts` and `public/js/base.ts` are byte-for-byte their
original selves apart from `RawHtml`'s parameter property and the `$` suppression, and nine call
sites got shorter rather than longer.

## Implementation Notes

All eight phases are implemented. `bun run lint`, `bun run typecheck`, `bun test` (52 pass) and
`bun run fmt:check` are green, with the ruleset untouched and exactly three suppressions.

What the plan did not anticipate:

1. **Two rules disagreed with each other.** Phase 3 rewrote `gz-app`'s `main?.isConnected` as
   `main !== null && main.isConnected` to satisfy `strict-boolean-expressions`, and
   `prefer-optional-chain` immediately asked for the optional chain back. `main?.isConnected === true`
   is the shape that satisfies both.
2. **`consistent-return` does not know a switch is exhaustive.** Phase 6 replaced `gz-app`'s
   `default:` with `case "notfound":`, and `consistent-return` then wanted a return for the
   fallthrough the type system knows cannot happen. A documented `throw` after the switch settles
   it — TypeScript is satisfied by the exhaustive cases, the linter by the throw.
3. **Typing a test body has knock-on effects.** `noUncheckedIndexedAccess` turns `detail.sets[1]`
   into a possibly-undefined value the moment the body stops being `any`, and matchers like
   `toBeGreaterThan` want a real number. An `at(items, index)` helper covers it.
4. **`src/server.ts`'s `shutdown` arrow** needed a return type and was missing from Phase 2's list.

### Manual verification

The Chrome extension was not connected in this session and `agent-browser` is not installed, so the
UI walks in Phases 4–7 were not driven through a real DOM. What was verified instead, against a live
server on port 3100 with the seeded database:

- Every changed frontend module is served as valid type-erased JavaScript (15 modules, all 200, no
  TypeScript syntax in any response). This is the check that matters most for the two exotic
  changes: `RawHtml`'s parameter property lowers to a field plus an assignment, and the
  `declare global` block in `gz-toast.ts` leaves no trace at all.
- The mutation paths behind every form: create a workout with blank title and notes (both stored as
  `null`, not `""`), add a set, edit it, clear its notes back to `null`, rename the workout, delete
  it, and confirm its set went with it.
- The error path `api.ts` now narrows by hand: a duplicate exercise name returns 409 with
  `{"error":"An exercise named \"back squat\" already exists"}`, which is the specific message the
  `in`-narrowing has to extract rather than falling back to "Request failed (409)".
- A 204 with an empty body, which `api.ts` now handles on the same path as every other response.
- The SPA fallback still serves `index.html` for an unknown deep path, and
  `GET /api/exercises/1/progress` still returns the five sessions and the 100 kg × 8 best set the
  chart plots.
- The rewritten `stats.summary()` answers with all eight fields.
- `data/gainz.sqlite` holds the same 17 workouts and 128 sets it started with.

Still needing a human at a browser: that the chart draws with correct axis labels, that a toast
appears and dismisses, that focus lands in the weight field after logging a set, and that Ctrl+C
shuts the server down cleanly — the process was force-killed here, which does not exercise the
SIGINT handler.

## Risks

- **`guardAll`'s index signature (Phase 1).** Bun's `Routes` is a mapped type over the path strings;
  a `Record<string, Handler>` return may not satisfy it. The mapped-type fallback is written into
  the task. `apiRoutes(repo): Bun.Serve.Routes<undefined, string>` itself is verified to work.
- **Removed `Number()` coercions (Phase 6, decision 3).** Behaviour change by design. If the manual
  chart check looks wrong, the values arriving are not what the types claim, and that is worth
  knowing.
- **Phase 8 is broad but shallow.** 45 mechanical edits in one file; the guard against a botched
  edit is that the test names and count must not change.

## References

- `.oxlintrc.json` — the ruleset, unchanged by this plan
- `README.md` — the REST surface the test shapes describe
- `docs/backend.md`, `docs/frontend.md` — the layering the fixes stay inside
- typescript-eslint rule docs for `no-unsafe-type-assertion` (recommends type guards) and
  `no-unnecessary-type-parameters` (documents the `querySelector`-wrapper case)
