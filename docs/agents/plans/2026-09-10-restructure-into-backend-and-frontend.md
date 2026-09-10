---
date: 2026-09-10T19:30:23.342630+00:00
git_commit: d2f925215b30d034700c78d3a892de63c08f33f0
branch: main
topic: "Restructure the repository into backend/ and frontend/"
tags: [plan, layout, server, transpile, migrations, tsconfig, docs]
status: complete
---

# PLAN: Restructure the repository into backend/ and frontend/

Move the top-level source directories into two named halves: `public/` becomes `frontend/`, and
`src/`, `test/` and `migrations/` are grouped under a single `backend/`. Nothing about the running
system changes — no URL, no import specifier, no endpoint, no database path. This is a pure move
plus the handful of path constants that name a directory.

The point is legibility. Today the root mixes two applications and their shared tooling in one
flat list, and `public/` describes how the directory is *served* rather than what it *is* — the
folder holds TypeScript source that never ships as-is, since `src/transpile.ts` erases the types
on the way out.

## Acceptance Criteria

- The tree is `backend/{migrations,src,test}` + `frontend/` + `data/` + `docs/`, with no `src/`,
  `test/`, `migrations/` or `public/` remaining at the repository root.
- Every file moves via `git mv`, so history follows each file across the rename.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass at the end of
  **each** phase, not only at the end of the plan.
- The server still serves the app: `index.html` at `/`, `/css/app.css`, `/js/main.ts` as
  transpiled JavaScript, and `/vendor/pico.css` out of `node_modules`.
- The path-escape guard still refuses to serve anything outside the frontend directory.
- No URL changes, and no import specifier inside `frontend/` changes.
- `bun start` boots and `bun run migrate` applies the schema, both from the repository root.
- `README.md`, `docs/backend.md`, `docs/frontend.md` and `AGENTS.md` describe the new tree; no
  document names a directory that no longer exists.

## Technical Key Decisions and Tradeoffs

1. **`data/` stays at the repository root:** it is not moved under `backend/`.
   - Why: `DEFAULT_DB_PATH` is `"data/gainz.sqlite"`, resolved against the current working
     directory rather than against a module, and every `bun run` script executes from the root.
     The database is also runtime data you own, not backend source.
   - Impact: `src/db.ts` and `.gitignore` are untouched by this refactor. Moving it would have
     forced a root-relative `"backend/data/gainz.sqlite"` into a file two levels down, which
     breaks the moment anything runs from another directory.

2. **The rename reaches the code's vocabulary:** `PUBLIC_DIR` becomes `FRONTEND_DIR`, and the
   comments and test names that say `public/` say `frontend/`.
   - Why: a constant named `PUBLIC_DIR` pointing at `frontend/` is a stale name sitting in the
     one function that enforces a security boundary. That is the worst place to make a reader
     doubt whether the code means what it says.
   - Impact: the `"Cache-Control": "public, max-age=3600"` header at `src/server.ts:70` is an
     HTTP cache directive and has nothing to do with the directory. A blind find-and-replace of
     the word `public` would corrupt it. Every edit in this plan is a named line, not a sweep.

3. **One root `package.json` and `tsconfig.json`:** only the `module` field, the script paths and
   the tsconfig `include` change; no workspaces, no per-area tsconfig.
   - Why: it keeps the change a pure move, verifiable by "the same tests pass and nothing behaves
     differently". There is one dependency set, one test runner, and no separate frontend build —
     the server transpiles on request — so a workspace split would add ceremony for nothing.
   - Impact: the backend still sees DOM types and the frontend still sees `bun-types`, exactly as
     today. Splitting tsconfig per area is a real improvement this layout makes possible, but it
     changes *what typechecks* and can surface pre-existing errors, so it stays a separate
     follow-up rather than riding along inside a move.

4. **`docs/agents/` is left alone:** the 212 old-path references across its three dated documents
   stand unedited.
   - Why: they record what was true when they were written. A plan stamped 2026-09-10 describing
     files at `backend/src/` would be describing a layout that did not exist that day. The project
     already treats them as artifacts — `.oxfmtrc.json` lists `docs/agents/` under
     `ignorePatterns`.
   - Impact: only this plan uses the new layout. Same reasoning covers the illustrative commit
     message quoted at `.agents/skills/commit/SKILL.md:143`, which mentions `src/server.ts` and
     `public/` as a *sample of prose style*, not as a description of the tree — it is deliberately
     not edited.

5. **Two phases rather than one sweep:** rename `public/` first, group `backend/` second.
   - Why: the two moves have independent failure modes. The rename touches the static-serving
     path guard and its traversal tests; the grouping touches the module-root arithmetic in
     `server.ts`. Done separately, a red suite names the culprit. Done together, it does not.
   - Impact: `test/static.api.test.ts:106` is edited twice — `"public"` becomes `"frontend"` in
     phase 1, then gains one more `".."` in phase 2. That is the deliberate cost of the split.

6. **One naming rule for prose, applied everywhere:** every comment and document names a
   directory by its path from the repository root — `backend/migrations/`, never a bare
   `migrations/`, even inside a file that sits next to it.
   - Why: without a stated rule this is decided per-file by whoever is editing, and the result is
     `docs/backend.md` saying `backend/migrations/` while `migrations.ts:4` three lines above the
     constant says `migrations/`. A reader cannot tell whether that is a relative reference or a
     stale one.
   - Impact: adds two comment-only tasks that a search for the word `public` would never surface,
     because they name the *other* moved directories: `backend/src/migrations.ts:4` and
     `frontend/js/types.ts:4`. Both are in phase 2, and phase 2 gets its own sweep to catch this
     class of miss.

## Current State

```
gainz/
├── migrations/  001-initial-schema.sql
├── src/         db.ts http.ts migrate.ts migrations.ts routes.ts seed.ts
│                server.ts transpile.ts validate.ts   repo/   routes/
├── test/        *.api.test.ts  migrate.test.ts   helpers/server.ts
├── public/      index.html  css/  js/  components/<tag>/<tag>.{ts,css}
├── data/        .gitkeep  (+ git-ignored gainz.sqlite)
├── docs/        backend.md frontend.md styling-guidelines.md  agents/{plans,research}/
├── .idea/       runConfigurations/*.xml
└── package.json tsconfig.json .oxlintrc.json .oxfmtrc.json bunfig.toml
    README.md AGENTS.md (symlink: CLAUDE.md -> AGENTS.md)
```

Only five places in the whole repository resolve a real directory path:

| Location | Current value | Fate |
| --- | --- | --- |
| `src/server.ts:9` | `PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)))` | phase 2 — becomes `"../.."` |
| `src/server.ts:10` | `PUBLIC_DIR = resolve(PROJECT_ROOT, "public")` | phase 1 — becomes `FRONTEND_DIR` / `"frontend"` |
| `src/migrations.ts:36` | `MIGRATIONS_DIR = resolve(import.meta.dir, "../migrations")` | **unchanged** |
| `test/static.api.test.ts:106` | `resolve(import.meta.dir, "..", "public", "js", "__broken.ts")` | both phases |
| `src/db.ts:30` | `DEFAULT_DB_PATH = process.env.GAINZ_DB ?? "data/gainz.sqlite"` | **unchanged** |

`PROJECT_ROOT` carries two jobs at once, which is why it needs care in phase 2: it is the base for
the frontend directory (line 10) *and* the resolution base handed to `Bun.resolveSync` when the
vendor allowlist reaches into `node_modules` (line 28).

Four things are cheaper than they look, and the plan should not spend effort on them:

- **Test imports need no edits.** They say `../src/repo` and `../../src/db`. `src/` and `test/`
  move together into `backend/`, so every relative hop is preserved.
- **`MIGRATIONS_DIR` needs no edit.** `src/` and `migrations/` stay siblings inside `backend/`, so
  `"../migrations"` from `backend/src/` still lands on `backend/migrations/`. Only the prose
  comment above it, at `migrations.ts:4`, is touched — see the naming rule below.
- **Frontend URLs need no edits.** `index.html` and every component use root-relative web paths
  (`/js/main.ts`, `/css/app.css`, `/vendor/pico.css`), and the web root is whatever
  `FRONTEND_DIR` points at. Renaming the folder on disk changes no URL and no `"./format.ts"`
  specifier.
- **The IDE run configs need no edits.** All eight `.idea/runConfigurations/*.xml` invoke npm
  scripts against `$PROJECT_DIR$/package.json`; not one names a source path.
- **`.oxlintrc.json` and `bunfig.toml` need no edits.** Neither names a directory.

## Desired End State

```
gainz/
├── backend/
│   ├── migrations/  001-initial-schema.sql
│   ├── src/         db.ts http.ts migrate.ts migrations.ts routes.ts seed.ts
│   │                server.ts transpile.ts validate.ts   repo/   routes/
│   └── test/        *.api.test.ts  migrate.test.ts   helpers/server.ts
├── frontend/        index.html  css/  js/  components/<tag>/<tag>.{ts,css}
├── data/            .gitkeep  (+ git-ignored gainz.sqlite)
├── docs/
└── package.json tsconfig.json .oxlintrc.json .oxfmtrc.json bunfig.toml
    README.md AGENTS.md
```

Path resolution afterwards:

```
backend/src/server.ts
  REPO_ROOT     = new URL("../..", import.meta.url)   -> gainz/
  FRONTEND_DIR  = resolve(REPO_ROOT, "frontend")      -> gainz/frontend/
  Bun.resolveSync("@picocss/pico/…", REPO_ROOT)       -> gainz/node_modules/…

backend/src/migrations.ts
  MIGRATIONS_DIR = resolve(import.meta.dir, "../migrations")
                                                      -> gainz/backend/migrations/   (unchanged)

backend/src/db.ts
  DEFAULT_DB_PATH = "data/gainz.sqlite"               -> resolved against CWD (unchanged)
```

## Abstractions and Code Reuse

No new abstractions. Every change is either a `git mv`, a path literal, or an identifier rename.

- `backend/src`
  - `server.ts` — the only file whose path arithmetic actually changes
    - `PROJECT_ROOT` → `REPO_ROOT`, and `".."` → `"../.."`
    - `PUBLIC_DIR` → `FRONTEND_DIR`, and `"public"` → `"frontend"`
    - `resolveStaticPath` — doc comment names the new directory; body unchanged apart from the
      renamed constant
    - `resolveVendorPath` — unchanged apart from the renamed constant it is handed
  - `transpile.ts` — doc comment on `transpileModule` names the new directory
  - `migrations.ts` — `MIGRATIONS_DIR` at line 36 is **unchanged**; only the module doc comment
    at line 4 is repathed
  - `db.ts` — **no change**
  - `repo/index.ts` — header comment says SQL lives under `src/repo/`; becomes `backend/src/repo/`
- `backend/test`
  - `static.api.test.ts` — two test names, the `__broken.ts` fixture path, and the two encoded
    traversal probes
  - every other test file — **no change**; the `../src/…` imports survive the move
- `frontend/js`
  - `base.ts` — one comment naming `public/components/gz-chart/gz-chart.css` (phase 1)
  - `types.ts` — header comment explaining why these shapes are not imported from `src/repo/`
    (phase 2)
- root
  - `package.json` — `module` field plus the `start`, `start:dev`, `seed` and `migrate` scripts
  - `tsconfig.json` — the `include` array
  - `README.md`, `AGENTS.md`, `docs/backend.md`, `docs/frontend.md` — prose and the layout tree

## Logging & Observability

No logging changes. The two lines `server.ts` prints on boot are unaffected:

```
gainz is lifting on http://localhost:3000/
  database: data/gainz.sqlite
```

The `database:` line still reads `data/gainz.sqlite` after the move, which is itself a useful
signal that decision 1 held.

## Implementation

### Phase 1: Rename `public/` to `frontend/`

Dependencies: None.

Move the frontend directory and follow the rename everywhere the code, tests and docs name it.
At the end of this phase the tree still has `src/`, `test/` and `migrations/` at the root, and
everything works.

**Tasks**:

- [x] `git mv public frontend`
- [x] `src/server.ts:10` — rename the constant and its value:
      `const FRONTEND_DIR = resolve(PROJECT_ROOT, "frontend");`
      (`PROJECT_ROOT` keeps its name in this phase; it is renamed in phase 2)
- [x] `src/server.ts` — update the three remaining uses of the constant, at lines 48, 49 and 94.
      Leave `"Cache-Control": "public, max-age=3600"` at line 70 exactly as it is: that `public`
      is an HTTP cache directive, not a directory.
- [x] `src/server.ts:35` — doc comment on `resolveStaticPath`:
      "Maps a URL path to a file inside `frontend/`, or null if it would escape it."
- [x] `src/transpile.ts:18` — doc comment on `transpileModule`: `path` has been resolved inside
      `frontend/`
- [x] `frontend/js/base.ts:53` — comment naming
      `frontend/components/gz-chart/gz-chart.css`
- [x] `test/static.api.test.ts:16` — test name: `"rejects directory traversal below frontend/"`
- [x] `test/static.api.test.ts:98` — test name:
      `"refuses to transpile anything outside frontend/"`
- [x] `test/static.api.test.ts:106` — fixture path:
      `resolve(import.meta.dir, "..", "frontend", "js", "__broken.ts")`
- [x] `tsconfig.json:17` — `"include": ["src", "test", "frontend"]`
- [x] `docs/frontend.md` — heading `### Frontend (\`frontend/\`)` (line 1) and the component
      directory convention at line 7
- [x] `docs/backend.md:50` — static serving is "`frontend/` with a path-escape guard"
- [x] `README.md` — line 61 (`frontend/js/format.ts`), the `public/` node in the layout tree at
      line 95, and lines 158 and 160 in the Styling section
- [x] `AGENTS.md` — line 16 (`typechecking (src + test + frontend)`) and the `public/` entry in
      the Architecture list at line 34. `CLAUDE.md` is a symlink to this file and needs no
      separate edit.

**Automated Verification**:

- [x] `bun test` passes — in particular `static.api.test.ts`, which is the file that proves the
      frontend is still found: it fetches `/`, `/css/app.css`, `/components/gz-app/gz-app.css`,
      `/js/format.ts`, `/js/main.ts` and `/vendor/pico.css`
- [x] `bun run typecheck` is clean — this also proves the new `include` glob actually matches the
      renamed directory rather than silently covering nothing
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `git status` shows the move as renames (`R`), not as deletions plus additions
- [x] The word `public` survives in exactly one place — the `Cache-Control` header in
      `server.ts` — confirming nothing else still names the old directory and that the header
      was not swept away with it. `Select-String` reads files, not directories, and has no
      `-Recurse`, so it must be fed by `Get-ChildItem`:
      `Get-ChildItem -Path src,test,frontend -Recurse -Include *.ts,*.html,*.css | Select-String -Pattern "public"`

### Phase 2: Group `src/`, `test/` and `migrations/` under `backend/`

Dependencies: Phase 1.

Move the three backend directories together, so the sibling relationships they rely on are
preserved, then fix the one constant whose distance to the repository root actually changed.

**Tasks**:

- [x] Create the directory and move all three together, so `git` sees one coherent rename:
      `New-Item -ItemType Directory backend`, then `git mv src backend/src`,
      `git mv test backend/test`, `git mv migrations backend/migrations`
- [x] `backend/src/server.ts:9` — the module is now one level deeper, so the root is two hops up.
      Rename it as well, since `PROJECT_ROOT` next to a `backend/` directory reads ambiguously:
      `const REPO_ROOT = resolve(fileURLToPath(new URL("../..", import.meta.url)));`
- [x] `backend/src/server.ts` — update both uses of the renamed constant: line 10
      (`resolve(REPO_ROOT, "frontend")`) and line 28 (`Bun.resolveSync(specifier, REPO_ROOT)`).
      Line 28 is the one that must point at the directory holding `node_modules`, and it is only
      exercised by the `/vendor/pico.css` test.
- [x] `backend/src/migrations.ts:36` — **verify and do not edit.** `resolve(import.meta.dir,
      "../migrations")` from `backend/src/` resolves to `backend/migrations/`, because both moved.
- [x] `backend/src/migrations.ts:4` — the module doc comment above that constant says numbered
      `.sql` files live under `migrations/`; per decision 6 it becomes `backend/migrations/`
- [x] `backend/src/repo/index.ts:4` — header comment: all SQL lives under `backend/src/repo/`
- [x] `frontend/js/types.ts:4` — the header comment explaining why these shapes are written by
      hand says they are "not imported from `src/repo/`"; becomes `backend/src/repo/`. This is
      the one edit that no search for `public` or `frontend` would ever surface — it lives in the
      frontend but names a backend directory.
- [x] `backend/test/static.api.test.ts:106` — the fixture path gains one more level:
      `resolve(import.meta.dir, "..", "..", "frontend", "js", "__broken.ts")`
- [x] `backend/test/static.api.test.ts:101-102` — the two encoded traversal probes name
      `/%2e%2e/src/server.ts` and `/%2e%2e/src/transpile.ts`. Both still return 404 after the
      move, so the assertions pass either way — but they would now be probing for a file that
      does not exist, which quietly turns a real test into a tautology. Repoint them at
      `/%2e%2e/backend/src/server.ts` and `/%2e%2e/backend/src/transpile.ts` so they keep
      describing an escape that would actually reach source if the guard failed.
- [x] `package.json:7` — `"module": "backend/src/server.ts"`
- [x] `package.json:9-12` — the four scripts:
      `start` → `bun run backend/src/server.ts`,
      `start:dev` → `bun --watch backend/src/server.ts`,
      `seed` → `bun run backend/src/seed.ts`,
      `migrate` → `bun run backend/src/migrate.ts`
- [x] `tsconfig.json:17` — `"include": ["backend/src", "backend/test", "frontend"]`
- [x] `docs/backend.md` — heading `### Backend (\`backend/src/\`)` (line 1), the schema location
      at line 32, and the two `test/` references at lines 41 and 47
- [x] `docs/frontend.md` — line 21 (`backend/src/transpile.ts`) and line 28 (`backend/src/repo/`)
- [x] `README.md` — rewrite the layout tree (lines 69-121) to nest `migrations/`, `src/` and
      `test/` under `backend/`, and update the prose at line 33 (`backend/migrations/`), line 173
      (`backend/src/transpile.ts`), line 229 (`backend/src/server.ts`) and line 288 (adding a new
      migration file)
- [x] `AGENTS.md` — line 14 (`bun test backend/test/workout.api.test.ts`), line 16
      (`typechecking (backend + frontend)`), and the Architecture list at lines 32-35, which
      should now describe `backend/` as one entry with its three children

**Automated Verification**:

- [x] `bun test` passes, and the run reports the same test count as before the refactor —
      confirming Bun still discovers the suite at its new depth rather than silently finding
      nothing
- [x] `bun run typecheck` is clean
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `bun run migrate` against a **fresh** throwaway database prints `applied
      001-initial-schema` and then `now at schema version 1`. Delete the file first, or the
      second run reports `already at schema version 1 — nothing to apply` and the check passes
      without applying anything:
      `$env:GAINZ_DB = "$env:TEMP\gainz-layout-check.sqlite"; Remove-Item $env:GAINZ_DB -ErrorAction Ignore; bun run migrate`
      What this proves is the rewritten `migrate` script path in `package.json`, which no test
      exercises. It is *not* the check on `MIGRATIONS_DIR` — `backend/test/migrate.test.ts:179`
      already reads `001-initial-schema.sql` out of the real `MIGRATIONS_DIR`, so `bun test`
      fails loudly on its own if that resolution breaks.
- [x] `bun start` boots, and its second line still reads `database: data/gainz.sqlite` —
      the check that decision 1 held and that `DEFAULT_DB_PATH` was not disturbed
- [x] Against that running server, `/`, `/css/app.css`, `/js/main.ts`, `/vendor/pico.css` and
      `/api/health` all return 200. The `import.meta.main` block and the real on-disk database
      path are the two things `useServer()` never exercises, which is why this is worth doing
      outside the suite.
- [x] A sweep for bare directory names in prose finds nothing stale. Unlike the phase-1 sweep
      this must look for the *other three* names, which is the class of miss that
      `frontend/js/types.ts:4` belongs to — a frontend file naming a backend directory:
      `Get-ChildItem -Path backend,frontend -Recurse -Include *.ts | Select-String -Pattern '(^|[^./\w])(src|test|migrations)/'`
      Every surviving hit must be a real relative import specifier such as `../src/repo`. Any
      hit inside a comment or a doc string is a stale path and must be repathed.
- [x] `git status` shows renames (`R`) for the moved files
- [x] The repository root contains no `src`, `test`, `migrations` or `public` directory

## Implementation Notes

Both phases went as written; nothing in the plan had to be revised against the code. The only
work the tasks did not name is prose rewrapping: repathing a directory inside a sentence pushes
its line past the column the surrounding document keeps to, so the touched paragraphs in
`README.md` (72–80 columns), `docs/backend.md`, `docs/frontend.md` (100) and the module doc
comment in `backend/src/migrations.ts` were re-flowed. `oxfmt` does not reflow comments or
Markdown prose, so `fmt:check` would not have caught a ragged line.

Every verification listed in both phases was run and passed. `bun test` reported the same
52 tests across 6 files before and after the move; `bun run migrate` against a fresh throwaway
database applied `001-initial-schema` and reported schema version 1; a booted server answered
`/`, `/css/app.css`, `/js/main.ts`, `/vendor/pico.css` and `/api/health` with 200 and printed
`database: data/gainz.sqlite`, which is decision 1 holding.

## References

- `src/server.ts:9-10` — the two-job `PROJECT_ROOT` and `PUBLIC_DIR`
- `src/server.ts:28` — `Bun.resolveSync` into `node_modules` for the vendor allowlist
- `src/server.ts:70` — `Cache-Control: public`, the one `public` that must not be renamed
- `src/migrations.ts:36` — `MIGRATIONS_DIR`, the path that survives the move untouched
- `src/db.ts:30` — `DEFAULT_DB_PATH`, CWD-relative, the reason `data/` stays at the root
- `test/static.api.test.ts` — the suite that verifies static serving and the escape guard
- `README.md:66-122` — the Layout section, the largest documentation edit in the plan
- `.oxfmtrc.json:4` — `ignorePatterns: ["docs/agents/"]`, the precedent for decision 4
