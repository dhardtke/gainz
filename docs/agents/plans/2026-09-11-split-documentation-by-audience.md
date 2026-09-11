---
date: 2026-09-11T09:15:00+00:00
git_commit: 016f95cfef446fc85d0bb8faa7abb0093a2857eb
branch: main
topic: 'Split the documentation by audience: README to start-up only, AGENTS.md to an index, architecture into docs/'
tags: [plan, docs, documentation, readme, agents-md, architecture, drift]
status: complete
---

# PLAN: Split the documentation by audience

Give every documented fact exactly one home, chosen by who needs it:

- **`README.md`** — what this is and how to get it running after a fresh checkout. Nothing else.
- **`AGENTS.md`** — the commands, the standing process rules, a four-line orientation map, and a
  pointer to every document. It is the only index; there is no `docs/README.md`.
- **`docs/`** — the architecture, the rules and the reasoning, one subject per file, each one
  short. It stays the four files it already holds: `backend.md`, `frontend.md`,
  `coding-guidelines.md`, `styling-guidelines.md`.

No document contains a file tree, a REST reference or an end-user guide. The layers are described
in prose in `docs/backend.md` and `docs/frontend.md`; the tree is a `ls` away, and the endpoints
are in `src/backend/http/routes/`, one file per URL group, which is where they are correct.

Today the architecture is written down six times over at four altitudes across 485 lines, and
`README.md` is 309 of them — a user guide, a per-file tree, 106 lines of frontend rationale and the
full REST reference sharing one page. Meanwhile `docs/backend.md` and `docs/frontend.md`, which
carry the most architectural reasoning in the repository, are referenced by nothing and reachable
only by listing the directory. The research at
`docs/agents/research/2026-09-11-architecture-documentation.md` establishes both, along with seven
concrete drift errors; this plan is the fix for all three.

The result is a net deletion. Of `README.md`'s 309 lines, roughly 115 move into `docs/` — the
styling, loading and theming rationale, and the data model — around 150 are dropped, and about 45
stay.

This is a documentation-only change. No source file, script or config is touched.

## Acceptance Criteria

- `README.md` is under 50 lines and contains only: what gainz is, the runtime requirement, the
  three-command quick start, the database location and `GAINZ_DB`, the security note, and a
  pointer to `AGENTS.md` and `docs/`. It contains no REST tables, no file tree, no rationale and
  no user guide.
- `AGENTS.md` is under 50 lines and contains only: the purpose line, the command block, the
  process rules, a four-line orientation map, and a one-line-per-document pointer list.
- `docs/` (excluding `docs/agents/`) holds exactly four files — `backend.md`, `frontend.md`,
  `coding-guidelines.md`, `styling-guidelines.md` — and each is named in the `AGENTS.md` pointer
  list. No document in `docs/` is reachable only by listing the directory.
- No file tree, no endpoint table and no end-user guide appears in `README.md`, `AGENTS.md` or any
  file in `docs/`.
- Every subject in the overlap table of the research has exactly one canonical home; the other
  copies are gone, not summarised. The one deliberate exception is the database location, which
  stays in both `README.md` and `AGENTS.md` because both are entry points.
- All seven drift items from the research are fixed, and no document names a path, script or
  module that does not exist. A `grep` for `../src/`, `bun run dev` and `src/theme.ts` across
  `README.md`, `AGENTS.md` and `docs/*.md` returns nothing.
- `src/frontend/main.ts` is named in `docs/frontend.md`.
- Every paragraph removed from `README.md` either lands in a `docs/` file or appears in the
  "Deliberate deletions" list below — nothing disappears unaccounted for.
- Each file keeps its own wrap width — `README.md` at ~75 characters, `docs/*.md` at ~100 — and
  its single top-level heading.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass at the end of each
  phase. (They cannot break; running them is the guard against an accidental non-doc edit.)
- `TODO.md`'s two documentation items are removed, because this plan closes both.

## Technical Key Decisions and Tradeoffs

1. **The canonical command list lives in `AGENTS.md`, not `README.md`.**
   - Why: it is already the most complete list in the repository — `lint`, `fmt`, `bun test <file>`
     and `bun test -t <name>` appear there and nowhere else — and it is the file that is read first
     and most often. `README.md` keeps the three commands that constitute "getting it running"
     (`bun install`, `bun run seed`, `bun start`) and points at `AGENTS.md` for the rest.
   - Tradeoff: a human who reads only `README.md` does not immediately see that the project has a
     test suite, a linter and a formatter. The pointer line has to carry that weight, so it is
     phrased as "every script, including test, lint and format" rather than a bare link.
   - Rejected: keeping the six-row script table in `README.md`. It is the table that drifted —
     it still lists `bun run dev`, which has not existed since the script was renamed to
     `start:dev` — precisely because a second copy has no reason to be updated.

2. **There is no `docs/README.md`.** `AGENTS.md` is the only index.
   - Why: a second index is a second thing to keep current, and it would duplicate the pointer
     list that `AGENTS.md` has to carry anyway. One index, in the file that is read first.
   - Impact: `docs/` is a flat set of subject files with no hub. `README.md` points a human at
     `AGENTS.md` for the index rather than at a `docs/` landing page, which reads oddly for a
     human-facing README and is the real cost of this decision — mitigated by naming what
     `AGENTS.md` contains ("every script, and an index of the documentation") rather than linking
     it bare.
   - The `docs/agents/` note that would have lived in the index — that those files are
     append-only and describe the repository as of their stamped date — joins the existing
     process rule in `AGENTS.md` that already forbids editing them.

3. **The file tree is deleted, not relocated.** The annotated tree at `README.md:67-133` names
   every file in `src/`, test files included, in 67 lines.
   - Why: it is the single highest-drift artifact in the repository — stale within one refactor,
     and nothing checks it — and it is redundant: `docs/backend.md` and `docs/frontend.md` already
     name every module, in prose, with the reason it exists. A directory-level tree would drift
     less but would still be a second description of the same layering, which is the duplication
     this plan exists to remove.
   - Tradeoff: no document lists every file with a one-line gloss any more. `src/` is a `ls` away
     and the prose covers what a listing cannot.
   - Consequence for `AGENTS.md`: its `## Architecture` section stays a four-line arrow map — the
     form it already has — and does not grow into a tree.

4. **`docs/frontend.md` gains two `##` subsections (Loading, Theming); the rest stays prose.**
   - Why: it is absorbing 106 lines of rationale from `README.md:138-243`, and unbroken prose at
     that length stops being readable. The house convention of prose-for-reasoning survives inside
     each section; only the two long mechanisms get a heading.
   - Impact: `docs/backend.md` stays fully prose, so the two half-documents no longer have
     identical form. That is acceptable — the frontend rationale is simply longer.

5. **No link checker or path-existence test is added.** The research raises it as an open
   question; this plan answers it as "not now".
   - Why: the project's stated preference is as little tooling as possible, and the drift being
     fixed here was caused by duplication rather than by the absence of a check. Removing the
     duplicates removes most of the surface a checker would guard.
   - Revisit if: drift reappears in the trimmed documents within a few refactors. A single
     `docs.test.ts` over `Bun.Glob` plus a path regex would need no new dependency.

6. **The `docs/agents/` staleness is left alone.** All four research documents describe paths as
   `backend/src/…`, which the 2026-09-11 restructure removed.
   - Why: `AGENTS.md` forbids editing them, and they are point-in-time records — being wrong about
     today's tree is what a dated record is for.
   - Impact: the existing `AGENTS.md` rule gains half a sentence saying these files describe the
     repository as it was on their stamped date, so a reader who greps the docs and finds the old
     shape first knows why.

7. **There is no API reference and no end-user guide.** The three endpoint tables
   (`README.md:245-287`) and the "Using it" section (`README.md:47-65`) are deleted rather than
   moved into `docs/`.
   - Why: the API can be read in the source. `http/routes/` is one file per URL group and the
     pattern strings are the paths — a hand-maintained table is a second copy that can only ever
     be as fresh as the last person who remembered it, and it was already the strongest candidate
     for the next round of drift.
   - Tradeoff: there is no longer one page listing every endpoint, so someone integrating against
     the API reads `src/backend/http/routes/*.routes.ts`. `docs/backend.md` already tells them the
     rule for finding the right file — a route belongs to the file its URL prefix names — which is
     what makes this navigable rather than a search.
   - The two behaviours that were *not* visible from the table are covered in source and in
     `docs/backend.md`: `performed_on` defaulting to today is in `shared/validate.ts`, and the
     atomic `copy_from_workout_id` is the worked example of the transaction rule in
     `docs/backend.md`. Nothing in this decision loses a reason, only a listing.
   - The data model is the one exception and moves rather than dies; see phase 3.

## Deliberate deletions

Content that is removed rather than moved, with the reason:

- The `bun run dev` row and the six-row script table (`README.md:22-29`) — superseded by the
  `AGENTS.md` block, and wrong.
- The `engines.bun` paragraph (`README.md:44-45`) — one clause survives in
  `docs/coding-guidelines.md` beside the pinning rule it belongs to.
- The annotated file tree (`README.md:69-133`) — deleted outright, per decision 3. The one
  sentence that follows it, about every component rendering through the escaping `html` template,
  is kept: it moves to `docs/frontend.md`, which already states the rule.
- The three endpoint tables and the two notes under them (`README.md:245-287`) — per decision 7,
  read the routes instead.
- The "Using it" section (`README.md:47-65`) — the dashboard / workouts / exercises / theme
  bullets. With it go the two domain facts parked there: that weights display in kilograms via
  `UNIT`, which is a one-line export in `src/frontend/format.ts`, and that estimated 1RM is Epley,
  which is the formula in the function that computes it. Both read better in the source than in a
  guide to an app with three screens. (Called out again as an open question below — this is the
  deletion with the weakest "it is in the source anyway" argument.)
- Duplicate statements of the no-build-step story, the component-directory convention, the
  load-bearing `await`, the static-import rule, the font-size rule, the Pico-in-shadow-root rule
  and the vendor allowlist — each keeps the `README.md` long form, moved into the `docs/` file
  that currently carries the compressed one, and the compressed one is deleted.

## Phases

No file is created. Every phase moves content into a document that already exists, and `README.md`
is only cut down once its keepers have landed — so no paragraph exists solely in git history at
any point in the plan.

### Phase 1 — Fold the frontend rationale into `docs/frontend.md`

Absorb `README.md:182-243` (Loading, Theming) into `docs/frontend.md` as two `##` sections, keeping
the measured claims intact: ~76 µs per transpile, the two-millisecond whole-frontend figure, the
`data-theme` two-row table, the `prefers-color-scheme` seeding, and the `/vendor/pico.css`
allowlist paragraph. Where `docs/frontend.md` already states the compressed version of a rule — the
load-bearing `await`, the static-import rule, types erased-not-checked — keep its wording and drop
the duplicate rather than stacking both.

In the same pass, fix the frontend drift:

- `README.md:223` says `src/theme.ts`; the file is `src/frontend/theme.ts`. Fix it as the Theming
  section moves, not after.
- `docs/frontend.md:29`: `../src/backend/db/repo` → `../../../src/backend/db/repos`.
- `docs/frontend.md:27`: quote the import as it appears in a component (`'../../types.ts'`) *and*
  note that `src/frontend/api.ts` uses `'./types.ts'`, or drop the literal specifier and describe
  it as a relative import — the specifier depends on depth and is what made the line wrong.
- Name `src/frontend/main.ts` in the shared-layer sentence. It is the module that boots the
  frontend and it appears in no description of the frontend today.
- Take over the URL-equals-path rule from `AGENTS.md:36-38` — `src/frontend/` is the web root, so
  `src/frontend/components/gz-app/gz-app.ts` is served at `/components/gz-app/gz-app.ts`. It is a
  frontend fact and belongs beside the transpile paragraph that already explains why specifiers
  are left untouched; `AGENTS.md` keeps only "no build step" and the pointer.

Verify: `grep -n '\.\./src/' docs/frontend.md` is empty; `src/frontend/main.ts` is named.

### Phase 2 — Fold the styling rationale into `docs/styling-guidelines.md`

Move the *evidence* behind the font-size rule from `README.md:150-165` into the existing bullet:
Pico's `131.25%` upper bound, the measured 39px at `gz-app > gz-dashboard > gz-stat-tile` from a
20px root, and the consequence for `gz-chart` (geometry in SVG, axis labels as HTML, because a font
size inside a `viewBox` is measured in user units). Add a bullet for native CSS nesting with the
explicit `&` (`README.md:144-148`), which is stated nowhere in `docs/`.

Keep the file a bullet list; the form signals that it is normative.

Verify: `bun run fmt:check`.

### Phase 3 — `docs/backend.md`: the data model, the drift, and `docs/coding-guidelines.md`

- Add the data model from `README.md:289-298` to `docs/backend.md` as one short paragraph beside
  the migrations one: `exercises ──< sets >── workouts`, `sets` as the fact table carrying `reps`,
  `weight`, `notes` and `position`, and the two constraint choices — deleting a workout deletes
  its sets, deleting an exercise is refused while a set still points at it, so history cannot
  silently lose its meaning. This is the one part of `README.md:245-303` that is not a listing of
  what the source already says: it is the reasoning behind two foreign-key clauses, and
  `docs/backend.md` is where the schema is explained. Drop the ASCII relationship line if the
  sentence carries it; keep it if it reads better.
- Drop the leading `../` from `../src/backend/db/migrations` and
  `../src/backend/db/migrations.test.ts` (`docs/backend.md:43` and `:58`).
- `docs/coding-guidelines.md`: extend the pinning sentence with the `bunfig.toml install.exact`
  clause and the `engines.bun`-is-documentation-not-a-gate clause from `README.md:37-45`.

Verify: the `ON DELETE` clauses in `src/backend/db/migrations/001-initial-schema.sql` still match
what the paragraph claims; `grep -rn '\.\./src/' docs/*.md README.md AGENTS.md` is empty.

### Phase 4 — Rewrite `README.md`

Reduce to the start-up document. In order: the title and the two-bullet what-it-is; "Requires Bun
1.4 or newer"; the three-command quick start; the database paragraph (`data/gainz.sqlite`,
`GAINZ_DB`, created on first run, git-ignored, schema from the numbered migrations); the security
note (binds all interfaces, no authentication, put a reverse proxy in front); and two closing
lines: `AGENTS.md` for every script and the index of the documentation, `docs/` for the
architecture and the guidelines.

Everything the plan keeps is in `docs/` by this point; the tree, the endpoint tables and the user
guide are deleted here, per decisions 3 and 7. This is the phase that removes about 260 lines.

Verify: the file is under 50 lines; it contains no table, no file tree, no fenced block other than
the quick start, and no heading below `##`.

### Phase 5 — Rewrite `AGENTS.md`

`AGENTS.md` keeps its purpose line, the twelve-command `sh` block, the database sentence and the
two process rules, the second of which gains the half-sentence from decision 6. Its
`## Architecture` section stays a four-line arrow map — `src/backend/`, `src/frontend/`,
`src/scripts/`, `docs/` — with the URL-equals-path detail handed to `docs/frontend.md` in phase 1
and the **no build step** emphasis kept, because it is the rule whose violation is silent.

The three existing pointers are replaced by a list naming every document with the one thing it is
for, plus one line saying where the API is:

```
docs/backend.md             layering, routes, repo, migrations, data model, tests
docs/frontend.md            components, loading, theming, the URL rule
docs/coding-guidelines.md   pinning, quotes, commits on main
docs/styling-guidelines.md  Pico, no CSS in JS, no font sizes
```

The endpoints are not documented anywhere: `src/backend/http/routes/` holds one file per URL
group, and `AGENTS.md` says so in a sentence so that nobody goes looking for the page that used to
exist.

This list is the only index in the repository, so a document added to `docs/` later is added here
in the same commit.

Verify: every path in the list exists, and every file in `docs/` outside `docs/agents/` appears in
it; `CLAUDE.md` still resolves as a symlink to `AGENTS.md`.

### Phase 6 — `TODO.md` and the final sweep

Remove the two items under `## Misc` — "Cleanup AGENTS.md to be very condensed (<300 lines)" and
"Move README.md stuff into dedicated files (if needed)" — both of which this plan closes. Note that
the first is satisfied by content, not line count: `AGENTS.md` has been 43 lines since `18b696e`.

Then the sweep across all documentation:

- No occurrence of `bun run dev`, `src/theme.ts` or `../src/`.
- Every `src/…` path named in a document exists on disk.
- Every relative markdown link resolves.
- `bun test`, `bun run typecheck`, `bun run lint`, `bun run fmt:check` all pass.

## Open Questions

- The end-user guide is the weakest of the deletions. "Read the source" answers a developer asking
  what `POST /api/workouts` takes; it does not answer someone asking what the `+1` button does or
  why the theme does not follow the OS after the first flip. If any of it is worth keeping, the
  three-bullet screen tour is the part to keep and `README.md` is where it would go — but that
  contradicts "README is start-up only", which is why the plan deletes it instead. Say so before
  phase 4 if that is the wrong call; afterwards it is a `git show` away.
- Nothing now records the `{ "error": "..." }` shape or the 400 / 404 / 409 convention outside the
  handlers. `docs/backend.md` documents throwing `HttpError` through `guardAll()`, which is the
  mechanism; whether the status convention deserves one added sentence there is a judgement call
  left to phase 3.
