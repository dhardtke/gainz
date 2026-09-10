# gainz

A small, self-hosted log for weight-lifting progress: workouts, the sets you did,
and the reps, weight and notes for each one.

- **Backend** — [Bun](https://bun.sh) serving a REST API over SQLite (`bun:sqlite`).
- **Frontend** — TypeScript custom elements and ES modules styled with
  [Pico CSS](https://picocss.com). No framework and no build step: there is no
  bundler, no output directory and nothing to keep in sync — the server erases
  the types as it hands each file over, one module per request.

## Quick start

Requires [Bun](https://bun.sh) 1.4 or newer.

```sh
bun install          # Pico CSS, plus TypeScript types for development
bun run seed         # optional: a few weeks of sample history
bun start            # http://localhost:3000
```

| Script              | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `bun start`         | Serves the API and the frontend on `PORT`(3000)  |
| `bun run dev`       | Same, restarting on file changes                 |
| `bun run seed`      | Fills an empty database with sample workouts     |
| `bun run migrate`   | Applies pending schema migrations, then exits    |
| `bun test`          | Runs the API test suite against in-memory SQLite |
| `bun run typecheck` | Type-checks the backend and the frontend         |

The database lives at `data/gainz.sqlite` (override with `GAINZ_DB`) and is
created on first run. It is git-ignored — the log is your data, not source. Its
schema comes from the numbered `.sql` files in `migrations/`, which the server
applies on startup; `bun run migrate` does the same without booting the server.

### Dependencies

Every dependency is pinned to an exact version in `package.json` — no `^` or
`~` ranges — so an install resolves the same tree on any machine and upgrades
only ever happen deliberately. `bunfig.toml` sets `install.exact`, which keeps
a later `bun add` from writing a caret range and undoing that.

`engines.bun` records the required runtime, but note that Bun does not enforce
the field on install: it documents the requirement rather than gating it.

## Using it

- **Dashboard** — totals, the last 30 days, and the most recent sessions.
- **Workouts** — one entry per session. Open one to log sets: pick the exercise,
  type weight and reps, hit _Log set_. The form keeps the last values so a
  second set of the same thing is one keystroke away, `+1` duplicates a set
  outright, and _Repeat_ on the workout list copies a whole session to today.
- **Exercises** — the catalogue. Each one has a progress page charting estimated
  1RM, top set, or session volume over time.

- **Theme** — the header carries a light/dark switch. It starts where the
  operating system points; a choice is remembered in `localStorage` and applied
  before the first paint, so it never flashes the wrong theme on load.

Weights are stored as plain numbers and displayed in kilograms; to switch the
whole UI to pounds, change `UNIT` in `public/js/format.ts`.

Estimated 1RM uses the Epley formula (`weight × (1 + reps / 30)`), which puts
sets of different rep counts on one comparable scale.

## Layout

```
migrations/
  001-initial-schema.sql  Numbered DDL, applied in order on startup
src/
  db.ts        SQLite connection and PRAGMAs
  migrations.ts  The migration runner
  migrate.ts   `bun run migrate` entry point
  repo/
    index.ts     The Repo facade — one flat surface, no SQL
    sql.ts       Shared fragments and the dynamic UPDATE builder
    exercises.ts Exercise queries
    workouts.ts  Workout queries
    sets.ts      Set queries
    stats.ts     The dashboard summary
  routes.ts    The registry — spreads the route files into one table
  routes/
    shared.ts    RouteTable, guardAll and the shared field limits
    meta.routes.ts     /api/health and the /api catch-all
    stats.routes.ts    The dashboard summary endpoint
    exercise.routes.ts Exercise endpoints, including progress
    workout.routes.ts  Workout endpoints, including a workout's sets
    set.routes.ts      Set endpoints
  validate.ts  Request-field parsing and limits
  http.ts      JSON responses and HttpError
  transpile.ts Erases types from a frontend module on its way to the browser
  server.ts    Bun.serve, static files, entry point
  seed.ts      Sample data
public/
  index.html   The only page
  css/
    app.css      Document-level styles
    shared.css   Layout utilities adopted by every component
  components/    One directory per custom element, holding its script and the
                 stylesheet named after its tag — gz-app/gz-app.ts beside
                 gz-app/gz-app.css, and the same shape for gz-dashboard,
                 gz-workout-list, gz-workout-detail, gz-set-row,
                 gz-exercise-list, gz-exercise-detail, gz-chart, gz-stat-tile,
                 gz-toast, gz-theme-toggle
  js/
    base.ts      GzElement: shadow root, escaping `html` tag, event delegation
    styles.ts    Fetches CSS into constructable stylesheets, per component
    theme.ts     Light/dark preference, stored and mirrored onto hosts
    api.ts       fetch wrapper for the REST API
    router.ts    Hash router
    format.ts    Dates, weights, volumes
    types.ts     The shapes the API returns; erased before the browser sees it
test/
  helpers/server.ts  useServer(): a real server on an in-memory database, per file
  meta.api.test.ts     Health, unknown endpoints, stats, request bodies
  static.api.test.ts   Static files, the vendor allowlist, TypeScript modules
  exercise.api.test.ts Exercises and progress
  workout.api.test.ts  Workouts
  set.api.test.ts      Sets
  migrate.test.ts  Unit tests for the migration runner
```

Every component renders through the `html` tagged template in `base.ts`, which
escapes interpolated values — notes and exercise names are safe to display.

## Styling

Pico CSS provides the typography, colours, form controls, tables and the
light/dark themes; hand-written CSS is a thin layer on top of it, built from
Pico's own `--pico-*` custom properties so it follows the active theme.

Selectors are written with native CSS nesting: a rule that would repeat a
prefix — `.workout`, `.workout:hover`, `.workout a` — nests instead, so each
block reads as one component and the media queries that only adjust it sit
inside it. There is no preprocessor, so this is the browser's own nesting and
`&` is always written explicitly.

**No stylesheet here declares a font size.** Body text is one size everywhere
and headings come from Pico's scale; emphasis is weight and colour. Two rules
exist only to make that hold:

- `app.css` pins `--pico-font-size` to `100%`. Pico otherwise grows the root
  font with the viewport, up to `131.25%` on a wide screen.
- `shared.css` sets `font-size: inherit` on `:host`. Pico applies
  `font-size: var(--pico-font-size)` to `:host, :root`, which is written to
  land once at the document root — but every component adopts Pico, so the
  percentage re-applied at each shadow host and _multiplied_ with nesting.
  `gz-app > gz-dashboard > gz-stat-tile` reached 39px from a 20px root.

For the same reason `gz-chart` draws only geometry in SVG and positions its
axis labels as HTML over the plot: a font size inside a `viewBox` is measured
in user units, so the browser scales the lettering with the chart instead of
matching the page.

No CSS lives in JavaScript. Each custom element owns a directory holding its
script and the stylesheet named after its tag — `<gz-chart>` is
`public/components/gz-chart/gz-chart.ts` beside `gz-chart.css` — which
`js/styles.ts` fetches once into a `CSSStyleSheet` and every instance adopts by
reference. Adding a component means creating `public/components/<tag>/` with
both files and ending the module with `await define("<tag>", TheClass)`; there
is no manifest to register it in.

That `await` is load-bearing — see **Loading** below.

Shadow roots do not inherit document stylesheets, so Pico is adopted into each
one as well as linked in `index.html`. Pico 2 ships `:host` selectors alongside
its `:root` ones, so its variables and both themes work inside a shadow root
unchanged.

### Loading

The frontend is TypeScript on disk and JavaScript on the wire. `src/transpile.ts`
runs each module through `Bun.Transpiler` as it is requested — around 76 µs per
file, the whole frontend in under two milliseconds — and `serveStatic` hands the
result back as `text/javascript`. Nothing is written to disk and nothing is
bundled: a URL still names one file, `import "./format.ts"` still asks for the
file of that name, and editing a module and reloading is the whole edit loop.

The transpiler **erases types without checking them**, and throws only when a
file will not parse. A type error transpiles happily and ships;
`bun run typecheck` is the gate that catches it. A file that does not parse
comes back as a 500 naming it, which the toast then reports.

A route's script and stylesheet arrive the first time that route is opened, and
never otherwise. Opening the dashboard fetches five component scripts and five
stylesheets; the chart is downloaded only once you open an exercise.

Two pieces make that safe. `define()` in `base.ts` awaits the component's
stylesheet before registering the element, and every component module `await`s
its own `define()` at the top level. Because a top-level await blocks the
modules that import it, `await import("…/gz-exercise-detail.ts")` in `gz-app`
resolves only when that view _and_ everything it renders — the chart, the stat
tiles — have their scripts and their CSS. So a lazily loaded page is fully
styled on its first paint; there is no flash to guard against.

Only the shell (`gz-app`, `gz-toast`, `gz-theme-toggle`) and Pico plus
`shared.css` load up front. `gz-app` keeps the outgoing view on screen while the
next one loads, guards against two navigations resolving out of order, and
reports a failed import through the toast.

One rule this depends on: **a component that a view renders inside itself must
stay a static import in that view's module.** `gz-workout-detail` writes
`<gz-set-row>` elements and then assigns properties to them; if the row's class
were not yet defined, those assignments would land on an un-upgraded element and
permanently shadow the class accessors, leaving the row blank with no error.
Only the five route views in `gz-app`'s `VIEWS` table are loaded dynamically.

### Theming

`js/theme.ts` holds the preference and mirrors it onto `<html>`; `base.ts`
mirrors it onto every component host too, because Pico can only reach a shadow
root through `:host`. There are two states, and one Pico rule covers each:

| Host `data-theme` | Rule that matches                                                                                            | Result                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- |
| `light`           | `:host(:not([data-theme=dark]))`                                                                             | forced light                                    |
| `dark`            | none — Pico only ships a bare `[data-theme=dark]`, which cannot match a host from inside its own shadow root | colours inherit from `<html data-theme="dark">` |

The second row works because custom properties inherit and Pico's base
`:host,:root` block sets no colours, only typography and spacing. Any component
added later gets this for free from `GzElement`.

A visitor who has never touched the switch is seeded from `prefers-color-scheme`
once, at load. The first flip stores an explicit choice that wins from then on,
so the page does not follow the operating system around afterwards.

Pico is served from `node_modules` at `/vendor/pico.css` through an explicit
one-file allowlist in `src/server.ts` — installing a package never publishes
anything the app did not ask to serve. The build is the `pico.orange` theme;
swapping themes is a one-line change to `VENDOR_FILES`.

## REST API

All endpoints live under `/api` and speak JSON. Errors come back as
`{ "error": "..." }` with a 400 (bad input), 404 (missing), or 409 (conflict).

### Exercises

| Method   | Path                          | Notes                                                                  |
| -------- | ----------------------------- | ---------------------------------------------------------------------- |
| `GET`    | `/api/exercises`              | With set counts, last performed date, best weight                      |
| `POST`   | `/api/exercises`              | `{ name, muscle_group?, notes? }`; names are unique (case-insensitive) |
| `GET`    | `/api/exercises/:id`          |                                                                        |
| `PATCH`  | `/api/exercises/:id`          | Only the fields you send are changed                                   |
| `DELETE` | `/api/exercises/:id`          | 409 while any set still references it                                  |
| `GET`    | `/api/exercises/:id/progress` | `{ exercise, sessions[], best_set }`                                   |

### Workouts

| Method   | Path                     | Notes                                                      |
| -------- | ------------------------ | ---------------------------------------------------------- |
| `GET`    | `/api/workouts`          | `?limit=&offset=` → `{ items, total, limit, offset }`      |
| `POST`   | `/api/workouts`          | `{ performed_on?, title?, notes?, copy_from_workout_id? }` |
| `GET`    | `/api/workouts/:id`      | Includes the session's `sets`                              |
| `PATCH`  | `/api/workouts/:id`      |                                                            |
| `DELETE` | `/api/workouts/:id`      | Cascades to its sets                                       |
| `GET`    | `/api/workouts/:id/sets` |                                                            |
| `POST`   | `/api/workouts/:id/sets` | `{ exercise_id, reps, weight, notes?, position? }`         |

### Sets and stats

| Method   | Path                 |
| -------- | -------------------- |
| `GET`    | `/api/sets/:id`      |
| `PATCH`  | `/api/sets/:id`      |
| `DELETE` | `/api/sets/:id`      |
| `GET`    | `/api/stats/summary` |
| `GET`    | `/api/health`        |

`performed_on` is a `YYYY-MM-DD` calendar date and defaults to today.

`copy_from_workout_id` copies that session's sets into the new workout as one
atomic step: if the id does not exist the request is a 404 and no workout is
created at all.

## Data model

```
exercises ──< sets >── workouts
```

`sets` is the fact table: one row per set performed, carrying `reps`, `weight`,
free-text `notes`, and a `position` that preserves the order within a session.
Deleting a workout deletes its sets; deleting an exercise is refused while any
set still points at it, so history cannot silently lose its meaning.

To change the schema, add `migrations/<next number>-<short-name>.sql` and
restart. The runner applies it in its own transaction, records it in
`schema_migrations`, and refuses to start if the number is not above the version
the database already carries.

## Notes

The server binds to all interfaces and has no authentication — it is built to run
on your own machine or inside a private network. Put it behind a reverse proxy
with auth before exposing it to the internet.
