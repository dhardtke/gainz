---
date: 2026-09-22T14:19:02+00:00
git_commit: f14c1f02c79e0c347c32bfb4b38606c50d8ab115
branch: main
topic: 'How the UI lets users open workouts and exercises, and create new ones'
tags: [research, codebase, frontend, workouts, exercises, routing, forms]
status: complete
---

# Research: How the UI lets users open workouts and exercises, and create new ones

## Research Question

How does the UI allow users to open workouts, open exercises, and create new workouts and
exercises?

## Summary

Every one of these interactions is built from the same three pieces.

**Opening** an entity is always a plain `<a href="/workouts/3">` or `<a href="/exercises/4">`.
No view calls a navigation helper to open something; the anchors sit in the views' shadow roots
and `gz-app` intercepts the click at the document level, so opening a workout from the dashboard,
from the log, from a set row and from an exercise's session history are all literally the same
mechanism. The route table then maps the path to a detail component and hands it the id as an
attribute.

**Creating** an entity is always a `data-action` on a form or a button, handled by the view's
`handleSubmit`/`handleAction`, sent through the feature's facade, and followed by either
`navigate()` to the new entity or a refetch of the list. There are three ways to create a workout
and two ways to create an exercise:

| Entity   | Entry point                                   | Trigger                                     | Afterwards                          |
| -------- | --------------------------------------------- | ------------------------------------------- | ----------------------------------- |
| Workout  | Dashboard "Log today's workout" button        | `data-action="start-workout"`               | `navigate('/workouts/<new id>')`    |
| Workout  | "New workout" form on the workouts list        | `<form data-action="create">`               | `navigate('/workouts/<new id>')`    |
| Workout  | "Repeat" on a row of the workouts list        | `data-action="repeat"` + `copyFromWorkoutId` | toast, then `navigate('/workouts/<new id>')` |
| Exercise | "Add an exercise" form on the exercises list  | `<form data-action="create">`               | toast, `form.reset()`, reload list  |
| Exercise | "＋ New exercise…" inside the add-set form     | `add-set` submit with the `__new__` sentinel | exercise created, then the set logged |

So a workout is created *and immediately opened* in all three of its paths, while an exercise is
created in place — the catalogue reloads, or the new exercise is used for the set being logged
without leaving the workout screen.

```
src/frontend/
├── index.html                        single page for every route
├── main.ts                           imports the shell only
├── app/
│   ├── gz-app.component.ts           intercepts link clicks, swaps the view in <main>
│   ├── gz-header.component.ts        nav links built from the routes' `nav` field
│   ├── router.ts                     matchRoute, navigate, onRouteChange, linkPath
│   └── routes.ts                     ROUTES = [...stats, ...workouts, ...exercises]
├── ui/
│   ├── base.ts                       GzElement: data-action delegation, formData()
│   ├── format.ts                     todayIso(), formatDate(), plural(), …
│   └── gz-toast.component.ts         toast() / toastError()
├── http/
│   ├── http.ts                       get/post/patch/remove, prefixes /api
│   └── errors.ts                     ApiError, errorMessage
└── features/
    ├── stats/
    │   ├── stats.routes.ts           "/"  → gz-dashboard
    │   └── gz-dashboard.component.ts creates a workout, links to recent ones
    ├── workouts/
    │   ├── workouts.routes.ts        "/workouts", "/workouts/(\d+)"
    │   ├── workouts.facade.ts        workoutFacade, setFacade
    │   ├── gz-workout-list.component.ts    new-workout form, repeat, links out
    │   ├── gz-workout-detail.component.ts  add-set form, inline new exercise
    │   └── internal/
    │       ├── workout.api.ts        /api/workouts/**
    │       ├── set.api.ts            /api/sets/**
    │       └── gz-set-row.component.ts     links to the set's exercise
    └── exercises/
        ├── exercises.routes.ts       "/exercises", "/exercises/(\d+)"
        ├── exercises.facade.ts       exerciseFacade
        ├── gz-exercise-list.component.ts   add-exercise form, inline edit rows
        ├── gz-exercise-detail.component.ts progress view, links to workouts
        └── internal/exercise.api.ts  /api/exercises/**
```

How a click on `<a href="/workouts/3">` ends up as a rendered detail view:

```
 anchor inside a view's shadow root
            │  click bubbles, composed
            ▼
 gz-app constructor listener              gz-app.component.ts:21
   composedPath() → the real anchor       (shadow roots retarget event.target)
            │
            ▼
 linkPath(event, {href,target,download})  router.ts:83
   plain left click? same origin? no query/fragment?
   not /api/**? extension-less?
            │ yes → "/workouts/3"
            ▼
 event.preventDefault(); navigate(path)   gz-app.component.ts:32-33
   history.pushState + dispatch popstate  router.ts:40-46
            │
            ▼
 onRouteChange listener → #renderView()   gz-app.component.ts:39, 72
            │
            ▼
 matchRoute(ROUTES, "/workouts/3")        router.ts:20
   /^\/workouts\/(\d+)\/?$/  keys:['id']  workouts.routes.ts:14-15
            │  params = { id: "3" }
            ▼
 route.view({id:"3"})                     workouts.routes.ts:16-21
   await import('./gz-workout-detail.component.ts')
   new GzWorkoutDetailComponent()
   view.setAttribute('workout-id', '3')
            │
            ▼
 main.replaceChildren(view)               gz-app.component.ts:104
   → connectedCallback → #load() → GET /api/workouts/3
```

## Detailed Findings

### The route table

`src/frontend/app/routes.ts:12` is the whole table: `[...statsRoutes, ...workoutsRoutes,
...exercisesRoutes]`. A `RouteDef` (`src/frontend/app/router.ts:5-12`) is a regex `pattern`, the
`keys` naming its capture groups, an async `view(params)` returning an `Element`, and an optional
`nav: { path, label }`.

Five routes exist:

| Pattern                    | File                                                    | View                       |
| -------------------------- | ------------------------------------------------------- | -------------------------- |
| `/^\/?$/`                  | `src/frontend/features/stats/stats.routes.ts:5`          | `gz-dashboard`             |
| `/^\/workouts\/?$/`        | `src/frontend/features/workouts/workouts.routes.ts:5`    | `gz-workout-list`          |
| `/^\/workouts\/(\d+)\/?$/` | `src/frontend/features/workouts/workouts.routes.ts:14`   | `gz-workout-detail`        |
| `/^\/exercises\/?$/`       | `src/frontend/features/exercises/exercises.routes.ts:5`  | `gz-exercise-list`         |
| `/^\/exercises\/(\d+)\/?$/`| `src/frontend/features/exercises/exercises.routes.ts:14` | `gz-exercise-detail`       |

The three routes carrying `nav` (`stats.routes.ts:11`, `workouts.routes.ts:11`,
`exercises.routes.ts:11`) are what `gz-header` turns into the top-level links:
`src/frontend/app/gz-header.component.ts:50` collects `ROUTES.flatMap(route => route.nav ? [route.nav] : [])`
and renders each twice — once in the wide `<ul class="links">` (line 60) and once inside the
narrow-screen dropdown (line 79). `#syncLinks()` (`gz-header.component.ts:29-47`) marks the active
one with `aria-current="page"` and swaps Pico's `secondary` class for `contrast`, and closes the
dropdown, on every route change.

A detail route's `view()` is the only place that sets the id: `workouts.routes.ts:19` calls
`view.setAttribute('workout-id', id ?? '')` and `exercises.routes.ts:19` sets `exercise-id`, both
before the element is connected.

### Opening a workout

Four places in the UI link to a workout, and all four are anchors:

- **Dashboard, "Recent workouts"** — `src/frontend/features/stats/gz-dashboard.component.ts:87`
  renders each of the five most recent workouts as `<a class="workout-link" href="/workouts/${workout.id}">`,
  with a "See all" link to `/workouts` at line 80. The list comes from
  `workoutFacade.list({ limit: 5 })` (line 27), fetched in parallel with the stats summary.
- **Workouts list** — `src/frontend/features/workouts/gz-workout-list.component.ts:151`:
  `<a href="/workouts/${workout.id}">${workout.title ?? formatDate(workout.performedOn)}</a>`,
  i.e. a workout with no title is labelled by its date.
- **Exercise detail, session history** —
  `src/frontend/features/exercises/gz-exercise-detail.component.ts:172` links each session row back
  to the workout it happened in, via `SessionPointDto.workoutId`.
- **After creating one** — the three create paths call `navigate('/workouts/<id>')` directly
  (`gz-dashboard.component.ts:42`, `gz-workout-list.component.ts:58` and `:80`).

The workouts list itself is reached from the header link, from the dashboard's "See all", and from
the error state of the detail view (`gz-workout-detail.component.ts:367`, "Back to all workouts").

`GzWorkoutDetailComponent` (`src/frontend/features/workouts/gz-workout-detail.component.ts:33`)
takes its id from the `workout-id` attribute: `static observedAttributes = ['workout-id']` (line 55)
and `attributeChangedCallback` (line 57) store the raw string, re-loading only when the attribute
*changes* on a connected element — the first assignment arrives before `connectedCallback`, which
loads anyway. The private `#id` getter (line 76-82) converts it to a `WorkoutId`, documenting that
the route's `(\d+)` makes the conversion NaN-proof.

`#load()` (line 92-108) fetches two things in parallel — `workoutFacade.get(this.#id)` and
`exerciseFacade.list()` — because the screen needs both the session and the exercise catalogue for
the add-set select. This is the cross-feature composition the frontend docs describe: the workouts
view reaches into `features/exercises/exercises.facade.ts`, never into `exercises/internal/`. On
failure the view renders its message inline and also toasts, except for a 404, which is left to the
inline message alone (line 103-105). The same `#load()` is re-run whenever a `gz-set-row` child
emits `sets-changed` (line 86-88).

### Opening an exercise

Three places link to an exercise:

- **Exercises list** — `src/frontend/features/exercises/gz-exercise-list.component.ts:130`:
  `<a href="/exercises/${exercise.id}">${exercise.name}</a>`, with the exercise's notes underneath.
- **A logged set** — `src/frontend/features/workouts/internal/gz-set-row.component.ts:148` makes the
  exercise name of each set a link to `/exercises/${set.exerciseId}`.
- **The "By exercise" breakdown** on the workout detail —
  `src/frontend/features/workouts/gz-workout-detail.component.ts:422`, one link per exercise trained
  in that session.

`GzExerciseDetailComponent` (`src/frontend/features/exercises/gz-exercise-detail.component.ts:44`)
mirrors the workout detail exactly: `observedAttributes = ['exercise-id']` (line 51), the same
`attributeChangedCallback`/`#id` pair (lines 53-77), and a `#load()` (line 84) that spreads
`exerciseFacade.progress(this.#id)` into the ready state. It suppresses the toast on a 404 the same
way (line 89-91) and offers "← Exercises" (line 209) and a "Back to all exercises" link in the error
state (line 197).

Note the asymmetry: opening an exercise fetches `GET /api/exercises/:id/progress`
(`exercise.api.ts:14`), not `GET /api/exercises/:id`. `exerciseFacade.get()` exists
(`exercises.facade.ts:16`) but no view calls it — the detail screen always wants the progress
payload, which embeds the `ExerciseDto` anyway (`src/shared/dto/exercise.ts:32-37`).

### Creating a workout — path 1: the dashboard button

`src/frontend/features/stats/gz-dashboard.component.ts:67` renders a single
`<button data-action="start-workout">Log today's workout</button>` next to the page title.
`handleAction` (line 36-46) calls `workoutFacade.create({ performedOn: todayIso() })` with nothing
else, then `navigate(\`/workouts/${workout.id}\`)`. This is the shortest path in the app: one click
from the landing page to an empty session dated today, ready to log sets into.

### Creating a workout — path 2: the form on the workouts list

`#newWorkoutForm()` (`src/frontend/features/workouts/gz-workout-list.component.ts:102-125`) renders
an `<article>` headed "New workout" above the log, containing `<form class="new-form" data-action="create">`
with three fields and a "Start session" submit button:

| Field         | Type   | Constraints                                        |
| ------------- | ------ | -------------------------------------------------- |
| `performedOn` | `date` | `required`, pre-filled with `todayIso()` (line 110) |
| `title`       | `text` | `maxlength="120"`, placeholder "Push day"           |
| `notes`       | `text` | `maxlength="2000"`                                  |

`handleSubmit` (line 45-62) returns early for any action other than `create`, reads the fields with
`this.formData(form)`, and calls `workoutFacade.create(...)`. One detail is called out in a comment
at lines 52-53: because the date field is pre-filled *and* `required`, an empty value can only mean
the user cleared it, and the API rejects an empty date while defaulting a missing one — so the view
substitutes `todayIso()` rather than sending `''`. On success it navigates straight to the new
workout (line 58); on failure it toasts (line 60).

The `maxlength` values mirror the server's limits exactly — `MAX_WORKOUT_NAME_LENGTH = 120` and
`MAX_WORKOUT_NOTES_LENGTH = 2000` in `src/backend/features/workouts/workouts.facade.ts:13-14`.

### Creating a workout — path 3: "Repeat"

Each row of the workouts list carries a "Repeat" button
(`gz-workout-list.component.ts:158-166`) with `data-action="repeat"`, `data-id` and `data-title`,
titled "Copy these sets into a new session dated today". `handleAction` (line 72-85) reads the id
off `element.dataset.id`, and creates a workout with `copyFromWorkoutId` set:

```ts
const workout = await workoutFacade.create({
  performedOn: todayIso(),
  title: element.dataset.title,
  copyFromWorkoutId: id,
});
toast(`Copied ${plural(workout.sets.length, 'set')} into a new session`, 'success');
navigate(`/workouts/${workout.id}`);
```

The toast can report the number of sets because `POST /api/workouts` answers with a
`WorkoutWithSetsDto` (`src/shared/dto/workout.ts:19-21`) — the copied sets come back in the same
response, so nothing has to be re-fetched to count them.

### Creating an exercise — path 1: the form on the exercises list

`src/frontend/features/exercises/gz-exercise-list.component.ts:162-181` renders an "Add an exercise"
article above the catalogue table, with `<form class="new-form" data-action="create">`:

| Field         | Type   | Constraints                                    |
| ------------- | ------ | ---------------------------------------------- |
| `name`        | `text` | `required`, `maxlength="120"`, "Back Squat"     |
| `muscleGroup` | `text` | `maxlength="60"`, "Legs"                        |
| `notes`       | `text` | `maxlength="2000"`                              |

`handleSubmit` (line 34-54) handles both `create` and `save` (the inline edit row) and reads `name`
once for both; a comment at lines 35-37 records that the `required` attribute means an empty name
can only arrive if the browser's validation was bypassed, and that the API rejects it regardless.
On success the view toasts `Added ${name}`, calls `form.reset()` so the fields are empty for the
next one, and re-runs `#load()` — unlike the workout forms, it stays on the page (line 47-49).

The three `maxlength` values again mirror the server: `MAX_EXERCISE_NAME_LENGTH = 120`,
`optionalString(dto, 'muscleGroup', 60)` and `MAX_EXERCISE_NOTES_LENGTH = 2000` in
`src/backend/features/exercises/exercises.facade.ts:10-11, 48-54`.

### Creating an exercise — path 2: inline, while logging a set

This is the more interesting path, and it lives entirely in
`src/frontend/features/workouts/gz-workout-detail.component.ts`. The module declares a sentinel,
`const NEW_EXERCISE = '__new__'` (line 30), which travels through the exercise `<select>` as if it
were an id.

`#addSetTemplate()` (line 295-337) renders the exercise select with one `<option>` per known
exercise plus a final `<option value="__new__">＋ New exercise…</option>` (line 313), and, right
after it, a `field-new-exercise` text input that is `hidden` unless the sentinel is the selected
value (line 316-319). `afterRender()` wires a `change` listener on the select (line 217-223) that
toggles that `hidden` attribute and, for a real exercise, prefills weight and reps from the last set
of that exercise in this session (`#prefillFrom`, line 233-250).

Lines 296-299 handle the cold start: if the catalogue is empty *and* nothing has been drafted yet,
the sentinel is made the selected value, so a brand-new database still shows a usable add-set form
with a name field rather than an empty dropdown.

`handleSubmit('add-set', …)` (line 174-200) then does the two-step:

```ts
let exerciseId: string | number = values.exerciseId ?? '';

if (exerciseId === NEW_EXERCISE) {
  if (!values.newExercise) {
    toast('Give the new exercise a name', 'error');
    return;
  }
  const created = await exerciseFacade.create({ name: values.newExercise });
  exerciseId = created.id;
}

await setFacade.create(this.#id, { exerciseId: Number(exerciseId), reps: …, weight: …, notes: … });
```

The exercise is created with a name only — no muscle group, no notes. The missing-name case is the
one piece of client-side validation in these flows that produces a message of its own
("Give the new exercise a name") rather than deferring to the server, because the field is only
conditionally shown and so cannot be marked `required`. Afterwards the view records the draft
(exercise, weight, reps) so the next set starts from the same numbers, sets `#focusAfterRender` so
focus lands back in the weight field, and reloads (line 194-196) — which re-runs
`exerciseFacade.list()` and makes the new exercise a normal option in the select.

### The delegation, facade and HTTP plumbing all of this rides on

`GzElement` (`src/frontend/ui/base.ts:15`) attaches two listeners in its constructor (lines 25-39):
a `click` listener that walks `closest('[data-action]')` and calls `handleAction(action, element, event)`,
and a `submit` listener that finds `closest('form[data-action]')`, calls `preventDefault()` and then
`handleSubmit(action, form, event)`. So no view ever registers a listener for a button or a form;
the markup's `data-action` is the whole wiring. `formData(form)` (line 107-115) reads the form into a
plain `Record<string, string>`, trimming every value and dropping non-string entries.

Views reach the network only through a facade. `workoutFacade` and `setFacade` are ready-made
instances exported from `src/frontend/features/workouts/workouts.facade.ts:61-63`; `exerciseFacade`
from `src/frontend/features/exercises/exercises.facade.ts:37`. Each method delegates one line to an
API class:

| Facade call                              | API class                                | Request                              |
| ---------------------------------------- | ---------------------------------------- | ------------------------------------ |
| `workoutFacade.list({limit, offset})`     | `workout.api.ts:7`                        | `GET /api/workouts?limit=&offset=`   |
| `workoutFacade.get(id)`                   | `workout.api.ts:11`                       | `GET /api/workouts/:id`              |
| `workoutFacade.create(dto)`               | `workout.api.ts:15`                       | `POST /api/workouts`                 |
| `setFacade.create(workoutId, dto)`        | `workout.api.ts:28` (`createSet`)         | `POST /api/workouts/:id/sets`        |
| `exerciseFacade.list()`                   | `exercise.api.ts:6`                       | `GET /api/exercises`                 |
| `exerciseFacade.progress(id)`             | `exercise.api.ts:14`                      | `GET /api/exercises/:id/progress`    |
| `exerciseFacade.create(dto)`              | `exercise.api.ts:18`                      | `POST /api/exercises`                |

Note that `SetFacade.create` is routed through `WorkoutApi`, not `SetApi`
(`workouts.facade.ts:46-48`), because the create URL is nested under the workout — `SetApi` owns
only `/api/sets/**`. These URLs are pinned by `workouts.facade.test.ts` and
`exercises.facade.test.ts`, which assert the exact method and URL of every facade method.

`src/frontend/http/http.ts:9-38` is the one place `fetch` is called. It prefixes `/api`, sets
`Content-Type: application/json` when there is a body, parses the response text, and on a non-2xx
throws an `ApiError` carrying the server's `error` string and `details`
(`src/frontend/http/errors.ts:1-13`). `toastError(error)` (`ui/gz-toast.component.ts:28-30`) is what
every catch block in these flows calls, so a rejected create surfaces the server's own wording —
`"name" is required and must be a non-empty string`, `An exercise named "Squat" already exists`,
and so on.

### What the server does with a create

`POST /api/workouts` and `POST /api/exercises` are declared in
`src/backend/features/workouts/workout.routes.ts:12` and
`src/backend/features/exercises/exercise.routes.ts:12`. Both controllers read the JSON object,
translate it to the DTO and respond **201** with the created entity
(`workout.controller.ts:31-34`, `exercise.controller.ts:24-27`).

`CreateWorkoutDto` (`src/shared/dto/workout.ts:32-39`) has no required field at all —
`performedOn`, `title`, `notes` and `copyFromWorkoutId` are each optional, and a missing
`performedOn` defaults to the server's today in `workout.translator.ts:32-38`. Validation in
`src/backend/features/workouts/workouts.facade.ts:52` only checks the fields that are present:
`requiredDate` for `performedOn`, `optionalString` bounded at 120 and 2000 for title and notes, and
`requiredInt(min 1)` for `copyFromWorkoutId`. An unknown `copyFromWorkoutId` becomes a 404 from
`workout.repository.ts:66`.

`CreateExerciseDto` (`src/shared/dto/exercise.ts:39-43`) requires `name`, and
`src/backend/features/exercises/exercises.facade.ts:48-54` enforces exactly that: `requiredString`
bounded at 120 for `name`, `optionalString` at 60 for `muscleGroup` and 2000 for `notes`. A
duplicate name is a 409 from `exercise.repository.ts:70`. All validation helpers live in
`src/backend/shared/validate.ts` and throw `badRequest` (400) with a message naming the field.

### Deep links and the single page

Because routes are real paths, `/workouts/3` can be typed into the address bar or bookmarked. The
static controller answers any extension-less path that matches no file with `index.html`
(`src/backend/features/static/internal/static.controller.ts:55-61`) — a trailing slash is treated as
a missing directory index and 404s instead. `static.routes.test.ts:77-90` pins both halves of that
rule. `index.html` loads only `/main.ts`, which imports the shell; the workout and exercise views
arrive on their first visit through the route's `import()`.

## Code References

- `src/frontend/app/routes.ts:12` — the single `ROUTES` table, spread per feature
- `src/frontend/app/router.ts:20-33` — `matchRoute`, turning a path into `{ route, params }`
- `src/frontend/app/router.ts:40-46` — `navigate()`: pushState plus a synthetic `popstate`
- `src/frontend/app/router.ts:83-105` — `linkPath()`, the rule for which anchor clicks are intercepted
- `src/frontend/app/gz-app.component.ts:21-34` — the delegated click listener using `composedPath()`
- `src/frontend/app/gz-app.component.ts:85-106` — `#swapView`, with the stale-navigation token guard
- `src/frontend/app/gz-header.component.ts:50` — nav links derived from the routes' `nav` field
- `src/frontend/features/workouts/workouts.routes.ts:14-22` — `/workouts/(\d+)` → `workout-id` attribute
- `src/frontend/features/exercises/exercises.routes.ts:14-22` — `/exercises/(\d+)` → `exercise-id` attribute
- `src/frontend/features/stats/gz-dashboard.component.ts:36-46` — `start-workout`: create then navigate
- `src/frontend/features/stats/gz-dashboard.component.ts:80-95` — "See all" and the recent-workout links
- `src/frontend/features/workouts/gz-workout-list.component.ts:45-62` — the `create` form handler
- `src/frontend/features/workouts/gz-workout-list.component.ts:72-85` — `repeat` via `copyFromWorkoutId`
- `src/frontend/features/workouts/gz-workout-list.component.ts:102-125` — the "New workout" form markup
- `src/frontend/features/workouts/gz-workout-list.component.ts:151` — the link that opens a workout
- `src/frontend/features/workouts/gz-workout-detail.component.ts:30` — the `__new__` sentinel
- `src/frontend/features/workouts/gz-workout-detail.component.ts:55-82` — observed attribute and `#id` getter
- `src/frontend/features/workouts/gz-workout-detail.component.ts:92-108` — parallel workout + exercise load
- `src/frontend/features/workouts/gz-workout-detail.component.ts:174-200` — `add-set`, creating an exercise first
- `src/frontend/features/workouts/gz-workout-detail.component.ts:295-337` — the add-set form and its hidden name field
- `src/frontend/features/workouts/gz-workout-detail.component.ts:422` — "By exercise" links
- `src/frontend/features/workouts/internal/gz-set-row.component.ts:148` — a set's exercise link
- `src/frontend/features/exercises/gz-exercise-list.component.ts:34-54` — `create` and `save` handlers
- `src/frontend/features/exercises/gz-exercise-list.component.ts:130` — the link that opens an exercise
- `src/frontend/features/exercises/gz-exercise-list.component.ts:162-181` — the "Add an exercise" form
- `src/frontend/features/exercises/gz-exercise-detail.component.ts:84-94` — loading progress by id
- `src/frontend/features/exercises/gz-exercise-detail.component.ts:172` — session history link back to a workout
- `src/frontend/ui/base.ts:25-39` — `data-action` click/submit delegation
- `src/frontend/ui/base.ts:107-115` — `formData()`, trimming text fields
- `src/frontend/http/http.ts:9-46` — the `/api` client and the four verbs
- `src/backend/features/workouts/workout.routes.ts:11-24` — the workout route table
- `src/backend/features/workouts/workouts.facade.ts:52` — `#validateCreate` for workouts
- `src/backend/features/exercises/exercise.routes.ts:11-24` — the exercise route table
- `src/backend/features/exercises/exercises.facade.ts:48-54` — `#validateCreate` for exercises
- `src/backend/features/static/internal/static.controller.ts:55-61` — the single-page fallback
- `src/shared/dto/workout.ts:32-45` — `CreateWorkoutDto`, `EditWorkoutDto`
- `src/shared/dto/exercise.ts:39-49` — `CreateExerciseDto`, `EditExerciseDto`

## Architecture Documentation

**Opening is declarative, creating is imperative.** Nothing in the UI "opens" an entity in code:
every open is an `<a href>` that `gz-app` intercepts centrally. Creating, by contrast, always runs
through a `data-action` handler, and the handler decides what follows — `navigate()` for a workout,
a reload for an exercise.

**The id travels as an attribute, the data as a fetch.** A route's `view()` constructs the element
and sets `workout-id`/`exercise-id` before connecting it; the component converts that string in a
private `#id` getter whose doc comment states the invariant (the route matched `(\d+)`, so the
`Number()` cannot be NaN) once, instead of at every call site. Both detail views implement this
identically, including re-loading when the attribute changes on a connected element — which covers
navigating from one workout straight to another.

**Refetch after mutation; no store.** Every create is followed by either a navigation (which mounts
a fresh component that loads) or an explicit `#load()`. No view patches its own list from a
response. The one place a response body is read for anything but rendering is the repeat toast,
which counts `workout.sets.length` from the 201.

**`maxlength` mirrors the server's limits.** 120 for a title or exercise name, 60 for a muscle
group, 2000 for notes — the same numbers appear as `MAX_*` constants in the backend facades. The
browser prevents the overflow; the server rejects it anyway if it arrives.

**Cross-feature composition happens in the component.** `gz-workout-detail` needs the exercise
catalogue, so it imports `exerciseFacade` from `features/exercises/exercises.facade.ts` — the public
front door — never anything under `exercises/internal/`. `gz-dashboard` does the same with
`workoutFacade`. `bun run lint` enforces that boundary.

**Feature-local sentinels stay in the module that uses them.** `NEW_EXERCISE = '__new__'` is
declared in `gz-workout-detail.component.ts` and never crosses a facade: by the time
`setFacade.create` is called it has already been replaced by a real id.

## Open Questions

- `exerciseFacade.get(id)` (`exercises.facade.ts:16`, `exercise.api.ts:10`) and
  `WorkoutFacade`'s `listSets`-equivalent backend route `GET /api/workouts/:id/sets`
  (`workout.routes.ts:22`) are reachable but unused by any view — the detail screens use
  `progress` and the embedded `sets` instead.
- There is no UI for creating an exercise with a muscle group or notes in one step from the workout
  screen; the inline path sends only a name, and the remaining fields are filled later through the
  exercises list's inline edit row.
- No route or view creates a workout with a `title` and `copyFromWorkoutId` chosen independently —
  "Repeat" always reuses the source workout's title verbatim.
