---
date: 2026-10-13T15:03:10.888391+00:00
git_commit: fb24fc062bb43ed73554f6cc78571c09f47ab315
branch: main
topic: 'Body weight log'
tags: [plan, weight, backend, frontend, dashboard, chart]
status: ready
---

# PLAN: Body weight log

Add a body weight log to gainz: one weigh-in per date, logged and corrected by hand on a new
`/weight` page, shown as a trend with a 7-day moving average, and summarized in a dashboard tile.

The log is deliberately standalone. Bodyweight exercises keep counting reps, and no existing volume,
progression or chart value changes; deriving a bodyweight set's load from the log is a later plan.
The API is shaped so that a later Eufy Smart Scale P3 listener (the scale broadcasts its weight in
BLE advertisements, see References) can `PUT` today's date with no further backend work, but that
listener is out of scope here.

## Acceptance Criteria

- Migration `007` creates
  `weigh_ins (measured_on TEXT PRIMARY KEY, weight REAL NOT NULL CHECK (weight > 0))`; existing data
  is untouched.
- `PUT /api/weigh-ins/:date` with `{ "weight": 82.4 }` creates (201) or replaces (200) that date's
  weigh-in and answers the `WeighInDto`; a malformed or nonexistent date (`2026-02-30`) or a weight
  outside 20–500 is a 400; the weight is rounded to 0.01.
- `GET /api/weigh-ins/:date` answers that date's `WeighInDto`, or 404.
- `DELETE /api/weigh-ins/:date` answers 204, or 404 for a date without a weigh-in; a malformed date
  is a 400.
- `GET /api/weigh-ins?since=YYYY-MM-DD` answers `{ since, items, latest }`: `items` oldest first,
  `latest` the newest weigh-in overall (in or out of the range), or `null`. Without `since` it answers
  every weigh-in with `since: null`; a malformed `since` is a 400.
- All four routes sit behind the auth guard.
- A "Weight" header link (after Statistics) opens `/weight`, which shows:
  - the latest weight with the 30-day change of the 7-day average,
  - a "Log a weigh-in" form whose date defaults to the browser's today, and which asks before
    replacing a date that already has one, whether that date is in the shown range or not,
  - a trend chart,
  - a newest-first history whose weights save inline on blur or Enter and whose × deletes after
    confirmation.
- The range (`30d`, `90d`, `1y`, `all`; default `90d`) lives in `?range=` and switches in place
  without remounting the page. Every range but `all` loads 6 extra days before its start, so the
  average is complete at its left edge.
- The 7-day average at a date is the mean of the weigh-ins in the 7 calendar days ending on it.
- `gz-chart` moves to `ui/chart/`.
  - It spaces points by date when every point carries one.
  - It draws an optional trend line, with the raw values as dots.
  - The exercise chart looks exactly as before.
- On the dashboard:
  - The "Exercises" tile becomes "Body weight", linking to `/weight`. It shows the latest weight
    and the 30-day change, or "–" with "Log your weight" when there are no weigh-ins at all.
  - The Workouts tile's hint becomes "N sets · N reps". `SummaryDto.exerciseCount` stays in the API,
    unread by the dashboard.
- No existing stat, volume or progression value changes.
- `bun run seed` writes about 120 days of weigh-ins. `bun run screenshots` adds `weight` and the
  shots are retaken. `README.md`, `docs/backend.md` and `docs/frontend.md` describe the feature.

## Technical Key Decisions and Tradeoffs

1. **Scope is the log only:** bodyweight exercises do not derive load from it.
   - Why: deriving load would change every past volume, the e1RM and the reps-based progression of
     bodyweight exercises, which deserves its own decisions.
   - Impact: nothing under `features/stats/` (backend) or the bodyweight branches is touched.
2. **One weigh-in per date, keyed by the date:** `GET`, `PUT` and `DELETE /api/weigh-ins/:date`, no
   id.
   - Why: a trend needs daily resolution only, it matches how workouts use `performed_on`, and a
     scale listener can simply `PUT` today.
   - Impact: the last reading of a day wins. Changing an entry's date is delete and re-log.
3. **Its own feature and page:** `weight` on both halves, `/weight` with a header link.
   - Why: logging your weight is a separate daily task from training.
   - Impact: new route lists spread into `src/backend/http/routes.ts` and `src/frontend/app/routes.ts`.
4. **One range request, no paging:** the chart, the history and the header all come from one `GET`,
   which also carries `latest`.
   - Why: ten years of daily weigh-ins is under 4,000 small rows, and `latest` keeps the current
     weight known when the range holds none.
   - Impact: the moving average and the 30-day change are computed in the frontend
     (`weight/internal/trend.ts`).
5. **The 30-day change is anchored at today:** the average of the 7 days ending today minus the
   average of the 7 days ending 30 days ago.
   - Why: every range loads at least today − 36 days, so both windows are always loaded. An anchor at
     the newest weigh-in could fall before the loaded data.
   - Impact: after a week without weigh-ins the change is `null` and the hint shows the latest
     weigh-in's date instead.
6. **A strict date check for the new readers:** `isRealDate()` round-trips the date through
   `Date.UTC`, so `2026-02-30` is a 400.
   - Why: `isIsoDate` lets `Date.parse` roll impossible days over, which would store a key that
     aliases a real day.
   - Impact: only `pathDate` and `optionalQueryDate` use it. The existing readers and workout dates
     keep `isIsoDate` unchanged, out of scope here.
7. **A shared chart with date spacing and a trend:** `gz-chart` moves to `ui/chart/`, and each
   `ChartPoint` gains an optional `x` date and `trend` value.
   - Why: index spacing would squeeze gaps and distort the trend, and `weight` may not import
     `exercises/internal/`.
   - Impact: the exercise chart's imports and the static-serving tests that name the chart's path
     change. Without `x` and `trend` the rendering is unchanged. The trend sits on each point, so the
     `series` setter's filter cannot shift it out of step.
8. **The dashboard's Body weight tile replaces "Exercises":** it is drawn by `gz-weight-tile` at the
   weight feature's root, and `gz-tile` gains an optional `href`.
   - Why: a fifth tile would sit alone on phones, and the trend math stays inside the weight
     feature.
   - Impact: the dashboard loads weigh-ins through `weighInFacade` and hands them to the tile, as it
     does with workout cards.
9. **Inline-editable history rows:** `gz-weigh-in-row` saves its weight like `gz-set-row`, and ×
   deletes it after `confirmAction()`.
   - Why: it is the same pattern as the workout page.
   - Impact: the page keeps the focused field across re-renders the way `gz-workout-detail` does.
10. **`daysBefore` moves to `ui/format.ts`:** both `stats` and `weight` need it.
   - Why: it is a generic date helper, and `weight` may not import `stats/internal/`.
   - Impact: `stats/internal/dates.ts` keeps only `RECENT_DAYS`, and its test moves to
     `format.test.ts`.

## Current State

There is no body weight data anywhere. The closest concept is the exercise's `bodyweight` flag
(`006-bodyweight-exercises.sql`): such sets are stored at weight 0, so every bodyweight view speaks
in reps.

```
backend  src/backend/http/routes.ts      allRoutes → auth.guard({ stats, exercises, workouts, sets })
         src/backend/db/migrations/      001 … 006-bodyweight-exercises.sql
         src/backend/http/http.ts        pathId, queryDate (required), queryMonth, … — no date-in-path reader
frontend src/frontend/app/routes.ts      ROUTES = [dashboard, workouts, exercises, statistics, auth] (= header order)
         src/frontend/http/http.ts       get / post / patch / remove — no PUT
         features/exercises/internal/gz-chart.component.{ts,css}
                                         one series, spaced by index, area + line + dots
         ui/tile/gz-tile.component.ts    label / value / hint, no link
         features/stats/internal/dates.ts RECENT_DAYS, daysBefore()
```

Dashboard today (`gz-dashboard.component.ts:61-66`):

```
┌ Workouts ─┐┌ Total volume ┐┌ Last 30 days ┐┌ Exercises ────┐
│ 42        ││ 182 t        ││ 9            ││ 14            │
│ 318 sets  ││ reps × weight││ 31 t moved   ││ 4,120 reps    │
│   total   ││  , all time  ││              ││   lifted      │
└───────────┘└──────────────┘└──────────────┘└───────────────┘
```

## Desired End State

```
backend  features/weight/
           weight.routes.ts       '/api/weigh-ins' GET, '/api/weigh-ins/:date' GET PUT DELETE
           weight.facade.ts       WeighInFacade: list(since), latest(), require(date), put(date, dto), delete(date)
           weight.fixtures.ts     putWeighIn(put, date, weight)
           ports/weigh-in.ts      WeighIn row
           internal/weigh-in.repository.ts  weigh-in.translator.ts  weigh-in.controller.ts
         db/migrations/007-weigh-ins.sql
frontend features/weight/
           weight.routes.ts       /weight, nav "Weight"
           weight.facade.ts       weighInFacade
           gz-weight.component.*  the page (GzView)
           gz-weight-tile.component.*  the dashboard tile (rendered by stats)
           internal/weigh-in.api.ts  trend.ts  range.ts  gz-weigh-in-row.component.*
         ui/chart/gz-chart.component.*  (moved, + x dates, + trend)
shared   src/shared/dto/weight.ts  WeighInDto, PutWeighInDto, WeighInListDto
```

The `/weight` page:

```
┌ gainz   Dashboard  Workouts  Exercises  Statistics  Weight          ◐ ┐
│ Weight                                                                 │
│ 82.4 kg · ▼ 0.6 kg in 30 days                                          │
│                                                                        │
│ ┌ Log a weigh-in ─────────────────────────────────────────────────┐    │
│ │ Date [2026-10-13]   Weight [ 82.4 ] kg            [ Log ]       │    │
│ └─────────────────────────────────────────────────────────────────┘    │
│                                                                        │
│ ┌ Trend ──────────────────────────────── [30d] [90d] [1y] [All] ┐      │
│ │ 83 ┤ ·    ·                                                   │      │
│ │    │  ╲·__·  ·  ·              ← 7-day average line, raw dots │      │
│ │ 82 ┤      ‾‾‾╲___·__                                          │      │
│ │    └─┬──────────┬──────────┬──────────┬                       │      │
│ │     Jul 15     Aug 14     Sep 13     Oct 13                   │      │
│ │ Dots are single weigh-ins; the line is their 7-day average.   │      │
│ └───────────────────────────────────────────────────────────────┘      │
│                                                                        │
│ History                                                                │
│  Mon, Oct 13      [ 82.4 ] kg                                    ×     │
│  Sun, Oct 12      [ 82.9 ] kg                                    ×     │
│  …                                                                     │
└────────────────────────────────────────────────────────────────────────┘
```

With no weigh-ins in the range, the Trend card shows "No weigh-ins in this range." and the history
"No weigh-ins yet. Log one above." With none at all, the heading's subtitle reads "Log your first
weigh-in to start the trend."

Dashboard after Phase 3:

```
┌ Workouts ─────┐┌ Total volume ┐┌ Last 30 days ┐┌ Body weight ───┐  ← whole tile links to /weight
│ 42            ││ 182 t        ││ 9            ││ 82.4 kg        │
│ 318 sets ·    ││ reps × weight││ 31 t moved   ││ ▼ 0.6 kg in 30 │
│   4,120 reps  ││  , all time  ││              ││   days         │
└───────────────┘└──────────────┘└──────────────┘└────────────────┘
```

### Trend rules (`weight/internal/trend.ts`)

- `averageAt(items, date)`: the mean of the items with `date − 6 ≤ measuredOn ≤ date`, or `null`
  when there are none.
- `trendPoints(items, from)`: for each item with `measuredOn ≥ from`, `{ date, value, average }`.
  The average uses every loaded item, so the 6 extra days feed the left edge.
- `change(items, today, days = 30)`: `averageAt(today) − averageAt(today − days)`, or `null` when
  either window is empty. Every caller has loaded at least `today − 36`, so both windows are covered. The subtitle and
  the tile show it as "▼ 0.6 kg in 30 days", "▲ 0.3 kg in 30 days" or "± 0 kg in 30 days" (below
  0.05 in either direction). Without a change they show the date of `latest` instead, e.g. "Oct 2".
  The value shown is always `latest`'s weight, never the newest item in the range.

### Range rules (`weight/internal/range.ts`)

- `RANGES`: `30d` → 30 days, `90d` → 90, `1y` → 365, `all` → none.
- `parseRange(search)` reads `?range=`; anything unknown is `90d`.
- `rangeFrom(range, today)` is `daysBefore(today, days)`, or `null` for `all`.
- `loadSince(range, today)` is `daysBefore(today, days + 6)`, or `null`.

## Abstractions and Code Reuse

- `src/shared/`
  - `dto/weight.ts` - new
    - `WeighInDto { measuredOn: Iso8601Date; weight: number }`
    - `PutWeighInDto { weight: number }`
    - `WeighInListDto { since: Iso8601Date | null; items: WeighInDto[]; latest: WeighInDto | null }`
- `src/backend/`
  - `db/migrations/007-weigh-ins.sql` - new table. `measured_on TEXT PRIMARY KEY`; the primary key is
    the index the range query uses.
  - `shared/validate.ts` - `isRealDate(value)` - new: `isIsoDate` plus a round trip through
    `Date.UTC`, so `2026-02-30` fails
  - `http/http.ts`
    - `pathDate(raw)` - new: a real date in the path or 400 `Invalid date`
    - `optionalQueryDate(params, key)` - new: null when missing or empty, else a real date or 400
  - `http/routes.ts` - spread `weightRoutes(db)` inside `auth.guard()`
  - `features/weight/` - new feature, shaped like `stats/`
    - `ports/weigh-in.ts` - `WeighIn { measured_on; weight }`
    - `internal/weigh-in.repository.ts`
      - `list(since | null)` - ordered by `measured_on`
      - `latest()` - the newest row, or null
      - `get(date)` - the row, or null
      - `put(date, weight)` - returns `{ weighIn, created }`, one transaction: `SELECT 1`, then
        `INSERT … ON CONFLICT(measured_on) DO UPDATE`
      - `delete(date)` - returns whether a row went
    - `internal/weigh-in.translator.ts`
      - `translateToPutWeighInDto(body)` - casts only
      - `translateToWeighInDto(row)`, `translateToWeighInListDto(since, rows, latest)`
    - `internal/weigh-in.controller.ts` - `list`, `get` (404 when missing), `put` (201 or 200),
      `delete` (204, or `notFound('Weigh-in not found')`)
    - `weight.facade.ts` - `WeighInFacade` with `#validatePut` using
      `requiredNumber(dto, 'weight', { min: 20, max: 500 })`, and `require(date)` throwing the 404;
      `createWeighInFacade(db)`, named after the entity like `createExerciseFacade`
    - `weight.routes.ts` - one-line handlers
    - `weight.fixtures.ts` - `putWeighIn(put, measuredOn, weight)`
  - `testing.ts` - `useServer()` also returns `put` and `del`, beside `post` and `patch`
- `src/frontend/`
  - `http/http.ts` - `put()` and `'PUT'` in `request`'s method union
  - `ui/format.ts`
    - `daysBefore` - moved here from `stats/internal/dates.ts`
    - `formatBodyWeight(value)` - new: "82.4 kg", one decimal
  - `ui/chart/gz-chart.component.{ts,css}` - moved from `features/exercises/internal/`
    - `ChartPoint.x?: Iso8601Date` - date spacing when every point has one
    - `ChartPoint.trend?: number | null` - when any point has one, the line and area follow the
      trend; the dots stay at the raw values
    - `empty` and `label` setters - the empty-state text and the `aria-label`, defaulting to
      today's
  - `ui/tile/gz-tile.component.{ts,css}` - optional `href` attribute; the label becomes a link
    whose `::after` covers the tile, as in `article.open-card`, with `position: relative` on the
    card (compare `shared.css:131`)
  - `app/routes.ts` - spread `weightRoutes` after `statisticsRoutes`
  - `features/weight/` - new
    - `weight.routes.ts` - `/weight`, title "Weight", nav "Weight"
    - `weight.facade.ts` - `WeighInFacade` (`list(since)`, `get(date)`, `put(date, dto)`,
      `delete(date)`), `weighInFacade`
    - `internal/weigh-in.api.ts` - owns `/api/weigh-ins/**`
    - `internal/trend.ts`, `internal/range.ts` - the rules above, with tests
    - `internal/gz-weigh-in-row.component.{ts,css}` - date, weight input with "kg", ×; emits
      `weigh-in-saved` with the answered DTO and `weigh-in-deleted` with the date;
      `focusedField()` / `restoreField()` as in `gz-set-row`
    - `gz-weight.component.{ts,css}` - the page
    - `gz-weight-tile.component.{ts,css}` - wraps `<gz-tile href="/weight">`; its `list` setter
      (a `WeighInListDto`) renders. Its host is `display: block` and stretches, so the tiles grid
      keeps equal heights.
  - `features/stats/gz-dashboard.component.ts` - loads `weighInFacade.list(daysBefore(today, 36))`
    beside the summary, caught on its own (a failure leaves the tile "–" and toasts), and renders
    `gz-weight-tile` in place of the Exercises tile
  - `features/exercises/internal/gz-progress-chart.component.ts` - imports `ui/chart/`
- `src/scripts/`
  - `seed.ts` - about 120 days of weigh-ins through `createWeighInFacade(db)`
  - `screenshots.ts` - adds `{ name: 'weight', path: '/weight', mobile: false }`

Reused as is: `requiredNumber` (rounds to 0.01), `isIsoDate`, `queryDate`, `json` / `noContent`,
`GzView`, `confirmAction()`, `toast()` / `toastError()`, `todayIso()`, `formatShortDate()`,
`formatDate()`, and the test helpers `useServer`, `useDom`, `useFetch`, `respondTo`, `mount`,
`find`, `testId`, `settle`, `openDialog`.

## Logging & Observability

Nothing new. The access log already writes one `http` line per API request, with its body:

```
12:04:31 http PUT /api/weigh-ins/2026-10-13 201 2ms {"weight":82.4}
12:05:02 http DELETE /api/weigh-ins/2026-10-12 204 1ms
```

## Implementation

### Phase 1: Log and history

Dependencies: None

Ship the backend feature end to end and a `/weight` page with the log form and the editable,
deletable history. There is no chart yet, and the dashboard is unchanged.

**Tasks**:

Backend:

- [x] Add `src/backend/db/migrations/007-weigh-ins.sql`:
  ```sql
  CREATE TABLE weigh_ins (
    measured_on TEXT PRIMARY KEY,
    weight      REAL NOT NULL CHECK (weight > 0)
  );
  ```
- [x] Add a "create weigh_ins" case to `describe('the real migrations')` in
      `src/backend/db/migrations.test.ts`: the table exists after `migrate`, and a database migrated
      from 006 keeps its rows.
- [x] Bump the pinned migration counts for `007`:
  - `src/backend/db/db.test.ts:16` (`toBe(6)` → `7`)
  - `src/backend/db/migrations.test.ts:171-172` (`[1..6]`, `toBe(6)`)
  - `:228` (`[4, 5, 6]`), `:249` (`[5, 6]`) and `:277` (`[6]`), each gaining `7`
- [x] Add `src/shared/dto/weight.ts` with `WeighInDto`, `PutWeighInDto` and `WeighInListDto`, using
      flavored dates.
- [x] Add `isRealDate()` to `src/backend/shared/validate.ts`:
  ```ts
  export function isRealDate(value: string): boolean {
    const [year, month, day] = value.split('-').map(Number);
    return isIsoDate(value) && new Date(Date.UTC(year ?? 0, (month ?? 1) - 1, day ?? 1)).toISOString().slice(0, 10) === value;
  }
  ```
  Test it in `validate.test.ts` (or beside the existing validation tests):
  - `2026-02-28` and `2028-02-29` pass
  - `2026-02-29`, `2026-02-30` and `2026-04-31` fail
- [x] Add `pathDate()` and `optionalQueryDate()` to `src/backend/http/http.ts`, both on
      `isRealDate`, with their edge cases in `http.test.ts`: a valid date, `2026-13-01`,
      `2026-02-30`, empty and missing.
- [x] Add `src/backend/features/weight/ports/weigh-in.ts` with the `WeighIn` row.
- [x] Add `internal/weigh-in.repository.ts` with `list`, `latest`, `get`, `put` (in
      `db.transaction()`) and `delete`.
- [x] Add `internal/weigh-in.translator.ts`, naming every field.
- [x] Add `weight.facade.ts` with `WeighInFacade` (`list`, `latest`, `require`, `put`, `delete`) and
      `#validatePut`, plus `createWeighInFacade(db)`.
- [x] Add `internal/weigh-in.controller.ts`: `list` (with `latest`), `get`, `put` and `delete`.
- [x] Add `weight.routes.ts`:
  ```ts
  '/api/weigh-ins': { GET: (req) => controller.list(req) },
  '/api/weigh-ins/:date': {
    GET: (req) => controller.get(req),
    PUT: (req) => controller.put(req),
    DELETE: (req) => controller.delete(req),
  },
  ```
- [x] Spread `...weightRoutes(db)` inside `auth.guard()` in `src/backend/http/routes.ts`.
- [x] Add `put` and `del` to `useServer()` in `src/backend/testing.ts`.
- [x] Add `weight.fixtures.ts` with `putWeighIn`.
- [x] Add `weight.routes.test.ts`, covering:
  - PUT a new date → 201 with the DTO
  - PUT the same date → 200 with the new weight; GET shows one item
  - weight rounding (82.456 → 82.46)
  - weight as a numeric string is accepted, like set weights
  - 400s for a weight of 19.99, 500.01, missing or `"abc"`, and for a date of `2026-1-5`,
    `2026-02-30` or `today`
  - GET one date → 200 with the DTO; an empty date → 404
  - DELETE → 204, then GET is empty; DELETE again → 404
  - GET with `since` filters (`>=`) and orders oldest first; without `since`, everything with
    `since: null`; `since=bad` → 400
  - `latest` is the newest weigh-in even when `since` excludes it from `items`, and `null` with none
- [x] Add the weigh-in routes to the guard's cases in `auth.routes.test.ts`
      (`describe('the guard')`): each answers 401 without a cookie. That file is the only one with
      auth on (`docs/backend.md`, "Tests").
- [x] Add a facade validation test in `weight.facade.test.ts`: a bad weight on a date that has no
      weigh-in is a 400, not anything else.

Frontend:

- [x] Add `put()` to `src/frontend/http/http.ts`, and `'PUT'` to `request`'s method union, with a
      case in `http.test.ts`.
- [x] Move `daysBefore` from `features/stats/internal/dates.ts` to `ui/format.ts`, and its cases
      from `dates.test.ts` to `format.test.ts`.
  - Update the imports in `gz-dashboard.component.ts` and `gz-stats.component.ts`.
  - Delete `dates.test.ts` if it has no cases left.
- [x] Add `formatBodyWeight()` to `ui/format.ts`, with tests: `82.4` → "82.4 kg", `82.46` →
      "82.5 kg", `80` → "80.0 kg".
- [x] Add `features/weight/internal/weigh-in.api.ts` with `list(since | null)`, `get(date)`,
      `put(date, dto)` and `delete(date)`.
- [x] Add `features/weight/weight.facade.ts` with `weighInFacade`, and `weight.facade.test.ts`
      asserting each method's method, URL and body:
  - `GET /api/weigh-ins?since=…`, and `GET /api/weigh-ins` for `null`
  - `GET /api/weigh-ins/2026-10-13`
  - `PUT /api/weigh-ins/2026-10-13 {"weight":82.4}`
  - `DELETE /api/weigh-ins/2026-10-13`
- [x] Add `features/weight/internal/gz-weigh-in-row.component.{ts,css}`:
  - It shows `formatDate(measuredOn)`, a `number` input (`step="0.1"`, `min="20"`, `max="500"`)
    with a "kg" label in Oat's `fieldset.group`, and a `.ghost` × button with an
    `aria-label` of "Delete Oct 13's weigh-in".
  - A committed `change` or Enter PUTs the new weight when it differs and is valid, then emits
    `weigh-in-saved`.
  - × asks `confirmAction({ title: 'Delete weigh-in?', message: 'Oct 13 · 82.4 kg', confirmLabel: 'Delete', danger: true })`,
    then DELETEs and emits `weigh-in-deleted`.
  - Failures toast and change nothing.
  - It has `focusedField()` / `restoreField()` like `gz-set-row`.
- [x] Add `gz-weigh-in-row.component.test.ts`:
  - a changed weight PUTs and emits
  - an unchanged or invalid value sends nothing
  - Enter saves
  - × with confirm DELETEs and emits; × with cancel sends nothing
  - a failed PUT toasts
- [x] Add `features/weight/gz-weight.component.{ts,css}` (`GzView`), without the chart in this
      phase:
  - `load()` reads `weighInFacade.list(null)`. Phase 2 switches it to the range.
  - The heading is "Weight", with `latest`'s `formatBodyWeight` and its date as the subtitle, or
    "Log your first weigh-in to start the trend."
  - The log form is an `article.card` with a date input (default `todayIso()`), a weight input
    (prefilled with `latest`'s weight) and a "Log" button.
  - On submit it finds the date's current weigh-in: among the loaded items when the date is on or
    after the loaded `since` (all of them in this phase), otherwise through `weighInFacade.get(date)`,
    where a 404 means none. If there is one, it first asks
    `confirmAction({ title: 'Replace weigh-in?', message: 'Oct 12 · 82.9 kg → 82.4 kg', confirmLabel: 'Replace' })`.
    It then PUTs, toasts "Weigh-in logged" or "Weigh-in replaced", and reloads. A failed lookup
    toasts and sends nothing.
  - The history is a newest-first list of `gz-weigh-in-row`s, each handed its weigh-in in
    `afterRender()`. A `weigh-in-saved` swaps the item in and re-renders, keeping the focused
    field. A `weigh-in-deleted` removes it and re-renders.
- [x] Add `features/weight/weight.routes.ts` with
      `{ pattern: /^\/weight\/?$/, keys: [], view, title: 'Weight', nav: { path: '/weight', label: 'Weight' } }`.
- [x] Spread `...weightRoutes` after `...statisticsRoutes` in `src/frontend/app/routes.ts`.
- [x] Update `src/frontend/app/routes.test.ts`:
  - Add "Weight" to the pinned header links at `:43-52`.
  - Add `/weight` → "Weight" to the title table at `:55-63`.
- [x] Add `gz-weight.component.test.ts`:
  - the empty state
  - a list rendered newest first
  - logging a new date PUTs without asking
  - logging an existing date asks, and Cancel sends nothing
  - deleting a row removes it
  - a failed load shows the error
- [x] `docs/backend.md`:
  - Add `weight/` to the feature list under "Layout", and `pathDate` / `optionalQueryDate` to the
    `http.ts` readers listed at `:16-17`.
  - Add `weightRoutes(db)` / `createWeighInFacade(db)` to "Facades".
  - In "Tests" (`:199-203`, `:229-230`), say `useServer()` also returns `put` and `del`, and add
    `putWeighIn` to the fixtures.
  - Add `weigh_ins` to "Data model".
  - Add a "Weight" section describing the four routes, the date key and `isRealDate`, the 20–500
    bounds, the rounding, `latest`, and the 201/200 split.
- [x] `docs/frontend.md`:
  - Add `weight` to the feature list.
  - Add `put` to the `http.ts` helpers and `daysBefore` to `format.ts`.
  - Point `:589`'s `daysBefore` reference at `ui/format.ts`.
  - Add a "Weight" section for the page, the form's replace confirmation (including the lookup
    outside the range) and the rows.

**Automated Verification**:

- [x] `bun test --parallel src/backend/features/weight` passes.
- [x] `bun test --parallel src/backend/db/migrations.test.ts src/backend/http/http.test.ts` passes.
- [x] `bun test --parallel src/frontend/features/weight src/frontend/ui/format.test.ts src/frontend/http` passes.
- [x] `bun test --parallel` passes.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [x] With `bun run start:dev`:
  - "Weight" shows in the header, and in the phone menu below 560 px.
  - Logging today shows the entry.
  - Logging the same date again asks before replacing it.
  - Editing a row's weight and tabbing away saves it, and focus stays in the next field.
  - × asks, then deletes.
  - The page fits at 320 px.

### Phase 2: Trend chart and range

Dependencies: Phase 1

Move `gz-chart` to `ui/chart/` with date spacing and a trend line, and give the page its chart,
range switch and 30-day change.

**Tasks**:

- [x] `git mv` `features/exercises/internal/gz-chart.component.{ts,css}` to
      `ui/chart/gz-chart.component.{ts,css}`, and fix its relative imports (`../base.ts`,
      `../html.ts`, `../format.ts`).
- [x] Update the imports of the moved chart:
  - `gz-progress-chart.component.ts` and `gz-progress-chart.component.test.ts`
  - the URL `/features/exercises/internal/gz-chart.component.ts` in `src/scripts/build.test.ts:86`,
    `src/backend/features/static/internal/transpile.test.ts:21,42` and
    `src/backend/features/static/internal/bundle.test.ts:19`
  - the `.css` URL in `src/backend/features/static/static.routes.test.ts:215`
  - Point them at `/ui/chart/gz-chart.component.ts` and `/ui/chart/gz-chart.component.css`.
  - In `transpile.test.ts:22`, change the asserted specifier `from "../../../ui/format.ts"` to
    `from "../format.ts"`.
- [x] Extend `ui/chart/gz-chart.component.ts`:
  - `ChartPoint.x?: Iso8601Date`. When every point has `x`, `xFraction` is
    `(days(x) − days(first)) / (days(last) − days(first))`, or 0.5 for a single day. Otherwise it
    keeps index spacing.
  - The x-axis keeps its stride over indexes.
  - `ChartPoint.trend?: number | null`. When any point has a trend, the line and the area are drawn
    through the non-null trend values, the dots stay at the raw values, and the y-scale spans both.
    It sits on the point, so the `series` setter's filter keeps it in step.
  - An `empty` setter holds the empty-state text, defaulting to the current sentence.
  - The `aria-label` becomes a settable `label`, defaulting to "Progress over the logged sessions".
- [x] Add `ui/chart/gz-chart.component.test.ts`:
  - Without `x`, dots are spaced evenly. This pins today's behavior.
  - With `x` on Oct 1, 2 and 11, the middle dot sits at 10%.
  - With `trend`, the polyline follows the trend values while the dots stay at the raw ones.
  - A custom `empty` text renders.
  - A single point is centered.
- [x] Add `features/weight/internal/trend.ts` (`averageAt`, `trendPoints`, `change`) and
      `trend.test.ts`, covering:
  - the 7-day window with a gap
  - the window boundaries (day −6 in, day −7 out)
  - `trendPoints` drawing on items before `from`
  - `change` with a missing window → `null`
  - the "± 0" threshold
- [x] Add `features/weight/internal/range.ts` (`RANGES`, `parseRange`, `rangeFrom`, `loadSince`) and
      `range.test.ts`.
- [x] Update `gz-weight.component.ts`:
  - `load()` reads the range from `?range=` and calls `weighInFacade.list(loadSince(range, today))`.
  - The subtitle shows `latest`'s weight and `change(items, today)` (see "Trend rules"). Every
    range loads at least today − 36, so both windows are loaded.
  - The log form's replace check uses the loaded items for dates on or after the loaded `since`,
    and `weighInFacade.get(date)` for older ones.
  - The Trend card is an `article.card` with a heading, the range buttons (the
    `gz-progress-chart` metric-switch style: `outline` unless current, `aria-pressed`), the
    `gz-chart` and a muted hint: "Dots are single weigh-ins; the line is their 7-day average."
  - In `afterRender()` the chart gets `series` from `trendPoints`, each point with `x`, `label`
    (`formatShortDate`), `value` and `trend` (the average). It also gets `unit` "kg", `label`
    "Body weight over time" and `empty` "No weigh-ins in this range."
  - The history lists only the items within the range (`measuredOn ≥ rangeFrom`), newest first.
  - A range button loads that range, then calls `history.pushState(null, '', '/weight?range=…')`
    (bare `/weight` for `90d`) and `show()`s it without remounting, guarded by a token like
    `gz-stats`'s `#showMonth`. A failure toasts and keeps the shown range.
- [x] Extend `gz-weight.component.test.ts`:
  - The default range requests `since` = today − 96 days.
  - `?range=all` requests no `since`.
  - A range click requests the new range and updates `location.search` without remounting.
  - The subtitle shows "▼ 0.6 kg in 30 days" for a fixed data set.
  - The subtitle shows `latest` when the range holds no weigh-ins.
  - The 6 extra days are not listed in the history.
  - Logging a date older than the loaded range asks to replace it when `GET /api/weigh-ins/:date`
    answers one, and doesn't when it answers 404.
- [x] `docs/frontend.md`:
  - Add `gz-chart` to the `ui/` shared widgets list at `:49`, with its `x`, `trend`, `empty` and
    `label`. It is documented nowhere today.
  - At `:623-624`, say the chart is also downloaded when `/weight` is first opened.
  - Describe the range, the moving average and the change in the "Weight" section.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/ui/chart src/frontend/features/weight src/frontend/features/exercises` passes.
- [x] `bun test --parallel src/backend/features/static src/scripts/build.test.ts` passes with the new chart URL.
- [x] `bun test --parallel` passes.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

**Manual Verification**:

- [x] Weight page:
  - A few weigh-ins with a gap of several days show as dots spaced by date, with a smooth average
    line through them.
  - 30d, 90d, 1y and All switch without a page flash, and Back returns to the previous range.
- [x] An exercise page's progress chart looks as before, in both themes.
- [x] At 320 px, the chart and range buttons fit without horizontal scrolling.

### Phase 3: Dashboard tile, seed, screenshots and README

Dependencies: Phase 2

Put body weight on the dashboard and into the showcase material.

**Tasks**:

- [x] Add an optional `href` to `ui/tile/gz-tile.component.ts` (and to `observedAttributes`).
  - With it, the label renders as `<a href>` with a stretched `::after` in
    `gz-tile.component.css`, on an `article.card` with `position: relative`, so the whole tile is
    the link. `gz-app` routes it, since the anchor is in the click's composed path.
  - Extend `gz-tile.component.test.ts`: with `href` there is a link to it; without, none.
- [x] Add `features/weight/gz-weight-tile.component.{ts,css}`:
  - A `list` setter (a `WeighInListDto`, or `null` after a failed load) renders
    `<gz-tile label="Body weight" href="/weight">`.
  - The value is `latest`'s `formatBodyWeight`, or "–".
  - The hint is `change(items, todayIso())`, else `latest`'s date, else "Log your weight".
  - The host is `display: block` and stretches, so the dashboard's tiles keep equal heights.
- [x] Add `gz-weight-tile.component.test.ts`:
  - no weigh-ins
  - `latest` only, outside the loaded window (date hint)
  - enough items for a change
- [x] Update `features/stats/gz-dashboard.component.ts`:
  - `load()` adds `weighInFacade.list(daysBefore(today, RECENT_DAYS + 6))`, caught on its own like
    `gz-stats`'s `#loadRecent`: a failure toasts and hands the tile `null`.
  - Replace the Exercises tile with `<gz-weight-tile data-testid="weight-tile">`, handed its list
    in `afterRender()`.
  - The Workouts tile's hint becomes
    `${plural(summary.setCount, 'set')} · ${plural(summary.totalReps, 'rep')}`.
- [x] Add `features/stats/gz-dashboard.component.test.ts`, since none exists:
  - the four tiles
  - the weight tile handed the loaded weigh-ins
  - a failed weigh-in request still renders the dashboard and toasts
- [x] Update `src/scripts/seed.ts`:
  - Write a weigh-in for about 120 of the last 130 days through `createWeighInFacade(db).put()`.
  - Start around 84.5 kg and drift to about 82 kg, with a deterministic ±0.6 kg wobble (no
    `Math.random`, so screenshots are stable) and a few skipped days.
- [x] Add `{ name: 'weight', path: '/weight', mobile: false }` to the shots in
      `src/scripts/screenshots.ts`, then run `bun run screenshots` to retake every shot.
- [x] `README.md`:
  - Change the dashboard alt text to "totals for workouts, volume and body weight".
  - Add a Weight section with the `weight-light.png` and `weight-dark.png` `<picture>`, alt text
    "The Weight page: a 90-day trend of daily weigh-ins with their 7-day average, above the
    history".
- [x] `docs/frontend.md`:
  - Describe the dashboard's Body weight tile, its separate failure path, and `gz-tile`'s `href`.
  - Note that `gz-weight-tile` sits at the weight feature's root because the dashboard renders it.

**Automated Verification**:

- [x] `bun test --parallel src/frontend/ui/tile src/frontend/features/weight src/frontend/features/stats` passes.
- [x] `bun test --parallel` passes.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.
- [x] `bun run seed` against an empty `GAINZ_DB` exits 0, and `GET /api/weigh-ins` then answers
      100+ items.
- [x] `docs/screenshots/weight-light.png` and `docs/screenshots/weight-dark.png` exist.

**Manual Verification**:

- [x] Dashboard:
  - The Body weight tile shows the latest weight and its change.
  - Clicking anywhere on it opens `/weight`, and Ctrl-click opens a tab.
  - On a phone the four tiles fill two rows.
- [x] The retaken screenshots look right in both themes, and the README renders them.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- The weight inputs (the log form and each history row) use `step="any"` rather than `step="0.1"`:
  the API keeps two decimals, so a stored 82.46 (from a scale, or typed) would fail `step="0.1"`'s
  validity check and its row could never be re-saved. The `min`/`max` of 20–500 stay.
- The log form's date input also carries `max` = today, so a future date cannot be logged by mistake.
- The trend math gained `formatChange()` and `trendHint()` in `trend.ts`, shared by the page's
  subtitle and the dashboard tile, and `range.ts` gained `rangePath()` for the pushed URL.
- `useServer()`'s `post`/`patch`/`put` share one `send()` helper; `del` sends no body.
- After a failed weigh-in load the dashboard tile shows "–" without a hint (rather than "Log your
  weight", which would wrongly claim there are none).
- The subtitle's weight is plain bold rather than `.mono`, which looked out of place beside the
  heading in the screenshots.
## References

- `docs/agents/plans/2026-10-12-bodyweight-exercises.md` - why bodyweight sets store 0 and compare reps
- `docs/agents/plans/2026-10-12-recent-exercise-progress.md` - the in-place `?`-state pattern and progress cards
- `docs/backend.md`, `docs/frontend.md`, `docs/checklists.md` - an endpoint, a migration, a component, a page
- `src/frontend/features/workouts/internal/gz-set-row.component.ts` - inline-save row pattern
- `src/frontend/features/stats/gz-stats.component.ts` - `#showMonth`, in-place URL state and separate failure path
- `src/frontend/features/exercises/internal/gz-chart.component.ts` - the chart being moved
- Eufy P3 BLE decoding for the later listener: https://github.com/bdr99/eufylife-ble-client
  (`eufy T9150`, weight in manufacturer data bytes 12–13 little-endian / 100, final when byte 10 is `0x05`)
