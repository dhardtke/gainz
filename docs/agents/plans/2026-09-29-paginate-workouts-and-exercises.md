---
date: 2026-09-29T13:55:09.877210+00:00
git_commit: 26619b186aeae5b52a4c47e1702988011a6bcce6
branch: main
topic: 'Paginate the workouts and exercises pages'
tags: [plan, frontend, backend, router, gz-workout-list, gz-exercise-list, exercises-api]
status: implemented
---

# PLAN: Paginate the workouts and exercises pages

Show the workouts page and the exercises page ten items at a time, with Oat's numbered pagination
under each list and the current page kept in the URL.

## Acceptance Criteria

- `/workouts` and `/exercises` each show 10 items per page — workouts newest first, exercises by
  name, as today.
- Below each list sits Oat's numbered pagination button group, **always**, even with one page
  (`[← Previous | 1 | Next →]`).
  - It shows the first page, the last page and the current page ±1, with `…` for the gaps it
    leaves: `[← Previous | 1 | … | 4 | 5 | 6 | … | 12 | Next →]`.
  - A gap of exactly one page shows that page's number instead of `…`.
  - The current page is filled and carries `aria-current="page"`.
  - Previous is disabled on page 1, Next on the last page.
- The page lives in the URL as `?page=N`; page 1 is the bare path (`/workouts`, never
  `?page=1`). Back/Forward, a reload and detail page → Back all land on the same page.
- `?page=abc`, `0`, `-1` and `2.5` mean page 1.
- A page past the end shows "No workouts on this page." / "No exercises on this page." with a
  `[Go to page 1]` button in place of the pager, and no error toast. That includes pages whose
  offset exceeds what the API accepts (above 100000).
- The workouts page's "Load N more" button is gone.
- `GET /api/exercises` answers `{ items, total, limit, offset }`. With `limit`/`offset` it pages
  (`limit` 1..200, `offset` 0..100000, 400 outside that); without `limit` it returns every exercise
  and `limit` is `null`.
- The workout detail page's exercise select still lists every exercise.
- `GET /api/exercises/:id/position` answers `{ index }`, the exercise's 0-based place in the
  list's name order; 404 for an unknown id, 400 for a malformed one.
- After adding an exercise, the exercises page navigates to the page that contains it.
- `docs/backend.md` and `docs/frontend.md` describe the paging, the position endpoint and the
  changed `navigate()`.

## Technical Key Decisions and Tradeoffs

1. **Numbered pages as in Oat's example, with Previous/Next and a window.**
   - Why: user's choice. First, last and current ±1 keep the group short, even for a log with
     dozens of pages, and wide enough for a phone.
   - Impact: the workouts list's append-on-"Load more" logic goes away. Both lists render the
     same `pager()` template, which gets its numbers from a pure `pageItems(page, pages)`.
2. **The page is in the URL and changed through `navigate()`, not through `<a>` links.**
   - Why: Back from a detail view and a reload keep the page; `gz-app` rebuilds the view on every
     route change anyway (`gz-app.component.ts:42,82`), so the component only reads
     `location.search` on connect.
   - Impact: `navigate()` compares `pathname + search` instead of `pathname` (`router.ts:41`),
     otherwise `/workouts?page=2` → `/workouts` would push nothing. `linkPath` keeps handing
     query links to the browser; the pager uses `data-action` buttons.
3. **Exercises are paged on the server; no `limit` means all.**
   - Why: one response shape for both lists, and the exercise select stays complete with a
     one-line change.
   - Impact: new `ExercisePageDto` with `limit: number | null`; `ExerciseRepository.list(limit,
     offset)` + `count()`; a new `optionalQueryInt` in `http/http.ts`. The workouts API keeps its
     default `limit` of 50 (the dashboard asks for 5).
4. **A page past the end shows an empty state with "Go to page 1".** Unparsable values are page 1.
   - Why: user's choice.
   - Impact: the frontend caps the requested offset at 100000 (the API's maximum), so a huge
     `?page=` still gets a valid response, which supplies `total` for the badge, and no 400 toast.
     A page whose real offset exceeds the cap counts as past the end (`isBeyondApi`), even if
     `total` is large. Otherwise it would show page 10001's items under the wrong page number.
5. **The pager is always shown**; in the past-the-end state the "Go to page 1" button replaces it.
   - Why: user's choice; on page 99 of 3 there's no current page to mark.
6. **After adding an exercise, jump to its page via `GET /api/exercises/:id/position`.**
   - Why: user's choice. Names are unique case-insensitively (`idx_exercises_name … COLLATE
     NOCASE`, `001-initial-schema.sql:9`) and the list orders by `name COLLATE NOCASE`, so the
     index is `COUNT(*) WHERE name < ? COLLATE NOCASE` — no ties.
   - Impact: new route, facade method, repository method and `ExercisePositionDto`. The page size
     stays a frontend concern; the API reports only a neutral index.
7. **The pager is a template helper in `ui/pagination.ts`, not a component.**
   - Why: `ui/` may not import `app/` (lint boundary, `docs/frontend.md:107`), so a `ui/` pager
     could not call `navigate()`. A plain module is also testable without a DOM.
   - Impact: each list handles `data-action="page"` itself and calls `navigate()`.
8. **The pager uses Oat's pagination markup** (https://oat.ink/components/#pagination):
   `<nav aria-label="Pagination"><menu class="buttons"><li>…</li></menu></nav>`.
   - Previous, Next and the other page numbers are `outline small` buttons.
   - The current page is the filled `small` button with `aria-current="page"`, as in Oat's
     example.
   - A gap is a `disabled` `outline small` button reading `…` with `aria-hidden="true"`. Oat dims
     it, screen readers skip it, and it keeps the group's borders intact; a bare text node inside
     `menu.buttons` would not get them.
   - Why: Oat already provides it (`menu.buttons` in `node_modules/@knadh/oat/css/button.css:117`);
     no hand-rolled layout and no new CSS.
   - Deviation from Oat's example: `<button>` instead of `<a class="button">`. `menu.buttons`
     styles any `li > *`, a `?page=` link would be a full page load (`router.ts:96`), and only a
     button can be `disabled`, which Oat dims (`00-base.css:186`).
   - The current page's button navigates to the current page, as Oat's current-page link points
     at itself; `navigate()` to the current URL refreshes the view. A do-nothing
     button would still get Oat's pointer cursor, hover and press effect (`button.css:22-32`),
     and `disabled` would dim the filled item to 50 %. The filled look comes from leaving out
     `.outline`; Oat does not style `aria-current` on buttons.

## Current State

```
Workouts page (gz-workout-list)              Exercises page (gz-exercise-list)
workoutFacade.list({limit:25, offset})       exerciseFacade.list()
  → GET /api/workouts?limit=25&offset=N        → GET /api/exercises
  → { items, total, limit, offset }            → ExerciseWithStatsDto[]  (every exercise)
"Load 25 more" appends the next page         everything rendered at once

gz-workout-detail: exerciseFacade.list() fills the exercise <select> (needs all exercises)
gz-dashboard:      workoutFacade.list({ limit: 5 })
router.navigate(path): pushes only if location.pathname !== path
```

- `src/frontend/features/workouts/gz-workout-list.component.ts:22` `PAGE_SIZE = 25`, `:33` `#load(offset)`, `:159` "Load more"
- `src/frontend/features/exercises/gz-exercise-list.component.ts:21` `#load()`, `:31` create → reload
- `src/backend/features/exercises/internal/exercise.repository.ts:27` `list()` — no limit, no count
- `src/backend/features/exercises/internal/exercise.controller.ts:20` `list()` answers an array
- `src/backend/features/exercises/exercise.routes.ts:11` `GET: () => controller.list()`
- `src/backend/http/http.ts:41` `queryInt` — always needs a numeric fallback
- `src/frontend/app/router.ts:40` `navigate()`

Current UI:

```
┌──────────────────────────────────────────┐
│ Workouts                     [23 sessions]│
│ ┌ New workout ────────────────────────┐  │
│ └─────────────────────────────────────┘  │
│ [card 1] … [card 25]                     │
│            [ Load 25 more ]              │
└──────────────────────────────────────────┘
```

## Desired End State

```
/workouts?page=2
┌──────────────────────────────────────────┐
│ Workouts                     [23 sessions]│   badge: the total, unchanged
│ ┌ New workout ────────────────────────┐  │
│ └─────────────────────────────────────┘  │
│ [card 11] … [card 20]                    │
│                                          │
│ [← Previous| 1 |▓2▓| 3 |Next →]          │   Oat menu.buttons group, always shown;
└──────────────────────────────────────────┘   current page filled (aria-current)

/workouts?page=5  (12 pages)
│ [← Previous| 1 | … | 4 |▓5▓| 6 | … | 12 |Next →] │   … = disabled, aria-hidden

/workouts?page=3  (12 pages)
│ [← Previous| 1 | 2 |▓3▓| 4 | … | 12 |Next →]     │   no … between 1 and 2

/workouts?page=9  (only 3 pages)
┌──────────────────────────────────────────┐
│ Workouts                     [23 sessions]│
│ ┌ New workout ────────────────────────┐  │
│ └─────────────────────────────────────┘  │
│ No workouts on this page.                │
│ [ Go to page 1 ]                         │   replaces the pager
└──────────────────────────────────────────┘

/exercises with no exercises
│ No exercises yet. Add the lifts you train above. │
│ [← Previous|▓1▓|Next →]                          │   Previous and Next disabled
```

```
gz-*-list connect
  page   = parsePage(location.search)
  offset = min((page-1)·10, 100000)
  facade.list({ limit: 10, offset }) → { items, total }
  pages  = pageCount(total, 10)
  page > pages || isBeyondApi(page, 10) ? empty state + [Go to page 1] : cards + pager(page, pages)

click [Next ›] (data-action="page" data-page="3")
  navigate(pagePath('/workouts', 3)) → pushState('/workouts?page=3') → popstate → gz-app rebuilds view

add exercise "Back Squat"
  POST /api/exercises → { id: 12 }
  GET  /api/exercises/12/position → { index: 23 }
  navigate(pagePath('/exercises', ⌊23/10⌋+1)) → /exercises?page=3
```

## Abstractions and Code Reuse

- `src/frontend/app/router.ts` — `navigate()` compares `location.pathname + location.search` with `path`
- `src/frontend/ui/pagination.ts` (new) — no DOM, importable by tests
  - `PAGE_SIZE = 10`
  - `MAX_OFFSET = 100000` — mirrors the API's `offset` bound
  - `parsePage(search)` — `?page=` as a positive integer, else 1
  - `pageCount(total, size)` — `max(1, ceil(total / size))`
  - `pageOffset(page, size)` — `min((page - 1) · size, MAX_OFFSET)`: always a valid request
  - `isBeyondApi(page, size)` — `(page - 1) · size > MAX_OFFSET`, which is past the end whatever `total` says
  - `pagePath(path, page)` — `path` for page 1, `${path}?page=${page}` otherwise
  - `pageItems(page, pages)` — `(number | 'gap')[]`: 1, last, page ± 1, with `'gap'` for a hole of two or more pages and the number for a hole of one
  - `pager(page, pages)` — Oat's pagination group (Previous, `pageItems`, Next) as `RawHtml`
  - `pastEnd(noun)` — "No {noun} on this page." + `[Go to page 1]` as `RawHtml`
- `src/frontend/features/workouts/gz-workout-list.component.ts` — one page per view, reads the page from the URL
- `src/frontend/features/exercises/gz-exercise-list.component.ts` — same; the create flow jumps to the new exercise's page
- `src/frontend/features/exercises/exercises.facade.ts` / `internal/exercise.api.ts` — `list(page?)` returns `ExercisePageDto`; new `position(id)`
- `src/frontend/features/workouts/gz-workout-detail.component.ts:89` — reads `.items`
- `src/shared/dto/exercise.ts` — `ExercisePageDto`, `ExercisePositionDto`
- `src/backend/http/http.ts` — `optionalQueryInt` (null when absent); `queryInt` delegates to it
- `src/backend/features/exercises/`
  - `exercise.routes.ts` — `GET /api/exercises` passes `req`; new `/api/exercises/:id/position`
  - `exercises.facade.ts` — `list(limit, offset)`, `count()`, `index(id)`
  - `internal/exercise.repository.ts` — `list(limit, offset)`, `count()`, `index(id)`
  - `internal/exercise.controller.ts` — `list(req)`, `position(req)`
  - `internal/exercise.translator.ts` — `translateToExercisePageDto`, `translateToExercisePositionDto`

## Logging & Observability

No changes; the app logs nothing per request.

## Implementation

### Phase 1: Paging the workouts page

Dependencies: None

The workouts API already pages. This phase builds the shared pieces (router change,
`ui/pagination.ts`) and moves `gz-workout-list` from "Load more" to one page per view.

**Tasks**:

- [x] `src/frontend/app/router.ts` — `navigate()` pushes when `location.pathname + location.search !== path`; update its doc comment to say a path may carry a query.
- [x] `src/frontend/app/router.test.ts` — the fake `location` **must** get `search: ''`; without it the existing test at `:89` compares `'/workoutsundefined'`. The fake `pushState` sets both parts from `new URL(url, fakeLocation.origin)`, so `search` keeps its leading `?` and nothing needs an unchecked index. Add tests:
  - `/workouts?page=2` → `/workouts` pushes once and leaves `search` empty.
  - Navigating to the current path including its query pushes nothing but still dispatches popstate.
- [x] `src/frontend/ui/pagination.ts` (new) — `PAGE_SIZE`, `MAX_OFFSET`, `parsePage`, `pageCount`, `pageOffset`, `isBeyondApi`, `pagePath`, `pageItems`, `pager`, `pastEnd`, as described above:
  ```ts
  /** Oat's pagination (https://oat.ink/components/#pagination), with buttons instead of links. */
  export function pager(page: number, pages: number): RawHtml {
    return html`
      <nav aria-label="Pagination">
        <menu class="buttons">
          <li><button class="outline small" data-action="page" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>← Previous</button></li>
          ${pageItems(page, pages).map((item) =>
            item === 'gap'
              ? html`<li><button class="outline small" disabled aria-hidden="true">…</button></li>`
              : item === page
                ? html`<li><button class="small" aria-current="page" data-action="page" data-page="${item}">${item}</button></li>`
                : html`<li><button class="outline small" data-action="page" data-page="${item}" aria-label="Page ${item}">${item}</button></li>`,
          )}
          <li><button class="outline small" data-action="page" data-page="${page + 1}" ${page >= pages ? 'disabled' : ''}>Next →</button></li>
        </menu>
      </nav>
    `;
  }
  ```
  The current page's button also gets `aria-label="Page ${item}"`.
- [x] `src/frontend/ui/pagination.test.ts` (new) — test cases:
  - `parsePage`: `''`, `?page=abc`, `0`, `-1`, `2.5` → 1; `?page=3` → 3; `?other=1&page=2` → 2.
  - `pageCount`: 0 → 1, 10 → 1, 11 → 2.
  - `pageOffset`: page 1 → 0, page 3 → 20, capped at `MAX_OFFSET`.
  - `isBeyondApi`: page 10001 → false, 10002 → true (size 10).
  - `pagePath`: page 1 → bare path, page 2 → `?page=2`.
  - `pageItems`:
    - (1, 1) → `[1]`
    - (2, 3) → `[1, 2, 3]`
    - (3, 12) → `[1, 2, 3, 4, 'gap', 12]` (a one-page hole shows the number)
    - (5, 12) → `[1, 'gap', 4, 5, 6, 'gap', 12]`
    - (12, 12) → `[1, 'gap', 11, 12]`
  - `pager` output:
    - Only the current page carries `aria-current="page"`.
    - Previous is disabled only on page 1, Next only on the last page.
    - `data-page` values on Previous/Next.
    - One disabled `…` per gap.
  - `pastEnd` output: carries the noun and a `data-page="1"` button.

  Compare substrings with the interpolated parts rather than whole markup; see `docs/frontend.md`, "Tests", on oxfmt.
- [x] `src/frontend/features/workouts/gz-workout-list.component.ts`:
  - Drop the local `PAGE_SIZE` and the "load-more" action.
  - State becomes `{ status, items, total, page, message? }` — no appending. Keep `items`/`total` on every variant so an error keeps the header.
  - `#load()` reads `parsePage(location.search)` and calls `workoutFacade.list({ limit: PAGE_SIZE, offset: pageOffset(page, PAGE_SIZE) })`.
  - `handleAction('page')` → `navigate(pagePath('/workouts', Number(element.dataset.page)))`.
  - Template: cards + `pager(page, pages)`. When `page > pages || isBeyondApi(page, PAGE_SIZE)`, render `pastEnd('workouts')` instead of the cards and the pager. `total === 0` on page 1 keeps "No sessions logged yet. Start one above." followed by the pager.
  - Update the class/state doc comments.
- [x] `docs/frontend.md`:
  - In the "Links are plain `<a href>`" paragraph, say that `navigate()` compares path and query ("none when already on that path and query").
  - Add a short paragraph on paging: the page lives in `?page=N` and is changed through `navigate()` from `data-action` buttons, because `linkPath` leaves query links to the browser. Cover `ui/pagination.ts`'s helpers, the offset cap and the past-the-end state.
  - Add `pagination.ts` to the `ui/` line of the tree and to the `ui/` description.
  - Mention paging in the "Tests" list.

**Automated Verification**:

- [x] `bun test src/frontend/app/router.test.ts src/frontend/ui/pagination.test.ts` passes
- [x] `bun test src/frontend/features/workouts/workouts.facade.test.ts` still passes (facade unchanged)
- [x] `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass

**Manual Verification** (`bun run seed` into an empty `data/gainz.sqlite`, then `bun start`):

- [ ] `/workouts` shows 10 cards and the numbered pager with 1 filled and Previous disabled. Next and "2" both go to `/workouts?page=2`; Previous or "1" from there goes back to `/workouts`.
- [ ] The pager looks like Oat's pagination example in light and dark mode, and fits on a narrow (phone-width) window at 12+ pages.
- [ ] Open a workout on page 2, press Back → still page 2. Reload → still page 2. Browser Back/Forward step through pages.
- [ ] `/workouts?page=abc` shows page 1. `/workouts?page=999` and `/workouts?page=99999999` show "No workouts on this page." with a working "Go to page 1", and no toast.
- [ ] The dashboard's recent workouts are unchanged.

### Phase 2: Paging exercises end to end

Dependencies: Phase 1 (`ui/pagination.ts`, `navigate()` change)

**Tasks**:

- [x] `src/shared/dto/exercise.ts` — add:
  ```ts
  export interface ExercisePageDto {
    items: ExerciseWithStatsDto[];
    /** Every exercise, not just this page. */
    total: number;
    /** Null when the request asked for every exercise. */
    limit: number | null;
    offset: number;
  }
  ```
- [x] `src/backend/http/http.ts` — add `optionalQueryInt(params, key, { min, max }): number | null`, which returns null for a missing or empty value and applies the same range check and 400. `queryInt` becomes `optionalQueryInt(...) ?? fallback`.
- [x] `src/backend/features/exercises/internal/exercise.repository.ts`:
  - `list(limit: number | null, offset: number)` appends `LIMIT ? OFFSET ?`, binding `limit ?? -1` (SQLite's "no limit").
  - Add `count(): number` (`SELECT COUNT(*) AS n FROM exercises`).
- [x] `src/backend/features/exercises/exercises.facade.ts` — `list(limit, offset)` and `count()` delegate.
- [x] `src/backend/features/exercises/internal/exercise.translator.ts` — `translateToExercisePageDto(rows, total, limit, offset)`, mirroring `translateToWorkoutPageDto`.
- [x] `src/backend/features/exercises/internal/exercise.controller.ts` — `list(req)`:
  - `limit = optionalQueryInt(params, 'limit', { min: 1, max: 200 })`
  - `offset = queryInt(params, 'offset', 0, { min: 0, max: 100000 })`
  - Answers the page DTO.
- [x] `src/backend/features/exercises/exercise.routes.ts` — `GET: (req) => controller.list(req)`.
- [x] `src/backend/features/exercises/exercise.routes.test.ts`:
  - Change "creates and lists exercises" to read `ExercisePageDto` (`total: 1, limit: null, offset: 0`).
  - Add a test that pages 3 exercises with `?limit=2&offset=0` and `?limit=2&offset=2`, checking name order and `total: 3`.
  - Add a test that `?limit=0`, `?limit=201` and `?offset=-1` are 400.
- [x] `src/frontend/features/exercises/internal/exercise.api.ts` — `list({ limit, offset }: { limit?: number; offset?: number } = {}): Promise<ExercisePageDto>`. Without `limit` it requests `/exercises`; with it, `/exercises?limit=${limit}&offset=${offset ?? 0}`.
- [x] `src/frontend/features/exercises/exercises.facade.ts` — `list(page?)` passes through and returns `ExercisePageDto`.
- [x] `src/frontend/features/exercises/exercises.facade.test.ts` — keep `list()` → `/api/exercises`, and add `list({ limit: 10, offset: 20 })` → `/api/exercises?limit=10&offset=20`.
- [x] `src/frontend/features/workouts/gz-workout-detail.component.ts:89` — `const [workout, { items: exercises }] = await Promise.all([...])`.
- [x] `src/frontend/features/exercises/gz-exercise-list.component.ts`:
  - State becomes `{ status: 'loading' } | { status: 'ready'; items; total; page } | { status: 'error'; message }`.
  - `#load()` works like the workouts list.
  - `handleAction('page')` navigates to `pagePath('/exercises', n)`.
  - The badge shows `total`, not `items.length`.
  - The template renders cards + `pager(page, pages)`, or `pastEnd('exercises')` when `page > pages || isBeyondApi(page, PAGE_SIZE)`. "No exercises yet…" stays for `total === 0`, followed by the pager.
  - Create keeps today's behavior (toast, reset, reload the current page) until phase 3.
- [x] `docs/backend.md`:
  - In the `http/` description (`:9`) and the controller paragraph (`:31`), name `optionalQueryInt` beside `queryInt`.
  - Add one sentence that both list endpoints page with `limit`/`offset` and answer `{ items, total, limit, offset }`, and that `GET /api/exercises` without `limit` returns every exercise, which is what the workout detail's exercise select uses.
- [x] `docs/frontend.md` — the paging paragraph covers both lists; the `gz-workout-detail` sentence (`:59-61`) notes the select asks for the unpaged list.

**Automated Verification**:

- [x] `bun test src/backend/features/exercises/exercise.routes.test.ts` passes: new paging tests, 400 bounds, and the unpaged list
- [x] `bun test src/frontend/features/exercises/exercises.facade.test.ts` passes: both list URLs
- [x] `bun test src/backend/features/workouts/workout.routes.test.ts` still passes (`queryInt` refactor)
- [x] `bun test`, `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass

**Manual Verification**:

- [ ] `/exercises` shows 10 exercises by name and the numbered pager; paging, Back from a detail page, reload and `?page=999` behave as on `/workouts`.
- [ ] The exercise select on a workout's detail page still lists every exercise.

### Phase 3: Jumping to a newly added exercise

Dependencies: Phase 2

**Tasks**:

- [x] `src/shared/dto/exercise.ts` — add:
  ```ts
  /** Where an exercise sits in the list's name order. */
  export interface ExercisePositionDto {
    /** 0-based. */
    index: number;
  }
  ```
- [x] `src/backend/features/exercises/internal/exercise.repository.ts` — `index(id: ExerciseId): number`:
  - `require(id)`, then `SELECT COUNT(*) AS n FROM exercises WHERE name < ? COLLATE NOCASE`, bound to its name.
  - Comment that the unique `NOCASE` index makes this the exact position in `list()`'s order.
- [x] `src/backend/features/exercises/exercises.facade.ts` — `index(id)` delegates.
- [x] `src/backend/features/exercises/internal/exercise.translator.ts` — `translateToExercisePositionDto(index)`.
- [x] `src/backend/features/exercises/internal/exercise.controller.ts` — `position(req)`: `pathId`, then answer the DTO.
- [x] `src/backend/features/exercises/exercise.routes.ts` — `'/api/exercises/:id/position': { GET: (req) => controller.position(req) }`.
- [x] `src/backend/features/exercises/exercise.routes.test.ts` — `describe('position')`:
  - Create "bench Press", "Deadlift" and "Arnold Press"; expect indexes 1, 2 and 0 (case-insensitive order).
  - An unknown id is 404; `/api/exercises/abc/position` is 400.
- [x] `src/frontend/features/exercises/internal/exercise.api.ts` and `exercises.facade.ts` — `position(id): Promise<ExercisePositionDto>` → `GET /exercises/${id}/position`.
- [x] `src/frontend/features/exercises/exercises.facade.test.ts` — `position(4)` → `GET /api/exercises/4/position`.
- [x] `src/frontend/features/exercises/gz-exercise-list.component.ts` — `handleSubmit('create')`:
  - Create, toast "Added {name}", then `const { index } = await exerciseFacade.position(exercise.id)`, then `navigate(pagePath('/exercises', Math.floor(index / PAGE_SIZE) + 1))`.
  - The rebuilt view replaces the form, so there's no `form.reset()` or `#load()`.
  - If `position()` fails after a successful create, show `toastError`, then `form.reset()` and `#load()` the current page, so the page doesn't sit with a stale list.
  - `navigate()` to the current URL still refreshes the view.
- [x] `docs/backend.md` — mention `GET /api/exercises/:id/position` and why a `COUNT` gives the exact index (the unique `NOCASE` name index).
- [x] `docs/frontend.md` — in the paging paragraph, say that adding an exercise navigates to the page that holds it, found through `exerciseFacade.position()`.

**Automated Verification**:

- [x] `bun test src/backend/features/exercises/exercise.routes.test.ts` passes, including `position`
- [x] `bun test src/frontend/features/exercises/exercises.facade.test.ts` passes, including `position()`
- [x] `bun test`, `bun run typecheck`, `bun run lint`, `bun run fmt:check` pass

**Manual Verification**:

- [ ] On `/exercises`, add an exercise that sorts onto a later page (e.g. "Zercher Squat"): the view moves to that page, which shows the new exercise, and the toast says "Added Zercher Squat".
- [ ] Adding one that sorts onto the current page reloads it with the new card.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Planning: the user first chose Previous/Next with "Page X of Y", then switched to numbered
  pages following Oat's pagination example after reviewing the draft.
- Implementation: both lists render their body through a `#page(items, total, page)` method that
  returns either the cards plus `pager()` or `pastEnd()`; `gz-workout-list` also gained a
  `#card()` like the exercise list's, which keeps the template readable after oxfmt's indentation.
- Implementation: `pagination.test.ts` compares plain string literals, not template literals, because
  oxlint's `no-unnecessary-template-expression` rejects `${1}` in a non-`html` template.

## References

- `docs/agents/research/2026-09-22-opening-and-creating-workouts-and-exercises.md` — list/detail pages (partly outdated: Oat migration, card click)
- `docs/agents/plans/2026-09-22-open-workouts-and-exercises-by-clicking-the-card.md` — the `open-card` pattern both lists use
- `src/frontend/app/router.ts`, `src/frontend/app/gz-app.component.ts` — routing and view rebuild
- `src/backend/features/workouts/internal/workout.controller.ts:24` — the existing paged list this mirrors
- `src/backend/db/migrations/001-initial-schema.sql:9` — the unique `NOCASE` name index
- https://oat.ink/components/#pagination and `node_modules/@knadh/oat/css/button.css:117` — Oat's pagination / `menu.buttons`
