---
date: 2026-09-15T07:54:05.851170+00:00
git_commit: cc3c0cc818e745a265931fa18125c965b84b6385
branch: main
topic: 'How database rows are translated into DTOs inside the backend'
tags: [research, codebase, backend, ports, dto, translators, repositories, controllers]
status: complete
---

# Research: How database rows are translated into DTOs inside the backend

## Research Question

How are database rows translated into DTOs inside the backend?

## Summary

A row becomes a DTO in exactly one kind of place: a `to<X>` function in the owning feature's
`ports/<entity>.ts`. There are eleven of them, they are the outbound half of the backend's type
boundary, and the only production code that calls them is a controller — the layer that turns the
result into a `Response`.

The shape of the conversion is always the same. A repository declares a row interface whose fields
carry the SQL column names verbatim (`muscle_group`, `performed_on`, `created_at`), hands it to
`db.query<Row, Params>(...)`, and returns it up through the feature's facade unchanged. The
controller then calls a `to<X>` mapper that builds a fresh object literal naming every field one at
a time, renaming each snake_case column to its camelCase DTO counterpart. The DTO types themselves
live outside the backend, in `src/shared/dto/`, which the frontend imports too.

That rename is not cosmetic — it is the enforcement mechanism. Because `Workout` has
`performed_on` and `WorkoutDto` has `performedOn`, a row is not structurally assignable to its own
DTO, so a controller that forgot to call a mapper does not typecheck. The mappers name every field
rather than spreading the row, so a column added to a table cannot silently reach the browser; the
two spreads that do exist in `ports/` spread an already-mapped DTO, not a row, and both carry a
comment saying so.

Translation in the inbound direction is a separate mechanism with separate files: `internal/
<entity>.translator.ts` casts a parsed JSON body onto a request DTO and, after the facade has
validated it, renames the DTO's camelCase fields back to the repository's snake_case input shape.
The two directions never share a function.

### Key files

```
src/
├── shared/
│   ├── flavors.ts                        flavored ids and dates used on both sides of the rename
│   └── dto/                              the wire format, types only, imported by the frontend too
│       ├── index.ts                      barrel; its header states the ports/ rule
│       ├── exercise.ts                   ExerciseDto, ExerciseWithStatsDto, SessionPointDto, …
│       ├── set.ts                        LiftSetDto, BestSetDto, CreateSetDto, EditSetDto
│       ├── workout.ts                    WorkoutDto, WorkoutWithStatsDto, WorkoutPageDto, …
│       ├── stats.ts                      SummaryDto
│       ├── meta.ts                       HealthDto           (never built from a row)
│       └── error.ts                      ErrorDto            (never built from a row)
└── backend/
    ├── db/
    │   └── db.ts                         `export type DB = Database` — Bun's bun:sqlite handle
    ├── http/
    │   ├── http.ts                       json(data: unknown, status) — the serializer
    │   └── errors.ts                     builds ErrorDto from an exception, not from a row
    └── features/
        ├── exercises/
        │   ├── ports/exercise.ts         ROW TYPES + toExercise, toExerciseWithStats,
        │   │                             toSessionPoint, toExerciseProgress
        │   ├── internal/exercise.repository.ts   SQL; returns rows
        │   ├── internal/exercise.translator.ts   inbound: body → DTO → CreateExercise
        │   ├── internal/exercise.controller.ts   calls the to* mappers
        │   └── exercises.facade.ts       validates, passes rows through untouched
        ├── workouts/
        │   ├── ports/workout.ts          Workout, WorkoutWithStats + toWorkout,
        │   │                             toWorkoutWithStats, toWorkoutWithSets, toWorkoutPage
        │   ├── ports/set.ts              LiftSet + toLiftSet, toBestSet
        │   ├── ports/sql.ts              SET_COLUMNS, EST_1RM_SQL — shared across features
        │   ├── internal/{workout,set}.repository.ts
        │   ├── internal/{workout,set}.translator.ts
        │   ├── internal/{workout,set}.controller.ts
        │   └── workouts.facade.ts        WorkoutFacade + SetFacade
        ├── stats/
        │   ├── ports/stats.ts            Summary + toSummary
        │   ├── internal/stats.repository.ts      merges two half-rows into one Summary
        │   ├── internal/stats.controller.ts
        │   └── stats.facade.ts
        └── meta/internal/meta.controller.ts      HealthDto literal; no table behind it
```

### The two directions

```
INBOUND   (internal/*.translator.ts + facade)
  Request body (unknown JSON)
    └─ readJsonObject(req)               http/http.ts:20   → Record<string, unknown>
        └─ translateTo<X>Dto(body)       *.translator.ts   → <X>Dto        (casts only)
            └─ facade.validateCreate()   *.facade.ts       → <X>Dto        (checked + normalised)
                └─ translateDtoTo<Create|Edit><Entity>(dto)
                                         *.translator.ts   → snake_case repository input
                    └─ repository.create(input)            → row

OUTBOUND  (ports/*.ts)                   ← this is what the question asks about
  repository.get/list/create/update      → row  (snake_case, flavored ids)
    └─ facade method                     → row  (passed straight through, never mapped)
        └─ to<X>(row)                    ports/<entity>.ts → <X>Dto (camelCase)
            └─ json(dto, status)         http/http.ts:3    → Response
```

The facade is deliberately not part of the outbound conversion: `docs/backend.md:98` puts it as
"the facades take request DTOs and publish rows". `ExerciseFacade.list()` returns
`ExerciseWithStats[]`, not `ExerciseWithStatsDto[]` (`exercises.facade.ts:16`), and the controller
maps it.

## Detailed Findings

### The mappers themselves

Every mapper is a free function, exported from a `ports/` module, taking a row (plus, sometimes,
extra arguments) and returning a DTO. None of them is a method, none is on a class, and none of
them touches the database.

| Mapper | Declared at | Row type in | DTO type out |
| --- | --- | --- | --- |
| `toExercise` | `exercises/ports/exercise.ts:30` | `Exercise` | `ExerciseDto` |
| `toExerciseWithStats` | `exercises/ports/exercise.ts:40` | `ExerciseWithStats` | `ExerciseWithStatsDto` |
| `toSessionPoint` | `exercises/ports/exercise.ts:54` | `SessionPoint` | `SessionPointDto` |
| `toExerciseProgress` | `exercises/ports/exercise.ts:66` | `Exercise` + `SessionPoint[]` + best set | `ExerciseProgressDto` |
| `toLiftSet` | `workouts/ports/set.ts:16` | `LiftSet` | `LiftSetDto` |
| `toBestSet` | `workouts/ports/set.ts:35` | `LiftSet & { performed_on }` | `BestSetDto` |
| `toWorkout` | `workouts/ports/workout.ts:20` | `Workout` | `WorkoutDto` |
| `toWorkoutWithStats` | `workouts/ports/workout.ts:30` | `WorkoutWithStats` | `WorkoutWithStatsDto` |
| `toWorkoutWithSets` | `workouts/ports/workout.ts:44` | `Workout` + `LiftSet[]` | `WorkoutWithSetsDto` |
| `toWorkoutPage` | `workouts/ports/workout.ts:48` | `WorkoutWithStats[]` + three numbers | `WorkoutPageDto` |
| `toSummary` | `stats/ports/stats.ts:20` | `Summary` | `SummaryDto` |

The simple ones are a single object literal. `toExercise` is the canonical example
(`exercises/ports/exercise.ts:30-38`):

```ts
export function toExercise(row: Exercise): ExerciseDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    createdAt: row.created_at,
  };
}
```

`toExerciseWithStats` (`exercises/ports/exercise.ts:40-52`) does not call `toExercise` and then add
the extra fields, even though `ExerciseWithStats extends Exercise` and
`ExerciseWithStatsDto extends ExerciseDto` — it restates all nine assignments. The same holds for
`toWorkoutWithStats` against `toWorkout` (`workouts/ports/workout.ts:30-42`).

### Row types live beside their mappers, in `ports/`

The row interfaces are declared in the same `ports/` files as the mappers, not in the repositories
that produce them: `Exercise`, `ExerciseWithStats` and `SessionPoint` at
`exercises/ports/exercise.ts:5-28`, `LiftSet` at `workouts/ports/set.ts:4-14`, `Workout` and
`WorkoutWithStats` at `workouts/ports/workout.ts:5-18`, `Summary` at `stats/ports/stats.ts:9-18`.
The repositories import them (`exercise.repository.ts:6-7`, `workout.repository.ts:5`,
`set.repository.ts:6`, `stats.repository.ts:3`).

`ports/` is the feature's public face, so this is what lets another feature read a row it does not
own: `ExerciseRepository.bestSet()` queries the `sets` table and types the result
`LiftSet & { performed_on: Iso8601Date }` by importing `LiftSet` from
`workouts/ports/set.ts` (`exercise.repository.ts:7,119-121`), and `toExerciseProgress` imports
`toBestSet` from the same place (`exercises/ports/exercise.ts:3`). The SQL fragments that make
those cross-feature queries possible — `SET_COLUMNS` and `EST_1RM_SQL` — sit in
`workouts/ports/sql.ts` for the same reason, which its header comment states explicitly
(`workouts/ports/sql.ts:1-5`).

The inverse case is the stats feature, where the *repository's* intermediate shapes are private and
only the published row is in `ports/`. `StatsRepository` runs two queries typed
`SummaryTotals` and `SummaryRecentActivity` — both declared in `internal/stats.repository.ts:6-19`
and exported from nothing — then merges them:

```ts
// stats.repository.ts:46-51
// Both queries aggregate, so SQLite always answers with a row. Spreading a
// null would quietly hand the endpoint an empty object, so refuse instead.
if (totals === null || recent === null) {
  throw new Error('Summary query returned no row');
}
return { ...totals, ...recent };
```

`Summary` is declared flat in `stats/ports/stats.ts:9-18` and its header says the two-query split
"is its own business, so the row is declared flat here and the repository has to satisfy it". The
merge is row→row; `toSummary` still performs the rename afterwards.

### How a row acquires its type in the first place

There is no ORM and no runtime row validation. A row's type is asserted by the generic parameter on
Bun's prepared statement:

```ts
// exercise.repository.ts:40-42
get(id: ExerciseId): Exercise | null {
  return this.db.query<Exercise, [ExerciseId]>(`SELECT ${EXERCISE_COLUMNS} FROM exercises e WHERE e.id = ?`).get(id);
}
```

`DB` is a bare alias for Bun's `Database` (`db/db.ts:6`), opened by `openDatabase`
(`db/db.ts:12-24`). The first generic argument is the row shape, the second the bound-parameter
tuple. Nothing checks at runtime that the `SELECT` list matches the interface — the correspondence
is maintained by hand between the column list constant (for example `EXERCISE_COLUMNS` at
`exercise.repository.ts:17`, `SET_COLUMNS` at `workouts/ports/sql.ts:13`) and the interface. Where
a query computes a column, the SQL aliases it to the interface's field name:
`COUNT(s.id) AS set_count`, `MAX(${EST_1RM_SQL}) AS est_one_rep_max`
(`exercise.repository.ts:27,108`).

Writes are typed the same way and use `RETURNING` so the created row comes back already shaped —
`exercise.repository.ts:54-59` and `workout.repository.ts:65-70`. `SetRepository.create` is the
exception: it returns only `RETURNING id` and then re-reads through `require(inserted.id)`
(`set.repository.ts:70-80`), because a `LiftSet` carries `exercise_name` from a join that the
`INSERT` cannot produce.

### Flavored ids survive the rename

Both the row and the DTO name the same flavored primitive from `src/shared/flavors.ts`:
`WorkoutId`, `ExerciseId`, `LiftSetId`, `Iso8601Date` (`YYYY-MM-DD`) and `Iso8601DateTime` (what
SQLite writes into `created_at`). The flavor marker is optional (`flavors.ts:8-11`), so a plain
`number` from SQLite flows into `WorkoutId` without a cast; what the compiler refuses is one flavor
standing in for another. So `LiftSet.workout_id: WorkoutId` (`workouts/ports/set.ts:6`) maps to
`LiftSetDto.workoutId: WorkoutId` (`src/shared/dto/set.ts:5`) and the mapper is a pure rename with
no type change on either side.

### Composite mappers, and the only two spreads

Four mappers build a DTO from more than one row, or from rows plus values that are not rows at all.
All four are still field-by-field.

`toWorkoutWithSets` (`workouts/ports/workout.ts:44-46`) and `toWorkoutPage`
(`workouts/ports/workout.ts:48-50`) fold a list in:

```ts
export function toWorkoutWithSets(row: Workout, sets: LiftSet[]): WorkoutWithSetsDto {
  return { ...toWorkout(row), sets: sets.map(toLiftSet) };
}

export function toWorkoutPage(rows: WorkoutWithStats[], total: number, limit: number, offset: number): WorkoutPageDto {
  return { items: rows.map(toWorkoutWithStats), total, limit, offset };
}
```

`toWorkoutPage`'s `total`, `limit` and `offset` never were columns: `total` comes from
`WorkoutRepository.count()` (`workout.repository.ts:37-39`, which unwraps a `{ n: number }` row to a
bare number), and `limit`/`offset` come from the query string via `queryInt`
(`workout.controller.ts:18-19`).

`toExerciseProgress` (`exercises/ports/exercise.ts:66-76`) assembles three independent repository
reads into one response body, delegating each part to the mapper that owns it:

```ts
return {
  exercise: toExercise(exercise),
  sessions: sessions.map(toSessionPoint),
  bestSet: bestSet === null ? null : toBestSet(bestSet),
};
```

`toBestSet` (`workouts/ports/set.ts:35-36`) is the one remaining spread, and its header comment is
explicit about why it is safe:

> The one spread in this directory, and it spreads a DTO rather than a row: `toLiftSet` has
> already named every field, so nothing internal can ride along. Spreading `row` here would
> ship `workout_id`, `exercise_id` and `created_at` to the browser without a word from anyone.

Both spreads in `ports/` therefore spread the output of a mapper, never a row.

### Where the mappers are called

Only in controllers, and — for the composite ones — inside other mappers in `ports/`. No facade,
no repository and no test calls a `to<X>` function.

| Call site | What it maps |
| --- | --- |
| `exercises/internal/exercise.controller.ts:12` | `this.exercises.list().map(toExerciseWithStats)` |
| `exercises/internal/exercise.controller.ts:17` | `toExercise(...)`, 201 |
| `exercises/internal/exercise.controller.ts:21` | `toExercise(...)` |
| `exercises/internal/exercise.controller.ts:27` | `toExercise(...)` |
| `exercises/internal/exercise.controller.ts:37` | `toExerciseProgress(require, progress, bestSet)` |
| `workouts/internal/workout.controller.ts:20` | `toWorkoutPage(list, count, limit, offset)` |
| `workouts/internal/workout.controller.ts:25` | `toWorkoutWithSets(...)`, 201 |
| `workouts/internal/workout.controller.ts:30` | `toWorkoutWithSets(...)` |
| `workouts/internal/workout.controller.ts:36` | `toWorkout(...)` |
| `workouts/internal/workout.controller.ts:47` | `this.sets.list(id).map(toLiftSet)` |
| `workouts/internal/workout.controller.ts:53` | `toLiftSet(...)`, 201 |
| `workouts/internal/set.controller.ts:12` | `toLiftSet(...)` |
| `workouts/internal/set.controller.ts:18` | `toLiftSet(...)` |
| `stats/internal/stats.controller.ts:9` | `toSummary(...)` |

Three mappers have no controller call site and are reached only from another mapper:
`toWorkoutWithStats` (from `toWorkoutPage`), `toSessionPoint` and `toBestSet` (both from
`toExerciseProgress`). `toExercise`, `toLiftSet` and `toWorkout` are called from both places.

A controller line is typically the whole conversion, written inline:

```ts
// exercise.controller.ts:20-22
show(req: ParamRequest): Response {
  return json(toExercise(this.exercises.require(pathId(req.params.id, 'exercise'))));
}
```

Note that `WorkoutController` imports `toLiftSet` from `../ports/set.ts`
(`workout.controller.ts:6`) — a controller reaching into a sibling entity's port inside its own
feature — because `GET /api/workouts/:id/sets` returns bare sets.

Deletes return `noContent()` (`http/http.ts:7-9`) and map nothing:
`exercise.controller.ts:32`, `workout.controller.ts:41`, `set.controller.ts:23`.

### What reaches the wire without a mapper

Two response bodies are DTOs that were never rows, so no mapper exists for them:

- `HealthDto` is a literal in `meta/internal/meta.controller.ts:7` — `{ status: 'ok', app: 'gainz' }`.
  The meta feature has no facade and no table (`docs/backend.md:106`).
- `ErrorDto` is built from a thrown exception in `http/errors.ts:20-28`, reading `err.message`,
  `err.status` and `err.details` off an `HttpError` (`errors.ts:5-14`) constructed by
  `badRequest`, `notFound` or `conflict` (`errors.ts:16-18`). The error path never sees a row.
  `ErrorDto.details` is typed `unknown` (`src/shared/dto/error.ts:3`), and the only values passed
  into it in the backend come from validators.

The static feature builds `Response` objects over files and transpiled source strings
(`static/internal/static.controller.ts`) and never serializes JSON.

No production call site hands a raw row to `json()`.

### Enforcement

`json()` itself imposes nothing — its parameter is `data: unknown` (`http/http.ts:3`). Three
separate things keep rows off the wire instead.

**The rename, checked by the compiler.** Because every row field is snake_case and every DTO field
camelCase, a row is not assignable to its DTO, so omitting a mapper is a type error at the
controller. `docs/backend.md:43-44` states this as the design intent: "The camelCase rename is what
keeps that honest — a row is not structurally assignable to its own DTO."

**Lint overrides in `.oxlintrc.json`.** Three backend overrides bear on this, in the `overrides`
block at `.oxlintrc.json:129-175`. Route files may not import `**/ports/**` at all, which is what
forces `to<X>` calls down into controllers (`.oxlintrc.json:131-152`, message: "Route handlers pass
the request to their controller and return its response."). Controllers may not import a
`*.repository.ts` (`.oxlintrc.json:154-169`, message: "Controllers reach the database through their
feature's facade."), so a controller cannot obtain an unmapped row by any route but the facade.
The third override switches `typescript/no-unsafe-type-assertion` off for `*.translator.ts`
(`.oxlintrc.json:170-175`), which is about the inbound direction — casting a body onto a request DTO
is half of a translator's job. `typeAware` is on globally (`.oxlintrc.json:3-5`), and `bun run lint`
runs `oxlint` with no other tool.

**The type-only rule on `src/shared/`.** The DTO modules must contain no runtime code, because
`src/shared/` sits outside the web root that `resolveStaticPath` allows
(`static/internal/paths.ts`); the frontend's `import type` erases whole, so the browser never
requests the module. The header of `src/shared/dto/index.ts:1-17` explains this and closes with the
sentence that names the outbound rule from the DTO side: "The backend translates its repository
rows into these shapes in each feature's `ports/`; the rows themselves stay snake_case and never
leave the feature that owns the table."

### The inbound counterpart, for contrast

The reverse translation is not done by the `ports/` mappers. It lives in `internal/*.translator.ts`
and is split in two halves with different jobs:

- `translateTo<X>Dto(body: Record<string, unknown>)` casts a parsed body onto a request DTO field by
  field and checks nothing (`exercise.translator.ts:4-18`, `set.translator.ts:5-23`,
  `workout.translator.ts:6-21`). This is the half the lint override exempts from
  `no-unsafe-type-assertion`.
- `translateDtoTo<Create|Edit><Entity>(dto)` renames camelCase back to snake_case and produces the
  repository's input shape (`exercise.translator.ts:20-40`, `set.translator.ts:25-53`,
  `workout.translator.ts:29-49`). The `Edit` half builds the patch conditionally, one
  `if (dto.x !== undefined)` per field, so that an absent field is not written; the repository's
  `buildUpdate` (`db/sql.ts:30-51`) then tests membership with `in` rather than `!== undefined`, so
  an explicit `null` still clears a column.

The input shapes are declared in the repositories, not in `ports/`: `CreateExercise` /
`EditExercise = Partial<CreateExercise>` (`exercise.repository.ts:9-15`), `CreateWorkout` /
`EditWorkout` (`workout.repository.ts:7-13`), `CreateSet` / `EditSet` (`set.repository.ts:9-17`).

Validation sits between the two halves, in the facade's private `validateCreate` / `validateEdit`
(`exercises.facade.ts:44-64`, `workouts.facade.ts:47-68` and `99-127`), using the helpers in
`shared/validate.ts`. `translateDtoToCreateWorkout` is the only translation that reads the clock —
a create body with no date means today — and its header comment says so
(`workout.translator.ts:23-35`).

So an entity has four types along the path, and each one is declared once:

```
EditSetDto           src/shared/dto/set.ts:29           camelCase, shared with the frontend
  EditSet            internal/set.repository.ts:17      snake_case, private to the feature
    LiftSet          ports/set.ts:4                     snake_case row, public to other features
      LiftSetDto     src/shared/dto/set.ts:3            camelCase, shared with the frontend
```

## Code References

- `src/backend/features/exercises/ports/exercise.ts:30-76` — `toExercise`, `toExerciseWithStats`, `toSessionPoint`, `toExerciseProgress`, plus the three row interfaces they consume
- `src/backend/features/workouts/ports/set.ts:16-37` — `toLiftSet` and `toBestSet`, with the comment explaining the spread
- `src/backend/features/workouts/ports/workout.ts:20-50` — `toWorkout`, `toWorkoutWithStats`, `toWorkoutWithSets`, `toWorkoutPage`
- `src/backend/features/stats/ports/stats.ts:9-31` — the flat `Summary` row and `toSummary`
- `src/backend/features/workouts/ports/sql.ts:11-13` — `EST_1RM_SQL` and `SET_COLUMNS`, the cross-feature SQL fragments
- `src/backend/features/exercises/internal/exercise.repository.ts:23-131` — typed queries producing `ExerciseWithStats`, `Exercise`, `SessionPoint` and a joined best set
- `src/backend/features/workouts/internal/set.repository.ts:61-87` — `RETURNING id` followed by a re-read, because `exercise_name` comes from a join
- `src/backend/features/stats/internal/stats.repository.ts:6-52` — the two private half-row interfaces and the merge into `Summary`
- `src/backend/features/exercises/internal/exercise.controller.ts:11-38` — every exercise mapper call site
- `src/backend/features/workouts/internal/workout.controller.ts:16-54` — every workout mapper call site, including the import of `toLiftSet` from the sibling port
- `src/backend/features/workouts/internal/set.controller.ts:11-19` — `toLiftSet` on show and update
- `src/backend/features/stats/internal/stats.controller.ts:8-10` — the whole stats wire surface
- `src/backend/features/exercises/exercises.facade.ts:16-42` — the facade returning rows, not DTOs
- `src/backend/features/workouts/workouts.facade.ts:22-45` and `79-97` — the same for workouts and sets
- `src/backend/features/exercises/internal/exercise.translator.ts:1-40` — the inbound pair, both halves
- `src/backend/features/workouts/internal/workout.translator.ts:23-35` — the one DTO-to-input translation that reads the clock
- `src/backend/db/sql.ts:30-51` — `buildUpdate`, which consumes the snake_case patch a translator produced
- `src/backend/db/db.ts:6,12-24` — `DB` and `openDatabase`
- `src/backend/http/http.ts:3-5,20-31` — `json(data: unknown, …)` and `readJsonObject`
- `src/backend/http/errors.ts:20-28` — `ErrorDto` built from an exception rather than a row
- `src/backend/features/meta/internal/meta.controller.ts:6-9` — `HealthDto` as a literal
- `src/shared/dto/index.ts:1-24` — the barrel and the header stating the `ports/` rule
- `src/shared/flavors.ts:8-21` — the flavored primitives that both rows and DTOs name
- `.oxlintrc.json:129-175` — the three backend overrides
- `docs/backend.md:14-44,84-100` — the prose statement of the same rules

## Architecture Documentation

**One function per shape per direction, and each one is exhaustive.** Eleven `to<X>` functions
outbound, six `translate*` functions inbound, and no generic mapper, decorator or key-transforming
helper anywhere. Every mapper lists every field. `docs/backend.md:41-43` gives the reason: "a spread
would compile and would ship `workout_id` and `created_at` to the browser with nothing to catch it."

**Conversion is anchored to the layer that owns the wire.** The controller both reads the request
(`pathId`, `queryInt`, `readJsonObject`) and maps the response (`to<X>`, `json`). The facade
validates and publishes rows; the repository owns SQL and the error status a failed constraint
earns. `docs/backend.md:31` writes the controller's path as
`body → translateTo<X>Dto → <X>Dto → facade → row → to<X> → DTO`, and the code matches it line for
line.

**Public row, private everything else.** A feature's `ports/` holds the row types other features may
read and the mappers over them; `internal/` holds the repository, its `Create`/`Edit` input types,
the translator and the controllers. The exercises feature reading the `sets` table is the only
production cross-feature dependency, and it lands entirely on `workouts/ports/` — `LiftSet`,
`toBestSet`, `SET_COLUMNS`, `EST_1RM_SQL`.

**Composition of reads happens in the controller.** `GET /api/workouts/:id` calls two facades and
joins the results with `toWorkoutWithSets` (`workout.controller.ts:30`); `GET /api/exercises/:id/
progress` calls three facade methods and joins them with `toExerciseProgress`
(`exercise.controller.ts:37`). The mapper is where the join is expressed, so the composite DTO has
one named producer.

**The composition root is `features/facades.ts`.** `createFacades(db)` (`features/facades.ts:22-28`)
is the only place a repository is constructed, and it is called by `http/server.ts` and by
`src/scripts/seed.ts`. The seeder therefore goes through facades with camelCase DTOs
(`src/scripts/seed.ts:52`), so seeded data passes the same validation as an API request — but it
never touches the outbound mappers, since it discards what the facades return.

## Open Questions

- `src/shared/shared.test.ts` is referenced by `src/shared/dto/index.ts:9`, `docs/frontend.md:98`
  and `src/backend/features/static/internal/transpile.test.ts:39` as the test that pins
  `src/shared/` to type-only code, but no such file exists in the tree at this commit
  (`src/shared/` contains only `flavors.ts` and `dto/`).
- Nothing checks at runtime that a `SELECT` list matches the row interface asserted on
  `db.query<Row, Params>`, so the correspondence between a column-list constant and its interface
  is maintained by hand. Whether any test exercises that correspondence directly was not
  established here.
- The `features/<a>/` ↛ `features/<b>/internal/` boundary is stated in `docs/backend.md:18` but
  there is no `no-restricted-imports` override expressing it; the backend overrides in
  `.oxlintrc.json` cover route files, controllers and translators only.
- `toWorkoutWithStats`, `toSessionPoint` and `toBestSet` are exported from `ports/` (so other
  features may call them) but today are reached only from within the same `ports/` directory.

## Prior research on this topic

Two earlier reports overlap and are useful mainly as dated snapshots:

- `docs/agents/research/2026-09-11-data-type-declarations.md` (commit `5d3ed74`) predates the DTO
  layer: it describes `src/backend/db/repos/` and route files handing raw rows straight to
  `json()`, with no `to*` functions and no `src/shared/dto/` at all.
- `docs/agents/research/2026-09-12-repositories-and-route-handlers.md` (commit `89659b2`) describes
  the mappers as they are today but places the calls in route handlers, before controllers and
  facades existed, and names the inbound files `*.mapper.ts` with `from<X>` functions — they are now
  `*.translator.ts` with `translateDtoTo<Create|Edit><Entity>`.
