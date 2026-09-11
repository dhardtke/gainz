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
bun test src/backend/routes/workout.routes.test.ts # one file
bun test -t "health"     # one test / describe block by name
bun run typecheck        # typechecking (backend + frontend)
bun run lint             # linting
bun run fmt              # format (fmt:check for CI)
```

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`), is created on first run,
and is git-ignored. `:memory:` is supported and is what the tests use.

Always put plans inside the project directory.

Never edit existing plans or research docs in `docs/agents/` — only add new ones.

## Architecture

`src/` -> both halves of the application, and nothing else
`src/backend/` -> the Bun + SQLite REST backend (TypeScript): the server with its tests side
by side — every `*.test.ts` sits beside the module it exercises — plus
`src/backend/migrations/` (numbered `.sql` schema migrations, applied on startup)
`src/frontend/` -> a **no-build-step** frontend: TypeScript ES modules and custom elements,
transpiled on request by `src/backend/transpile.ts` — no bundler, no output directory.
`src/frontend/` is also the web root, so a module's URL is its path below it:
`src/frontend/components/gz-app/gz-app.ts` is served at `/components/gz-app/gz-app.ts`
`docs/` -> design and API documentation

`README.md` documents the full REST surface, the data model, and the reasoning behind the
frontend's loading and theming design. Read it before changing either.

See `docs/coding-guidelines.md` and `docs/styling-guidelines.md` for guidelines on how to code and style.
