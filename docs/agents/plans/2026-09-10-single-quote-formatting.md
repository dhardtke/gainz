---
date: 2026-09-10T21:59:02.240490+00:00
git_commit: 152f0201d750c8d11707f39e6dcaf7341a5ac520
branch: main
topic: "Adopt oxfmt's singleQuote option across the project"
tags: [plan, tooling, oxfmt, formatting, docs]
status: complete
---

# PLAN: Adopt oxfmt's `singleQuote` option

Turn on oxfmt's `singleQuote` option and reformat the whole project to match, while keeping CSS on
double quotes. The formatter change is mechanical; the work that needs judgement is the small set of
documentation snippets oxfmt cannot reach and the convention note that explains the CSS exception.

Every figure in this plan was measured by applying the change to a clean working tree, recording the
result, and reverting it.

## Acceptance Criteria

- `.oxfmtrc.json` sets `singleQuote: true` and carries an `overrides` entry pinning `**/*.css` back to
  `singleQuote: false`.
- `bun run fmt:check` passes over all 82 matched files with no manual fixups.
- Every string literal in `backend/**` and `frontend/**` TypeScript uses single quotes, except the nine
  literals whose content contains an apostrophe — oxfmt keeps those double-quoted to avoid an escape.
  They live at `backend/src/migrations.ts:56`, `backend/test/meta.api.test.ts:29`,
  `backend/test/migrate.test.ts:36`, `frontend/src/base.ts:16`,
  `frontend/src/components/gz-set-row/gz-set-row.ts:41`, and
  `frontend/src/components/gz-workout-detail/gz-workout-detail.ts:212,222,237,238`.
- CSS attribute selectors and `grid-template-areas` strings still use double quotes.
- `frontend/index.html`'s HTML attributes are byte-identical, including the `data:image/svg+xml`
  favicon on line 12; only its inline `<script>` body flips.
- `bun test` (53 tests, 6 files), `bun run typecheck` and `bun run lint` all pass unchanged.
- No new escaped quotes anywhere in the diff.
- The six stale TypeScript snippets in `README.md` and `docs/frontend.md` read as single-quoted, and
  the HTML, JSON, shell and English-prose quotes near them are untouched.
- `AGENTS.md` states the convention; `docs/styling-guidelines.md` explains the CSS carve-out.
- Two commits on `main`: a mechanical `style:` commit, then a `docs:` commit.

## Technical Key Decisions and Tradeoffs

1. **CSS keeps double quotes, via an `overrides` entry.** `singleQuote` is applied globally and then
   switched back off for `**/*.css`.
   - Why: double quotes are the near-universal CSS convention — Prettier hard-codes that behaviour and
     leaves CSS alone even under `singleQuote: true`, whereas oxfmt does not. Two CSS comments quoting
     `role="group"` (`frontend/src/css/shared.css:67`) and `preserveAspectRatio="none"`
     (`frontend/src/components/gz-chart/gz-chart.css:57`) would otherwise disagree with the selectors
     beside them, because the formatter rewrites code but not comments.
   - Impact: `.oxfmtrc.json` grows an `overrides` array. Four CSS files drop out of the change set,
     leaving 51 files instead of 55.

2. **`.agents/` stays formatted**, so the plan template's YAML frontmatter flips along with everything
   else.
   - Why: `.agents/` is not in `ignorePatterns` today and its files are currently formatted. Adding it
     would silently drop six files out of `oxfmt --check .` (82 matched files down to exactly 76,
     measured) — a bigger behavioural change than the single line it would avoid.
   - Impact: one line changes in `.agents/skills/rpi-plan/references/plan-template.md`. `.claude/skills`
     is a symlink to `.agents/skills`, so this is one file on disk, edited once.

3. **Documentation covers the convention and its exception**, not just the stale snippets.
   - Why: `.oxfmtrc.json` is plain `.json` and cannot carry a comment, so the reason for the CSS
     override has nowhere else to live. `docs/styling-guidelines.md` already collects the reasoning
     behind CSS decisions.
   - Impact: `CLAUDE.md` is a committed symlink to `AGENTS.md` (git mode `120000`), so only `AGENTS.md`
     is edited — writing to both would break the symlink.

4. **Two commits, and no `.git-blame-ignore-revs`.**
   - Why: separating 800 lines of churn from roughly nine lines of editorial work keeps the second
     commit reviewable. A blame-ignore file only takes effect once each developer sets
     `blame.ignoreRevsFile` locally, which is not worth a third commit here.
   - Impact: the `style:` commit must be self-contained — the config change and the reformat go in
     together, or `fmt:check` is red at that commit.

## Current State

```
gainz/
├── .oxfmtrc.json          printWidth 160, ignorePatterns ["docs/agents/"]
│                          no `singleQuote` key → oxfmt's default of false → double quotes
├── package.json           "fmt": "oxfmt .", "fmt:check": "oxfmt --check ."
├── .oxlintrc.json         no quote-style rules; oxlint does not police quotes
├── AGENTS.md              CLAUDE.md is a symlink to it (git mode 120000)
├── .agents/skills/…       8 tracked files; oxfmt matches 6 of them (the 2 .py are not
│                          matched). NOT in ignorePatterns.
│                          .claude/skills is a symlink to .agents/skills, and oxfmt
│                          does not follow it — `oxfmt --check .claude` sees 1 file
├── backend/               31 .ts files (24 in src/, 7 in test/)
├── frontend/              19 .ts, 13 .css, 1 .html
├── docs/                  backend.md, frontend.md, styling-guidelines.md — formatted
│   └── agents/            plans + research — ignored by oxfmt
└── no .github/, no CI, no .editorconfig, no .git-blame-ignore-revs
```

`bunx oxfmt --check .` matches **82 files** and currently passes.

`singleQuote` in oxfmt 0.67.0 covers **JS, JSX, TS, TSX, CSS, Less, SCSS, Markdown, MDX, YAML,
Handlebars and Svelte** — notably *not* HTML attributes. Measured effect of `singleQuote: true` with no
override:

| Area                                                  | Files | Notes                                             |
| ----------------------------------------------------- | ----- | ------------------------------------------------- |
| `backend/**/*.ts`                                      | 31    | all of them — 24 under `src/`, 7 under `test/`    |
| `frontend/src/**/*.ts`                                 | 18    | of 19; one has no string literal to flip          |
| `frontend/index.html`                                  | 1     | inline `<script>` body only; attributes untouched |
| `frontend/src/**/*.css`                                | 4     | 6 lines total — this plan excludes these          |
| `.agents/skills/rpi-plan/references/plan-template.md`  | 1     | YAML frontmatter `topic: "…"` → `topic: '…'`      |

55 files and 806 lines, all of it quote flips. Excluding CSS, that is **51 files and 800 lines**.
Nothing in `docs/*.md`, `README.md`, `AGENTS.md`, `package.json` or `tsconfig.json` moves.

Verified with the change applied to the working tree: `bun test` 53 pass / 0 fail, `bun run typecheck`
clean, `bun run lint` exit 0, and zero newly escaped quotes in the diff.

## Desired End State

```
.oxfmtrc.json
  singleQuote: true                  ← TS, JS, Markdown, YAML
  overrides: [ **/*.css → false ]    ← CSS stays on double quotes

backend/**/*.ts        'single'      (except strings containing an apostrophe)
frontend/src/**/*.ts   'single'
frontend/index.html    <script> body 'single'; HTML attributes unchanged
frontend/**/*.css      "double"      (unchanged)
README.md, docs/frontend.md          TS snippets in prose read as 'single'
AGENTS.md              one line stating the convention
docs/styling-guidelines.md           one bullet explaining the CSS carve-out
```

`bun run fmt:check` green over all 82 matched files, with `bun test`, `bun run typecheck` and
`bun run lint` unchanged.

## Abstractions and Code Reuse

No new abstractions. The change is a formatter configuration flag plus its mechanical consequence; the
existing `fmt` / `fmt:check` scripts already drive it.

- `.oxfmtrc.json` — add `singleQuote` and `overrides`
- `backend/src/**`, `backend/test/**`, `frontend/src/**`, `frontend/index.html` — reformatted by
  `bun run fmt`, never edited by hand
- `.agents/skills/rpi-plan/references/plan-template.md` — reformatted by `bun run fmt`
- `README.md` — 3 prose snippets corrected by hand
- `docs/frontend.md` — 3 prose snippets corrected by hand
- `AGENTS.md` — new convention line (do **not** touch `CLAUDE.md`, it is a symlink to this file)
- `docs/styling-guidelines.md` — new bullet on the CSS exception

## Logging & Observability

No logging or observability changes: nothing about the running application's behaviour changes.

## Implementation

### Phase 1: Enable `singleQuote` and reformat

Dependencies: None.

Turn the option on with the CSS carve-out, let the formatter rewrite the project, and prove that
nothing but quotes moved.

**Tasks**:

- [x] Confirm the working tree is clean, so the reformat diff is unambiguous. `git status --porcelain`
      should print nothing — or at most this plan file, if it has not been committed yet.
- [x] Add `singleQuote` and `overrides` to `.oxfmtrc.json`, keeping `$schema`, `printWidth` and
      `ignorePatterns` as they are:
      ```json
      {
        "$schema": "./node_modules/oxfmt/configuration_schema.json",
        "printWidth": 160,
        "ignorePatterns": ["docs/agents/"],
        "singleQuote": true,
        "overrides": [{ "files": ["**/*.css"], "options": { "singleQuote": false } }]
      }
      ```
- [x] Run `bun run fmt` to rewrite the project. Expect **51 files** reformatted: 31 under `backend/`
      (24 in `src/`, 7 in `test/`), 18 under `frontend/src/`, `frontend/index.html`, and
      `.agents/skills/rpi-plan/references/plan-template.md`. Do not hand-edit any of them. The config
      above needs no reformatting — oxfmt leaves it exactly as written, `overrides` on one line.
- [x] Confirm no CSS file was touched: `git diff --name-only -- "*.css"` must print nothing.
- [x] Confirm `frontend/index.html`'s HTML attributes are untouched — its diff is 3 lines, all inside
      the inline `<script>`. The `data:image/svg+xml` favicon on line 12 (which relies on single quotes
      nested inside a double-quoted attribute) must be unchanged.
- [x] Confirm the formatter introduced no escapes: no added line in the diff may contain `\'` or `\"`.
      Strings containing an apostrophe must still be **double**-quoted. Spot-check
      `backend/src/migrations.ts:56` — the line does change, because `.get("schema_migrations")` at its
      end flips to `.get('schema_migrations')`, but the SQL literal
      `"SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?"` keeps its double quotes.
      Also check `frontend/src/base.ts:16`, which exercises both directions in one line: `"&"` becomes
      `'&'`, while `'"'` and `"'"` are both already optimal and must not move.
- [x] **Run the whole Automated Verification block below before committing** — every `git diff` check
      in it is written against the working tree. Only then commit.
- [x] Commit as a `style:` commit covering `.oxfmtrc.json` and all 51 reformatted files together (52
      paths in total), so `fmt:check` is green at this commit. Follow the repository's commit
      conventions; the body should say why CSS is excluded rather than restate the diff.
- [x] After committing, re-run the two structural checks in their post-commit form to confirm what
      actually landed: `git diff --name-only HEAD~1 HEAD -- "*.css"` is empty, and
      `git diff --shortstat HEAD~1 HEAD -- . ":(exclude).oxfmtrc.json"` reports 51 files / 800 / 800.

**Automated Verification** (run against the working tree, before the commit task above — a `git diff`
check run after committing compares against an empty diff and passes for the wrong reason):

- [x] `bun run fmt:check` reports all matched files correctly formatted, over 82 files.
- [x] `git diff --name-only -- "*.css"` is empty.
- [x] No newly escaped quotes: `git diff -U0 | Select-String -Pattern '^\+.*\\[\x27"]'` returns
      nothing (`\x27` is the apostrophe, spelled this way to stay inside PowerShell's single quotes).
- [x] `git diff --shortstat -- . ":(exclude).oxfmtrc.json"` reports **51 files changed, 800
      insertions(+), 800 deletions(-)** — equal counts are what a pure quote flip looks like, with no
      reflowed lines. Including the config, the whole commit is 52 files, 803 insertions, 801
      deletions.
- [x] `bun test` passes: 53 tests across 6 files, 0 failures.
- [x] `bun run typecheck` exits 0.
- [x] `bun run lint` exits 0.

### Phase 2: Document the convention

Dependencies: Phase 1.

Correct the TypeScript snippets that live in prose — oxfmt does not rewrite inline code in Markdown, so
these go stale the moment Phase 1 lands — and record the convention and its one exception.

**Tasks**:

- [x] `README.md:166` — `await define("<tag>", TheClass)` → `await define('<tag>', TheClass)`
- [x] `README.md:183` — `import "./format.ts"` → `import './format.ts'`
- [x] `README.md:198` — `await import("…/gz-exercise-detail.ts")` →
      `await import('…/gz-exercise-detail.ts')`
- [x] `docs/frontend.md:8` — `await define("<tag>", TheClass)` → `await define('<tag>', TheClass)`
- [x] `docs/frontend.md:23` — `"./format.ts"` → `'./format.ts'`
- [x] `docs/frontend.md:27` — `import type { … } from "../../types.ts"` →
      `import type { … } from '../../types.ts'`
- [x] Leave every non-TypeScript quote in those files alone. Specifically: `README.md:224`
      (`<html data-theme="dark">`, HTML), `README.md:242` (`{ "error": "..." }`, JSON — JSON has no
      single-quoted form), `AGENTS.md:15` (`bun test -t "health"`, shell), `docs/frontend.md:9-10`
      (English quotation marks around "module loaded" and "stylesheet loaded"), and everything under
      `.agents/skills/**` and `.claude/skills/**`, which is vendored prose.
- [x] Add a line to `AGENTS.md` recording the convention — single quotes in TypeScript and JavaScript,
      double quotes in CSS, enforced by `bun run fmt`. Place it near the existing
      "Dependencies are pinned to exact versions." note under the Commands block, matching that
      section's terse single-sentence style.
- [x] Do **not** edit `CLAUDE.md`. It is a committed symlink to `AGENTS.md`; writing to it through a
      tool that replaces rather than appends would turn it into a regular file. Verify afterwards that
      `git diff --name-only` lists `AGENTS.md` and not `CLAUDE.md`.
- [x] Add a bullet to `docs/styling-guidelines.md` stating that CSS keeps double quotes deliberately —
      it is the prevailing CSS convention, and `.oxfmtrc.json` cannot carry a comment saying so. Match
      the file's existing bold-lead bullet style.
- [x] Run `bun run fmt` after the Markdown edits and before committing. oxfmt formats Markdown, so a
      newly added line could be reflowed; letting the formatter settle it first keeps the commit from
      needing a follow-up. Re-read any line it rewraps to confirm the wording still reads well.
- [x] Commit as a `docs:` commit.

**Automated Verification**:

- [x] `bun run fmt:check` passes.
- [x] No double-quoted TypeScript snippets remain:
      `Select-String -Path README.md,docs/frontend.md -Pattern 'define\("|import\("|"\./format\.ts"|"\.\./\.\./types\.ts"'`
      returns nothing.
- [x] The non-TypeScript examples survived:
      `Select-String -Path README.md -Pattern 'data-theme="dark"|\{ "error"'` returns two matches
      (lines 224 and 242), and `Select-String -Path AGENTS.md -Pattern 'bun test -t "health"'` returns
      one.
- [x] `git ls-files -s CLAUDE.md` still reports mode `120000` — the symlink is intact.
- [x] `git diff --name-only HEAD~1` lists exactly `README.md`, `docs/frontend.md`, `AGENTS.md` and
      `docs/styling-guidelines.md`.
- [x] `bun test`, `bun run typecheck` and `bun run lint` all still pass.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `.oxfmtrc.json` — the formatter configuration being changed
- `node_modules/oxfmt/configuration_schema.json` — `singleQuote` (languages and default),
  `jsxSingleQuote`, `quoteProps`, and the `OxfmtOverrideConfig` shape (`files`, `excludeFiles`,
  `options`; later overrides win)
- `package.json` — the `fmt` and `fmt:check` scripts
- `AGENTS.md` — commands, and the "commits go directly on `main`" convention
- `docs/styling-guidelines.md` — where the CSS reasoning lives
- `backend/src/migrations.ts:56` — the SQL string that must stay double-quoted
- `frontend/index.html:12` — the favicon data URI that depends on nested quote styles
- `frontend/src/css/shared.css:67`, `frontend/src/components/gz-chart/gz-chart.css:57` — the CSS
  comments that motivated the override
