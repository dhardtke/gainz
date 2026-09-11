---
date: 2026-09-11T08:45:35+00:00
git_commit: 016f95cfef446fc85d0bb8faa7abb0093a2857eb
branch: main
topic: 'How the architecture of the app is written down in docs/, AGENTS.md and README.md'
tags: [research, docs, documentation, architecture, agents-md, readme, drift]
status: complete
---

# Research: How the architecture of the app is written down in `docs/`, `AGENTS.md` and `README.md`

## Research Question

How is the architecture of the app written inside `docs/`, `AGENTS.md` and `README.md`?

## Summary

The architecture is written down six times over, at four different altitudes, in 485 lines of
prose across six files — and `README.md` is 309 of them, 64% of everything.

| File                          | Lines | Genre                                       |
| ----------------------------- | ----- | ------------------------------------------- |
| `README.md`                   |   309 | User guide + file-tree reference + rationale + API reference |
| `docs/backend.md`             |    71 | Rationale for the backend's arrangement     |
| `AGENTS.md` (= `CLAUDE.md`)   |    43 | Orientation card: commands, directory map, pointers |
| `docs/frontend.md`            |    37 | Rationale for the frontend's arrangement    |
| `docs/styling-guidelines.md`  |    18 | Normative rules                             |
| `docs/coding-guidelines.md`   |     7 | Normative rules                             |

The same layering is described four times, each time at a different altitude, and each altitude
serves a different reader:

1. **`AGENTS.md:28-38`** — one arrow per directory (`src/` -> both halves, `src/backend/` -> the
   Bun + SQLite REST backend, …). Nine lines, no file names below the second level.
2. **`README.md:67-133`** — an annotated tree naming every file in `src/` with a one-line gloss,
   test files included.
3. **`docs/backend.md`, `docs/frontend.md`** — the same structure as unbroken prose, but arguing
   *why* each boundary sits where it does rather than listing what is there.
4. **`docs/agents/research/*.md`** — four point-in-time deep dives that go a level below all of
   the above, and are append-only by house rule.

The single most consequential finding is a discoverability gap: **`docs/backend.md` and
`docs/frontend.md` are referenced by nothing.** `AGENTS.md:40-43` points at `README.md`,
`docs/coding-guidelines.md` and `docs/styling-guidelines.md`, and describes `docs/` only as
"design and API documentation"; `README.md` never mentions `docs/` at all; the two files do not
cross-reference each other. There is no `docs/README.md` index either. The two documents that
carry the most architectural reasoning in the repository are reachable only by listing the
directory.

The division of labour that does hold is by genre, not by topic. `AGENTS.md` is the index and the
command list. `README.md` is the only source of truth for the REST surface, the data model, the
end-user guide and the security posture — nothing duplicates those four. `docs/backend.md` and
`docs/frontend.md` hold the reasoning. The two `*-guidelines.md` files hold the rules. Everything
else — the layering, the no-build-step story, the font-size rule, the load-bearing `await` — is
stated twice, with `README.md` carrying the long form and `docs/` the compressed one.

## Detailed Findings

### `AGENTS.md` — the index, and the file that is also `CLAUDE.md`

`CLAUDE.md` is a symbolic link to `AGENTS.md`, so there is one file with two names and no chance
of the two drifting apart. It is 43 lines in three parts: a one-line statement of purpose, a
`## Commands` block, and a `## Architecture` map.

`## Commands` is a single `sh` code block of twelve invocations, each with a trailing comment, and
it is the most complete command reference in the repository — `lint`, `fmt` and the
`bun test <file>` / `bun test -t <name>` forms appear here and nowhere else. Two paragraphs follow
it that are not commands at all: where the database lives (`data/gainz.sqlite`, `GAINZ_DB`,
`:memory:`), and two standing process rules — plans go inside the project directory, and existing
plans and research docs in `docs/agents/` are never edited, only added to.

`## Architecture` is written as a five-entry arrow map rather than a tree. It is the only place
that states the frontend's URL rule compactly — `src/frontend/` is the web root, so
`src/frontend/components/gz-app/gz-app.ts` is served at `/components/gz-app/gz-app.ts` — and the
only place that describes what `docs/` is for. It ends with the three pointers, of which the
`README.md` one carries an instruction rather than a location: read it before changing the REST
surface, the data model, or the frontend's loading and theming design.

### `README.md` — four documents sharing one file

The section list maps cleanly onto four unrelated audiences:

| Lines     | Section                        | Audience                               |
| --------- | ------------------------------ | -------------------------------------- |
| 1-45      | intro, Quick start, Dependencies | someone installing it                |
| 47-65     | Using it                       | someone using the app                  |
| 67-136    | Layout                         | someone reading the code               |
| 138-243   | Styling, Loading, Theming      | someone changing the frontend          |
| 245-303   | REST API, Data model           | someone calling the API                |
| 305-309   | Notes                          | someone deploying it                   |

The rationale stretch at 138-243 is the longest single run in the file at 106 lines, and it is the
part that overlaps `docs/` most heavily. It is also the most valuable prose in the repository: it
records the measurements and the failure modes behind each decision, not just the decision. The
font-size rule is justified with an observed number (`gz-app > gz-dashboard > gz-stat-tile`
reached 39px from a 20px root); the transpile-per-request design is justified with a measured cost
(~76 µs per file, the whole frontend in under two milliseconds); the static-import rule for nested
components is justified by naming the exact failure (property assignments land on an un-upgraded
element and permanently shadow the class accessors, leaving the row blank with no error).

`## Using it` (47-65) is the only end-user documentation anywhere in the repository, and it is also
where two domain decisions are parked that a reader would not think to look for in a user guide:
the display unit is `UNIT` in `src/frontend/format.ts`, and estimated 1RM is Epley.

`## REST API` (245-287) is three tables covering every endpoint, plus the two behaviours that are
not visible from a table — `performed_on` defaulting to today, and `copy_from_workout_id` being
atomic with a 404 that creates nothing. `## Data model` (289-303) is an ASCII relationship line,
a paragraph on `sets` as the fact table, and the rule for changing the schema. `## Notes` (305-309)
is the security posture: binds all interfaces, no authentication, put a reverse proxy in front.

### `docs/backend.md` and `docs/frontend.md` — the rationale layer

Both files are a single top-level heading followed by unbroken prose: no subsections, no code
blocks, no tables, no bullet lists. The form is deliberate and consistent, and the content is
almost entirely justification.

`docs/backend.md` (71 lines) argues, in order: that the directories name the layers
(`db/` for everything touching SQLite, `http/` for everything speaking HTTP) and traces the chain
`db/db.ts` → `db/migrations.ts` → `db/repo/` → `http/routes.ts` → `http/server.ts` → `main.ts`;
why `paths.ts`, `transpile.ts` and `testing.ts` stay at the top level (they belong to neither
layer) and why `migrate`/`seed` live in `src/scripts/` (so `src/backend/` holds the running server
and nothing else); the route-ownership rule with its worked exception (`/api/workouts/:id/sets` is
a workout route, so `workout.routes.ts` imports `readSetBody` from `set.routes.ts` and not the
reverse); the `Repo` facade and the deliberate flatness of its surface; error handling by throwing
`HttpError` through `guardAll()`; that a multi-statement write belongs in one `Repo` method inside
`db.transaction()` and never in a handler; the migration runner's guarantees (per-file transaction,
`schema_migrations`, foreign keys off for the run because SQLite's table rebuild needs it and
`PRAGMA foreign_keys` is a silent no-op inside a transaction, `PRAGMA foreign_key_check` before
commit, refusal to start on disagreement); `serveOptions(repo)` as the test seam and `useServer()`
registering its hooks from inside the function so each file gets its own database; the narrow
static allowlist; and finally two deliberate omissions in `static.ts`.

`docs/frontend.md` (37 lines) argues: what `GzElement` and the shared layer provide; the
directory-per-component convention found by convention rather than a manifest; that the top-level
`await define(...)` is load-bearing because it makes "module loaded" mean "stylesheet loaded"; that
a component a view renders inside itself must stay a static import; that all interpolation goes
through the escaping `html` template; that types are erased and not checked, so `bun run typecheck`
is the only gate; and — at the most length — why `types.ts` is written out by hand instead of
imported from the backend's repository types, which is that the frontend should be pinned to the
wire format it expects rather than the server's internal row types, so a renamed column surfaces as
the API change it is instead of being absorbed as a quiet refactor.

Both files end up documenting what the code does *not* do as carefully as what it does:
`static.ts` sets no `Content-Type` except on the vendor stylesheet (because `new Response(Bun.file(x))`
already carries the type Bun infers, measured on Bun 1.4.2) and does not special-case `HEAD`;
there is no component manifest; there are no unit tests of `Repo`.

### The guideline files — normative, and a comment channel for config

`docs/coding-guidelines.md` is three sentences: dependencies pinned to exact versions, single
quotes in TypeScript and JavaScript with double in CSS, and commits going directly on `main`.
`docs/styling-guidelines.md` is six bullets covering Pico as the base layer, no CSS in JavaScript,
no declared font sizes, buttons coloured only by Pico variant classes, Pico adopted into each
shadow root, and the quote split.

The last bullet is worth noting as a pattern: it exists *because* `.oxfmtrc.json` is plain JSON and
cannot carry a comment explaining why `singleQuote` is overridden back off for `**/*.css`, so the
reason is parked in the guideline file instead. Documentation is being used here as the comment
channel for a config file that has none.

### Overlap map — what is stated in more than one place

| Subject                                      | `AGENTS.md` | `README.md`          | `docs/`                        |
| -------------------------------------------- | ----------- | -------------------- | ------------------------------ |
| Command list                                 | 5-19 (12)   | 22-29 (6)            | —                              |
| DB location, `GAINZ_DB`, `:memory:`          | 21-22       | 31-35                | —                              |
| Exact dependency pinning                     | —           | 37-45                | `coding-guidelines.md:3`       |
| Tests sit beside the module they exercise    | 31-32       | tree, 75-108         | `backend.md:51-59`             |
| How to change the schema                     | 33          | 33-35, 300-303       | `backend.md:43-49`             |
| No build step, transpile on request          | 34-37       | 6-10, 184-195        | `frontend.md:21-24`            |
| Layering of `src/backend/`                   | 31-33       | tree, 70-114         | `backend.md:3-13`              |
| Component directory convention               | —           | 120-125, 167-173     | `frontend.md:7-8`              |
| The load-bearing `await define()`            | —           | 167-175, 201-219     | `frontend.md:8-11`             |
| Static imports for nested components         | —           | 214-219              | `frontend.md:13-16`            |
| No stylesheet declares a font size           | —           | 150-165              | `styling-guidelines.md:7-9`    |
| Pico adopted into every shadow root          | —           | 177-180              | `styling-guidelines.md:12-14`  |
| Vendor allowlist for `/vendor/pico.css`      | —           | 240-243              | `backend.md:61-63`             |
| Hand-written frontend types                  | —           | tree, 132            | `frontend.md:26-33`            |

Four subjects have exactly one home and are duplicated nowhere: the REST endpoint tables, the data
model, the end-user guide, and the security posture — all four in `README.md`.

### Drift found while reading

Seven concrete inaccuracies, all of them in the direction of documentation lagging a move or a
rename:

1. `README.md:25` lists `bun run dev`. `package.json` has no `dev` script; it is `start:dev`.
   `AGENTS.md:10` has it right.
2. `README.md:223` says `src/theme.ts`. The file is `src/frontend/theme.ts`.
3. `docs/backend.md:43` and `docs/backend.md:58` write `../src/backend/db/migrations` and
   `../src/backend/db/migrations.test.ts` — a leading `../` left over from when these paths were
   relative to a different root. From the repository root the `../` is wrong.
4. `docs/frontend.md:29` has the same leftover: `../src/backend/db/repo`.
5. `docs/frontend.md:27` quotes the type import as `'../../types.ts'`, which is right for a
   component two levels down but not for `src/frontend/api.ts:3`, which imports `'./types.ts'`.
6. `README.md`'s script table omits `lint`, `fmt` and `fmt:check`, which `AGENTS.md` lists. A
   reader who only opens the README will not know the project has a linter or a formatter.
7. `src/frontend/main.ts` — the frontend's entry point — appears in neither description of the
   frontend: not in the `README.md` tree (which lists the other seven root modules at 126-132) and
   not in `docs/frontend.md:3-5` (which names the shared layer as `base.ts`, `styles.ts`,
   `theme.ts`, `router.ts`, `api.ts`, `format.ts`). The one file that boots the frontend is
   undocumented.

Separately, all four documents under `docs/agents/research/` describe paths as `backend/src/…`,
which the 2026-09-11 restructure removed. That is expected of point-in-time records and
`AGENTS.md:26` forbids editing them — but they are also the deepest written description of the
layers, so anyone grepping the docs for a module path will find the old shape first.

## Code References

- `AGENTS.md:1-26` — purpose line, the twelve-command block, database paragraph, the two process rules
- `AGENTS.md:28-38` — the arrow map of `src/`, and the frontend URL-equals-path rule
- `AGENTS.md:40-43` — the three outbound pointers; `docs/backend.md` and `docs/frontend.md` are absent
- `CLAUDE.md` — symbolic link to `AGENTS.md`, so the agent file cannot fork
- `README.md:67-133` — the annotated tree, the most complete per-file reference in the repository
- `README.md:138-243` — Styling / Loading / Theming: 106 lines of rationale with measured numbers
- `README.md:150-165` — the font-size rule and the two rules that hold it in place
- `README.md:227-231` — the two-row theme table, the only table used to explain a mechanism
- `README.md:245-287` — the three REST tables; the only enumeration of the endpoints
- `README.md:289-303` — the data model and the schema-change rule
- `README.md:305-309` — the security posture
- `docs/backend.md:3-13` — the layer chain in one sentence, `db/` → `http/` → `main.ts`
- `docs/backend.md:21-24` — the route-ownership rule and its `readSetBody` exception
- `docs/backend.md:38-41` — transactions belong in a `Repo` method, never in a handler
- `docs/backend.md:43-49` — the migration runner's guarantees and the foreign-key reasoning
- `docs/backend.md:61-71` — the static allowlist and the two deliberate omissions in `static.ts`
- `docs/frontend.md:8-11` — why the top-level `await define()` is load-bearing
- `docs/frontend.md:13-16` — the static-import rule for components a view renders
- `docs/frontend.md:26-33` — why `types.ts` is hand-written instead of imported from the backend
- `docs/coding-guidelines.md` — seven lines: pinning, quote style, commit-on-`main`
- `docs/styling-guidelines.md:15-18` — the quote split, documented here because JSON has no comments
- `docs/agents/plans/` — seven plans, `docs/agents/research/` — four research docs, both append-only
- `package.json:8-19` — the script names the README table disagrees with
- `TODO.md:29-30` — the two open documentation items this research bears on

## Architecture Documentation

Conventions the documentation itself follows, observable across all six files:

- **One top-level heading per file.** Every doc opens with a single `#`, and commit `5ab1cb2`
  ("docs: Use a top-level heading in every doc") is where that was made uniform.
- **Prose for reasoning, bullets for rules.** The two half-documents are unbroken paragraphs with
  no subsections; the two guideline files are bullet lists. The form signals the genre.
- **Hard wrap at roughly 100 characters** in every file, including the agent artifacts.
- **Why over what.** A `docs/` file that restates the tree is the exception; the norm is a sentence
  of arrangement followed by a sentence of justification.
- **Measured claims, not adjectives.** 76 µs per transpile, 39px from a 20px root, 131.25% as
  Pico's upper bound, "measured on Bun 1.4.2", "53 tests across 11 files".
- **Deliberate omissions are documented.** What the code refuses to do — no MIME map, no `HEAD`
  special case, no component manifest, no unit tests of `Repo`, no `Content-Type` beyond the vendor
  stylesheet — is written down as explicitly as what it does.
- **Bold for the trap.** Emphasis is reserved for the rule whose violation fails silently: **no
  build step**, **that `await` is load-bearing**, **must stay a static import**, **erased, not
  checked**, **by hand**, **no CSS in JavaScript**, **no stylesheet declares a font size**.
- **`AGENTS.md` as index, `README.md` as reference, `docs/` as reasoning** — the intended split,
  incompletely wired: the index does not link the reasoning.
- **Agent artifacts are append-only and stamped.** Every file under `docs/agents/` carries
  `date` / `git_commit` / `branch` / `topic` / `tags` / `status` frontmatter, is named
  `YYYY-MM-DD-kebab-topic.md`, and is never edited after the fact — plans get `status: complete`
  instead of being rewritten.

## Open Questions

- `TODO.md:29` asks to "Cleanup AGENTS.md to be very condensed (<300 lines)", but `AGENTS.md` is
  43 lines and has been since `18b696e` ("docs: Move coding conventions out of AGENTS.md"). Either
  the item is stale, or "condensed" means something other than line count.
- `TODO.md:30` asks to "Move README.md stuff into dedicated files (if needed)". Which of
  `README.md:138-243` is the canonical copy and which is the summary is genuinely undecided today:
  `docs/frontend.md` and `docs/styling-guidelines.md` read as compressions of it, but `README.md`
  is also the repository's landing page, so the long form is where a first-time visitor will look.
- Should `AGENTS.md` point at `docs/backend.md` and `docs/frontend.md`? As it stands an agent
  following only the instructions it is given will never open either file.
- There is no `docs/README.md` or index of any kind; `docs/` is discovered by listing it. Whether
  that matters depends on the answer above.
- The five `../`-prefixed and renamed paths listed under **Drift** are safe to correct in
  `docs/backend.md`, `docs/frontend.md` and `README.md`, but the same class of staleness in
  `docs/agents/research/` sits behind the no-editing rule in `AGENTS.md:26`, and no convention
  exists yet for marking a research doc superseded.
- Nothing checks documented paths against the tree, so drift of the kind found here is only ever
  noticed by a reader. Whether that is worth a check is an open trade-off against the project's
  stated preference for as little tooling as possible.
