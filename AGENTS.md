# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun install              # deps (Pico CSS + dev types/tooling)
bun start                # serve API + frontend on PORT (default 3000)
bun run start:dev        # same, with --watch
bun run seed             # fill an empty DB with sample workouts
bun run migrate          # apply pending schema migrations, then exit
bun test                 # API suite against in-memory SQLite
bun test backend/test/workout.api.test.ts # one file
bun test -t "health"     # one test / describe block by name
bun run typecheck        # typechecking (backend + frontend)
bun run lint             # linting
bun run fmt              # format (fmt:check for CI)
```

Dependencies are pinned to exact versions.

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`), is created on first run,
and is git-ignored. `:memory:` is supported and is what the tests use.

Commits go directly on `main`; don't open a feature branch unless asked.

Always put plans inside the project directory.

Never edit existing plans or research docs in `docs/agents/` — only add new ones.

## Architecture

`backend/` -> the Bun + SQLite REST backend (TypeScript), holding
`backend/src/` (the server), `backend/test/` (the API suite) and
`backend/migrations/` (numbered `.sql` schema migrations, applied on startup)
`frontend/` -> a **no-build-step** frontend: TypeScript ES modules and custom elements,
transpiled on request by `backend/src/transpile.ts` — no bundler, no output directory
`docs/` -> design and API documentation

`README.md` documents the full REST surface, the data model, and the reasoning behind the
frontend's loading and theming design. Read it before changing either.
