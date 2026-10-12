---
date: 2026-10-12T14:09:54.548218+00:00
git_commit: a0651e30a799bb2d57007c092b3019032e59983e
branch: main
topic: 'Recent exercise progress on the Statistics page'
tags: [plan, stats, exercises, progression]
status: ready
---

# PLAN: Recent exercise progress on the Statistics page

Add a section to the Statistics page that lists every exercise trained in the last 30 days with
its last three sessions and whether it is progressing, so stalls and regressions stand out at a
glance.

## Acceptance Criteria

- Below the calendar on `/stats`, a "Progress · last 30 days" section lists every exercise with at
  least one done set in a workout dated on or after today − 30 days, by the browser's date; the
  calendar's month does not affect it.
- Each exercise is an `article.card` in a responsive grid (one column on a phone) inside a plain
  `<section>`: the exercise name linking to `/exercises/:id`, its overall marker and %, then its 3
  most recent sessions however old, oldest first.
- A session row shows its date linking to `/workouts/:id`, its done-set volume (weighted) or total
  reps (bodyweight), and its marker and % against the session before it — which may be older than
  the three shown.
- Sessions compare as on the calendar: a weighted exercise compares volume and is not compared
  when either volume is 0; a bodyweight exercise compares total reps; done sets only; sessions
  ordered by `(performed_on, workout id)`.
- The overall value is the newest shown session against the oldest shown one (newest ÷ oldest − 1)
  by the same rule; with one session, or when the rule does not compare them, it is `null`.
- Markers match the calendar: ▲ from +2.5%, ■ within ±2.5%, ▼ from −2.5%, the dashed ring for
  `null`; the exact % sits beside each marker.
- Cards are sorted by overall value ascending (biggest regression first), `null` last, ties by name
  ignoring case.
- With no exercise in the window, the section shows "No exercises in the last 30 days."
- `GET /api/stats/exercises?since=YYYY-MM-DD` answers the list; a missing or malformed `since` is a
  400.
- `docs/backend.md`, `docs/frontend.md` and `README.md` describe the endpoint and the section; the
  stats screenshots are retaken.

## Technical Key Decisions and Tradeoffs

1. **The calendar's metric (user choice A):** volume for weighted, total reps for bodyweight.
   - Why: the section and the calendar never disagree about a session.
   - Impact: `exerciseProgression(row)` in `stats.repository.ts` becomes
     `sessionChange(bodyweight, current, previous)`, used by both queries.
2. **Overall = net change across the shown window (user choice A):** newest of the three against
   the oldest.
   - Why: answers "am I better than three sessions ago" and survives one bad session in between.
   - Impact: computed in TypeScript from the window's ends, not from the per-session values.
3. **The 30 days select exercises; sessions are the last three overall (user choice A):**
   - Why: an exercise trained every other week still shows a trend.
   - Impact: one query over all history — the calendar's sessions CTE, `LAG()` for each session's
     predecessor and `ROW_NUMBER()` newest first, filtered to `recency <= 3` and to exercises with
     a session on or after `since`. The CTE becomes one shared constant for both queries.
4. **`since` comes from the browser and is required (user choice A):**
   - Why: the server runs in UTC; the calendar requires `month` for the same reason.
   - Impact: `queryDate()` beside `queryMonth()` in `http.ts`, validating through an `isIsoDate()`
     extracted from `requiredDate()`; the frontend computes `since` with `daysBefore(todayIso(), 30)`,
     the same span as the dashboard's `date('now', '-30 day')`.
5. **Card grid below the calendar (user choice A):** `article.card`s in a plain `<section>`, never
   nested in the calendar's card.
   - Why: built for the phone; a table would scroll sideways.
6. **Biggest regression first (user choice A), sorted by the backend:**
   - Why: stalls are what to act on; the order is part of the answer and tested there.
   - Impact: the frontend renders in the order received.
7. **The backend computes fractions, the frontend buckets them:** as for the calendar, through
   `progressionLevel()` and `LEVELS`.
   - Impact: the marker moves out of `gz-calendar` into a small `gz-progress-marker` element in
     `stats/internal/` with its own CSS, so both components share it instead of copying it across
     their shadow roots.
8. **One phase:** the endpoint without the section, or the section without indicators, is not
   useful on its own.

## Current State

```
/stats?month=YYYY-MM   gz-stats
 ├─ parseMonth(location.search, todayIso())
 ├─ statsFacade.calendar(month) ─▶ GET /api/stats/calendar?month=…
 │     StatsRepository.calendar()               stats.repository.ts:86
 │       sessions CTE ─▶ LAG() per exercise ─▶ month filter
 │       exerciseProgression(row)               stats.repository.ts:31
 └─ gz-calendar (internal/)
       marker(level) ─▶ <span class="marker" data-level>   gz-calendar.component.ts:13
       .marker CSS                                        gz-calendar.component.css:84-113
```

- `progressionLevel()`, `LEVELS`, `PROGRESSION_LEVELS`, `PROGRESSION_THRESHOLD` in
  `src/frontend/features/stats/internal/progression.ts`.
- `formatPercent`, `formatVolume`, `formatShortDate`, `plural`, `todayIso` in `src/frontend/ui/format.ts`.
- `queryMonth()` in `src/backend/http/http.ts:65`; `requiredDate()` with its private `ISO_DATE` in
  `src/backend/shared/validate.ts:4,111`.
- `gz-stats` loads only the calendar (`gz-stats.component.ts:32-36`); its test answers only
  `/api/stats/calendar` (`gz-stats.component.test.ts:17-20`) and asserts the request list exactly
  (`:33,39,47`); `useFetch` answers an unregistered request with `{}` (`src/frontend/testing.ts:46,59`).

## Desired End State

```
/stats?month=YYYY-MM   gz-stats
 ├─ Promise.all
 │   ├─ statsFacade.calendar(month)
 │   └─ statsFacade.recentExercises(daysBefore(today, 30))
 │         ─▶ GET /api/stats/exercises?since=YYYY-MM-DD
 │              StatsRepository.recentExercises(since)
 │                COMPARED_SESSIONS_SQL (shared with calendar)
 │                ─▶ recency <= 3, exercise has a session >= since
 │                ─▶ group per exercise, sessionChange(), overall, sort
 ├─ gz-calendar           ─┐
 └─ gz-exercise-progress  ─┴─ gz-progress-marker level="up|held|down|none"
```

The page:

```
Statistics
Your training month by month.

┌──────────────────────────────────────────────┐
│ [‹]          October 2026              [›]   │
│  … calendar grid and legend as today …       │
└──────────────────────────────────────────────┘

Progress · last 30 days
┌───────────────────────────────┐ ┌───────────────────────────────┐
│ Overhead Press      ▼  −6.1%  │ │ Pull-up             ▲  +3.1%  │
│ Sep 15   1 230 kg   ■  +1.0%  │ │ Sep 24   32 reps    ▼  −3.0%  │
│ Sep 29   1 200 kg   ■  −2.4%  │ │ Oct  1   31 reps    ■  −3.1%  │
│ Oct  6   1 155 kg   ▼  −3.8%  │ │ Oct  8   33 reps    ▲  +6.5%  │
└───────────────────────────────┘ └───────────────────────────────┘
┌───────────────────────────────┐ ┌───────────────────────────────┐
│ Bench Press         ▲  +8.0%  │ │ Lunge               ◌         │
│ Sep 22   2 400 kg   ▲  +4.3%  │ │ Oct 10     960 kg   ◌         │
│ Sep 29   2 450 kg   ■  +2.1%  │ └───────────────────────────────┘
│ Oct  6   2 592 kg   ▲  +5.8%  │
└───────────────────────────────┘
```

- The exercise name links to `/exercises/:id`, each date to `/workouts/:id`.
- Each marker and its % sit in one `<span class="change" role="img">` carrying the `title` and
  `aria-label` (the marker itself is `aria-hidden`): overall
  `+8.0% over the last ${plural(n, 'session')}` (`… 2 sessions` when only two exist) or
  `nothing to compare`; a session's `+4.3% against the session before` or `nothing to compare`.
- On a phone the grid is one column.
- With nothing in the window: `No exercises in the last 30 days.`

## Abstractions and Code Reuse

- `src/shared/dto/stats.ts`
  - `RecentSessionDto { workoutId; performedOn; reps; volume; progression: number | null }`
  - `RecentExerciseDto { id: ExerciseId; name; bodyweight: boolean; progression: number | null; sessions: RecentSessionDto[] }` — sessions oldest first, at most 3
  - `RecentExercisesDto { since: Iso8601Date; exercises: RecentExerciseDto[] }` — biggest regression first
- `src/backend/shared/validate.ts` - export `isIsoDate(value)`, used by `requiredDate()`
- `src/backend/http/http.ts` - `queryDate(params, key): Iso8601Date`, required, 400
  `"since" must be a date in YYYY-MM-DD format`
- `src/backend/features/stats/`
  - `ports/stats.ts` - `RecentSession`, `RecentExercise` (snake_case)
  - `internal/stats.repository.ts`
    - `COMPARED_SESSIONS_SQL` - the shared `sessions` + `compared` CTEs, now with `name` and `recency`
    - `sessionChange(bodyweight, current, previous)` - replaces `exerciseProgression`
    - `StatsRepository.calendar()` - built on the shared CTE, behavior unchanged
    - `StatsRepository.recentExercises(since)` - new
  - `stats.facade.ts` - `recentExercises(since)`
  - `internal/stats.translator.ts` - `translateToRecentExercisesDto(since, exercises)`
  - `internal/stats.controller.ts` - `recentExercises(req)`
  - `stats.routes.ts` - `'/api/stats/exercises': { GET }`
- `src/frontend/features/stats/`
  - `internal/stats.api.ts`, `stats.facade.ts` - `recentExercises(since)`
  - `internal/dates.ts` - `daysBefore(date, days)`, `RECENT_DAYS = 30`
  - `internal/gz-progress-marker.component.ts` (+ `.css`) - the marker, from `gz-calendar`
  - `internal/gz-calendar.component.ts` (+ `.css`) - uses `gz-progress-marker`, loses `.marker` CSS
  - `internal/gz-exercise-progress.component.ts` (+ `.css`) - the section
  - `gz-stats.component.ts` (+ `.css`) - loads both, renders the section

Reused as they are: `progressionLevel`, `LEVELS`, `formatPercent`, `formatVolume`,
`formatShortDate`, `plural`, `todayIso`, `GzElement`, `useServer`/`body`, `createExercise`,
`createWorkout`, `createSet`, `markDone`, the calendar test's `session()` helper.

## Logging & Observability

No new logging; the endpoint goes through the access log like every route, and its 400 carries the
usual `{ error }` body.

## Implementation

Dependencies: None

**Tasks**:

- [x] `src/shared/dto/stats.ts`: the three DTOs above; `progression` documented as a fraction
      (`0.041` = +4.1%) — on a session against the session before it, on an exercise the newest
      shown session against the oldest
- [x] `src/backend/shared/validate.ts`: export `isIsoDate(value: string): boolean`
      (`ISO_DATE.test(value) && !Number.isNaN(Date.parse(value))`); `requiredDate()` uses it
- [x] `src/backend/http/http.ts`: `queryDate(params, key): Iso8601Date` beside `queryMonth`
- [x] `ports/stats.ts`:
      ```ts
      export interface RecentSession {
        workout_id: WorkoutId;
        performed_on: Iso8601Date;
        reps: number;
        volume: number;
        progression: number | null;
      }

      export interface RecentExercise {
        id: ExerciseId;
        name: string;
        bodyweight: 0 | 1;
        progression: number | null;
        sessions: RecentSession[];
      }
      ```
- [x] `stats.repository.ts`: one module-level `COMPARED_SESSIONS_SQL`:
      ```sql
      WITH sessions AS (
        SELECT w.id AS workout_id, w.performed_on, w.title, s.exercise_id, e.name, e.bodyweight,
               SUM(s.reps) AS reps, SUM(s.reps * s.weight) AS volume
          FROM sets s
          JOIN workouts w  ON w.id = s.workout_id
          JOIN exercises e ON e.id = s.exercise_id
         WHERE s.done = 1
         GROUP BY w.id, s.exercise_id
      ), compared AS (
        SELECT *, LAG(reps)   OVER history AS previous_reps,
                  LAG(volume) OVER history AS previous_volume,
                  ROW_NUMBER() OVER (PARTITION BY exercise_id ORDER BY performed_on DESC, workout_id DESC) AS recency
          FROM sessions
        WINDOW history AS (PARTITION BY exercise_id ORDER BY performed_on, workout_id)
      )
      ```
      `calendar()` appends its existing `SELECT … FROM compared WHERE …` to it, unchanged
- [x] `stats.repository.ts`: `sessionChange(bodyweight, current: { reps; volume }, previous: { reps; volume } | null): number | null`
      — `null` without `previous`; bodyweight → `current.reps / previous.reps - 1`
      (`null` when `previous.reps` is 0); weighted → `current.volume / previous.volume - 1` when
      both are > 0, else `null`. `calendar()` calls it with the row's `previous_*` columns
      (both `null` → no previous)
- [x] `StatsRepository.recentExercises(since)`:
      ```sql
      ${COMPARED_SESSIONS_SQL}
      SELECT exercise_id, name, bodyweight, workout_id, performed_on, reps, volume, previous_reps, previous_volume
        FROM compared
       WHERE recency <= 3
         AND exercise_id IN (SELECT exercise_id FROM sessions WHERE performed_on >= ?1)
       ORDER BY exercise_id, performed_on, workout_id
      ```
      grouped per exercise in TypeScript; each session's `progression` from `sessionChange` against
      its `previous_*`; the exercise's from `sessionChange(bodyweight, newest, oldest)` when it has
      at least two sessions, else `null`; sorted by `progression` ascending, `null` last, then
      `name.localeCompare(other, undefined, { sensitivity: 'base' })`
- [x] `StatsFacade.recentExercises(since)` delegating; `translateToRecentExercisesDto(since, exercises)`
      (`bodyweight === 1`); `StatsController.recentExercises(req)` reading
      `queryDate(new URL(req.url).searchParams, 'since')`; route `'/api/stats/exercises': { GET }`
- [x] Frontend `StatsApi.recentExercises(since)` → `get(`/stats/exercises?since=${since}`)`;
      `StatsFacade.recentExercises(since)`
- [x] `internal/dates.ts`: `export const RECENT_DAYS = 30`; `daysBefore(date, days): Iso8601Date`
      by `Date.UTC` arithmetic on the parts, so no local timezone enters
- [x] `internal/gz-progress-marker.component.ts` (+ `.css`): observes `level`, renders
      `<span class="marker" data-level="…" aria-hidden="true">${LEVELS[level].icon}</span>` through
      `progressionLevel`'s `ProgressionLevel` (an unknown `level` renders `none`); the `.marker`
      rules move here from `gz-calendar.component.css`, with `:host { display: inline-flex; }`
- [x] `gz-calendar.component.ts`: `marker(level)` renders `<gz-progress-marker level="${level}">`
      and imports the component; `gz-calendar.component.css` drops the `.marker` block
- [x] `internal/gz-exercise-progress.component.ts` (+ `.css`): property
      `exercises: RecentExerciseDto[]` re-rendering when connected, as `gz-calendar.days` does;
      template — `<section class="vstack gap-2">` with `<h2>Progress · last 30 days</h2>` and either
      `<p class="empty" data-testid="empty">No exercises in the last 30 days.</p>` or a
      `<div class="cards">` of `<article class="card" data-testid="exercise" data-id="…">`: a header
      row with `<a href="/exercises/:id">name</a>`, the marker and the `formatPercent` (empty for
      `null`), then a list of sessions — `<a href="/workouts/:id">formatShortDate</a>`, the value
      (`plural(reps, 'rep')` for bodyweight, `formatVolume(volume)` otherwise), marker and %; each
      marker and % wrapped in `<span class="change" role="img">` with the `title`/`aria-label`s
      from the Desired End State; CSS: `.cards` a grid of
      `repeat(auto-fill, minmax(min(100%, 16rem), 1fr))`, tabular numbers, `--muted-foreground` for
      dates and %, no font sizes, no `color-mix()`
- [x] `gz-stats.component.ts`: `StatsData` gains `recent: RecentExercisesDto`; `load()` fetches both
      with `Promise.all`, `since = daysBefore(today, RECENT_DAYS)`; `afterRender()` sets
      `exercises` on `gz-exercise-progress`; the template adds
      `<gz-exercise-progress data-testid="progress">` after the calendar; `loadingText` becomes
      `Loading your statistics…`
- [x] `docs/backend.md`: a paragraph after the calendar one (`docs/backend.md:275-292`) on
      `GET /api/stats/exercises?since=…` — selection by `since`, last three sessions over all
      history, per-session and overall values by the calendar's rule, the order, the 400, and that
      the shared CTE serves both; add "the recent exercises' sessions" to the done-set list
      (`docs/backend.md:255-259`)
- [x] `docs/frontend.md`: the `stats/internal/` line of the tree (`docs/frontend.md:23`) gains
      `gz-exercise-progress`, `gz-progress-marker`, `dates.ts`; in the Statistics paragraph
      (`docs/frontend.md:371-388`) the markers are now `gz-progress-marker` elements shared with the
      section; a paragraph after it — the section, `since` from the browser's date, the shared
      marker element, the order coming from the API; in the export paragraph
      (`docs/frontend.md:480-483`) `GzExerciseProgressComponent` joins the exported components
      (`gz-stats` types it) and "the other six components" becomes seven (`gz-progress-marker`
      stays private)
- [x] `README.md`: extend the calendar sentence (`README.md:30`) — "…and below it every exercise of
      the last 30 days shows whether its last three sessions are trending up"; alt text of the
      picture mentions the section
- [x] Run `bun run screenshots`; keep only `docs/screenshots/stats-{light,dark}.png`, as the calendar
      plan did

**Automated Verification**:

- [x] `stats.routes.test.ts`, new `describe('stats recent exercises')`, reusing a `session()` helper:
  - [x] lists an exercise with a session on `since` and leaves out one whose last session is the
        day before
  - [x] shows the three newest sessions oldest first when an exercise has five, even when the
        older two of the three lie before `since`
  - [x] each session's `progression` compares against the session before it, including the oldest
        shown against a fourth, unshown one; the very first session ever is `null`
  - [x] the exercise's `progression` is newest ÷ oldest − 1 (2400 → 2592 volume is `0.08`); one
        session gives `null`
  - [x] a bodyweight exercise compares reps; a weighted one with a 0-volume session gives `null`
        there, never −100%
  - [x] sets not done count in no session
  - [x] order: most negative first, `null` last, equal values by name ignoring case
  - [x] 400 for a missing `since`, `2026-1-05`, `2026-13-01` and `abc`
- [x] The existing calendar tests in `stats.routes.test.ts` pass unchanged on the shared CTE
- [x] `src/backend/http/http.test.ts`: `queryDate` accepts a date and rejects missing and
      malformed values
- [x] `src/backend/shared/validate.test.ts`: `isIsoDate` accepts `2026-10-12` and rejects
      `2026-1-05`, `2026-13-01` and `abc`; the `requiredDate` cases still pass
- [x] `stats.facade.test.ts` (frontend): `recentExercises('2026-09-12')` requests
      `/api/stats/exercises?since=2026-09-12`
- [x] `internal/dates.test.ts`: `daysBefore` within a month, across a month, across a year and
      across Feb 29 of a leap year
- [x] `internal/gz-progress-marker.component.test.ts`: each level renders its `data-level` and icon;
      an unknown `level` renders `none`
- [x] `gz-calendar.component.test.ts`: the icon now lives in the marker's own shadow root, so
      three tests are rewritten to assert `gz-progress-marker`'s `level` attribute plus the text
      beside it — the tile marker case (`:84-93`), the menu items (`:72-75`, `▲ Push day …`) and
      the legend (`:106`, `'▲progressed'`); the other cases pass unchanged
- [x] `internal/gz-exercise-progress.component.test.ts`: renders cards in the given order with the
      name linking to the exercise; each session row links to its workout and shows `kg` volume
      (fixture volumes under 10 000, where `formatVolume` switches to `t`) or `reps`; the overall
      label reads `over the last 2 sessions` for an exercise with two; the overall and session markers carry the right level, % and `aria-label`; a `null`
      shows the ring with no % and "nothing to compare"; an empty list shows the empty text
- [x] `gz-stats.component.test.ts`: `answer()` always also registers
      `GET /api/stats/exercises?since=${daysBefore(todayIso(), RECENT_DAYS)}` with
      `{ since, exercises: [] }` (an unregistered request would answer `{}` and break the render);
      the three exact request-list assertions (`:33,39,47`) expect both URLs; a new case answers
      one exercise and finds its card in the section
- [x] `bun test --parallel`
- [x] `bun run typecheck`
- [x] `bun run lint`
- [x] `bun run fmt:check`

**Manual Verification**:

- [ ] With `bun run seed` data, `/stats` shows the section below the calendar with the regressing
      exercises first, and the links open the exercise and the workout
- [ ] Markers and % read clearly in both themes, and the calendar's markers look as before
- [ ] On a phone-width screen the cards stack in one column without horizontal scroll

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `meta.routes.test.ts` (`/apix` content type) fails intermittently under `bun test --parallel` and
  passes alone; unrelated to this change, left as found.

## References

- `docs/agents/plans/2026-10-12-statistics-calendar.md` — the calendar and its progression rule
- `docs/agents/plans/2026-10-12-bodyweight-exercises.md` — the bodyweight comparison by reps
- `src/backend/features/stats/internal/stats.repository.ts` — `calendar()` and `exerciseProgression`
- `src/frontend/features/stats/internal/progression.ts` — levels and threshold
- `src/frontend/features/stats/internal/gz-calendar.component.ts` (+ `.css`) — the marker to share
- `src/frontend/features/exercises/gz-muscle-group-icon.component.ts` — an attribute-driven element
- `src/frontend/features/stats/gz-dashboard.component.ts` — `Promise.all` in a `GzView` load
- `docs/backend.md:255-292`, `docs/frontend.md:23,371-388,482` — sections to extend
