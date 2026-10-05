# AGENTS.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```sh
bun install              # deps (Oat + dev types/tooling)
bun start                # serve API + frontend on PORT (default 3000)
bun run start:dev        # same, with --watch
bun run seed             # fill an empty DB with sample workouts
bun run migrate          # apply pending schema migrations, then exit
bun run hash-password    # prompt for a password, print its hash for GAINZ_PASSWORD_HASH
bun run build            # one-file deployment build: dist/gainz.js (+ .map)
bun test --parallel      # the test suite against in-memory SQLite
bun test --parallel src/backend/features/workouts/workout.routes.test.ts # one file
bun test --parallel -t "health" # one test / describe block by name
bun run typecheck        # typechecking (backend + frontend)
bun run lint             # linting
bun run fmt              # format (fmt:check for CI)
```

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`), is created on first run,
and is git-ignored. `:memory:` is supported and is what the tests use.

Write American English in code, comments, docs and commit messages.

Always put plans inside the project directory.

Never edit existing plans or research docs in `docs/agents/` — only add new ones. Each describes
the repository as it stood on the date it carries, so an old path in one is a record, not a bug.

## Architecture

- `src/backend/` — Bun + SQLite REST backend, organized by feature (`features/<feature>/`), each
  behind a `<feature>.facade.ts`
- `src/frontend/` — no-build-step frontend of TypeScript ES modules and custom elements, organized
  by feature like the backend
- `src/shared/` — types-only wire contract (DTOs, flavored ids and dates) both halves import
- `src/scripts/` — the `migrate`, `seed` and `build` entry points

Tests sit beside the module they exercise. `bun run lint` enforces the import boundaries.

Details live in `docs/`:

- `docs/backend.md` — features, ports/internal, routes, repositories, migrations, the data model, tests
- `docs/frontend.md` — features and facades, components, import boundaries, loading, theming, tests, and
  why a module's URL is its path
- `docs/coding-guidelines.md` — pinning, quote style, commits on `main`
- `docs/deployment.md` — the CI workflow, the self-hosted runner and its privileges, server setup
- `docs/styling-guidelines.md` — Oat, no CSS in JavaScript, no font sizes

That list is the only index in the repository: a document added to `docs/` is added here in the
same commit.
