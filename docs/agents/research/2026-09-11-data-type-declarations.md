---
date: 2026-09-11T10:33:39+00:00
git_commit: 5d3ed743cbf30e5f9ade3a5effcf27ce826614df
branch: main
topic: 'How and where data types are written, backend and frontend'
tags: [research, codebase, types, typescript, backend, frontend, validation]
status: complete
---

# Research: How and where data types are written, backend and frontend

## Research Question

How and where are data types written in this repository? Check both the backend and the frontend.

## Summary

Every data type in gainz is a hand-written TypeScript `interface` or `type` alias, declared in the
module that owns the concept and exported from there. There is no schema library, no code
generation from SQLite, no `.d.ts` file anywhere under `src/`, no `enum`, and no shared types
package spanning the two halves of the app. `src/` holds 0 files matching `*.d.ts`, and the only
`declare` block in the repository is one `declare global` that teaches the DOM about a custom
event (`src/frontend/components/gz-toast/gz-toast.ts:21`).

Types exist at four addresses:

1. **Entity shapes, backend** — one `interface` per row shape and per input shape, written directly
   above the repository class whose SQL produces it, in `src/backend/db/repos/{exercises,workouts,sets,stats}.ts`.
   `src/backend/db/repos/index.ts:12` re-exports all of them from a single `export type { … }` line,
   so the rest of the backend imports types from `'../db/repos'` and never from a sub-module.
2. **Plumbing types, backend** — declared beside the module they belong to: `DB` in `db/db.ts:6`,
   the migration runner's three interfaces in `db/migrations.ts`, `RouteTable`/`ParamRequest`/`Handler`
   in `http/routes/shared.ts`, `GainzServeOptions` in `http/server.ts:10`, and `HttpError` as a real
   class in `http/errors.ts:4`.
3. **Wire shapes, frontend** — `src/frontend/types.ts` restates the JSON the API returns, **by hand
   and on purpose**, and is consumed only through `import type`, so the transpiler erases it and the
   browser never fetches the module. Its own header comment and `docs/frontend.md` both record why:
   the frontend is a client of an HTTP API and should be pinned to the wire format, not to the
   server's row types.
4. **Local shapes, frontend** — a view's `#state` union, the chart's point, the metric descriptor:
   declared unexported in the component module that uses them. The only names a component module
   exports are `GzChart`, `GzSetRow`, `ChartPoint`, `ToastKind` and `ToastDetail` — each because
   another module says it.

Alongside those static declarations there is exactly one place where shapes are checked at
**runtime**: `src/backend/shared/validate.ts`, a set of hand-rolled per-field parsers
(`requiredString`, `optionalString`, `requiredInt`, `requiredNumber`, `requiredDate`, `pathId`,
`queryInt`) that each route file composes into a `readXBody()` function returning the repository's
`…Input` type. Nothing else validates: the frontend asserts the server's contract at a single
line, and the backend's test helper asserts it at a second.

```
src/
├── backend/
│   ├── db/
│   │   ├── db.ts                    export type DB = Database            (:6)
│   │   ├── migrations.ts            Migration, MigrateResult,
│   │   │                            MigrateOptions, AppliedRow           (:13,:22,:29,:49)
│   │   └── repos/
│   │       ├── exercises.ts         Exercise, ExerciseWithStats,
│   │       │                        SessionPoint, ExerciseInput          (:6,:14,:21,:31)
│   │       ├── workouts.ts          Workout, WorkoutWithStats,
│   │       │                        WorkoutInput                         (:5,:13,:20)
│   │       ├── sets.ts              LiftSet, SetInput                    (:7,:19)
│   │       ├── stats.ts             SummaryTotals, SummaryRecentActivity,
│   │       │                        Summary = the intersection           (:4,:14,:19)
│   │       ├── sql.ts               UpdateStatement + column constants   (:18)
│   │       └── index.ts             one re-export line for all of them   (:12)
│   ├── http/
│   │   ├── errors.ts                class HttpError                      (:4)
│   │   ├── http.ts                  isJsonObject type guard              (:16)
│   │   ├── server.ts                GainzServeOptions                    (:10)
│   │   └── routes/
│   │       ├── shared.ts            RouteTable, ParamRequest, Handler    (:4,:7,:9)
│   │       └── *.routes.ts          readXBody(): …Input — no new types
│   ├── shared/validate.ts           runtime field parsers, no types
│   └── testing.ts                   WorkoutDetail, WorkoutPage, Progress,
│                                    ErrorBody, TestServer                (:17,:22,:30,:37,:42)
└── frontend/
    ├── types.ts                     13 wire interfaces, hand-written     (:16–:137)
    ├── api.ts                       class ApiError + request<T>          (:6,:42)
    ├── base.ts                      class RawHtml, class GzElement       (:5,:56)
    ├── router.ts                    ViewName, RouteName, Route           (:6,:8,:10)
    ├── theme.ts                     Theme                                (:19)
    └── components/<tag>/<tag>.ts    module-local state unions and props
```

The shape of one record as it travels, and what names it at each step:

```
 SQLite columns                001-initial-schema.sql   (the only non-TypeScript declaration)
       │
       │  db.query<LiftSet, [number]>(…)      26 call sites pass <Row, Params> explicitly
       ▼
 repos/sets.ts:7  interface LiftSet           row type, beside the SQL that fills it
       │
       │  re-exported by repos/index.ts:12
       ▼
 routes/set.routes.ts          json(repo.requireSet(id))       →  Response.json(unknown)
       │
       ╎  ── HTTP; every static type ends here ──
       ▼
 api.ts:75   return data as T                 the one assertion on the client side
       │
       ▼
 frontend/types.ts:55  interface LiftSet      written again, by hand, deliberately
       │
       ▼
 gz-set-row.ts:21  set set(value: LiftSet | undefined)
```

The reverse direction — a request body — is the only path with runtime enforcement:

```
 JSON body  →  readJsonObject()            http/http.ts:21, guarded by isJsonObject (:16)
            →  Record<string, unknown>
            →  requiredInt / optionalString / requiredDate …      shared/validate.ts
            →  SetInput                    set.routes.ts:9  readSetBody()
            →  repo.createSet(…)           typed all the way to the bound SQL parameters
```

## Detailed Findings

### Backend entity types sit next to the SQL that produces them

Each entity repository opens with its interfaces and then its class. `src/backend/db/repos/exercises.ts`
declares `Exercise` (:6), `ExerciseWithStats` (:14), `SessionPoint` (:21) and `ExerciseInput` (:31)
before `class ExerciseRepo` (:39). `workouts.ts` and `sets.ts` follow the same order. The field
names are the SQL column names — `muscle_group`, `performed_on`, `created_at`, `est_one_rep_max` —
so a row interface reads as a transcript of the `SELECT` a few lines below it, including the aliases
(`MAX(s.weight) AS best_weight`).

Two composition idioms appear:

- **`extends` for a row plus its aggregates.** `ExerciseWithStats extends Exercise`
  (`exercises.ts:14`), `WorkoutWithStats extends Workout` (`workouts.ts:13`). The base interface is
  what a plain `SELECT` returns; the extension adds the `COUNT`/`SUM` columns of the list query.
- **An intersection for a shape assembled from two queries.** `stats.ts` splits the summary into
  `SummaryTotals` (:4) and `SummaryRecentActivity` (:14) — neither exported — and exports
  `export type Summary = SummaryTotals & SummaryRecentActivity` (:19). That mirrors
  `StatsRepo.summary()`, which runs one query per half and spreads the two rows together.

`repos/sql.ts` holds the one type that describes a statement rather than a record:
`UpdateStatement { sql, values: (string | number | null)[] }` (:18), returned by the shared
`buildUpdate<T extends object>(table, fields, patch)` builder. Its `fields` parameter is typed
`readonly Extract<keyof T, string>[]`, and each repository passes a module-level
`const FIELDS = [...] as const` (`exercises.ts:37`, `workouts.ts:26`, `sets.ts:27`), so the column
names in a dynamic `UPDATE` are constrained by the input interface's own keys.

### A row type reaches the database through `db.query<Row, Params>`

`export type DB = Database` (`db/db.ts:6`) is a one-line alias over `bun:sqlite`'s `Database`, and
every repository takes a `DB` in its constructor. The row type is supplied at each call site as an
explicit generic argument to `query` (or `prepare`): `this.db.query<ExerciseWithStats, []>(…)`,
`this.db.query<LiftSet, [number]>(…)`, `this.db.query<{ n: number }, [number]>(…)`. There are 26
such parameterised call sites across `src/backend/`. Small one-off result shapes are written inline
as anonymous object types (`{ n: number }` for a count, `{ next: number }` for the next set
position in `sets.ts`, `{ version: number | null }` in `migrations.ts:60`); only shapes that leave
the module get a named interface.

The generic is a claim, not a check — nothing verifies that the `SELECT` list matches the
interface. The shared column constants in `sql.ts` (`EXERCISE_COLUMNS`, `SET_COLUMNS`) are what keep
the claim true across the several queries that return the same shape.

### Input types and the runtime validators are separate things

`ExerciseInput` (`exercises.ts:31`), `WorkoutInput` (`workouts.ts:20`) and `SetInput` (`sets.ts:19`)
describe what a repository accepts. In the backend copies every optional column is `string | null`
rather than `?` — the repository expects a decision, not an absence — with `SetInput.position?`
the single exception, because the repository computes the next position when it is left out.

Route files turn an untyped body into one of those interfaces in a function named `readXBody`:
`readExerciseBody` (`exercise.routes.ts:8`), `readWorkoutBody` (`workout.routes.ts:8`) and the
exported `readSetBody` (`set.routes.ts:9`, exported because `POST /api/workouts/:id/sets` lives in
the workout file). Each is a literal returning the `…Input` type, built field by field from
`shared/validate.ts`. Partial updates skip the helper and build a `Partial<…Input>` by hand, one
`if (isPresent(body, 'x'))` per field (`exercise.routes.ts:31–43`, `workout.routes.ts:44–54`,
`set.routes.ts:28–47`) — `isPresent` distinguishes "absent" from "explicitly null", which is what
lets a `PATCH` clear a column.

The validators themselves take `Record<string, unknown>` and return a narrowed primitive, throwing
`HttpError` on a mismatch. They also carry the bounds: lengths, ranges, the `YYYY-MM-DD` regex, and
the two-decimal rounding of a weight in `requiredNumber` (`validate.ts:67`). The maximum lengths are
constants in `routes/shared.ts` (`MAX_NAME`, `MAX_NOTES`), not in the type.

`http/http.ts:16` holds the one type guard in the repository: `isJsonObject(value): value is
Record<string, unknown>`, written as a guard rather than a check-then-cast so, in the words of its
comment, "the narrowing the check performs is the same narrowing the caller gets". It backs
`readJsonObject` (:21), the single entry point for a request body.

### HTTP plumbing types are aliases over Bun's own

`http/routes/shared.ts` names three: `RouteTable = Bun.Serve.Routes<undefined, string>` (:4),
`ParamRequest = Request & { params: Record<string, string | undefined> }` (:7), and
`Handler = (req: ParamRequest) => Response | Promise<Response>` (:9). Every route module's exported
function is annotated `: RouteTable`, which is what makes the spread in `http/routes.ts` type-check
as one table. `http/server.ts:10` declares `GainzServeOptions` locally with a comment explaining
that `Bun.Serve.Options` stops being spreadable into `Bun.serve` once it is named.

Error types are a class rather than a union: `class HttpError extends Error` (`errors.ts:4`) carries
`status` and optional `details` as `readonly` constructor parameter properties, with three factory
arrows (`badRequest`, `notFound`, `conflict`) beneath it and `errorResponse(err: unknown)` narrowing
with `instanceof`.

### The migration runner types its own metadata

`db/migrations.ts` declares `Migration` (:13), `MigrateResult` (:22) and `MigrateOptions` (:29)
exported, plus an unexported `AppliedRow` (:49) for the ledger query. Each field carries a doc
comment naming what it is (`version` is "the leading number of the filename — the ordering key").
The database's actual schema is declared in SQL, in `db/migrations/001-initial-schema.sql`; nothing
derives the TypeScript interfaces from it.

### Test-only response shapes live in `testing.ts`

`src/backend/testing.ts` declares a third set of shapes, for the composite JSON bodies the routes
assemble inline and which therefore have no repository type: `WorkoutDetail extends Workout` (:17),
`WorkoutPage` (:22), `Progress` (:30) and `ErrorBody` (:37), plus `TestServer` (:42) describing the
helper bundle `useServer()` returns. These overlap by construction with `WorkoutWithSets`,
`WorkoutPage` and `ExerciseProgress` in `src/frontend/types.ts` — the same three composite responses,
written a third time for the test harness.

Tests name the shape at the call site rather than inferring it: `body<T>(res)` (:133) does
`const parsed: unknown = await res.json()` and then one asserted `parsed as T`, carrying an
`oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above` (:135) and a comment
noting Bun types `json()` as `Promise<any>` with no generic overload. Call sites read
`await body<WorkoutDetail>(res)` (`workout.routes.test.ts:37`). `at<T>(items, index)` (:140) exists
so `noUncheckedIndexedAccess` does not force a null check in every assertion.

### The frontend restates the wire format by hand

`src/frontend/types.ts` is the single largest concentration of type declarations in the repository:
13 exported interfaces covering `Exercise`, `ExerciseWithStats`, `Workout`, `WorkoutWithStats`,
`WorkoutWithSets`, `LiftSet`, `SessionPoint`, `Summary`, `WorkoutPage`, `ExerciseProgress`,
`ExerciseInput`, `WorkoutInput` and `SetInput` (:16 through :137). The module's header comment
states the rule and the reason:

> These are declared here rather than imported from `src/backend/db/repos/`, even though a type-only
> import would be erased before the browser ever saw it. […] Sharing them would quietly absorb a
> renamed column as a refactor; keeping them apart makes it show up as what it is, a change to the
> API. `bun run typecheck` will not catch that drift for you.

`docs/frontend.md` repeats it in the same terms, so the duplication is a documented convention in
two places. Differences from the backend copies are visible and intentional: the frontend's input
interfaces use optional properties (`muscle_group?: string | null`, `copy_from_workout_id?: number`)
because the browser omits fields, where the backend's use `string | null` because the repository is
handed a decision; and `WorkoutWithSets`, `WorkoutPage` and `ExerciseProgress` exist only here,
describing bodies the route files build inline.

Every consumer imports from it with `import type`, e.g. `import type { Summary, WorkoutWithStats }
from '../../types.ts'` (`gz-dashboard.ts:6`) — the transpiler strips the statement whole, so the
module is never fetched by the browser. `verbatimModuleSyntax` in `tsconfig.json` and
`typescript/consistent-type-imports` in `.oxlintrc.json` are what keep that mechanical.

### The API client turns a type into a promise, and asserts once

`src/frontend/api.ts` declares `class ApiError extends Error` (:6) with `status` and `details`, and
`async function request<T>(method, path, body?): Promise<T>` (:42). Its doc comment names the
arrangement exactly: "`T` is a promise the caller makes rather than one this function keeps — every
method on `api` below declares the shape its own endpoint returns, and those declarations are the
single place the frontend states what it expects." The body ends with
`return data as T` (:75) under `oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the
server contract boundary` (:74), with a comment recording that validating instead "would mean a
schema library, and this app deliberately has none".

Four thin arrows (`get`, `post`, `patch`, `remove`, :78–:84) pass the generic through, and the
exported `api` object (:86) is where the endpoint-to-shape map actually lives, one annotated return
type per method: `summary: (): Promise<Summary>`, `list: (): Promise<ExerciseWithStats[]>`,
`progress: (id): Promise<ExerciseProgress>`, `update: (id, patchBody: Partial<ExerciseInput>):
Promise<Exercise>`, and so on. Ids are accepted as `number | string` throughout, because route
params arrive as strings.

An error body is narrowed rather than typed: `request` checks `typeof data === 'object' && data !==
null`, then uses `in` tests to read `error` and `details` (:66–:71). `errorMessage(error: unknown)`
(:33) is the module's public way to turn a `catch` binding into a string.

### Component modules declare their own state and prop types

Each view keeps its render state in one module-local type, and the pattern is a discriminated union
on `status`:

- `gz-dashboard.ts:10` — `{ status: 'loading' } | { status: 'ready'; summary; workouts } | { status: 'error'; message }`
- `gz-exercise-list.ts:8` and `gz-workout-detail.ts:11` — the same three-armed shape
- `gz-exercise-detail.ts:21–23` — `ReadyState = { status: 'ready' } & ExerciseProgress`, then the
  three-armed union over it, so the API response is spread straight into the state
  (`this.#state = { status: 'ready', ...(await api.exercises.progress(id)) }`, :80)
- `gz-workout-list.ts:13` — deliberately **not** a union: one interface with
  `status: 'loading' | 'ready' | 'error'` and `items`/`total` present on every variant, because the
  list keeps already-loaded pages and "an error while paging must not blank what is on screen"

Templates then narrow by early return on `this.#state.status` before destructuring
(`gz-dashboard.ts:45–52` is the canonical shape).

Other module-local declarations: `ChartPoint` (exported, `gz-chart.ts:11`) and `ChartScale`
(private, :19); `MetricKey` and `Metric` in `gz-exercise-detail.ts:12–18`, with
`const METRICS: [Metric, ...Metric[]]` (:29) written as a non-empty tuple so `METRICS[0]` is a
`Metric` under `noUncheckedIndexedAccess`; `ExerciseTotals` in `gz-workout-detail.ts:14`;
`WorkoutListState` above. `gz-app.ts:24` types its lazy-route map as
`Record<ViewName, () => Promise<unknown>>`, which is how `router.ts`'s `ViewName` union forces the
map to name every route.

Props are passed as typed setters rather than attributes: `set series(value: ChartPoint[])`
(`gz-chart.ts:45`), `set set(value: LiftSet | undefined)` / `set exercises(value: Exercise[] | null
| undefined)` / `set index(value: number)` (`gz-set-row.ts:21–35`). Each setter defends against the
absent case at runtime (`value ?? []`, `Number.isFinite(value) ? value : 0`), because the caller
found the element through a query. That query is the reason two component classes are exported:
`GzChart` and `GzSetRow` are named as type arguments to the base helpers
`this.$<GzChart>('gz-chart')` (`gz-exercise-detail.ts:102`) and `this.$$<GzSetRow>('gz-set-row')`
(`gz-workout-detail.ts:204`). `docs/frontend.md` states the rule: those two are exported so a view
can type the element it drives; the other nine components stay private.

`base.ts` supplies the generic query helpers `$<T extends Element = Element>(selector): T | null`
(:144) and `$$<T extends Element = Element>(selector): T[]` (:148). The first carries
`oxlint-disable-next-line typescript/no-unnecessary-type-parameters` (:143) with a comment
explaining that proving the element type instead would mean an `instanceof` check at every call
site. `RawHtml` (:5) is a class used as a type — `template(): RawHtml` is the contract every
component implements, and it exists so the `html` tagged template can tell escaped from
already-safe markup.

### Declaration merging, used once

`gz-toast.ts:21` opens a `declare global { interface WindowEventMap { 'gz-toast': CustomEvent<ToastDetail> } }`
so a listener's `event.detail` arrives typed. Its comment notes the declaration is erased at
transpile time and nothing about it reaches the browser. The listener field is then typed
`((event: WindowEventMap[typeof EVENT]) => void) | null` (:39). This is the only global
augmentation in the repository.

### What the repository deliberately does not use

Searching `src/` for the alternatives turns up nothing: no `enum` (the several `typescript/*-enum-*`
oxlint rules guard a construct the code never reaches for), no `satisfies`, no `.d.ts` file, no
`@ts-expect-error` or `@ts-ignore`, and no `any` outside two comments that explain why a Bun API
returns one. Type assertions appear at exactly two lines, both at a boundary where JSON becomes a
typed value, both annotated: `api.ts:75` and `testing.ts:135`. The `as const` keyword appears four
times, always to fix a literal tuple (`FIELDS` in the three repositories, one test table).

## Code References

- `src/backend/db/repos/exercises.ts:6,14,21,31` — `Exercise`, `ExerciseWithStats`, `SessionPoint`, `ExerciseInput` above `ExerciseRepo`
- `src/backend/db/repos/workouts.ts:5,13,20` — `Workout`, `WorkoutWithStats`, `WorkoutInput`
- `src/backend/db/repos/sets.ts:7,19` — `LiftSet`, `SetInput`
- `src/backend/db/repos/stats.ts:4,14,19` — two private halves and the exported intersection `Summary`
- `src/backend/db/repos/sql.ts:18,31` — `UpdateStatement`, and `buildUpdate<T>` constrained by `Extract<keyof T, string>`
- `src/backend/db/repos/index.ts:12` — the single `export type { … }` line the rest of the backend imports from
- `src/backend/db/db.ts:6` — `export type DB = Database`
- `src/backend/db/migrations.ts:13,22,29,49` — `Migration`, `MigrateResult`, `MigrateOptions`, `AppliedRow`
- `src/backend/db/migrations/001-initial-schema.sql` — the schema, declared in SQL, with no generated counterpart
- `src/backend/http/errors.ts:4` — `class HttpError` with readonly parameter properties
- `src/backend/http/http.ts:16,21` — `isJsonObject` type guard and `readJsonObject`
- `src/backend/http/server.ts:10` — `GainzServeOptions`, spelled out rather than taken from Bun
- `src/backend/http/routes/shared.ts:4,7,9` — `RouteTable`, `ParamRequest`, `Handler`
- `src/backend/http/routes/set.routes.ts:9` — `readSetBody(body: Record<string, unknown>): SetInput`
- `src/backend/http/routes/workout.routes.ts:44-54` — a `Partial<WorkoutInput>` assembled field by field for `PATCH`
- `src/backend/shared/validate.ts:5-102` — the runtime field parsers; the only shape checking that runs
- `src/backend/testing.ts:17,22,30,37,42` — test-only response shapes and `TestServer`
- `src/backend/testing.ts:133-137` — `body<T>` and the asserted `parsed as T`
- `src/frontend/types.ts:1-14` — the header comment stating why the wire types are written by hand
- `src/frontend/types.ts:16-137` — the 13 wire interfaces
- `src/frontend/api.ts:6,42,74-75,86` — `ApiError`, `request<T>`, the one assertion, and the `api` map of endpoint → shape
- `src/frontend/base.ts:5,56,143-149` — `RawHtml`, `GzElement`, the generic `$`/`$$` helpers
- `src/frontend/router.ts:6,8,10` — `ViewName`, `RouteName`, `Route`
- `src/frontend/theme.ts:19,27` — `Theme` and its `isTheme` narrowing function
- `src/frontend/components/gz-toast/gz-toast.ts:5,7,21-25` — `ToastKind`, `ToastDetail`, the `WindowEventMap` augmentation
- `src/frontend/components/gz-chart/gz-chart.ts:11,19,45` — exported `ChartPoint`, private `ChartScale`, the typed setter
- `src/frontend/components/gz-dashboard/gz-dashboard.ts:10,45-52` — the state union and the narrowing early returns
- `src/frontend/components/gz-exercise-detail/gz-exercise-detail.ts:12-29,102` — `MetricKey`, `Metric`, the non-empty tuple, `this.$<GzChart>(…)`
- `src/frontend/components/gz-workout-list/gz-workout-list.ts:8-21` — the flat state interface and the comment for why it is not a union
- `tsconfig.json:1-20` — `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, `allowImportingTsExtensions`
- `.oxlintrc.json:4-6` — `"typeAware": true`, which is what makes the type-aware rules below it run
- `docs/frontend.md` — the paragraph documenting `types.ts` and which components are exported
- `docs/backend.md` — "`db/repos/` (**all** SQL, one method per operation, returns typed rows)"

## Architecture Documentation

Conventions visible in the current code:

- **A type is declared in the module that owns the concept, above the class or functions that use
  it**, and exported only if another module names it. `stats.ts`, `migrations.ts`, `gz-chart.ts` and
  the view modules all keep private interfaces unexported.
- **One re-export point per layer.** `db/repos/index.ts` is the only module the backend imports
  entity types from; `src/frontend/types.ts` is the only module the frontend imports wire types
  from. Route files and tests import `type { Repo, SetInput } from '../../db/repos'` — the directory,
  not the file.
- **Row shapes mirror SQL column names**, aliases included, and the shared column-list constants in
  `repos/sql.ts` keep the several queries returning one shape in agreement.
- **Aggregates extend their base row**; a response assembled from two queries is an intersection of
  two halves.
- **Input types and row types are separate interfaces**, and a partial update is `Partial<…Input>`
  rather than a third type.
- **The backend and the frontend do not share types.** The duplication in `src/frontend/types.ts` is
  documented in the file itself and in `docs/frontend.md` as a decision about what the frontend
  should be pinned to: the wire format, not the server's rows.
- **Types are erased, never checked, on the way to the browser.** `src/backend/transpile.ts` runs
  `Bun.Transpiler` per request and its header comment says so outright: "Types are erased, not
  checked. `bun run typecheck` is the gate; a type error transpiles happily and ships."
- **Runtime checking exists only where untyped data enters**: `readJsonObject` plus
  `shared/validate.ts` on the way in, and two annotated assertions (`api.ts:75`, `testing.ts:135`)
  on the way out. No schema library, by stated choice.
- **Enforcement is configuration, not convention**: `tsconfig.json` turns on `strict` and
  `noUncheckedIndexedAccess` (which is why the non-empty tuple in `gz-exercise-detail.ts` and the
  `at()` helper in `testing.ts` exist), and `.oxlintrc.json` runs type-aware oxlint with the
  `no-unsafe-*` family, `explicit-function-return-type`, `explicit-module-boundary-types`,
  `consistent-type-imports`, `consistent-type-definitions`, `consistent-indexed-object-style`,
  `no-explicit-any` and `no-unsafe-type-assertion` all set to `error`. Every deviation from those
  rules in the codebase carries an `oxlint-disable-next-line` with a reason.

## Open Questions

- Nothing checks that a `db.query<Row, …>` generic matches the statement's actual `SELECT` list, and
  nothing checks that `src/frontend/types.ts` still matches what the routes return. Both are held by
  review and by the shared column constants; whether anything else is intended to catch that drift
  is not recorded in the docs beyond the note that `bun run typecheck` will not.
- Three modules describe the same composite responses (`WorkoutWithSets`/`WorkoutDetail`,
  `WorkoutPage` twice, `ExerciseProgress`/`Progress`): `src/frontend/types.ts`, `src/backend/testing.ts`,
  and the route handlers that build the objects inline with no named type at all. The documented
  reason covers the frontend copy; the test copy's rationale is not written down anywhere.
