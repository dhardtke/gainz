# gainz

A small, self-hosted log for weight-lifting progress: workouts, the sets you did,
and the reps, weight and notes for each one.

- **Backend** — [Bun](https://bun.sh) serving a REST API over SQLite (`bun:sqlite`).
- **Frontend** — custom elements and ES modules. No framework, no build step,
  no third-party dependencies; the browser loads the files as they are on disk.

## Quick start

```sh
bun install          # dev dependencies only (TypeScript types)
bun run seed         # optional: a few weeks of sample history
bun start            # http://localhost:3000
```

| Script             | What it does                                    |
| ------------------ | ----------------------------------------------- |
| `bun start`        | Serves the API and the frontend on `PORT`(3000) |
| `bun run dev`      | Same, restarting on file changes                |
| `bun run seed`     | Fills an empty database with sample workouts    |
| `bun test`         | Runs the API test suite against in-memory SQLite|
| `bun run typecheck`| Type-checks the backend                         |

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`) and is
created on first run. It is git-ignored — the log is your data, not source.

## Using it

- **Dashboard** — totals, the last 30 days, and the most recent sessions.
- **Workouts** — one entry per session. Open one to log sets: pick the exercise,
  type weight and reps, hit *Log set*. The form keeps the last values so a
  second set of the same thing is one keystroke away, `+1` duplicates a set
  outright, and *Repeat* on the workout list copies a whole session to today.
- **Exercises** — the catalogue. Each one has a progress page charting estimated
  1RM, top set, or session volume over time.

Weights are stored as plain numbers and displayed in kilograms; to switch the
whole UI to pounds, change `UNIT` in `public/js/format.js`.

Estimated 1RM uses the Epley formula (`weight × (1 + reps / 30)`), which puts
sets of different rep counts on one comparable scale.

## Layout

```
src/
  db.ts        SQLite connection and schema
  repo.ts      All SQL, one method per operation
  routes.ts    The REST route table
  validate.ts  Request-field parsing and limits
  http.ts      JSON responses and HttpError
  server.ts    Bun.serve, static files, entry point
  seed.ts      Sample data
public/
  index.html   The only page
  styles.css   Design tokens (light and dark) on :root
  js/
    base.js          GzElement: shadow root, escaping `html` tag, event delegation
    api.js           fetch wrapper for the REST API
    router.js        Hash router
    format.js        Dates, weights, volumes
    shared-styles.js One stylesheet adopted by every component
    components/      gz-app, gz-dashboard, gz-workout-list, gz-workout-detail,
                     gz-set-row, gz-exercise-list, gz-exercise-detail,
                     gz-chart, gz-stat-tile, gz-toast
test/
  api.test.ts  End-to-end tests over a real server on an in-memory database
```

Every component renders through the `html` tagged template in `base.js`, which
escapes interpolated values — notes and exercise names are safe to display.

## REST API

All endpoints live under `/api` and speak JSON. Errors come back as
`{ "error": "..." }` with a 400 (bad input), 404 (missing), or 409 (conflict).

### Exercises

| Method   | Path                          | Notes                                             |
| -------- | ----------------------------- | ------------------------------------------------- |
| `GET`    | `/api/exercises`              | With set counts, last performed date, best weight |
| `POST`   | `/api/exercises`              | `{ name, muscle_group?, notes? }`; names are unique (case-insensitive) |
| `GET`    | `/api/exercises/:id`          |                                                   |
| `PATCH`  | `/api/exercises/:id`          | Only the fields you send are changed              |
| `DELETE` | `/api/exercises/:id`          | 409 while any set still references it             |
| `GET`    | `/api/exercises/:id/progress` | `{ exercise, sessions[], best_set }`              |

### Workouts

| Method   | Path                       | Notes                                                     |
| -------- | -------------------------- | --------------------------------------------------------- |
| `GET`    | `/api/workouts`            | `?limit=&offset=` → `{ items, total, limit, offset }`      |
| `POST`   | `/api/workouts`            | `{ performed_on?, title?, notes?, copy_from_workout_id? }` |
| `GET`    | `/api/workouts/:id`        | Includes the session's `sets`                              |
| `PATCH`  | `/api/workouts/:id`        |                                                            |
| `DELETE` | `/api/workouts/:id`        | Cascades to its sets                                       |
| `GET`    | `/api/workouts/:id/sets`   |                                                            |
| `POST`   | `/api/workouts/:id/sets`   | `{ exercise_id, reps, weight, notes?, position? }`         |

### Sets and stats

| Method   | Path                  |
| -------- | --------------------- |
| `GET`    | `/api/sets/:id`       |
| `PATCH`  | `/api/sets/:id`       |
| `DELETE` | `/api/sets/:id`       |
| `GET`    | `/api/stats/summary`  |
| `GET`    | `/api/health`         |

`performed_on` is a `YYYY-MM-DD` calendar date and defaults to today.

## Data model

```
exercises ──< sets >── workouts
```

`sets` is the fact table: one row per set performed, carrying `reps`, `weight`,
free-text `notes`, and a `position` that preserves the order within a session.
Deleting a workout deletes its sets; deleting an exercise is refused while any
set still points at it, so history cannot silently lose its meaning.

## Notes

The server binds to all interfaces and has no authentication — it is built to run
on your own machine or inside a private network. Put it behind a reverse proxy
with auth before exposing it to the internet.
