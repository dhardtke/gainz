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
bun test src/backend/http/routes/workout.routes.test.ts # one file
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

`src/backend/` -> the Bun + SQLite REST backend, layered `db/` -> `http/` -> `main.ts`, with every
`*.test.ts` beside the module it exercises
`src/frontend/` -> a **no-build-step** frontend: TypeScript ES modules and custom elements,
transpiled on request by `src/backend/transpile.ts` — no bundler, no output directory
`src/scripts/` -> the `migrate` and `seed` entry points
`docs/` -> the documents below

The REST surface has no reference document: `src/backend/http/routes/` holds one file per URL
group, and a route belongs to the file its URL prefix names.

- `docs/backend.md` — layering, routes, the repository, migrations, the data model, tests
- `docs/frontend.md` — components, loading, theming, and why a module's URL is its path
- `docs/coding-guidelines.md` — pinning, quote style, commits on `main`
- `docs/styling-guidelines.md` — Pico, no CSS in JavaScript, no font sizes

That list is the only index in the repository: a document added to `docs/` is added here in the
same commit.
