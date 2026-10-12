---
date: 2026-10-12T12:46:05.628370+00:00
git_commit: 17d6344253022737769b4fcded337bb181f59c92
branch: main
topic: 'Statistics page with a training calendar'
tags: [plan, stats, calendar, workouts, progression]
status: ready
---

# PLAN: Statistics page with a training calendar

Add a Statistics page whose month calendar marks the days you worked out. Clicking a day opens
its workout, and each day's tile shows its training intensity: how its exercises progressed,
combined, against each exercise's previous session.

## Acceptance Criteria

- The header gains "Statistics" after Exercises, opening `/stats`; the tab reads `Statistics · gainz`.
- `/stats` shows one month as a Monday-first grid, the current month (by the browser's date) by
  default; ‹ and › move one month and keep it in the URL as `?month=YYYY-MM`; a missing or invalid
  `month` shows the current month; › is disabled on the current month and any later one.
- A day is a workout day when it has a workout with at least one done set; workouts without done
  sets do not appear.
- Clicking a day with one workout opens `/workouts/:id`. A day with several shows their count and
  opens an `ot-dropdown` listing each workout — its title or "Workout", its level and its % — as
  links to it.
- An exercise's progression in a workout is its done-set volume (reps × weight) ÷ the volume of
  its previous session − 1. The previous session is the latest earlier workout by
  `(performed_on, id)` with a done set of the exercise. When either session's volume is 0, total
  reps are compared instead. An exercise without a previous session is not compared.
- A workout's progression is the mean of its compared exercises' progressions; a day's is the mean
  over every compared exercise of that day's workouts (not of the workouts' means); with nothing
  compared it is `null`.
- A tile shows ▲ in `--success` at ≥ +2.5%, ■ in `--muted` within ±2.5%, ▼ in `--danger` at
  ≤ −2.5%, and the `--primary` outline marker when its progression is `null`; the exact % and the
  number of compared exercises (or "nothing to compare") are in the tile's `title` and
  `aria-label`; a legend under the grid explains
  the four.
- `GET /api/stats/calendar?month=YYYY-MM` answers the month's workout days; a missing or malformed
  `month` is a 400.
- `docs/backend.md`, `docs/frontend.md` and `README.md` describe the endpoint and the page; the
  README shows a screenshot of it.

## Technical Key Decisions and Tradeoffs

1. **Mean of per-exercise ratios (user choice B):** every exercise counts equally, so an isolation
   lift moves a tile as much as a squat.
   - Why: chosen over summed volume and over estimated 1RM.
   - Impact: the day value cannot be derived from workout values, so the backend computes it from
     the per-exercise rows.
2. **Reps fallback for bodyweight:** when either session's volume is 0, total reps are compared.
   - Why: bodyweight sets log weight 0, so their volume is always 0.
   - Impact: also covers moving between bodyweight and weighted in either direction (reps are the
     only figure both sessions share), so dropping the weight never reads as −100%.
3. **The backend computes progression, the frontend only buckets it:** one query over all history
   — a CTE of per-(workout, exercise) done reps and volume, `LAG()` over each exercise ordered by
   `performed_on, workout_id`, then filtered to the month — grouped in TypeScript by
   `StatsRepository`.
   - Why: an exercise's previous session can lie before the month; window functions are already in
     use (`ROW_NUMBER()` in migration 003 and in `SetRepository.copyLastSessions`).
   - Impact: the wire carries raw fractions (`0.041`); the ±2.5% threshold lives in one frontend
     helper, `progressionLevel()`.
4. **Response lists only workout days:** `CalendarMonthDto { month, days: CalendarDayDto[] }`,
   each day `{ date, progression, comparedExerciseCount, workouts: [{ id, title, progression,
   comparedExerciseCount }] }`, oldest first; the count feeds the tile's "across N exercises".
   - Why: the grid is built on the frontend; empty days carry nothing.
   - Impact: new DTOs in `shared/dto/stats.ts`, ports and a translator in the stats feature.
5. **`month` is required on the API, defaulted in the frontend:** the server has no notion of the
   user's timezone, and "this month" is the browser's (`todayIso()`).
   - Impact: `queryMonth()` beside `optionalQueryInt` on the backend; `parseMonth(search, today)`
     in the stats feature's `internal/`, modeled on `parsePage`.
6. **Month arrows are buttons calling `navigate()`:** as the workout list does for
   `gz-pagination`'s `page-change`.
   - Why: `linkPath` does not route a link carrying a query, so an `<a href="/stats?month=…">`
     would reload the page.
   - Impact: day links stay plain `<a href="/workouts/:id">`, routed by `gz-app`.
7. **`gz-calendar` in `features/stats/internal/`, the page `gz-stats` at the feature root:** only
   this page draws a calendar, and `gz-chart` is a line chart in another feature's `internal/`.
   - Impact: the route sits in `stats.routes.ts` after the dashboard; CSS uses Oat tokens as they
     are — no `color-mix()`, no font sizes; the multi-workout menu copies `gz-header`'s
     `ot-dropdown` + `popovertarget` + `<menu popover>` markup with one id per day.
8. **Two vertical phases:** first the calendar with links, then intensity.
   - Why: phase 1 is usable on its own (where did I train, open it); phase 2 only adds the value
     and its rendering.
   - Impact: in phase 1 every workout day uses the `--primary` outline marker that phase 2 keeps
     for "nothing to compare".

## Current State

```
Header nav: Dashboard (/) · Workouts · Exercises          app/routes.ts:8 (spread order)

/  gz-dashboard (features/stats/)
    ├─ statsFacade.summary() ─▶ GET /api/stats/summary ─▶ StatsRepository.summary()
    └─ workoutFacade.list({ limit: 5 }) ─▶ recent gz-workout-cards
```

- `StatsRepository.summary()` runs plain aggregates over `workouts` and `sets`
  (`src/backend/features/stats/internal/stats.repository.ts:27-59`), served by
  `stats.routes.ts:6-13` through `StatsController` and `translateToSummaryDto`.
- History counts done sets only (`docs/backend.md:245-255`); per-exercise sessions are grouped by
  workout and ordered `performed_on, id` (`exercise.repository.ts:137-154`,
  `workouts/ports/sql.ts:10-12`).
- Query helpers: `optionalQueryInt`, `optionalQueryOneOf` (`src/backend/http/http.ts:40-62`).
- Frontend: `parsePage` reads `location.search` (`src/frontend/ui/pagination/pagination.ts:6-9`);
  `navigate()` re-dispatches `popstate` so the same route reloads (`app/router.ts:40-46`);
  `ot-dropdown` usage in `app/gz-header.component.ts:81-99`; `formatDelta`, `todayIso` in
  `ui/format.ts`.
- The README's screenshots come from `src/scripts/screenshots.ts:140-145` over relative-dated seed
  data (`src/scripts/seed.ts:70-76`).

## Desired End State

```
Header nav: Dashboard · Workouts · Exercises · Statistics

/stats?month=YYYY-MM  gz-stats (features/stats/)
    ├─ parseMonth(location.search, todayIso())
    ├─ statsFacade.calendar(month) ─▶ GET /api/stats/calendar?month=YYYY-MM
    │                                   └─ StatsRepository.calendar(month)
    │                                        sessions CTE ─▶ LAG per exercise ─▶ month filter
    │                                        ─▶ group by workout and day, mean ratios
    └─ gz-calendar (internal/) ── days ─▶ grid, tiles, dropdowns, legend
```

The page, October 2026:

```
Statistics
Your training month by month.

┌──────────────────────────────────────────────┐
│ [‹]          October 2026              [›]   │
│  Mo    Tu    We    Th    Fr    Sa    Su      │
│                    1     2     3     4       │
│                         ▲                    │
│  5     6     7     8     9     10    11      │
│  ■           ▼           ▲²                  │
│  12    13    14    15    16    17    18      │
│  ◌                                           │
│  …                                           │
│                                              │
│ ▲ progressed  ■ held  ▼ regressed            │
│ ◌ nothing to compare                         │
└──────────────────────────────────────────────┘
```

- A workout day is a link (one workout) or a dropdown button (several, with a count, here `²`);
  other days are plain numbers; today carries `aria-current="date"`.
- `title` / `aria-label` of a tile: `Oct 9: +4.1% across 5 exercises, 2 workouts` or
  `Oct 12: nothing to compare`.

The dropdown on Oct 9:

```
 ┌────────────────────────┐
 │ ▲ Push day     +6.0%   │ → /workouts/41
 │ ■ Arms         +1.2%   │ → /workouts/42
 └────────────────────────┘
```

## Abstractions and Code Reuse

- `src/shared/`
  - `flavors.ts` - `Iso8601Month` (`YYYY-MM`)
  - `dto/stats.ts` - `CalendarWorkoutDto`, `CalendarDayDto`, `CalendarMonthDto`
- `src/backend/http/http.ts` - `queryMonth(params, key)`: required, `/^\d{4}-(0[1-9]|1[0-2])$/`,
  else `badRequest('"month" must be a month as YYYY-MM')`
- `src/backend/features/stats/`
  - `ports/stats.ts` - `CalendarWorkout`, `CalendarDay` (snake_case, like `Summary`)
  - `internal/stats.repository.ts` - `StatsRepository.calendar(month)`
  - `stats.facade.ts` - `StatsFacade.calendar(month)`
  - `internal/stats.translator.ts` - `translateToCalendarMonthDto(month, days)`
  - `internal/stats.controller.ts` - `StatsController.calendar(req)`
  - `stats.routes.ts` - `'/api/stats/calendar': { GET }`
- `src/frontend/ui/format.ts` - `formatPercent(fraction)`: `+4.1%`, `−3%`, `±0%`, using the same
  `−` and one decimal as `formatDelta`/`formatNumber`
- `src/frontend/features/stats/`
  - `internal/stats.api.ts`, `stats.facade.ts` - `calendar(month)`
  - `internal/month.ts` - `parseMonth`, `shiftMonth`, `monthGrid`, `formatMonth`
  - `internal/progression.ts` (phase 2) - `progressionLevel`, `PROGRESSION_THRESHOLD = 0.025`
  - `internal/gz-calendar.component.ts` (+ `.css`) - the grid, tiles, dropdowns, legend
  - `gz-stats.component.ts` (+ `.css`) - the `GzView` page
  - `stats.routes.ts` - the `/stats` route with `nav` and `title`

Reused as they are: `GzView` (load/ready/error and `PAGE_TITLE_EVENT`), `navigate`, `todayIso`,
`formatShortDate`, `plural`, the `ot-dropdown` markup, `useServer`/`body`, the workout fixtures
(`createWorkout(post, date)`, `createSet`, `markDone`), `createExercise`.

## Logging & Observability

No new logging; the endpoint goes through the access log like every route, and its 400 carries the
usual `{ error }` body.

## Implementation

### Phase 1: Workout-day calendar

Dependencies: None

Serve the month's workout days and show them on a new Statistics page, with links to each workout.

**Tasks**:

- [x] `src/shared/flavors.ts`: `export type Iso8601Month = Flavor<string, 'Iso8601Month'>; // YYYY-MM`
- [x] `src/shared/dto/stats.ts`:
      ```ts
      export interface CalendarWorkoutDto {
        id: WorkoutId;
        title: string | null;
      }

      export interface CalendarDayDto {
        date: Iso8601Date;
        /** Oldest first. */
        workouts: CalendarWorkoutDto[];
      }

      export interface CalendarMonthDto {
        month: Iso8601Month;
        /** Only days with a workout holding a done set, oldest first. */
        days: CalendarDayDto[];
      }
      ```
- [x] `src/backend/http/http.ts`: `queryMonth(params, key): Iso8601Month`, required (no `optional`
      prefix: a missing value is the same 400)
- [x] `ports/stats.ts`: `CalendarWorkout { id; performed_on; title }`, `CalendarDay { date; workouts: CalendarWorkout[] }`
- [x] `StatsRepository.calendar(month)`: workouts with a done set in the month, grouped into days
      in TypeScript
      ```sql
      SELECT w.id, w.performed_on, w.title
        FROM workouts w
       WHERE w.performed_on >= ?1 AND w.performed_on < date(?1, '+1 month')
         AND EXISTS (SELECT 1 FROM sets s WHERE s.workout_id = w.id AND s.done = 1)
       ORDER BY w.performed_on, w.id
      ```
      binding `${month}-01`
- [x] `StatsFacade.calendar(month)` delegating; `translateToCalendarMonthDto(month, days)`;
      `StatsController.calendar(req)` reading `queryMonth(new URL(req.url).searchParams, 'month')`
      the way the other controllers read their query; route `'/api/stats/calendar': { GET }`
- [x] Frontend `StatsApi.calendar(month)` → `get(`/stats/calendar?month=${month}`)`, `StatsFacade.calendar`
- [x] `internal/month.ts`:
  - `parseMonth(search, today: Iso8601Date): Iso8601Month` — `month` if it matches the backend's
    pattern, else `today.slice(0, 7)`
  - `shiftMonth(month, delta): Iso8601Month` — by calendar arithmetic on year and month, no `Date`
    timezone math
  - `monthGrid(month): (Iso8601Date | null)[]` — leading `null`s up to the first day's Monday-based
    weekday, then every date of the month
  - `formatMonth(month)` — `Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' })`
- [x] `internal/gz-calendar.component.ts` (+ `.css`):
  - properties `month: Iso8601Month`, `days: CalendarDayDto[]`, `today: Iso8601Date`; setting
    `days` re-renders, as `gz-chart`'s `series` does
  - header: outline icon buttons ‹ (`data-action="month" data-month="<previous>"`) and ›
    (disabled when `month` is `today`'s month or later — months compare as strings), the `formatMonth` label between; clicks emit
    `month-change` with the month, since `internal/` components do not navigate
  - weekday row (Mo…Su), then a 7-column grid from `monthGrid`; a day without workouts is a
    `<span class="day">`; one workout is `<a class="day worked" href="/workouts/:id">`; several is
    an `ot-dropdown` with `<button class="day worked" popovertarget="day-<date>">` showing a count
    and `<menu popover id="day-<date>">` of `<a role="menuitem" href="/workouts/:id">` with the
    title or `Workout`
  - each worked tile shows the day number and the marker; today gets `aria-current="date"`
  - CSS: the grid sized so seven tiles fit a phone with the 16px gutter; markers drawn with Oat
    tokens only (`--primary` outline in this phase); no font sizes
- [x] `gz-stats.component.ts` (+ `.css`): `GzView<{ month; calendar }>`, `load()` parses the month
      from `location.search` and calls `statsFacade.calendar`; `<hgroup><h1>Statistics</h1>…`;
      listens for `month-change` and calls `navigate(`/stats?month=${month}`)`; `titleFor` stays
      the route title
- [x] `stats.routes.ts`: a second export, `statisticsRoutes`, holding
      `{ pattern: /^\/stats\/?$/, keys: [], view: lazy gz-stats, title: 'Statistics', nav: { path: '/stats', label: 'Statistics' } }`;
      `app/routes.ts` spreads it after `exercisesRoutes`, since spread order is header order and
      the dashboard in `statsRoutes` must stay first
- [x] `docs/backend.md`: a paragraph on `GET /api/stats/calendar` after the last-session
      paragraph (`docs/backend.md:256`), with its done-set rule and the 400
- [x] `docs/frontend.md`: the `stats` feature now owns the dashboard and the Statistics page; the
      tree at lines 22-23; `gz-calendar` and why month changes go through `navigate()`; the
      "Loading" paragraph if its count of shell routes or files changes

**Automated Verification**:

- [x] `stats.routes.test.ts`: lists the month's days oldest first with their workouts by
      `(performed_on, id)`; leaves out a workout without done sets and workouts in the months
      before and after (including the 1st and the last day as boundaries); 400 for a missing
      `month`, `2026-13`, `2026-1` and `abc`
- [x] `stats.facade.test.ts` (frontend): `calendar('2026-10')` requests `/api/stats/calendar?month=2026-10`
- [x] `internal/month.test.ts`: `parseMonth` default and invalid values; `shiftMonth` across year
      boundaries both ways; `monthGrid` leading blanks for a month starting on Monday (none) and
      on Sunday (six), and lengths for February in a leap and a common year
- [x] `gz-calendar.component.test.ts`: renders the label and 7-column grid; a one-workout day links
      to the workout; a two-workout day renders a dropdown with both links and the count; today
      has `aria-current`; › is disabled on the current month and on a future one; ‹ emits `month-change` with the
      previous month
- [x] `gz-stats.component.test.ts`: loads the current month without `?month`, the given one with
      it, falls back on an invalid one; `month-change` navigates to `/stats?month=…`
- [x] `app/routes.test.ts`: header links are Dashboard, Workouts, Exercises, Statistics; `/stats`
      is titled `Statistics`
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

### Phase 2: Training intensity

Dependencies: Phase 1

Compute each workout's and day's progression and show it on the tiles, in the dropdown and in a
legend.

**Tasks**:

- [x] `shared/dto/stats.ts`: add `progression: number | null` (a fraction, `0.041` = +4.1%) and
      `comparedExerciseCount: number` to `CalendarWorkoutDto` and `CalendarDayDto`, documented as
      "mean of the compared exercises' change against their previous session"
- [x] `ports/stats.ts`: the same fields in snake_case
- [x] `StatsRepository.calendar(month)` switches to one query over all history:
      ```sql
      WITH sessions AS (
        SELECT w.id AS workout_id, w.performed_on, w.title, s.exercise_id,
               SUM(s.reps) AS reps, SUM(s.reps * s.weight) AS volume
          FROM sets s
          JOIN workouts w ON w.id = s.workout_id
         WHERE s.done = 1
         GROUP BY w.id, s.exercise_id
      ), compared AS (
        SELECT *, LAG(reps)   OVER history AS previous_reps,
                  LAG(volume) OVER history AS previous_volume
          FROM sessions
        WINDOW history AS (PARTITION BY exercise_id ORDER BY performed_on, workout_id)
      )
      SELECT workout_id, performed_on, title, reps, volume, previous_reps, previous_volume
        FROM compared
       WHERE performed_on >= ?1 AND performed_on < date(?1, '+1 month')
       ORDER BY performed_on, workout_id
      ```
      and, per row, a module-level `exerciseProgression(row): number | null` —
      `previous_volume === null` → `null`; both `volume` and `previous_volume` > 0 →
      `volume / previous_volume - 1`; otherwise `previous_reps > 0` → `reps / previous_reps - 1`;
      else `null`. Workouts and days average
      their non-null ratios; `compared_exercise_count` counts them
- [x] `translateToCalendarMonthDto` maps the new fields
- [x] `ui/format.ts`: `formatPercent(fraction)` — one decimal, `+`/`−` sign, `±0%` under 0.05%
- [x] `internal/progression.ts`: `type ProgressionLevel = 'up' | 'held' | 'down' | 'none'`,
      `PROGRESSION_THRESHOLD = 0.025`, `progressionLevel(value)`, and one `LEVELS` table of
      `{ icon, label }` (`▲ progressed`, `■ held`, `▼ regressed`, `◌ nothing to compare`) that the
      tiles, the menu and the legend all read
- [x] `gz-calendar.component.ts`: worked tiles carry `data-level="<level>"` and the level's icon;
      `title`/`aria-label` `${formatShortDate(date)}: ${formatPercent(p)} across ${plural(n, 'exercise')}`
      plus `, ${plural(k, 'workout')}` when k > 1, or `…: nothing to compare`; menu items show the
      icon, the title and the workout's `formatPercent`; a `<ul class="legend unstyled">` under the
      grid from `LEVELS`
- [x] `gz-calendar.component.css`: `[data-level='up']` → `--success`, `held` → `--muted`
      background with `--muted-foreground` icon, `down` → `--danger`, `none` → `--primary`
      outline; each paired with its `-foreground` token where it fills; legend spacing; no
      `color-mix()`, no font sizes
- [x] `src/scripts/screenshots.ts`: add `{ name: 'stats', path: '/stats', mobile: false }`; run
      `bun run screenshots` and commit `docs/screenshots/stats-{light,dark}.png`
- [x] `README.md`: a short paragraph in "A look around" — the calendar marks training days and
      whether they progressed — with the `stats` picture
- [x] `docs/backend.md`: how progression is computed (previous session, reps fallback, means over
      exercises, `null`), why it runs over all history, and that it counts done sets only (add it
      to the list of done-set aggregates)
- [x] `docs/frontend.md`: the levels, the threshold living in `progression.ts`, and the legend

**Automated Verification**:

- [x] `stats.routes.test.ts`: a workout whose exercise went 1000 → 1100 volume is `0.1`; two
      exercises at +10% and 0% average to `0.05`; the first session of an exercise is not compared
      and alone gives `null` with `comparedExerciseCount: 0`; the previous session is found in an
      earlier month; skipped sets count in neither session; a bodyweight exercise at 30 → 36 reps
      is `0.2`; bodyweight → weighted and weighted → bodyweight both compare reps (never −100%); two workouts on one day give each its own
      value and the day the mean over all their exercises (not of the two means); two sessions on
      the same date order by id
- [x] `ui/format.test.ts`: `formatPercent` for positive, negative, near-zero and whole values
- [x] `internal/progression.test.ts`: `null` → `none`; `0.025` → `up`; `0.0249` → `held`;
      `-0.025` → `down`; `0` → `held`
- [x] `gz-calendar.component.test.ts`: tiles carry the right `data-level`, icon and `aria-label`;
      the menu shows each workout's %; the legend lists the four levels
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [x] With `bun run seed` data, `/stats` shows the current month with marked days; ‹ and back keep
      the month in the URL; a day opens its workout
- [x] Progressed, held and regressed days are told apart by icon and color, in both themes
- [x] On a phone-width screen the grid fits without horizontal scroll and a multi-workout day's
      menu opens and its links are tappable

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Both phases were implemented in one pass, so the phase-1 repository query was never written on
  its own; `calendar()` went straight to the all-history `LAG()` query.
- The level colors fill a round `.marker` inside each tile rather than the tile itself, so the
  multi-workout `<button>` stays a plain Oat `.ghost` button (no custom button colors).
- `ui/contrast.test.ts` gained `--success-foreground` on `--success` and `--muted-foreground` on
  `--muted`, the two new filled pairs.
- `gz-calendar` also takes `today` as a property, so › and `aria-current` do not read the clock.
- `bun run screenshots` retakes every picture; only the new `stats-{light,dark}.png` are kept, as the
  others changed only by their relative dates.

## References

- `src/backend/features/stats/` — the feature the endpoint joins
- `src/backend/features/exercises/internal/exercise.repository.ts:137-154` — per-session
  aggregates over done sets
- `src/backend/features/workouts/ports/sql.ts:10-12` — the `(performed_on, id)` order of sessions
- `src/backend/http/http.ts:40-62` — query helpers `queryMonth` sits beside
- `src/frontend/features/stats/gz-dashboard.component.ts` — a `GzView` in the same feature
- `src/frontend/ui/pagination/` and `features/workouts/gz-workout-list.component.ts:30-40` — query
  state in the URL, changed through `navigate()`
- `src/frontend/app/gz-header.component.ts` — `ot-dropdown` markup
- `docs/backend.md:245-255` — which aggregates count done sets only
