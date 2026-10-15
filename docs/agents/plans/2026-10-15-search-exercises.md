---
date: 2026-10-15T13:16:19.932940+00:00
git_commit: 74e4029feb471671d34ff3d46793477d39b2bdc4
branch: main
topic: 'Search the exercises page by name'
tags: [plan, exercises, gz-exercise-list, exercise-filter, exercise.repository, exercise.controller]
status: ready
---

# PLAN: Search the exercises page by name

Add a "Search" field to the exercises list that narrows it to the exercises whose name contains the
typed text. The search is a third filter beside "Muscle group" and "Type": it lives in the URL as
`?search=`, runs on the server so it works across pages, and is applied when the user presses Enter or
leaves the field.

## Acceptance Criteria

- The exercises page has a "Search" field (`<input type="search">`) in front of the "Muscle group" and
  "Type" selects, showing the current search from the URL.
- Pressing Enter or leaving the field navigates to `/exercises?…&search=<text>` on page 1, keeping
  `muscleGroup` and `type`; clearing the field (typing it empty, or the browser's ✕) drops `search`
  from the URL. An unchanged value navigates nowhere.
- The search is trimmed; an empty one is no search.
- The list holds only exercises whose name contains the text, case-insensitively for ASCII letters
  (as the `NOCASE` ordering); `%`, `_` and `\` match themselves, not as wildcards.
- The search combines with `muscleGroup` and `type`, and paging keeps all three.
- The subtitle reads "N of M exercises" while a search is active.
- The empty page names the filters and the search: `No exercises match "squat".`,
  `No weighted Legs exercises match "squat".`, `No exercises without a muscle group match "squat".`
- Adding an exercise drops the search and otherwise navigates as today (its own group, its own type
  while a type is chosen, the page that holds it).
- `GET /api/exercises` and `GET /api/exercises/:id/position` take an optional `search` (trimmed, empty
  is none, over 120 characters is a 400) that narrows `items`, `total` and `index`; `all` still counts
  every exercise.

## Technical Key Decisions and Tradeoffs

1. **Applied on Enter or `change`, not live while typing:** the search is a URL filter like the selects.
   - Why: `navigate()` makes `gz-app` build a fresh view and scroll to the top
     (`gz-app.component.ts:89-129`), and `render()` swaps the whole `innerHTML` (`ui/base.ts:42`), so a
     navigation per keystroke would lose focus and caret.
   - Impact: no new rendering logic. The `change` listener, which today returns early for anything but
     a `<select>` (`gz-exercise-list.component.ts:35`), is restructured to dispatch on the target's id,
     and a `search` listener joins it (below).
   - Tradeoff: typing a search and then clicking a select or a page link first fires `change` on blur,
     which navigates with the search on page 1; the click lands on the view being replaced and is lost.
     The user clicks again. Accepted, as for any `change`-applied field.
2. **Search on the server, name only:** `name LIKE '%' || ? || '%' ESCAPE '\'` in `filterConditions`.
   - Why: the list is paginated on the server (10 per page); names are what the cards show.
   - Impact: `list`, `count` and `index` (position) honor it with no further change.
3. **`search` is the parameter name** in the URL, the API query and `ExerciseFilterDto.search`; the
   repository's port calls it `ExerciseFilter.name_contains`.
   - Why: the DTO's keys already match the query keys (`muscleGroup`, `type`).
   - Impact: a new `optionalQueryString(params, key, maxLength)` beside `optionalQueryOneOf` in
     `src/backend/http/http.ts`.
4. **Placement:** a third labeled `.field` in the header's existing `.hstack gap-2`, before the selects.
   - Why: it is one more filter and follows the same label-above-field pattern; Oat styles
     `input[type=search]` like any input (`node_modules/@knadh/oat/css/form.css:16`) and `.hstack`
     already wraps (`node_modules/@knadh/oat/css/utilities.css:20`).
   - Impact: no new CSS.
5. **Adding an exercise drops the search.**
   - Why: a kept search could hide the new card; matching it in TypeScript would duplicate the SQL rule.
   - Impact: the add flow's filter object simply never carries `search`.
6. **The empty text appends `match "<search>"`** to the existing filter wording.
7. **Navigate on `change` and on the `search` event, only when the value differs from the URL's search.**
   - Why: browsers fire `change` on Enter and on blur, but Chrome and Safari fire only `search` (and
     `input`) when the ✕ clears the field; they also fire `search` on Enter, in either order (Chrome
     `change` first, Safari `search` first), so both events arrive and `navigate()` would otherwise
     reload twice (it dispatches `popstate` even for the same path, `router.ts:40-46`).
   - Impact: the handler compares the trimmed value with `parseExerciseFilter(location.search).search ?? ''`,
     not with `this.data.filter.search`: after the first `navigate()`, `gz-app` keeps the old view in
     the DOM until the new one is ready, so the second event lands on a view whose `data` is stale,
     while `location` has already moved on. Comparing the search alone (not the whole path) also keeps
     an unchanged search on page 2 from jumping to page 1 on blur.
8. **An over-long `?search=` in the page's URL reads as no search** in `parseExerciseFilter`, as an unknown
   `muscleGroup` or `type` already does; the input's `maxlength="120"` keeps typed values within bounds.

## Current State

```
URL /exercises?muscleGroup=Legs&type=weighted&page=2
        │
        ▼
gz-exercise-list.load()                          gz-exercise-list.component.ts:50
  parseExerciseFilter(location.search)           internal/exercise-filter.ts:16
  exerciseFacade.list({limit, offset, ...filter}) → ExerciseApi.list / setFilter   internal/exercise.api.ts:19-37
        │  GET /api/exercises?limit=10&offset=10&muscleGroup=Legs&type=weighted
        ▼
ExerciseController.list → #filter(params)        exercise.controller.ts:23,68
  → ExerciseFilterDto {muscleGroup?, type?}      shared/dto/exercise.ts:27
  → translateDtoToExerciseFilter                 exercise.translator.ts:65
  → ExerciseRepository.list/count/index          exercise.repository.ts:27-93
      filterConditions(): "muscle_group IS ?", "kind = ?"
  ← { items, total (matching), all (every exercise), limit, offset }
```

```
┌────────────────────────────────────────────────────────────────┐
│ Exercises                     Muscle group        Type         │
│ 3 of 12 exercises             [ Legs       ▾]     [ All     ▾] │
├────────────────────────────────────────────────────────────────┤
│ ▸ Add an exercise                                              │
│ [card] [card] [card] …                                         │
│                 « 1 2 »                                        │
└────────────────────────────────────────────────────────────────┘
```

The selects' `change` handler (`gz-exercise-list.component.ts:34-47`) navigates with
`exercisesPath(filter, 1)`; `page-change` keeps the filter (`:29-33`); `isFiltered` drives the
"N of M" subtitle (`:160`); `#emptyText` names the filters (`:128-137`); the add flow navigates to the
new exercise's own group and type (`:78-90`).

## Desired End State

```
┌───────────────────────────────────────────────────────────────────────┐
│ Exercises              Search            Muscle group     Type        │
│ 2 of 12 exercises      [squat______]     [ Legs     ▾]    [Weighted▾] │
├───────────────────────────────────────────────────────────────────────┤
│ ▸ Add an exercise                                                     │
│ [Back Squat] [Front Squat]                                            │
└───────────────────────────────────────────────────────────────────────┘

Empty:  No weighted Legs exercises match "squat".
```

```
URL /exercises?muscleGroup=Legs&search=squat
  → parseExerciseFilter → { muscleGroup: 'Legs', search: 'squat' }
  → GET /api/exercises?limit=10&offset=0&muscleGroup=Legs&search=squat
  → controller: optionalQueryString(params, 'search', 120) → filter.search
  → translator: name_contains
  → filterConditions: "name LIKE '%' || ? || '%' ESCAPE '\'" with % _ \ escaped
```

## Abstractions and Code Reuse

- `src/backend/http/http.ts` - new `optionalQueryString(params, key, maxLength)`: trims; `null` when missing
  or empty; `badRequest('"<key>" must be at most <max> characters')` when longer
- `src/shared/dto/exercise.ts`
  - `ExerciseFilterDto` - add `search?: string`
- `src/backend/features/exercises/ports/exercise.ts`
  - `ExerciseFilter` - add `name_contains?: string`
- `src/backend/features/exercises/exercises.facade.ts` - export `MAX_EXERCISE_NAME_LENGTH` for the controller
- `src/backend/features/exercises/internal/exercise.controller.ts`
  - `#filter` - read `search`
- `src/backend/features/exercises/internal/exercise.translator.ts`
  - `translateDtoToExerciseFilter` - map `search` → `name_contains`
- `src/backend/features/exercises/internal/exercise.repository.ts`
  - `FilterParam` - add `string`
  - `filterConditions` - add the escaped `LIKE` condition on the unqualified `name`, safe under the
    comment at `:26` since neither `sets` nor `workouts` has a `name` column (`workouts` has `title`)
- `src/frontend/features/exercises/internal/exercise.api.ts`
  - `setFilter` - set `search`
- `src/frontend/features/exercises/internal/exercise-filter.ts`
  - `parseExerciseFilter`, `exercisesPath`, `isFiltered` - know `search`
- `src/frontend/features/exercises/gz-exercise-list.component.ts` - the field, the handler, the empty text

No new components; the field is plain markup styled by Oat.

## Logging & Observability

None. The access log already records the request URL with its query.

## Implementation

### Phase 1: `search` on the exercises API

Dependencies: None

`GET /api/exercises` and `GET /api/exercises/:id/position` narrow by name.

**Tasks**:

- [ ] `src/backend/http/http.ts`: add `optionalQueryString`
      ```ts
      export function optionalQueryString(params: URLSearchParams, key: string, maxLength: number): string | null {
        const raw = params.get(key)?.trim() ?? '';
        if (raw === '') {
          return null;
        }
        if (raw.length > maxLength) {
          throw badRequest(`"${key}" must be at most ${maxLength} characters`);
        }
        return raw;
      }
      ```
- [ ] `src/shared/dto/exercise.ts`: add `search?: string` to `ExerciseFilterDto`, and mention in its doc
      comment that it matches names containing it
- [ ] `src/backend/features/exercises/ports/exercise.ts`: add `name_contains?: string` to `ExerciseFilter`
- [ ] `src/backend/features/exercises/exercises.facade.ts`: export `MAX_EXERCISE_NAME_LENGTH`
- [ ] `src/backend/features/exercises/internal/exercise.controller.ts`: in `#filter`, set
      `filter.search` from `optionalQueryString(params, 'search', MAX_EXERCISE_NAME_LENGTH)`
- [ ] `src/backend/features/exercises/internal/exercise.translator.ts`: in `translateDtoToExerciseFilter`,
      map `dto.search` to `filter.name_contains`
- [ ] `src/backend/features/exercises/internal/exercise.repository.ts`: widen `FilterParam` with `string`;
      in `filterConditions` push `"name LIKE '%' || ? || '%' ESCAPE '\\'"` (the SQL reads
      `ESCAPE '\'`) with `filter.name_contains.replace(/[\\%_]/g, '\\$&')`; `name` stays unqualified
      like the other conditions, which `count` and `index` need since they do not alias `exercises`
- [ ] `src/backend/http/http.test.ts`: `describe('optionalQueryString')` - reads and trims a value; reads
      missing, empty and whitespace-only as `null`; rejects 121 characters with
      `"search" must be at most 120 characters`
- [ ] `src/backend/features/exercises/exercise.routes.test.ts`: `describe('searching by name')` with its
      own seed (e.g. Back Squat/Legs/weighted, Front Squat/Legs/weighted, Goblet Squat/Legs/bodyweight,
      Bench Press/Chest, `100% Effort`, `Row_Wide`, `Push\Pull`):
  - [ ] lists the names containing the text in any case (`search=SQUAT`) with `total` and `all`
  - [ ] combines with `muscleGroup` and `type`
  - [ ] pages within the search (`limit=1&offset=1`)
  - [ ] treats `%`, `_` and `\` literally (`search=%25` finds only `100% Effort`; `search=_` only
        `Row_Wide`; `search=%5C` only `Push\Pull`)
  - [ ] trims, and treats an empty or blank `search` as none
  - [ ] rejects a 121-character `search` with 400
  - [ ] positions an exercise within the search (`/position?search=squat`)

**Automated Verification**:

- [ ] `bun test --parallel src/backend` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

Docs in this phase:

- [ ] `docs/backend.md` (`:364-379`): `GET /api/exercises` and `/position` take an optional `search`,
      trimmed, empty as none, at most 120 characters, matched as a case-insensitive (ASCII) substring of
      the name with `LIKE … ESCAPE '\'` and its wildcards escaped, combining with the other two; rewrite
      the closing "The filter is one `muscle_group IS ?` …" sentence, already stale since `type`, to
      describe the three conditions `filterConditions` builds, each left out when not given
- [ ] `docs/backend.md` (`:17-18`, `:63`): list `optionalQueryString` among the `http.ts` query readers

### Phase 2: The Search field on the exercises page

Dependencies: Phase 1

The page reads, writes and shows the search.

**Tasks**:

- [ ] `src/frontend/features/exercises/internal/exercise.api.ts`: `setFilter` sets `search` when given
- [ ] `src/frontend/features/exercises/internal/exercise-filter.ts`:
  - [ ] `parseExerciseFilter` reads `search`, trimmed; empty or over 120 characters reads as none (update
        the doc comment: "An unknown value of any filter…"); rename its `search` parameter to `query`
        so it does not shadow the new key
  - [ ] `exercisesPath` writes `search` after `type`, before `page`; rename its local `search`
        (`:37`) to `queryString`
  - [ ] `isFiltered` is also true for a `search`
- [ ] `src/frontend/features/exercises/gz-exercise-list.component.ts`:
  - [ ] put a `.field` before the two selects:
        ```html
        <div class="field">
          <label for="search">Search</label>
          <input id="search" type="search" value="${filter.search ?? ''}" maxlength="120" data-testid="search" />
        </div>
        ```
  - [ ] restructure the `change` listener (`:34-47`), which returns early for anything but a
        `<select>`, to dispatch on the target's id: `filter`, `type-filter`, `search`; anything else,
        such as the add form's inputs and selects, is ignored
  - [ ] add `this.root.addEventListener('search', …)` that runs the same search branch
  - [ ] the search branch reads `value.trim()` and navigates only if it differs from
        `parseExerciseFilter(location.search).search ?? ''` (Decision 7: not `this.data`, which is stale
        while the next view loads), to
        `exercisesPath({ ...filter without search, ...(value === '' ? {} : { search: value }) }, 1)`
  - [ ] the selects' navigation keeps the current `search`, as each keeps the other select
  - [ ] `handleSubmit`'s filter for the new exercise never carries `search` (it already builds its own
        object; keep it so and say so in the existing comment at `:79`)
  - [ ] `#emptyText` takes `search`: with one, `No ${phrase} match "${search}".`, where `phrase` is
        `exercises`, `weighted Legs exercises` or `exercises without a muscle group`, built from the same
        parts as today; `all === 0` still reads "No exercises yet. Add the lifts you train above."
- [ ] `src/frontend/features/exercises/internal/exercise-filter.test.ts`:
  - [ ] `parseExerciseFilter` rows: `?search=squat`, `?search=%20squat%20` → `squat`, `?search=` → `{}`,
        `?search=` + 121 characters → `{}`, all three together
  - [ ] `exercisesPath` rows: `{ search: 'back squat' }` → `/exercises?search=back+squat`, all three with page 2
  - [ ] `isFiltered({ search: 'x' })` is true
- [ ] `src/frontend/features/exercises/exercises.facade.test.ts`: rows for `list({ search })` and
      `position(4, { search })`
- [ ] `src/frontend/features/exercises/gz-exercise-list.component.test.ts`:
  - [ ] shows the URL's search in the field, and "N of M exercises"
  - [ ] a `change` on the field navigates to `?muscleGroup=Legs&type=weighted&search=squat` from page 2,
        on page 1, trimmed
  - [ ] clearing the field (via `change` and via the `search` event) drops `search`
  - [ ] counting `popstate` on `window` (the test mounts no `gz-app`, so list requests cannot tell):
    - [ ] an unchanged value, from either event, dispatches none
    - [ ] `change` then `search` with the same new value dispatches exactly one, the view's `data`
          still holding the old search when the second arrives
    - [ ] an unchanged search on `?search=squat&page=2` stays on page 2 on `change`
  - Events are dispatched as `new Event('change' | 'search', { bubbles: true })` after setting
    `value`; `testing.ts`'s `choose()` covers only selects
  - [ ] a `change` on the add form's name field does not navigate
  - [ ] choosing a muscle group or type keeps the search; paging keeps it
  - [ ] the empty texts for the three acceptance-criteria examples, and a search with `"` and `<`
        shown escaped in the field and the empty text
  - [ ] adding an exercise while searching navigates without `search`

**Automated Verification**:

- [ ] `bun test --parallel` passes
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes

Docs in this phase:

- [ ] `docs/frontend.md` (`:514-528`): the "Search" field before the selects, `?search=` in the URL beside
      the other two, applied on `change` or the `search` event and only when it changed (and why not
      live), trimmed and capped as the selects' unknown values, kept by the selects and paging, dropped
      by adding an exercise, and the empty text's `match "…"`
- [ ] `README.md:10`: "filterable by muscle group" → "searchable by name and filterable by muscle group
      and type"

**Manual Verification**:

- [ ] With `bun run seed` data and `bun run start:dev`, in Chrome: typing "squat" and pressing Enter
      lists only the squats with "N of M exercises"; the ✕ restores the full list; changing a select
      keeps the search; Back returns to the previous search
- [ ] In Firefox: Enter applies the search, and emptying the field and tabbing out clears it
- [ ] At phone width, the three fields wrap without horizontal scroll

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/plans/2026-10-09-filter-exercises-by-muscle-group.md` - the muscle group filter this extends
- `docs/agents/plans/2026-10-14-assisted-exercises.md` - the type filter
- `docs/agents/plans/2026-09-29-paginate-workouts-and-exercises.md` - the pagination it combines with
- SQLite `LIKE` and `ESCAPE`: https://www.sqlite.org/lang_expr.html#like
