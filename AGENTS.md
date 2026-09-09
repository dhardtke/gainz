# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun install              # deps (Pico CSS + dev types/tooling)
bun start                # serve API + frontend on PORT (default 3000)
bun run start:dev        # same, with --watch
bun run seed             # fill an empty DB with sample workouts
bun test                 # API suite against in-memory SQLite
bun test test/api.test.ts # one file
bun test -t "health"     # one test / describe block by name
bun run typecheck        # bunx tsc --noEmit (src + test)
bun run lint             # oxlint
bun run fmt              # oxfmt .   (fmt:check for CI)
```

Dependencies are pinned to exact versions.

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`), is created on first run,
and is git-ignored. `:memory:` is supported and is what the tests use.

Commits go directly on `main`; don't open a feature branch unless asked.

## Architecture

`src/` -> Bun + SQLite REST backend (TypeScript)
`public/` -> a **no-build-step** frontend (plain ES modules and custom elements)
`docs/` -> design and API documentation

`README.md` documents the full REST surface, the data model, and the reasoning behind the
frontend's loading and theming design. Read it before changing either.
