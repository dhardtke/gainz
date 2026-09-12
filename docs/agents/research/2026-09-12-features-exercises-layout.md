---
date: 2026-09-12T17:39:36+00:00
git_commit: 4893a581c636d8b2a7e86786a42b1872f5d74b83
branch: main
topic: 'How features/exercises is built: the translate naming convention and the move into internal/'
tags: [research, codebase, backend, features, exercises, internal, ports, translator, repository]
status: complete
---

# Research: How `features/exercises` is built

## Research Question

How is `src/backend/features/exercises/` built? In particular: what is the naming convention of
the translate methods, and how did the repository and the translation functions move into the new
`internal/` folder?

## Summary

`features/exercises/` is the first — and at this commit the only — feature folder carried all the
way through the in-flight restructuring from layer-first directories (`db/repos/`, `http/dto/`,
`http/routes/`) to feature-first ones (`src/backend/features/<feature>/`). Everything described
here lives in the **uncommitted working tree**: `HEAD` is `4893a58 docs: Mark the shared-DTO plan
complete`, and no commit yet contains a `features/` directory.

The feature splits into three visible levels:

- the **route module at the feature root** (`exercise.routes.ts`), which is what `http/routes.ts`
  imports;
- **`ports/`**, holding the types and mapper functions that other features and the rest of the
  backend are allowed to import — the row interfaces, the `to*` row-to-DTO mappers and the
  `from*` DTO-to-repository-input mappers;
- **`internal/`**, holding the two modules the feature does not offer outwards: the SQL-owning
  `ExerciseRepository` class and the new `exercise.translator.ts`.

The translate functions follow a single mechanical rule: **`translateTo` + the exact name of the
shared DTO type returned**. `translateToCreateExerciseDto` returns `CreateExerciseDto`;
`translateToEditExerciseDto` returns `EditExerciseDto`. They are the renamed successors of the
file-private `readExerciseBody` / `readEditExerciseBody` that still exist, under the old names, in
the sets and workouts route files.

```
src/backend/
├── main.ts                                  composition root: new Repo(db) -> serveOptions(repo)
├── db/
│   ├── db.ts, migrations.ts, migrations/
│   └── repos/
│       ├── index.ts                         the `Repo` facade — still constructs ExerciseRepository
│       ├── sql.ts                           shared SQL fragments + buildUpdate()
│       ├── sets.ts, workouts.ts, stats.ts   the three repositories NOT yet moved
│       └── (exercises.ts — gone, moved into the feature)
├── features/
│   ├── exercises/                           ← the fully migrated feature
│   │   ├── exercise.routes.ts               route table factory, the feature's public entry point
│   │   ├── exercise.routes.test.ts          end-to-end HTTP tests, beside the module
│   │   ├── ports/
│   │   │   └── exercise.ts                  row interfaces + to*/from* mappers (importable)
│   │   └── internal/
│   │       ├── exercise.repository.ts       class ExerciseRepository — all the SQL
│   │       └── exercise.translator.ts       translateTo*Dto — request body -> shared DTO
│   ├── sets/       ports/set.ts,     set.routes.ts        (no internal/)
│   ├── workouts/   ports/workout.ts, workout.routes.ts    (no internal/)
│   ├── meta/       ports/stats.ts,   meta.routes.ts, stats.routes.ts  (no internal/)
│   └── static/     paths.ts, static.routes.ts, transpile.ts
├── http/
│   ├── routes.ts                            the registry, imports every feature's route factory
│   ├── routes/shared.ts                     RouteTable, guard/guardAll, MAX_NAME, MAX_NOTES
│   ├── http.ts, errors.ts, server.ts
│   └── (dto/ — deleted; its four files became the four ports/ files)
└── shared/validate.ts                       per-field parsers: requiredString, optionalString, …
```

The request path through the migrated feature, with the folder each step lives in:

```
  HTTP request body                       Record<string, unknown>
        │
        │  internal/exercise.translator.ts
        ▼  translateToCreateExerciseDto()  ── parses + bounds each field via shared/validate.ts
  CreateExerciseDto (camelCase)            ── the shared wire contract, src/shared/dto/
        │
        │  ports/exercise.ts
        ▼  fromCreateExercise()            ── camelCase DTO -> snake_case repository input
  ExerciseInput (snake_case)
        │
        │  db/repos/index.ts facade -> internal/exercise.repository.ts
        ▼  repo.createExercise()  ->  ExerciseRepository.create()
  Exercise (snake_case row)
        │
        │  ports/exercise.ts
        ▼  toExercise()                    ── row -> DTO, every field named, no spread
  ExerciseDto (camelCase)  ->  json(…, 201)
```

## Detailed Findings

### The naming convention of the translate methods

`src/backend/features/exercises/internal/exercise.translator.ts` is a 25-line module exporting
exactly two functions:

```ts
export function translateToCreateExerciseDto(body: Record<string, unknown>): CreateExerciseDto
export function translateToEditExerciseDto(body: Record<string, unknown>): EditExerciseDto
```

The convention is `translateTo` followed by the identifier of the DTO type in the return position,
`Dto` suffix included. The name therefore restates the return type, and the target of the
translation — not its source — is what appears in the name. Both take the same untyped input,
`Record<string, unknown>`, so the input needs no mention.

The two functions differ in how they treat absent fields, which is what the `Create`/`Edit`
distinction carries:

- `translateToCreateExerciseDto` (`exercise.translator.ts:5-11`) builds the whole object
  unconditionally — `requiredString(body, 'name', MAX_NAME)`, then `optionalString` for
  `muscleGroup` and `notes`.
- `translateToEditExerciseDto` (`exercise.translator.ts:13-25`) starts from an empty
  `EditExerciseDto` and adds a key only when `isPresent(body, …)` says the caller sent it, so a
  `PATCH` writes exactly the fields it names.

The field parsing itself is not part of the translator: `requiredString`, `optionalString` and
`isPresent` come from `src/backend/shared/validate.ts`, and the length bounds `MAX_NAME` (120) and
`MAX_NOTES` (2000) from `src/backend/http/routes/shared.ts:26-27`. The translator's own body is
field-name mapping and nothing else.

**The predecessors, and where they still live.** The committed version of the same code
(`src/backend/http/routes/exercise.routes.ts` at `HEAD`, now deleted) had these as two
module-private functions at the top of the route file:

```ts
function readExerciseBody(body: Record<string, unknown>): CreateExerciseDto
function readEditExerciseBody(body: Record<string, unknown>): EditExerciseDto
```

So the rename changed three things at once: `read…Body` → `translateTo…Dto`, module-private →
exported, and inside the route file → in its own `internal/` module.

Every other feature still carries the old form, inline in the route file:

| Feature | Function | Location | Visibility |
| --- | --- | --- | --- |
| exercises | `translateToCreateExerciseDto` | `internal/exercise.translator.ts:5` | exported |
| exercises | `translateToEditExerciseDto` | `internal/exercise.translator.ts:13` | exported |
| sets | `readSetBody` | `set.routes.ts:10` | exported (workouts imports it) |
| sets | `readEditSetBody` | `set.routes.ts:20` | module-private |
| workouts | `readWorkoutBody` | `workout.routes.ts:10` | module-private |
| workouts | `readEditWorkoutBody` | `workout.routes.ts:19` | module-private |

`TODO.md:7-8` names this same gap in its own words: "readWorkoutBody and readSetBody should be part
of an explicit mapping layer" and "Validation should not be part of mapping (requiredInt, etc.)".

**The plan document was rewritten to match.** `docs/agents/plans/2026-09-11-shared-dto-translation-layer.md`
is modified in the working tree, and one of the modifications replaces the old names with the new
ones inside an already-ticked checklist item (lines 434-435):

```diff
-- [x] `src/backend/http/routes/exercise.routes.ts`: `readExerciseBody` returns `CreateExerciseDto`
-      reading `muscleGroup`; add `readEditExerciseBody` returning `EditExerciseDto`; map all four
+- [x] `../../../src/backend/features/exercises`: `translateToCreateExerciseDto` returns `CreateExerciseDto`
+      reading `muscleGroup`; add `translateToEditExerciseDto` returning `EditExerciseDto`; map all four
```

The committed plan therefore did not prescribe the `translateTo…Dto` convention — it prescribed
`readExerciseBody` — and the convention appears only in the working tree, in the code and in the
retroactively edited plan.

The same substitution reached further back. `docs/agents/plans/2026-09-10-split-routes-into-per-entity-files.md`
predates the DTO layer entirely, and six of its lines now read `translateToCreateExerciseDto` where
the committed text read `readExerciseBody` — including a diagram line (`:112`) and a checklist item
(`:369-372`) that still says the function "stays module-private", which the exported translator is
not. In that plan the function returned `ExerciseInput`, not a DTO, so the new name does not
describe what the document is describing.

The sweep touched ten files under `docs/agents/` (79 insertions, 79 deletions), rewriting paths into
relative forms such as `../../../src/backend/features/exercises/ports/exercise.ts` and collapsing
several distinct files onto one directory string (`../../../src/backend/features/static` stands in
for what were `static.routes.ts`, `static.routes.test.ts` and `transpile.ts`). `AGENTS.md:26-27`
states the opposite rule for those files: "Never edit existing plans or research docs in
`docs/agents/` — only add new ones. Each describes the repository as it stood on the date it carries,
so an old path in one is a record, not a bug."

### Two different meanings of "translation" in the feature

The feature has conversion code in both `internal/` and `ports/`, and they convert different
things in different directions:

| | `internal/exercise.translator.ts` | `ports/exercise.ts` |
| --- | --- | --- |
| Direction | inbound: untrusted JSON → DTO | both: row → DTO, DTO → repo input |
| Input type | `Record<string, unknown>` | typed rows / typed DTOs |
| Can it reject? | yes — throws `badRequest` via `validate.ts` | no, total functions |
| Naming | `translateTo<Dto>` | `to<Shape>` / `from<Operation>` |
| Visible outside the feature | no | yes |

`ports/exercise.ts` holds six mappers, three of each prefix:

- `toExercise(row: Exercise): ExerciseDto` (`ports/exercise.ts:37`)
- `toExerciseWithStats(row: ExerciseWithStats): ExerciseWithStatsDto` (`:47`)
- `toSessionPoint(row: SessionPoint): SessionPointDto` (`:61`)
- `toExerciseProgress(exercise, sessions, bestSet): ExerciseProgressDto` (`:73`) — the one that
  composes, calling `toExercise`, `toSessionPoint` and `toBestSet`
- `fromCreateExercise(dto: CreateExerciseDto): ExerciseInput` (`:81`)
- `fromEditExercise(dto: EditExerciseDto): Partial<ExerciseInput>` (`:89`)

Each names every field explicitly; none spreads a row. `docs/backend.md:18-24` states the rule that
this follows ("**A route returns a DTO, never a row**", and a spread "would ship `workout_id` and
`created_at` to the browser with nothing to catch it"), and `features/sets/ports/set.ts:30-34`
carries the one comment explaining the single permitted spread, which spreads an already-mapped DTO
rather than a row.

### What moved into `internal/`, and what changed in the move

Two modules sit in `internal/`, and they arrived there by different routes.

**`internal/exercise.repository.ts` — a rename of `db/repos/exercises.ts`.** Git records it as a
rename with 77% similarity. Four things changed:

1. **The class was renamed** `ExerciseRepo` → `ExerciseRepository` (`exercise.repository.ts:9`).
   The three repositories still in `db/repos/` keep the short form: `SetRepo`, `WorkoutRepo`,
   `StatsRepo`.
2. **The four row interfaces were removed from it** — `Exercise`, `ExerciseWithStats`,
   `SessionPoint` and `ExerciseInput` were declared in the old `db/repos/exercises.ts` and are now
   declared in `ports/exercise.ts:5-35`. The repository imports them back:
   `import type { Exercise, ExerciseInput, ExerciseWithStats, SessionPoint } from '../ports/exercise.ts';`
   (`exercise.repository.ts:4`). The dependency therefore points **from `internal/` into `ports/`**,
   not the other way.
3. **Its imports were re-pointed** three levels up for the things that stayed behind — `DB` from
   `../../../db/db.ts`, the error constructors from `../../../http/errors.ts`, and the shared SQL
   fragments (`buildUpdate`, `EST_1RM_SQL`, `EXERCISE_COLUMNS`, `isUniqueViolation`,
   `SET_COLUMNS`) from `../../../db/repos/sql.ts` (`exercise.repository.ts:1-3`). SQL fragments are
   the one thing the feature still reaches back into `db/repos/` for.
4. **`LiftSet` now comes from the sets feature**, `import type { LiftSet } from '../../sets/ports/set.ts';`
   (`:5`), where before it came from the sibling `./sets.ts`. Cross-feature type dependencies go
   through the other feature's `ports/`.

The class's eight methods are unchanged in body and keep their bare, entity-free names — `list`,
`get`, `require`, `create`, `update`, `delete`, `progress`, `bestSet` — because the facade supplies
the entity half of each name.

The move also rewrote the word "exercise" to "exercises" in prose that surrounds the code: the two
doc comments now read "Per-session aggregates for one exercises" (`:87`) and "The single best set
ever recorded for an exercises" (`:107`), and the thrown message reads
`'Insert of exercises returned no row'` (`:50`). The same substitution appears in the test names
(`exercise.routes.test.ts:36`, `:40`, `:49`) and in `src/shared/dto/exercise.ts:18` and `:38`.

**`internal/exercise.translator.ts` — a new file.** Git records it as added, not renamed; its
content is the two functions lifted out of the old route file and renamed as described above.

**What did not move into `internal/`.** The route module stays at the feature root rather than in a
subfolder, and its test sits beside it. `ports/exercise.ts` is a rename of `http/dto/exercise.ts`
(69% similarity) that gained the four row interfaces the repository shed.

### How the route module consumes the three pieces

`exercise.routes.ts` is 38 lines and imports from all three directions (`:1-7`): plumbing from
`http/`, the `Repo` facade type from `db/repos`, `pathId` from `shared/validate.ts`, the mappers
from `./ports/exercise.ts`, and the translators from `./internal/exercise.translator.ts`. Note that
the feature root imports its own `internal/` — the folder is internal to the feature, not to a
narrower scope.

The `POST` handler composes all three layers in one expression (`:13`):

```ts
POST: async (req) => json(toExercise(repo.createExercise(fromCreateExercise(translateToCreateExerciseDto(await readJsonObject(req))))), 201),
```

read inside-out: parse body → `translateToCreateExerciseDto` → `fromCreateExercise` →
`repo.createExercise` → `toExercise` → `json`. The `PATCH` handler (`:19-23`) breaks the same chain
across three statements. Handler bodies were not otherwise changed by the move — the diff against
the deleted `http/routes/exercise.routes.ts` shows only the import block and the two call sites.

The factory signature `exerciseRoutes(repo: Repo): RouteTable` is unchanged. Notably the migrated
feature still receives the central `Repo` facade rather than its own `ExerciseRepository`: the
repository class moved into the feature, but the feature does not construct or import it.

### What still points at the old layout

`db/repos/index.ts` remains the composition point for every repository, including the one that
moved. It reaches across into the feature folder for both the class and the types
(`db/repos/index.ts:7`):

```ts
import { type Exercise, ExerciseRepository, type ExerciseInput, type ExerciseWithStats, type SessionPoint } from '../../features/exercises/internal/exercise.repository.ts';
```

and re-exports those types on line 12, constructs `new ExerciseRepository(db)` on line 21, passes
it to `SetRepo` on line 23, and keeps its eight flat delegating methods under the `// ---- exercises`
banner (`:27-59`). Its own header comment (`:1-5`) still asserts that "All SQL in this project lives
under `src/backend/db/repos/` and nowhere else", which the move made no longer literally true of
the exercises SQL.

`bun run typecheck` currently exits 1 with seven errors, all outside the exercises feature:

```
src/backend/db/repos/index.ts(7,15|50|70|94): TS2459: Module '".../exercise.repository.ts"' declares 'Exercise' / 'ExerciseInput' / 'ExerciseWithStats' / 'SessionPoint' locally, but it is not exported.
src/backend/db/repos/index.ts(8,15):          TS2459: Module '"./sets.ts"' declares 'LiftSet' locally, but it is not exported.
src/backend/features/sets/set.routes.ts(4,40):        TS2307: Cannot find module '../../http/dto'
src/backend/features/workouts/workout.routes.ts(4,123): TS2307: Cannot find module '../../http/dto'
```

The first five are the facade asking `exercise.repository.ts` and `sets.ts` for row types those
modules no longer declare — the types now live in the respective `ports/` files. The last two are
the two route files still importing the deleted `http/dto` barrel. Every module inside
`features/exercises/` typechecks.

The prose documentation still describes the pre-move layout. `docs/backend.md:5-10` names the chain
`db/repos/` → `http/dto/` → `http/routes.ts` and lists the route files under `http/routes/`;
`docs/backend.md:26` says `paths.ts`, `transpile.ts` and `testing.ts` "stay at the top of
`src/backend/`", though the first two are now under `features/static/`. The one working-tree edit to
that file is line 40, where the facade's delegate list changed from `exercises.ts` to
`exercise.repository.ts`. Neither `docs/backend.md` nor `AGENTS.md` mentions `features/`, `internal/`
or `ports/` at all. `src/shared/dto/index.ts:10` still says the backend translates rows "in
`src/backend/http/dto/`".

### Wiring, unchanged by the move

`http/routes.ts` imports all six route factories by their new feature paths and spreads them into
one table in `allRoutes(repo)`; its doc comment still says "one file per URL group under `routes/`".
`main.ts` opens the database, constructs the single `Repo`, and hands it to `serveOptions(repo)`,
which calls `allRoutes(repo)`. `src/backend/testing.ts` and `src/scripts/seed.ts` construct their
own `Repo` the same way.

## Code References

- `src/backend/features/exercises/exercise.routes.ts:1-7` — the import block: ports, internal,
  and the `Repo` facade side by side
- `src/backend/features/exercises/exercise.routes.ts:13` — the full inbound/outbound chain in one
  expression
- `src/backend/features/exercises/internal/exercise.translator.ts:5` — `translateToCreateExerciseDto`
- `src/backend/features/exercises/internal/exercise.translator.ts:13` — `translateToEditExerciseDto`,
  with the `isPresent` guard per field
- `src/backend/features/exercises/internal/exercise.repository.ts:4-5` — the repository importing
  its own row types from `../ports/`, and `LiftSet` from the sets feature's ports
- `src/backend/features/exercises/internal/exercise.repository.ts:9` — `class ExerciseRepository`
- `src/backend/features/exercises/ports/exercise.ts:5-35` — the four row interfaces, with the
  `TODO` on `ExerciseInput` at line 30
- `src/backend/features/exercises/ports/exercise.ts:37-101` — the six `to*` / `from*` mappers
- `src/backend/features/exercises/ports/exercise.ts:3` — `LiftSet` imported from `../../../db/repos`
  here, while the repository imports the same name from `../../sets/ports/set.ts`
- `src/backend/db/repos/index.ts:7,21,23` — the facade's remaining hold on the moved repository
- `src/backend/features/sets/set.routes.ts:10,20` and `src/backend/features/workouts/workout.routes.ts:10,19`
  — the four surviving `read…Body` functions
- `src/backend/http/routes/shared.ts:26-27` — `MAX_NAME` / `MAX_NOTES`, imported by the translator
- `src/backend/shared/validate.ts:5,10,23` — `isPresent`, `requiredString`, `optionalString`
- `src/shared/dto/exercise.ts` — the six exercise DTOs the translators and mappers target
- `docs/agents/plans/2026-09-11-shared-dto-translation-layer.md:434-435` — the checklist item
  rewritten from `readExerciseBody` to `translateToCreateExerciseDto`
- `docs/agents/plans/2026-09-11-shared-dto-translation-layer.md:84-90` — decision 5, the per-entity
  split that `ports/` inherited
- `docs/agents/plans/2026-09-10-split-routes-into-per-entity-files.md:52-53` — the `.routes.ts`
  suffix rule, the only file-naming convention stated in the repository
- `AGENTS.md:26-27` — the rule that documents under `docs/agents/` are never edited

## Architecture Documentation

Patterns visible in the migrated feature as it stands:

- **File names carry a role suffix.** `<entity>.routes.ts`, `<entity>.repository.ts`,
  `<entity>.translator.ts` — singular entity, dot, role. The feature folder itself is plural
  (`exercises/`), as are `ports/` and `internal/`. Only the first of those suffixes is written down
  anywhere: `docs/agents/plans/2026-09-10-split-routes-into-per-entity-files.md:52-53` states "File
  names are singular with a `.routes` suffix". No document in the repository prescribes
  `.repository.ts`, `.translator.ts`, `internal/` or `ports/`; the convention exists in the code
  alone. The nearest committed precedent for the `ports/` split is decision 5 of the shared-DTO
  plan (`:84-90`), which prescribed `src/backend/http/dto/{exercise,workout,set,stats,index}.ts` —
  "both sides split per entity, mirroring `db/repos/`" — and those are the exact four files that
  became the four `ports/` files.
- **`ports/` is the feature's outward surface, `internal/` is not imported from outside it.** At
  this commit, nothing outside `features/exercises/` imports from its `internal/` except
  `db/repos/index.ts`, which is the module the restructuring has not reached. Cross-feature
  imports go port-to-port: `exercises/internal/exercise.repository.ts:5` and
  `exercises/ports/exercise.ts:2` both reach into `sets/ports/set.ts`.
- **Row types live in `ports/`, not beside the SQL.** The repository is the only module that writes
  SQL, but it no longer owns the shapes that SQL returns — it imports them from its own `ports/`.
  A `TODO` at `ports/exercise.ts:30` records an intent for `ExerciseInput` specifically: "get rid of
  `ExerciseInput`, only declare it inside `ExerciseRepository` but don't export it".
- **Two conversion vocabularies, one per direction of trust.** `translateTo<Dto>` for turning an
  untrusted `Record<string, unknown>` into a DTO (may throw `badRequest`); `to<Shape>` and
  `from<Operation>` for total conversions between typed shapes.
- **Names do not repeat their container.** `ExerciseRepository` methods are `list`, `get`, `create`;
  the entity appears once, in the class name, and again in the facade's flat method names
  (`repo.listExercises`). The translator functions are the exception — they carry the full DTO name,
  because that name is their contract.
- **The `Repo` facade survives the feature split.** Route modules take `Repo`, never a concrete
  repository, so moving `ExerciseRepository` into the feature changed no handler code.
- **Tests sit beside the module they exercise and drive it over HTTP.** `exercise.routes.test.ts`
  moved with the route file, imports only DTO types from `../../../shared/dto`, and names no
  internal module.

## Open Questions

- Whether `db/repos/index.ts` is intended to keep owning `ExerciseRepository`, or whether the
  facade is itself due to move or dissolve — the five TS2459 errors sit exactly on that seam, and
  `sets.ts` shows the mirror-image case (it imports `LiftSet` back from `features/sets/ports/set.ts`
  while `index.ts` still tries to re-export it from `sets.ts`).
- Whether `sql.ts` is meant to stay in `db/repos/` as shared SQL infrastructure — it is currently
  the only thing `features/exercises/internal/` reaches back into `db/repos/` for.
- Whether the `read…Body` functions in the sets and workouts features are to be renamed
  `translateTo…Dto` and moved into `internal/` folders of their own; `TODO.md:7-8` records the
  intent to give them "an explicit mapping layer" but predates the `internal/` convention.
- `features/sets/ports/set.ts:1` imports `LiftSet` from `../../../db/repos` while line 4 declares an
  interface of the same name in the same file; which of the two the sets feature is meant to keep is
  not settled at this commit.
- Whether `ports/exercise.ts:3` importing `LiftSet` from `../../../db/repos` rather than from
  `../../sets/ports/set.ts` (as its sibling `internal/exercise.repository.ts:5` does) is a
  distinction with intent behind it.
- Where the `features/` layout, the `internal`/`ports` split and the translator convention are to be
  documented: `docs/backend.md` and `AGENTS.md` describe only the layer-first structure, and the
  repository's own rule is that the docs index in `AGENTS.md` is updated in the same commit as a
  documentation change.
