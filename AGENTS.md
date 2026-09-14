# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun install              # deps (Pico CSS + dev types/tooling)
bun start                # serve API + frontend on PORT (default 3000)
bun run start:dev        # same, with --watch
bun run seed             # fill an empty DB with sample workouts
bun run migrate          # apply pending schema migrations, then exit
bun test                 # the test suite against in-memory SQLite
bun test src/backend/features/workouts/workout.routes.test.ts # one file
bun test -t "health"     # one test / describe block by name
bun run typecheck        # typechecking (backend + frontend)
bun run lint             # linting
bun run fmt              # format (fmt:check for CI)
```

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`), is created on first run,
and is git-ignored. `:memory:` is supported and is what the tests use.

Always put plans inside the project directory.

Never edit existing plans or research docs in `docs/agents/` — only add new ones. Each describes
the repository as it stood on the date it carries, so an old path in one is a record, not a bug.

## Architecture

`src/backend/` -> the Bun + SQLite REST backend, organised by feature: `features/<feature>/` owns
its routes, its SQL and its mapping, publishing rows and `to*` mappers through `ports/` and keeping
its repository, translator and controllers in `internal/` — one `*.controller.ts` per
route file, which takes the request, casts its body onto a request DTO through the translator, calls
the facades and returns the `Response`; a route handler is one line handing the request to it. At
its root, beside the routes, sits `<feature>.facade.ts`, the feature's front door and the only
module that names its repository, which validates a request DTO before handing it to the repository; `features/facades.ts`
assembles the four into the `Facades` object `allRoutes` is given. `bun run lint` fails if a route
reaches `ports/`, a repository, anything in `internal/` but its controller, or the request helpers
in `http/http.ts`, `http/errors.ts` and `shared/validate.ts`, or if a controller reaches a
repository. Only what belongs to
no feature sits outside — `db/` (connection, migrations, statement helpers), `http/` (routing, the
registry, the server), `shared/validate.ts` and `main.ts`. Every `*.test.ts` sits beside the module
it exercises
`src/frontend/` -> a **no-build-step** frontend: TypeScript ES modules and custom elements,
transpiled on request by `src/backend/features/static` — no bundler, no output directory. It is
organised like the backend: `features/<feature>/` owns its route views and a `<feature>.facade.ts`
at its root and keeps its `*.api.ts` classes and child components in `internal/`; `app/` is the
shell and router, `http/` the request helpers, `ui/` the component foundation and the widgets
several features use. `bun run lint` fails if a feature reaches another's `internal/` or a
component reaches an `*.api.ts` or `http/http.ts`
`src/shared/` -> the wire contract both halves import: `dto/` declares every request and response
shape and `flavors.ts` the flavored ids and dates those shapes are written in — both **types
only**, because it is not web-served and reaches the browser only as an erased `import type`
`src/scripts/` -> the `migrate` and `seed` entry points
`docs/` -> the documents below

The REST surface has no reference document: each feature holds one `*.routes.ts` file per URL
group, and a route belongs to the file its URL prefix names.

- `docs/backend.md` — features, ports/internal, routes, repositories, migrations, the data model, tests
- `docs/frontend.md` — features and facades, components, import boundaries, loading, theming, and
  why a module's URL is its path
- `docs/coding-guidelines.md` — pinning, quote style, commits on `main`
- `docs/styling-guidelines.md` — Pico, no CSS in JavaScript, no font sizes

That list is the only index in the repository: a document added to `docs/` is added here in the
same commit.
