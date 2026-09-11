---
date: 2026-09-11T07:04:47.701199+00:00
git_commit: cb204c5ea01a231ae833a6ac4bcfbe6ea736b456
branch: main
topic: 'Group backend/ and frontend/ under a single src/ root'
tags: [plan, layout, paths, static, transpile, migrations, tsconfig, docs]
status: complete
---

# PLAN: Group `backend/` and `frontend/` under a single `src/` root

Move the two halves of the application under one root: `backend/src/` becomes `src/backend/` and
`frontend/src/` becomes `src/frontend/`, with the inner `src/` level collapsed away in both cases.
`backend/migrations/` follows its backend into `../../../src/backend/db/migrations`. Afterwards the repository
root holds `src/`, `data/` and `docs/` plus the tooling files, and the word `src` appears exactly
once in the tree instead of twice at the second level.

The point is that `src` currently says nothing. `backend/src/db.ts` and `frontend/src/api.ts` both
carry a level whose only content is "this is source" — which is already implied by `backend/` and
`frontend/` sitting next to `data/` and `docs/`. Hoisting that one word to the top says it once, and
leaves the two halves as immediate siblings, which is what they actually are.

Unlike the 2026-09-10 restructure this is **not** a pure move. `FRONTEND_DIR` is the web root, and
the level being removed from `frontend/` is exactly the level the frontend's URLs reflect, so every
`/src/…` URL becomes `/…`. That is the one behavioural change in the plan, and decision 3 is about
owning it rather than working around it.

## Acceptance Criteria

- The tree is `src/{backend,frontend}` + `data/` + `docs/`, with no `backend/`, `frontend/` or
  `test/` directory at the repository root and no `src/` directory inside either half.
- `src/backend/` holds what `backend/src/` held, directly — `db.ts`, `repo/`, `routes/` and the
  rest — plus `migrations/`.
- `src/frontend/` holds what `frontend/src/` held, directly — `main.ts`, `components/`, `css/` and
  the rest — plus `index.html`.
- Every file moves via `git mv`, so history follows each file across the rename.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` all pass at the end of
  **each** phase, not only at the end of the plan.
- `bun test` reports 53 tests across 11 files, the same as before the move.
- The server still serves the app: `index.html` at `/`, `/css/app.css`, `/main.ts` as transpiled
  JavaScript, and `/vendor/pico.css` out of `node_modules`.
- The path-escape guard still refuses to serve anything outside the frontend directory, and the
  encoded traversal probes still name a file that would really be reached if it failed.
- No import specifier changes, in either half.
- `bun start` boots and `bun run migrate` applies the schema, both from the repository root, and
  the boot line still reads `database: data/gainz.sqlite`.
- `README.md`, `docs/backend.md`, `docs/frontend.md` and `AGENTS.md` describe the new tree and the
  new URLs; no document names a directory or a URL that no longer exists.

## Technical Key Decisions and Tradeoffs

1. **`data/` and `docs/` stay at the repository root:** `src/` holds source and nothing else.
   - Why: `DEFAULT_DB_PATH` is `'data/gainz.sqlite'`, resolved against the current working
     directory rather than against a module, and every `bun run` script executes from the root.
     The database is runtime data you own; the docs are not compiled by anything.
   - Impact: `../../../src/backend/db/db.ts` and `.gitignore` are untouched by this refactor. This is the same
     reasoning that kept `data/` out of `backend/` in the 2026-09-10 restructure, and it holds for
     the same reason.

2. **`backend/migrations/` becomes `../../../src/backend/db/migrations`**, not a root-level `migrations/`.
   - Why: the migration runner is the only thing that reads them and it lives one directory away.
     Keeping them adjacent means `MIGRATIONS_DIR` stays a single hop and a reader of
     `src/backend/` sees the schema without leaving the directory.
   - Impact: `src/` now holds `.sql` files as well as TypeScript, which is a mild cost against the
     "source only" framing of decision 1. `MIGRATIONS_DIR` changes from
     `resolve(import.meta.dir, '../migrations')` to `resolve(import.meta.dir, 'migrations')` —
     the one migration path in the codebase that the 2026-09-10 restructure got to leave alone.

3. **The frontend's URL surface changes, and the plan changes it rather than preserving it.**
   `/src/main.ts` becomes `/main.ts`, `/src/css/app.css` becomes `/css/app.css`, and
   `/src/components/<tag>/<tag>.css` becomes `/components/<tag>/<tag>.css`.
   - Why: `FRONTEND_DIR` **is** the web root. Today it points at `frontend/`, so the `src/` inside
     it shows up in every URL; after the move it points at `src/frontend/`, and the level is gone
     from disk. The alternative — pointing `FRONTEND_DIR` one level higher, or adding a rewrite —
     would either re-expose the backend through the static server or introduce the first piece of
     URL indirection in a project whose whole static story is "a URL names a file". Neither is
     worth paying to keep a path prefix that only ever existed as an accident of nesting.
   - Impact: four files carry a URL literal — `src/frontend/index.html`, `src/frontend/styles.ts`,
     `../../../src/backend/http/static.test.ts` and `src/backend/transpile.test.ts` — and all four are edited in
     phase 1. `/vendor/pico.css` is unaffected: it is served from the allowlist, not from
     `FRONTEND_DIR`. Nothing is cached across the change, since every frontend response already
     carries `Cache-Control: no-cache`.

4. **`REPO_ROOT` in `paths.ts` keeps `'../..'` and must be verified, not edited.**
   - Why: `src/backend/paths.ts` is exactly as deep as `backend/src/paths.ts` was, so two hops
     still land on the repository root, and `Bun.resolveSync(specifier, REPO_ROOT)` still finds
     `node_modules`.
   - Impact: this is the most dangerous line in the change, because it is the one that looks like
     it needs attention and does not, sitting one line above `FRONTEND_DIR`, which looks
     identical and does. Phase 2 carries an explicit "verify, do not edit" task for it, and the
     comment above it that names `backend/src/` is repathed.

5. **`FRONTEND_DIR` stays anchored on `REPO_ROOT`** — `resolve(REPO_ROOT, 'src', 'frontend')` —
   rather than becoming a sibling hop off the module, `new URL('../frontend', import.meta.url)`.
   - Why: the sibling form is shorter and reads well, but it would leave `paths.ts` with two
     independent ways of locating things, and `REPO_ROOT` cannot go away — the vendor allowlist
     needs it. One base that everything in the file is expressed against is easier to check than
     two that happen to agree.
   - Impact: one constant changes value; the surrounding structure of the file does not.

6. **`tsconfig.json`'s `include` collapses to `["src"]`.**
   - Why: the array exists to name the two halves, and after the move one entry covers both. A
     two-entry list would be listing the children of a directory it could just name.
   - Impact: `include` no longer distinguishes backend from frontend, so it is no longer the place
     a future per-area tsconfig split would start. That split was already deferred by the
     2026-09-10 restructure and stays deferred; nothing here makes it harder.

7. **Two phases, frontend first.** Phase 1 moves `frontend/` and takes the URL change with it;
   phase 2 moves `backend/`.
   - Why: the two moves fail differently. The frontend move breaks `FRONTEND_DIR` and every URL,
     and the static and transpile tests say so loudly. The backend move breaks `MIGRATIONS_DIR`
     and the `package.json` script paths, which the migration tests and `bun start` say so loudly.
     Run together, a red suite does not name the culprit.
   - Impact: the mid-state after phase 1 is `backend/` and `src/frontend/` side by side, which
     reads oddly for one commit. Two things are edited twice as the price: the `__broken.ts`
     fixture path in `transpile.test.ts`, and the layout tree in `README.md`.

8. **One naming rule for prose:** every comment and document names a directory by its path from
   the repository root — `../../../src/backend/db/migrations`, never a bare `migrations/`, even inside a file
   that sits next to it.
   - Why: this is the rule the 2026-09-10 restructure adopted, and the documents already follow
     it. Dropping it now would produce `docs/backend.md` saying `../../../src/backend/db/migrations` while
     `migrations.ts:4` says `migrations/`, and a reader could not tell stale from relative.
   - Impact: it surfaces the edits that no search for `backend` or `frontend` would find, because
     they live in one half and name the other — `src/frontend/types.ts:4` names the backend's
     `repo/`, and `src/frontend/base.ts:53` names its own components directory by full path. Both
     are covered by a per-phase sweep.

9. **`docs/agents/` is left alone.** The old-path references across its ten dated documents stand
   unedited, including the four that describe the layout this plan replaces.
   - Why: they record what was true when they were written, and the project already treats them as
     artifacts — `.oxfmtrc.json` lists `docs/agents/` under `ignorePatterns`.
   - Impact: only this plan uses the new layout. The same reasoning covers the illustrative commit
     message at `.agents/skills/commit/SKILL.md:98`, which quotes "Group the frontend's modules and
     styles under frontend/src/" as a *sample of prose style*, not as a description of the tree.

## Current State

```
gainz/
├── backend/
│   ├── migrations/  001-initial-schema.sql
│   └── src/         db.ts http.ts main.ts migrate.ts migrations.ts paths.ts routes.ts
│                    seed.ts server.ts static.ts testing.ts transpile.ts validate.ts
│                    + the *.test.ts beside each   repo/   routes/
├── frontend/
│   ├── index.html
│   └── src/         api.ts base.ts format.ts main.ts router.ts styles.ts theme.ts
│                    types.ts   components/<tag>/<tag>.{ts,css}   css/
├── data/            .gitkeep  (+ git-ignored gainz.sqlite)
├── docs/            backend.md frontend.md coding-guidelines.md styling-guidelines.md
│                    agents/{plans,research}/
├── .idea/           runConfigurations/*.xml
└── package.json tsconfig.json .oxlintrc.json .oxfmtrc.json bunfig.toml
    README.md AGENTS.md (symlink: CLAUDE.md -> AGENTS.md)
```

Four places resolve a real directory path, and one of them is the web root:

| Location | Current value | Fate |
| --- | --- | --- |
| `backend/src/paths.ts:14` | `REPO_ROOT = resolve(fileURLToPath(new URL('../..', import.meta.url)))` | **unchanged** — same depth after the move (decision 4) |
| `backend/src/paths.ts:15` | `FRONTEND_DIR = resolve(REPO_ROOT, 'frontend')` | phase 1 — `resolve(REPO_ROOT, 'src', 'frontend')` |
| `backend/src/migrations.ts:36` | `MIGRATIONS_DIR = resolve(import.meta.dir, '../migrations')` | phase 2 — `resolve(import.meta.dir, 'migrations')` |
| `backend/src/db.ts` | `DEFAULT_DB_PATH = process.env.GAINZ_DB ?? 'data/gainz.sqlite'` | **unchanged** — CWD-relative (decision 1) |

Plus one test fixture that builds a path by hand:

| Location | Current value |
| --- | --- |
| `backend/src/transpile.test.ts:54` | `resolve(import.meta.dir, '..', '..', 'frontend', 'src', '__broken.ts')` |

And the URL literals, which exist because `FRONTEND_DIR` is `frontend/` and the modules sit one
level below it:

```
frontend/index.html:34          <link rel="stylesheet" href="/src/css/app.css" />
frontend/index.html:35          <script type="module" src="/src/main.ts"></script>
frontend/src/styles.ts:19       BASE_HREFS = ['/vendor/pico.css', '/src/css/shared.css']
frontend/src/styles.ts:21       componentHref = `/src/components/${tagName}/${tagName}.css`
backend/src/static.test.ts:20   '/src/css/app.css', '/src/css/shared.css', '/src/components/gz-app/gz-app.css'
backend/src/static.test.ts:40   '/src/format.ts'
backend/src/static.test.ts:47   '/src/nope.ts'
backend/src/transpile.test.ts   '/src/format.ts', '/src/components/gz-chart/gz-chart.ts',
                                '/src/main.ts', '/src/types.ts',
                                '/src/components/gz-set-row/gz-set-row.ts', '/src/__broken.ts',
                                and the `src="/src/main.ts"` assertion against index.html
```

Five things are cheaper than they look, and the plan should not spend effort on them:

- **No import specifier changes, anywhere.** Inside the backend, `./migrations` and `../db` survive
  because `backend/src/**` moves as one piece. Inside the frontend, `../../base.ts` from a
  component survives because `components/` stays immediately below the frontend root. The one
  cross-half import in the project is `import type` only — and it does not exist: `types.ts`
  declares the wire shapes by hand precisely so there is none.
- **`.idea/runConfigurations/*.xml` need no edits.** All eight invoke npm scripts against
  `$PROJECT_DIR$/package.json`; not one names a source path.
- **`.oxlintrc.json`, `.oxfmtrc.json`, `bunfig.toml` and `.gitignore` need no edits.** None names a
  source directory. `oxlint` and `oxfmt` both run over `.`.
- **`docs/coding-guidelines.md` and `docs/styling-guidelines.md` need no edits.** Neither names a
  path.
- **Test discovery needs no configuration.** `bun test` scans from the root; the suite is found at
  its new depth the same way it was found at the old one. The count is the check.

One pre-existing staleness is worth fixing while the file is open, and phase 1 does:
`backend/src/transpile.test.ts:45` asserts `expect(body).not.toContain('js/types.ts')`. There has
been no `js/` directory since the 2026-09-10 restructure renamed it, so the assertion cannot fail
and the test proves nothing. It should read `not.toContain('types.ts')`, which is what "the
type-only import was stripped whole" actually means.

## Desired End State

```
gainz/
├── src/
│   ├── backend/
│   │   ├── migrations/  001-initial-schema.sql
│   │   ├── repo/        index.ts sql.ts exercises.ts workouts.ts sets.ts stats.ts
│   │   ├── routes/      shared.ts + <entity>.routes.ts and their *.test.ts
│   │   └── db.ts http.ts main.ts migrate.ts migrations.ts paths.ts routes.ts seed.ts
│   │       server.ts static.ts testing.ts transpile.ts validate.ts + the *.test.ts
│   └── frontend/
│       ├── index.html
│       ├── components/  <tag>/<tag>.{ts,css}
│       ├── css/         app.css shared.css
│       └── api.ts base.ts format.ts main.ts router.ts styles.ts theme.ts types.ts
├── data/            .gitkeep  (+ git-ignored gainz.sqlite)
├── docs/
└── package.json tsconfig.json .oxlintrc.json .oxfmtrc.json bunfig.toml
    README.md AGENTS.md
```

Path resolution afterwards:

```
src/backend/paths.ts
  REPO_ROOT     = new URL('../..', import.meta.url)      -> gainz/            (unchanged)
  FRONTEND_DIR  = resolve(REPO_ROOT, 'src', 'frontend')  -> gainz/src/frontend/
  Bun.resolveSync('@picocss/pico/…', REPO_ROOT)          -> gainz/node_modules/…

src/backend/migrations.ts
  MIGRATIONS_DIR = resolve(import.meta.dir, 'migrations') -> gainz/src/backend/migrations/

src/backend/db.ts
  DEFAULT_DB_PATH = 'data/gainz.sqlite'                   -> resolved against CWD (unchanged)
```

URL surface afterwards — the web root is `src/frontend/`, so each URL is the file's path below it:

```
/                                     src/frontend/index.html
/main.ts                              src/frontend/main.ts            (transpiled)
/format.ts  /api.ts  /router.ts  …    src/frontend/<name>.ts          (transpiled)
/css/app.css  /css/shared.css         src/frontend/css/<name>.css
/components/gz-app/gz-app.ts          src/frontend/components/gz-app/gz-app.ts
/components/gz-app/gz-app.css         src/frontend/components/gz-app/gz-app.css
/vendor/pico.css                      node_modules/@picocss/pico/…    (unchanged)
/api/*                                the route table                 (unchanged)
```

## Abstractions and Code Reuse

No new abstractions. Every change is a `git mv`, a path literal, a URL literal, or a comment.

- `src/backend`
  - `paths.ts` — the file the whole static half hangs on
    - `REPO_ROOT` (`:14`) — **verify, do not edit**; only the comment above it is repathed
    - `FRONTEND_DIR` (`:15`) — `resolve(REPO_ROOT, 'src', 'frontend')`
    - `resolveStaticPath` — doc comment names `src/frontend/`; body unchanged
    - `resolveVendorPath` — no change
  - `migrations.ts`
    - `MIGRATIONS_DIR` (`:36`) — loses the `../`
    - module doc comment (`:4`) — names `../../../src/backend/db/migrations`
  - `static.ts` — one comment naming the frontend directory (`:44`)
  - `transpile.ts` — doc comment on `transpileModule` names `src/frontend/`
  - `testing.ts` — header comment says the harness serves every `*.test.ts` under `backend/src/`
  - `repo/index.ts` — header comment says SQL lives under `backend/src/repo/`
  - `static.test.ts` — three URL literals, and the two encoded traversal probes, which lose a level
  - `transpile.test.ts` — eight URL literals, the `__broken.ts` fixture path, and the stale
    `'js/types.ts'` assertion
  - `db.ts`, `http.ts`, `main.ts`, `migrate.ts`, `routes.ts`, `seed.ts`, `server.ts`, `validate.ts`,
    `repo/*`, `routes/*` — **no change**
- `src/frontend`
  - `index.html` — the two `/src/…` URLs in `<head>`
  - `styles.ts` — `BASE_HREFS` (`:19`) and `componentHref` (`:21`)
  - `base.ts` — one comment naming `frontend/src/components/gz-chart/gz-chart.css` (`:53`)
  - `types.ts` — header comment explaining why these shapes are not imported from
    `backend/src/repo/` (`:4`)
  - every component module, `api.ts`, `format.ts`, `router.ts`, `theme.ts`, `main.ts` —
    **no change**
- root
  - `package.json` — the `module` field plus the `start`, `start:dev`, `seed` and `migrate` scripts
  - `tsconfig.json` — the `include` array
  - `README.md` — the layout tree plus six prose references and the URL examples
  - `AGENTS.md` — the single-file test example and the Architecture block
  - `docs/backend.md`, `docs/frontend.md` — headings and path references

## Logging & Observability

No logging changes. The two lines the server prints on boot are unaffected:

```
gainz is lifting on http://localhost:3000/
  database: data/gainz.sqlite
```

The `database:` line still reads `data/gainz.sqlite` after the move, which is itself the signal
that decision 1 held.

The one runtime message that names a path is the transpile failure, which logs
`gainz: could not transpile ${path}` with an absolute path and returns `Could not transpile
${basename(path)}`. Both are derived, so both follow the move without an edit — and the 500-status
test in `transpile.test.ts` asserts only the basename, which does not change.

## Implementation

### Phase 1: Move `frontend/` to `src/frontend/` and drop its `src/` level

Dependencies: None.

Hoist the frontend into the new root and collapse its inner `src/`, which is the phase that
carries the URL change. At the end of it the tree still has `backend/` at the root, `src/` holds
only the frontend, and everything works.

**Tasks**:

- [x] Create the new root and move the frontend into it in two hops, so `git` sees one rename per
      file rather than a move followed by a hoist:
      `New-Item -ItemType Directory src`, then `git mv frontend/src src/frontend`, then
      `git mv frontend/index.html src/frontend/index.html`, then `Remove-Item frontend` — which
      must succeed without `-Recurse`, proving the directory was left empty.
- [x] `backend/src/paths.ts:15` — the web root gains a level:
      `export const FRONTEND_DIR = resolve(REPO_ROOT, 'src', 'frontend');`
      `REPO_ROOT` on line 14 is **not** touched in this phase; it is verified in phase 2.
- [x] `backend/src/paths.ts:4` and `:41` — the module doc comment and the `resolveStaticPath` doc
      comment both name `frontend/`; both become `src/frontend/`.
- [x] `backend/src/static.ts:44` — the comment reasoning about Bun's MIME database ends "would
      drift as `frontend/` grows"; becomes `src/frontend/`.
- [x] `backend/src/transpile.ts:18` — doc comment on `transpileModule`: `path` has been resolved
      inside `src/frontend/`.
- [x] `src/frontend/index.html:34-35` — the two URLs lose their prefix:
      `<link rel="stylesheet" href="/css/app.css" />` and
      `<script type="module" src="/main.ts"></script>`.
      Leave `/vendor/pico.css` on line 33 alone — it is served from the allowlist, not from
      `FRONTEND_DIR`.
- [x] `src/frontend/styles.ts:19` — `const BASE_HREFS = ['/vendor/pico.css', '/css/shared.css'];`
- [x] `src/frontend/styles.ts:21` — ``const componentHref = (tagName: string): string =>
      `/components/${tagName}/${tagName}.css`;``
- [x] `src/frontend/base.ts:53` — the comment names
      `frontend/src/components/gz-chart/gz-chart.css`; becomes
      `src/frontend/components/gz-chart/gz-chart.css`.
- [x] `backend/src/static.test.ts:20` — the stylesheet list becomes
      `['/css/app.css', '/css/shared.css', '/components/gz-app/gz-app.css']`.
- [x] `backend/src/static.test.ts:40` and `:47` — `'/format.ts'` and `'/nope.ts'`.
- [x] `backend/src/static.test.ts:14` — the test name says "below frontend/"; becomes
      "below src/frontend/". The probe itself, `/../package.json` on line 15, is left as it is:
      the URL parser normalises it to `/package.json` before `resolveStaticPath` ever sees it, so
      what it asserts — that the frontend root does not serve the repository's files — is
      unchanged by the move.
- [x] `backend/src/static.test.ts:50` — the test name says "outside frontend/"; becomes
      "outside src/frontend/".
- [x] `backend/src/static.test.ts:53-54` — the two encoded traversal probes name
      `/%2e%2e/backend/src/server.ts` and `/%2e%2e/backend/src/transpile.ts`. One `..` above the
      web root is now `src/`, not the repository root, so after phase 2 these must read
      `/%2e%2e/backend/server.ts` and `/%2e%2e/backend/transpile.ts`. In **this** phase the
      backend has not moved yet, so they become `/%2e%2e/%2e%2e/backend/src/server.ts` and
      `/%2e%2e/%2e%2e/backend/src/transpile.ts` — one extra hop, because the web root went one
      level deeper while the backend stayed put. They pass either way; the point of editing them
      is that a probe naming a file that does not exist is a tautology dressed as a security test.
- [x] `backend/src/transpile.test.ts` — the eight URL literals lose their prefix:
      `:10` `'/format.ts'`, `:22` `'/components/gz-chart/gz-chart.ts'`,
      `:28` `expect(page).toContain('src="/main.ts"')`, `:30` `'/main.ts'`, `:37` `'/types.ts'`,
      `:44` `'/components/gz-set-row/gz-set-row.ts'`, `:49`
      `'/components/gz-chart/gz-chart.ts'`, `:57` `'/__broken.ts'`.
      Line 23, `expect(body).toContain('from "../../format.ts"')`, is **unchanged** — it asserts
      an import specifier, and no specifier changes in this plan. Line 33,
      `toContain('./components/gz-app/gz-app.ts')`, is unchanged for the same reason.
- [x] `backend/src/transpile.test.ts:45` — replace the stale assertion
      `expect(body).not.toContain('js/types.ts')` with
      `expect(body).not.toContain('types.ts')`. There has been no `js/` directory since the
      2026-09-10 restructure, so the current form cannot fail. Run it once against the *unedited*
      `gz-set-row.ts` to confirm the stronger assertion actually passes before moving on.
- [x] `backend/src/transpile.test.ts:54` — the fixture path, from `backend/src/`:
      `resolve(import.meta.dir, '..', '..', 'src', 'frontend', '__broken.ts')`.
      This line is edited again in phase 2; that is the deliberate cost of decision 7.
- [x] `tsconfig.json:17` — `"include": ["backend/src", "src/frontend"]`
- [x] `docs/frontend.md` — the heading (`:1`) becomes `# Frontend (\`src/frontend/\`)`; the
      `src/base.ts` and `src/styles.ts` references (`:3-4`) become bare `base.ts` and `styles.ts`,
      since the directory the heading names now holds them directly; the component-directory
      convention (`:7`) becomes `src/frontend/components/<tag>/`; and the `src/types.ts`
      reference (`:26`) becomes `types.ts`.
- [x] `docs/backend.md:9` and `:52` — static serving is `src/frontend/` with a path-escape guard.
- [x] `README.md` — the `frontend/` node in the layout tree (`:112-130`) is rewritten to
      `src/frontend/` with `index.html`, `css/`, `components/` and the eight modules as its direct
      children; `static.ts` at `:104` serves `src/frontend/`; the `UNIT` pointer at `:62` becomes
      `src/frontend/format.ts`; and the two component-directory references at `:167` and `:169`
      become `src/frontend/components/…`. The tree's `backend/` half is rewritten in phase 2.
- [x] `AGENTS.md:34-35` — the `frontend/` entry in the Architecture list becomes `src/frontend/`.
      Edit `AGENTS.md`, not `CLAUDE.md`; the latter is a symlink to it.

**Automated Verification**:

- [x] `bun test` reports **53 pass across 11 files** — the same as before the move. `static.test.ts`
      and `transpile.test.ts` are the two that prove the frontend is still found and still served
      at its new URLs; an unchanged count proves Bun still discovers every file.
- [x] `bun run typecheck` is clean. This also proves the new `include` glob matches the moved
      directory rather than silently covering nothing — a typo there typechecks *faster*, not
      louder, so the check is that `tsc` still has work to do.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `git status` shows the move as renames (`R`), not as deletions plus additions.
- [x] `Test-Path frontend` returns `False`.
- [x] No `/src/…` URL survives anywhere. Every remaining hit must be a filesystem path naming
      `backend/src/…`, never a quoted URL:
      `Get-ChildItem -Path backend,src -Recurse -Include *.ts,*.html,*.css | Select-String -SimpleMatch '/src/'`
- [x] No prose still names the frontend by its old path:
      `Get-ChildItem -Path backend,src -Recurse -Include *.ts,*.html,*.css | Select-String -Pattern '(^|[^./\w])frontend/'`
      Every hit must read `src/frontend/`.

**Manual Verification**:

- [ ] `bun start`, then open `http://localhost:3000/` and click through Dashboard → Workouts →
      open a workout → Exercises → open an exercise. This is the check that the URL change did not
      leave a component unstyled or a lazily imported route unreachable. The suite fetches modules
      and stylesheets individually; it never exercises `styles.ts` adopting a sheet into a shadow
      root, and an adopted-stylesheet failure is silent apart from a console line.
- [ ] With the app open, the browser console is clean — in particular no
      `gainz: could not load stylesheet` line, which is what a missed `componentHref` would print
      while the page still rendered.

### Phase 2: Move `backend/` to `src/backend/`, drop its `src/` level, and fold in `migrations/`

Dependencies: Phase 1.

Move the backend under the same root, collapsing `backend/src/` into `src/backend/` and bringing
the schema files with it. The module depth below the repository root is unchanged, so only the one
constant that pointed *out of* `src/` at a sibling directory actually moves.

**Tasks**:

- [x] Move both halves of the backend in two hops:
      `git mv backend/src src/backend`, then `git mv backend/migrations src/backend/migrations`,
      then `Remove-Item backend` — again without `-Recurse`, proving nothing was left behind.
- [x] `src/backend/paths.ts:14` — **verify and do not edit.**
      `resolve(fileURLToPath(new URL('../..', import.meta.url)))` from `src/backend/` resolves to
      the repository root, exactly as it did from `backend/src/`: the module sits at the same
      depth. The check that this holds is the `/vendor/pico.css` test, which is the only thing
      that exercises `Bun.resolveSync(specifier, REPO_ROOT)` reaching `node_modules`.
- [x] `src/backend/paths.ts:12-13` — the comment above it reads "it only holds while the file sits
      in `backend/src/`"; becomes `src/backend/`. This is the edit that makes the unedited line
      below it legible, and it is the only reason a reader will not repath the constant by mistake.
- [x] `src/backend/paths.ts:15` — **verify and do not edit.**
      `resolve(REPO_ROOT, 'src', 'frontend')` was already made correct in phase 1 and the frontend
      has not moved since.
- [x] `src/backend/migrations.ts:36` — `migrations/` is now a child rather than a sibling:
      `export const MIGRATIONS_DIR = resolve(import.meta.dir, 'migrations');`
- [x] `src/backend/migrations.ts:4` — the module doc comment says numbered `.sql` files live under
      `backend/migrations/`; becomes `../../../src/backend/db/migrations`.
- [x] `src/backend/testing.ts:2` — header comment: the harness every `*.test.ts` under
      `src/backend/` builds its fixtures from.
- [x] `../../../src/backend/db/repo` — header comment: all SQL lives under `../../../src/backend/db/repo`.
- [x] `src/frontend/types.ts:4` — the header comment explaining why these shapes are written by
  hand says they are "not imported from `backend/src/repo/`"; becomes `../../../src/backend/db/repo`.
  This is the edit no search for `backend/src` inside the backend would surface — it lives in
  the frontend and names a backend directory, which is the class of miss decision 8 exists for.
- [x] `src/backend/static.test.ts:53-54` — the traversal probes lose the level phase 1 gave them
      and the one the backend just lost: `/%2e%2e/backend/server.ts` and
      `/%2e%2e/backend/transpile.ts`. One `..` above the web root is `src/`, and `backend/` is
      right there — so unlike before, a single failed guard would now reach real source. That is
      exactly what the probe should describe.
- [x] `src/backend/transpile.test.ts:54` — the fixture path, now from `src/backend/`:
      `resolve(import.meta.dir, '..', 'frontend', '__broken.ts')`
- [x] `package.json:7` — `"module": "src/backend/main.ts"`
- [x] `package.json:9-12` — the four scripts:
      `start` → `bun run src/backend/main.ts`,
      `start:dev` → `bun --watch src/backend/main.ts`,
      `seed` → `bun run src/backend/seed.ts`,
      `migrate` → `bun run src/backend/migrate.ts`
- [x] `tsconfig.json:17` — `"include": ["src"]`, per decision 6.
- [x] `docs/backend.md` — the heading (`:1`) becomes `# Backend (\`src/backend/\`)`; the schema
      location (`:34`) becomes `src/backend/migrations/`; and the three module references at
      `:43`, `:49` and `:62` become `src/backend/testing.ts`, `src/backend/migrations.test.ts` and
      `src/backend/static.test.ts:39`.
- [x] `docs/frontend.md:21` and `:29` — `src/backend/transpile.ts` and `../../../src/backend/db/repo`.
- [x] `README.md` — rewrite the `backend/` half of the layout tree (`:70-111`) as `src/backend/`
      with `migrations/` among its children, and update the four prose references: `:33`
      (`../../../src/backend/db/migrations`), `:183` (`src/backend/transpile.ts`), `:239`
      (`src/backend/paths.ts`) and `:298` (adding `src/backend/migrations/<next number>-…sql`).
- [x] `AGENTS.md` — line 14 (`bun test src/backend/routes/workout.routes.test.ts`) and the
      Architecture block (`:30-35`), which should now describe `src/` as one entry with
      `src/backend/` (holding the server, its colocated tests and `migrations/`) and
      `src/frontend/` as its two children.

**Automated Verification**:

- [x] `bun test` reports **53 pass across 11 files**, unchanged again — confirming Bun still
      discovers the suite at its new depth rather than finding a subset of it.
- [x] `bun test src/backend/migrations.test.ts` reports 11 pass. This is the real check on
      `MIGRATIONS_DIR`: the file reads `001-initial-schema.sql` out of the live constant, so a
      wrong path fails here loudly rather than at boot.
- [x] `bun test src/backend/static.test.ts` reports 8 pass — the `/vendor/pico.css` case inside it
      is what proves `REPO_ROOT` still reaches `node_modules` after decision 4's "do not edit".
- [x] `bun run typecheck` is clean.
- [x] `bun run lint` passes.
- [x] `bun run fmt:check` passes.
- [x] `bun run migrate` against a **fresh** throwaway database prints `applied
      001-initial-schema` and then `now at schema version 1`. Delete the file first, or the second
      run reports `already at schema version 1 — nothing to apply` and the check passes without
      applying anything:
      `$env:GAINZ_DB = "$env:TEMP\gainz-src-layout-check.sqlite"; Remove-Item $env:GAINZ_DB -ErrorAction Ignore; bun run migrate`
      What this proves is the rewritten `migrate` script path in `package.json`, which no test
      exercises.
- [x] `git status` shows renames (`R`) for the moved files.
- [x] `Test-Path backend` returns `False`, and the repository root contains no `src` *file*
      collision — `Get-ChildItem -Directory` at the root lists `src`, `data`, `docs` and nothing
      else that is not dot-prefixed or `node_modules`.
- [x] `Get-ChildItem src -Directory` lists exactly `backend` and `frontend`, and
      `Test-Path src/backend/src`, `Test-Path src/frontend/src` both return `False`.
- [x] No `/src/` string survives in either half — after this phase the correct spelling is
      `src/backend/` and `src/frontend/`, neither of which contains it:
      `Get-ChildItem -Path src -Recurse -Include *.ts,*.html,*.css | Select-String -SimpleMatch '/src/'`
      must return nothing at all.
- [x] No prose still names a half by its old root:
      `Get-ChildItem -Path src -Recurse -Include *.ts,*.html,*.css | Select-String -Pattern '(^|[^./\w])(backend|frontend|migrations)/'`
      Every hit must be preceded by `src/`.
- [x] The documents agree with the tree:
      `Select-String -Path README.md,AGENTS.md,docs/backend.md,docs/frontend.md -Pattern '(^|[^./\w])(backend|frontend)/'`
      Every hit must read `src/backend/` or `src/frontend/`. `docs/agents/` is excluded by
      decision 9.

**Manual Verification**:

- [x] `bun start` boots, its first line names the port and its second still reads
      `database: data/gainz.sqlite` — the check that decision 1 held and `DEFAULT_DB_PATH` was not
      disturbed. Against that running server, `/`, `/css/app.css`, `/main.ts`, `/vendor/pico.css`
      and `/api/health` all return 200. The `import.meta.main` block and the real on-disk database
      path are the two things `useServer()` never exercises, which is why this is worth doing
      outside the suite.
- [x] `bun run start:dev` picks up an edit to `../../../src/backend/http/routes` and restarts.
      `--watch` is given a file path in `package.json` and is the one script whose rewritten path
  has a mode of failure beyond "does not start".
- [x] `bun run seed` against a throwaway `GAINZ_DB` fills the database without error — the fourth
      rewritten script path, and the only one no other check touches.

## Implementation Notes

Both phases went as written. Every path prediction in the plan held: `REPO_ROOT` needed no edit
(decision 4), `MIGRATIONS_DIR` lost exactly its `../`, no import specifier moved in either half,
and the two `Remove-Item` calls both succeeded without `-Recurse`, which is what proves the
`git mv` pairs emptied the old directories rather than leaving a stray file behind. `git status`
recorded 58 pure renames plus 12 rename-with-modification, so history follows all 70 moved files.
`bun test` reported 53 pass across 11 files with 141 `expect()` calls before the work started and
after each phase — identical all three times.

Four things the tasks did not name:

- **Two stale paths in `index.html`'s comments.** The pre-paint theme script says the preference is
  owned "from then on" by what was `src/theme.ts`, and the Pico comment names what was
  `src/styles.ts`. Both were correct when `index.html` sat above `src/`, and both became wrong the
  moment that level was collapsed — but neither sweep in phase 1 could see them: they contain
  neither `/src/` nor a bare `frontend/`. They are now `src/frontend/theme.ts` and
  `src/frontend/styles.ts` per decision 8. This is the same class of miss as
  `src/frontend/types.ts:4`, and it is worth recording that the sweeps as written do not catch a
  path that was *relative to the moved file itself*.
- **Prose rewrapping.** Repathing a directory inside a sentence pushes the line past the column the
  surrounding document keeps to, so touched paragraphs in `README.md` (72–80 columns),
  `docs/backend.md`, `docs/frontend.md` (100) and the module doc comment in
  `../../../src/backend/db/migrations.ts` were re-flowed. `oxfmt` reflows neither comments nor Markdown prose,
  so `fmt:check` would not have caught a ragged line.
- **The `README.md` layout tree needed dedenting, not just repathing.** Collapsing `backend/src/`
  into `src/backend/` removes a level of indentation from 38 tree lines; repathing only the header
  line would have left every child indented as though `src/` were still there.
- **`AGENTS.md`'s Architecture block gained a sentence about the web root.** The URL change of
  decision 3 is the one thing about this layout that a reader cannot infer from the tree, and
  `AGENTS.md` is where someone looks before touching the frontend.

Two verification notes:

- **`bun run fmt:check` fails on `CLAUDE.md`, and did so before this work.** `CLAUDE.md` is a git
  symlink (mode `120000`) to `AGENTS.md`; this Windows checkout has `core.symlinks=false`, so git
  materialises it as an 11-byte text file containing `./AGENTS.md` with no trailing newline, which
  `oxfmt` reads as malformed Markdown. The file is byte-identical to `HEAD` and was never touched
  here. It must **not** be "fixed" by appending a newline — that would corrupt the symlink for any
  POSIX checkout. Every other file passes; the phase checks were run as
  `bunx oxfmt --check src docs README.md AGENTS.md package.json tsconfig.json`.
- **The phase-2 manual checks were run programmatically rather than by hand**, and their output is
  in the session: `bun start` with no `GAINZ_DB` printed `database: data/gainz.sqlite` and answered
  `/api/health` with 200; `bun run start:dev` re-printed its boot line after
  `../../../src/backend/http/routes` was touched, proving `--watch` follows the rewritten path;
  `bun run seed` against a throwaway database seeded 16 workouts and 101 sets. The phase-1 browser
  checks are the only items left unticked — the Chrome extension was not connected in this session.
  What *was* verified for them is stronger than a spot check: with the server running, all 35 moved
  URLs were fetched and every one returned 200 — `/`, the eight top-level modules, both app
  stylesheets, `/vendor/pico.css`, `/api/health`, and the `.ts` and `.css` of all ten components.
  Since the only failure mode behind the visual check is `styles.ts` fetching a stylesheet that
  404s, that sweep rules it out mechanically; the remaining risk is cosmetic.

One pre-existing bug was fixed in passing, as the plan's Current State section anticipated:
`transpile.test.ts` asserted `not.toContain('js/types.ts')` against a `js/` directory that has not
existed since 2026-09-10, so it could not fail. It now asserts `not.toContain('types.ts')`, which
is what "the type-only import was stripped whole" actually means, and it passes.

## References

- `backend/src/paths.ts:12-15` — `REPO_ROOT` (unchanged, decision 4) and `FRONTEND_DIR`, the web
  root whose move is the whole of decision 3
- `backend/src/paths.ts:28` — `Bun.resolveSync` into `node_modules` for the vendor allowlist, the
  second job `REPO_ROOT` carries
- `backend/src/migrations.ts:36` — `MIGRATIONS_DIR`, the one path the 2026-09-10 restructure left
  untouched and this one must change
- `backend/src/db.ts` — `DEFAULT_DB_PATH`, CWD-relative, the reason `data/` stays at the root
- `backend/src/static.test.ts` and `backend/src/transpile.test.ts` — the two suites that carry
  every URL literal, and the escape guard's only probes
- `backend/src/transpile.test.ts:45` — the `'js/types.ts'` assertion left stale by the 2026-09-10
  rename
- `frontend/src/styles.ts:19-21` — `BASE_HREFS` and `componentHref`, the frontend's only
  constructed URLs
- `frontend/index.html:33-35` — the three `<head>` links, one of which must not be touched
- `README.md:67-131` — the Layout section, the largest documentation edit in the plan
- `docs/agents/plans/2026-09-10-restructure-into-backend-and-frontend.md` — the move this one
  builds on; its decisions 1, 4 and 6 are carried forward here as 1, 9 and 8
- `.oxfmtrc.json:4` — `ignorePatterns: ["docs/agents/"]`, the precedent for decision 9
