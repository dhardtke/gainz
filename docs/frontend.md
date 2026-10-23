# Frontend (`src/frontend/`)

The first half of this document holds the rules every change follows: the layout, components,
features and facades, routing, import boundaries and types. Then come the pages, one section per
feature, and last how the frontend loads, reloads, themes, installs and is tested.

`index.html` is the only page: it links Oat, `ui/shared.css` and `ui/app.css`, the web app manifest
and the barbell icon, applies a stored theme in a small inline script before the first paint, loads
Oat's `oat.js` deferred, and `main.ts` as a module. `main.ts` only imports the
`app/gz-app.component.ts` shell. A built page links one stylesheet and one script instead (see
"Loading"). Routes are real paths such as `/workouts/3`, and the server answers each with
`index.html` because it carries no extension.

## Layout

```
src/frontend/
├── index.html  main.ts  manifest.webmanifest  testing.ts
├── icons/      the app icon
├── dev/        hot.ts, the hot-reload client (development only)
├── app/        the shell, the router and the route table
├── http/       the request helpers and ApiError
├── ui/         what any component may use
└── features/<feature>/
    ├── <feature>.routes.ts  <feature>.facade.ts  the route views and shared components
    └── internal/            the API classes and what only this feature uses
```

What belongs to no feature sits beside `features/`:

- `icons/` holds the app icon, which the manifest and the favicon link point at (see
  "Installing").
- `dev/` holds `hot.ts`, the hot-reload client the server injects only in development; nothing
  imports it, and it is deliberately not one of the import boundaries below.
- `app/` is the shell: `gz-app`, the `gz-header` it renders at the top with the `gz-theme-toggle`
  inside it, the `gz-breadcrumbs` trail it renders above the view, `router.ts`, a generic path
  router that names no route, `routes.ts`, which spreads the features' route lists into the one
  `ROUTES` table, and `tab-title.ts`, which formats the browser tab's title. `app/` reaches a
  feature only through those route lists, with one exception: `gz-header` imports
  `features/auth/auth.facade.ts` for its Log out button and whether to show it.
- `http/` is the request plumbing: `http.ts` holds the `get`/`post`/`put`/`patch`/`remove` helpers over
  `fetch`, and `errors.ts` holds `ApiError` and `errorMessage`, kept apart so a component can catch
  an error without being able to make a request.
- `ui/` is what any component may use: `base.ts` with `GzElement` (open shadow root,
  `data-action` click/submit delegation, `template()`/`render()`) and `define()`; `view.ts` with
  `GzView`, the base of the route views (see below); `editable-row.ts` with `GzEditableRow`, the
  base of `gz-set-row` and `gz-weigh-in-row` (see "Set rows"), and `keepRowFocus()`, which their
  views call around a re-render; `html.ts` with the escaping `html` tagged
  template and `raw()`; `styles.ts`, `theme.ts` and `format.ts`, which holds the display formats and
  the date helpers `todayIso()` and `daysBefore()`; the document stylesheet `app.css`
  and the utilities in `shared.css`; `toast.ts`, whose `toast()` and `toastError()` show Oat's
  toasts through `ot.toast()`; and the shared widgets — `tile/gz-tile`, the stat tile several
  views use; `chart/gz-chart`, the line chart of the exercise and weight pages, whose `series` of
  `ChartPoint`s it spaces by index, or by date when every point carries an `x`, and draws through
  the points' `trend` values instead of their own when any has one, with the raw values as dots,
  and whose `empty` and `label` set the empty-state text and the plot's `aria-label`; `pagination/`, the paged lists' page arithmetic in `pagination.ts` beside
  `gz-pagination`, their pager; `modal.ts` with `GzModal`, whose `open()` appends it to the body,
  shows its Oat `<dialog>` as a modal and resolves its `answer()` once the dialog closes, by a
  button, Escape or a click on the backdrop, and then removes it; and `confirm/`, whose
  `confirmAction()` opens a `gz-confirm-dialog`, a `GzModal` that answers `true` only for its action
  button.

The features are `exercises`, `workouts`, `stats`, which owns the dashboard and the Statistics
page, `weight`, which owns the body weight log, and `auth`, which owns the login page.

## Components

A component is a pair of files side by side, `gz-<name>.component.ts` and
`gz-<name>.component.css`, in whichever directory owns it. A component module ends with
`await define('<tag>', TheClass, import.meta.url)`, and `styles.ts` swaps the module URL's `.ts`
for `.css` to find the stylesheet, fetches it once into a `CSSStyleSheet`, and every instance
adopts it by reference — there is no manifest, and a tag name implies no path. In a built bundle
the sheet's text comes from `ui/inline-styles.ts`, which the build fills, instead of a fetch (see
"Loading"). A test in `static.routes.test.ts` requests the `.css` beside every
`gz-*.component.ts`, so a component without its stylesheet fails the suite rather than painting
unstyled. **That top-level `await` is load-bearing**: it makes "module loaded" also mean
"stylesheet loaded", which is what lets a route's `view()` lazily `import()` its view and still
have it paint styled on the first frame.

Every route view but the login page extends `GzView`, which loads on connect through its `load()`
hook and renders `loadingText`, then `readyTemplate()` or `errorTemplate()` (the message alone). It
names what it shows through its `titleFor(data)` hook (`null` by default) and the `pageTitle`
getter (that answer for the loaded data, `null` while loading or after an error), and emits
`PAGE_TITLE_EVENT` (`page-title`) after every `reload()`, failed or not, and every `show(data)`,
which renders data a mutation's response already carries without loading, and every
`replaceData(data)`, which only stores it, for a view that patches its own DOM. Its
`numericAttribute()` reads the id attribute a route sets, throwing when it is missing.

All interpolation goes through the `html` template, which escapes, so notes and exercise names are
safe to display; use `raw()` only for markup another `html` call produced.

The route views are exported so their route file can construct them with `new`, which keeps each
tag name written only in its `define()`. Any other component class is exported only when another
module needs it — a parent typing the element it drives, or `confirm.ts` and `start-session.ts`
checking the dialog they appended — and otherwise stays private to its module.

### Open cards

A list item opens its entity on the whole card rather than on the words: the card is
`shared.css`'s `article.open-card`, a column of lines — a `.head` with the title (and any badge at
its end), a muted subtitle, and a `.foot` of muted stats with the actions pushed to its end — and
its hit area is the anchor's own `::after` stretched across the card. Because the overlay is part
of the anchor, it is still a link — `gz-app` routes it, Ctrl- and middle-click open a tab, and the
keyboard reaches it — where a click handler on the card would be none of those things. A button on
a card sits in `.actions`, which is positioned so it paints above the overlay and takes its own
click; a click there carries no anchor in its composed path, so `gz-app` leaves it alone.

## Features and facades

A feature is shaped like its backend counterpart and named the same. It keeps its route views at
its root beside its `<feature>.facade.ts`, together with any component another feature renders —
`gz-workout-card`, which the dashboard renders too, `gz-muscle-group-icon`, which the workout page
renders, and `gz-weight-tile`, which the dashboard renders — since the root is the feature's front door. What only it uses goes in `internal/`:
one API class per URL prefix — `workout.api.ts` owns every `/api/workouts/**` URL, `set.api.ts`
every `/api/sets/**` one — and the child components only its views render.

The facade module holds thin classes named after entities, such as `WorkoutFacade` and
`SetFacade`, whose methods delegate one line each and use the backend's verbs
(`SetFacade.create(workoutId, dto)` posts to `/api/workouts/:id/sets` through `WorkoutApi`). It
exports ready instances, `workoutFacade` and `setFacade`, rather than having a composition root:
custom elements cannot take constructor arguments, there is nothing to inject, and a root that
built every facade would statically pull every feature's API module into every view.

A component reads data only through a facade; composition across facades stays in the component,
as it stays in the backend controller. That holds across features too: `gz-workout-detail` loads a
workout through `workoutFacade` and the exercises for `gz-add-set-form`'s select through
`exerciseFacade` from `features/exercises/`, never through anything in `exercises/internal/`, and
`gz-dashboard` takes its summary from `statsFacade`, its recent workouts from `workoutFacade` and its
weigh-ins from `weighInFacade`. Its "Total volume" tile reads "weighted lifts, all time", since the
summary's volumes count weighted exercises only.

## Routing

A feature's routes live in `<f>.routes.ts` beside its facade, the way the backend keeps one
`*.routes.ts` per feature and spreads them in `src/backend/http/routes.ts`. Each route is a regex
`pattern`, the `keys` naming its capture groups, and a `view(params)` that `import()`s the view
module and returns `new GzXComponent()`, setting any id attribute before handing it back. `gz-app`
matches the current path against `ROUTES` and awaits the matching route's `view()` without knowing
which route it is; when nothing matches it shows its own not-found message. A route may also carry
`nav: { path, label }`, and `gz-header` builds the header from those, in the order `app/routes.ts`
spreads the features — so adding a list page needs no edit in `app/` beyond a new feature's spread.
A route file only `import type`s `RouteDef` from `app/router.ts`, so it loads up front at almost no
cost and reaches its views only through `import()`.

### Links

Links are plain `<a href="/…">`. `gz-app` listens for clicks on its host, finds the anchor through
`composedPath()` because the views' and the header's shadow roots retarget the event, and routes it
through `navigate()` when `router.ts`'s `linkPath` says it is a plain same-origin click on an
extension-less, non-`/api` path without query or fragment; anything else — a modifier click, a
`target`, `download` — is left to the browser. `navigate()` pushes a history entry (none when
already on that path and query) and dispatches `popstate`, so links, `navigate()` and Back/Forward
all reach `gz-app` and `gz-header` through `onRouteChange`. A route path must therefore stay
extension-less and must not name a file under `src/frontend/`.

### Titles and breadcrumbs

A route may also carry a `title`, the page's name, and `parents`, the pages above it as
`{ path, label }` crumbs (the `Crumb` shape `nav` has too), outermost first. Every route but the
dashboard has a title, and only the detail routes have parents, their lists. The breadcrumb is
location-based: it is derived from the matched route alone, never from history, so `/exercises/7`
shows `Exercises › …` however it was reached, and Back stays the way to where you came from. A
parent links to the bare list path, never to `?page=N`, which `linkPath` would leave to the
browser. Only a page with parents shows a trail; the top-level pages are already marked by the
header, and a one-item trail would repeat it. `gz-app` renders `gz-breadcrumbs` in `<main>` above
the `<slot>` and, every time it reveals a view, hands it `{ parents, current }` or `null`. The
current crumb is the shown view's `pageTitle` — the workout's title or else its date, the
exercise's name — and the route's `title` (`Workout`, `Exercise`) until the view has one: while it
loads past `SLOW_VIEW_MS`, or after its error or 404. `gz-app` reads `pageTitle` again on every
`page-title` from the view it shows, so a rename reaches the trail and the tab without a
navigation; the event of a view still loading hidden is ignored, because the swap reads its title
anyway. The same name sets `document.title` through `tabTitle()` in `tab-title.ts`,
`<name> · gainz`, and `Not found · gainz` for the not-found line; the dashboard, without a title,
keeps `APP_TITLE`, `gainz — lifting log`, which `tab-title.test.ts` holds equal to `index.html`'s
`<title>`. The trail is `<nav aria-label="Breadcrumb"><ol>`: the parents are links in Oat's
`.unstyled` style, muted and `--primary` on hover, a `›` drawn by CSS separates the items and is
read as nothing (`content: "›" / ""`), and the current crumb is `--foreground` text with
`aria-current="page"`. It stays on one line at 320 px: the parents keep their width and the
current crumb ends in an ellipsis.

### The shell

`gz-app` renders `gz-header` above its `<main>`, and `<main>` holds `gz-breadcrumbs` above the
`<slot>`, both in the shell's shadow root; the header's host is the sticky element, because a
`<header>` inside its shadow root would be only as tall as its host and could never stick. The
host's height is fixed, `block-size: var(--header-height)` with its border included, a token
`ui/app.css` declares on `:root` as `calc(3.75rem + 1px)` — the theme toggle's 2.75rem button, the
nav's padding and the border, the same at every width — so page chrome such as the workout's
progress strip can stick right below it. The view is not in that shadow root: it is `gz-app`'s own
child, in the document's light DOM, and shows through a `<slot>` in `<main>`. That is for password
managers, which search the document and, by default, not shadow roots, so they could never find a
login form inside the shell's shadow root (see "Authentication"). Because the not-found line and
the login form are in the light DOM, the document links `ui/shared.css` beside Oat, so they are
styled as they would be in a shadow root.

The header is a surface bar: `--card` with a `--border` line beneath it, rather than a band of
brand color, since blue is kept for what is tappable or current. Inside it is a flex `<nav>`: the
brand on the left — the app icon and "gainz" in `--primary`, which on hover underlines the name and
grows the icon (without the motion under `prefers-reduced-motion`) — then the page links in
`--muted-foreground`, with `aria-current="page"` making the current page `--foreground` and bold,
then a thin `--border` divider and the theme toggle, a `.ghost.icon` button. Below 560 px the links
render a second time inside Oat's `<ot-dropdown>` — a `.ghost.icon` hamburger with `popovertarget`
and a `<menu popover>` of `role="menuitem"` links — and CSS shows one list at a time rather than a
resize listener choosing. `ot-dropdown` works inside the header's shadow root because it uses no
shadow DOM of its own, queries only its own children, and a `popovertarget` ID resolves within its
tree; it positions the menu, closes it on Esc or an outside click, and moves between items with the
arrow keys. `gz-header` subscribes to `onRouteChange` itself, and on every route change its
`nav a[data-path]` loop marks the current page in both lists and closes the menu if it is open.

## Import boundaries

`bun run lint` holds the import boundaries in `.oxlintrc.json`:

- A module under `features/<a>/` may not import `features/<b>/internal/`.
- Nothing under `app/`, `ui/`, `http/` or `main.ts` may import any `internal/`.
- No component may import an `*.api.ts` module or `http/http.ts`.
- Nothing under `ui/` or `http/` may import `features/` or `app/`, because they are the foundation
  the rest is built on.
- A feature's `*.routes.ts` may not import `internal/`, an `*.api.ts`, a `*.facade.ts`, `http/` or
  `ui/`, because it loads on every page.

oxlint applies only the last matching override's `no-restricted-imports` options rather than
merging them, so an override for components or route files repeats the patterns of its directory's
override. The rule also checks `import()` calls, which is why it cannot forbid a route file's
static import of a `gz-*.component.ts` view without forbidding the lazy one too.

Only the route views reached through the features' `*.routes.ts` are dynamically imported. **A
component a view renders inside itself — a feature's `internal/` child, or a `ui/` widget — must
stay a static import in that view's module** — otherwise property assignments land on an
un-upgraded element and permanently shadow the class accessors, leaving it blank with no error.

## Types

The shapes the API returns are declared once in `src/shared/dto/`, the single declaration of the
wire format, one file per feature and no barrel, and both halves of the app import the file that
declares a shape with a type-only import — the frontend as `'../../../shared/dto/workout.ts'` from
a feature view, `'../../../../shared/dto/workout.ts'` from an API class. The transpiler strips such
an import whole, so the module is never fetched at runtime, and that is load-bearing: `src/shared/`
sits **outside the web root**, so a surviving specifier would be a 404. Everything under
`src/shared/` must therefore stay free of runtime code — `flavors.ts` as much as the DTOs.

What the frontend is pinned to is still the wire format rather than the server's row types: the
backend translates its rows into these DTOs in each feature's translator and the wire is camelCase
where the database is snake_case, so a renamed column cannot arrive here as a silent refactor. It
just no longer costs a hand-written second copy to say so.

That wire format also names its ids and dates: `WorkoutId`, `ExerciseId`, `LiftSetId`,
`Iso8601Date` and `Iso8601DateTime`, declared in `src/shared/flavors.ts` and used by the frontend's
own signatures too — the parameters of the `*.api.ts` classes and the facades, `ui/format.ts`'s
date helpers, and id-shaped state in the components. So the API client cannot be handed the wrong
entity's id, and a `createdAt` cannot reach a formatter that expects a `YYYY-MM-DD` day. A plain
`number` still assigns into a flavor, which is why `Number(element.dataset.id)` needs no cast on
the way in.

Shapes local to one module — a view's loaded data, the chart's points — are declared in that
module; what a view is doing with that data is `GzView`'s `ViewState<Data>`.

## Authentication

When the server has a password set (see "Authentication" in `docs/backend.md`), every API call
without a valid session cookie is answered 401, and the frontend turns that into the login page
without any view knowing about it. `http.ts` dispatches `UNAUTHORIZED_EVENT` (`gz:unauthorized`) on
the global object before it throws the `ApiError`; it signals with an event rather than calling
`navigate()` because `http/` is foundation and may not import `app/`. `gz-app` listens for the
event on `window` and, unless it is already on `/login`, navigates to `/login?next=` with the
current path and query encoded. `toastError()` stays silent for a 401, so the view that failed to
load shows no toast on its way out.

`gz-login`, the `auth` feature's one view, renders a form with a hidden `username` field (password
managers save an entry only for a form that has one) and a password field, posting through
`authFacade.login()`. A 401 shows "Wrong password." inline, any other failure — the throttle's 429
among them — the server's message, and a success navigates to
`nextPath(location.search, location.origin)` from `internal/next-path.ts`, which accepts `next`
only when it resolves to a path on this origin other than the login page itself, and otherwise
answers `/`. On connect it also asks `authFacade.enabled()` — which reads the `#auth-status` JSON
the server embeds in the page, with no request, and assumes a login should the element be missing —
whether the server wants a login at all, and while it has no password navigates to that same
`nextPath` instead; nothing links to `/login` then, so only an address typed by hand shows the form
for that moment.

`gz-login` is built for password managers in two ways. KeePassXC-Browser, like most of them, finds
inputs in the document, and by default not inside shadow roots. Its first scan, once it has talked
to KeePassXC, reads only the light DOM, which is often after the login page has rendered; after
that a `MutationObserver` on the body checks each added element and the inputs in that element's
own shadow root. So the form is `gz-login`'s light DOM, shown through a `<slot>` in a shadow root
that holds only the heading, and together with `gz-app`'s slot the password field sits in the
document. And it is the one route view that is a plain `GzElement` rather than a `GzView`: `gz-app`
connects a `GzView` hidden until it has loaded and reveals it by removing `hidden`, while the
extension judges an input's size once, when it is added, and afterwards reacts only to `class` and
`style` changes — a form added hidden would be judged invisible and never looked at again. As a
plain element, `gz-login` is swapped in at once and renders its form, visible, as it connects. The
form is also the one wired with its own `submit` listener rather than a `data-action`: `GzElement`
delegates from the shadow root, which a slotted form's events reach in browsers but not in
happy-dom, so the tests could not see it.

On `/login` the header's `#syncLinks` puts a `login` class on its `<nav>`, which hides both link
lists at every width and moves the theme toggle to the far end, so the page shows only the brand
and the toggle. Elsewhere both lists end in Log out, a link to `/login` styled like its neighbors
in each list, shown once the header, as it renders, has asked `authFacade.enabled()` and put an
`auth` class on its `<nav>` — so it never shows while the server has no password. Its
`data-action="logout"` handler cancels the click before `gz-app` routes it, posts through
`authFacade.logout()` and then navigates to `/login`, toasting a failure instead.

## Paged lists

The workouts and exercises lists each show one page of `PAGE_SIZE` (10) items at a time, and the
page lives in the URL as `?page=N`, with page 1 as the bare path, so Back from a detail view, a
reload and Back/Forward all land on the same page. Because `linkPath` leaves a link with a query to
the browser, which would be a full page load, the `gz-pagination` component renders Oat's
pagination `menu.buttons` group out of buttons. It cannot call `navigate()` because `ui/` may not
import `app/`: a click emits a composed `page-change` event carrying the page number, and the list
turns it into its own URL and calls `navigate()`; `gz-app` rebuilds the view on the route change,
so a list reads `location.search` only when it connects. `ui/pagination/pagination.ts` holds the
pieces, none of which touch the DOM: `parsePage` reads `?page=` (anything but a positive integer is
page 1), `pageCount`, `pageOffset`, `pagePath` and `pageItems` (the first page, the last and the
current one ±1, with a gap for a hole of two or more), which the component renders. `pageOffset`
caps the offset at `MAX_OFFSET`, the largest the API accepts, so even `?page=99999999` is a valid
request whose `total` fills the header, and `pageCount` stops at the last page that cap can reach.
A page past `pageCount`, given as `gz-pagination`'s `page` and `pages` attributes, shows "No
<noun> on this page." with a Go to page 1 button in place of the pager, and the list leaves out its
cards.

Both lists show their count as a muted subtitle under the heading.

## Workouts

### The card

`gz-workout-card` is the one place a listed workout is drawn, on the log and on the dashboard, in
three lines: a head with the open-card link and, on a done workout, a success "✓ Done" badge at its
end; the date in muted text; and a foot with the totals, also muted text rather than a badge, and
Repeat at its end — which copies the sets into a new session dated today through `workoutFacade`
and opens it. A done workout's card also takes a `--success` border; both the badge and the border
follow the workout's stored `done`, not its sets, so a workout finished with sets skipped shows as
done. Each view renders `<gz-workout-card data-id>` and hands every card its workout in
`afterRender()`, as `gz-workout-detail` does its set rows.

### Starting a session

The workouts list has no form: its "Start session" header button creates a workout dated today and
opens it, as the dashboard's "Log today's workout" does, and a title, notes or a past date are set
on the workout itself.

The button builds a session from exercises already trained. On click, `gz-workout-list` fetches the
unpaged exercise list through `exerciseFacade` — on click, not on load, since only this needs it —
keeps those with a `lastPerformedOn`, most recent first, then by name, and hands them to
`pickExercises()` from `internal/start-session.ts`, which opens `gz-start-session-dialog` and
resolves as `confirmAction()` does for `gz-confirm-dialog`: the dialog lists one checkbox per
exercise with its muscle-group icon, name and "last Oct 5", records the ticks in tick order, and
resolves those ids for "Start with N" (disabled at none), `[]` for "Start empty", and `null` for
Cancel, Escape or the backdrop. It updates the start button in place rather than re-rendering,
which would close the dialog. `null` starts nothing; otherwise the view creates today's workout
through `workoutFacade`, copies the picked exercises' last sessions into it through
`setFacade.addExercises()`, and opens it — a failed copy toasts and still opens the new, empty
workout. With no exercise history at all the dialog is skipped and an empty session starts, and the
button is disabled while any of this runs, so a double click starts one session.

### The workout page

`gz-workout-detail` puts the logging first. From the top: the sticky set progress strip; the title
and the date with its relative day; one summary line of muted totals — sets, exercises, reps and
volume — followed, on a done workout, by its "✓ Done" badge; the exercise groups;
`gz-add-set-form`, which a done workout does not render; the finish button, "Mark workout done" or,
on a done workout, an outline "Reopen workout", once the workout has sets; and last a collapsed
`<details>`, "Details & notes", holding the workout's autosaving details form and a danger "Delete
workout" button, so editing the date or title and deleting stay out of the way and Delete is not a
mis-tap beside the title. That section carries no `name`, so it does not join the exercises'
exclusive group, and the view remembers whether it is open in `#detailsOpen`, through a `toggle`
listener, because a save in it and every set change re-render the view.

The workout's details form saves without a button or a toast: a committed change, or Enter in the
date or title (in the notes it is a new line), PATCHes the details that differ from the workout,
and the view patches the heading in place (see "Set rows"). A re-render for any other reason puts
focus back in a details field by its id while `#edits` keeps its text.

### Exercise groups

The view groups the workout's sets by exercise in Oat's accordion: one `<details name="exercises">`
per exercise, in the workout's order, rendered in the view's own shadow root rather than by a
per-exercise component, because `name` exclusivity only groups `<details>` within one tree. At most
one exercise is open, and all may be collapsed. The view remembers which in `#openExerciseId`, for
the same reason it keeps `#edits`: every change re-renders. `undefined` means the first load has
not decided yet, and it then opens the exercise of the first set not done, otherwise the last
exercise. After that a `toggle` listener on each `<details>` (the event does not bubble) records
the one opened and clears the id when that one closes; a set logged through `gz-add-set-form` opens
its exercise, since the form's `set-logged` event carries `{ exerciseId }` (the created exercise's
id for a new one); and an id no longer among the groups, its last set deleted, collapses them all.
Every other change to a set leaves the open exercise open.

Each header (`<summary>`) holds only the muscle group's labeled `gz-muscle-group-icon` (none for an
exercise without a group), the exercise name, its stats "N sets · volume" in muted text — "3 sets ·
30 reps" for a bodyweight exercise and "3 sets · 22 reps" for an assisted one, whose client has no
body weight to turn assistance into volume — and a progress badge — an outline "x/y done", or a success "✓
Done" once all of its sets are — so a collapsed exercise is a glanceable name, stats and state, and
nothing in it can be tapped by mistake. On a phone the icon and name keep the first line beside the
chevron, and the stats and badge take the second.

The open group ends in a `.group-actions` footer below its rows, edge to edge like them and divided
by the same `--border` line. It holds a ▲▼ pair and an "Exercise history →" link button,
`<a class="button outline" href="/exercises/:id">`, so `gz-app` routes it and Ctrl-click opens a
tab. The pair is two `outline` buttons in Oat's `fieldset.group`, whose bottom margin and shared
border the view's stylesheet resets, since Oat only joins grouped inputs. Reordering is done to the
exercise you have open, so a closed group's arrows are hidden with the rest of its body. ▲ is
disabled on the first exercise and ▼ on the last. They are the view's own `data-action`s,
`move-exercise-up` and `move-exercise-down`, so no event is needed: a click POSTs the move through
`workoutFacade.moveExercise()`, shows the workout it answers without reloading, and focuses the
same arrow on the moved exercise, or the other one once it has reached that edge, so repeated
presses keep moving it. The open exercise stays open, and a failed move toasts and changes nothing.

### The add-set form

The view hands `gz-add-set-form` the sets back in logged order (`position`, then `id`): the form
starts from the last set it is given, which in group order would be the last exercise's. Its
exercise select offers every exercise, from `exerciseFacade.list()` without a `limit`; exercises
are created on the exercises page only, so with none yet the form links there.

Under its fields the form shows the selected exercise's last session, "Last · Oct 5: 5×100 · 5×100
· 5×105 · best 110 kg" in muted text, or "No history yet". The session comes from
`exerciseFacade.lastSession(id, workoutId)`, which leaves the open workout out, and "best" is the
`bestWeight` of the exercise list the view already loaded, so it is all-time and left out when null
or 0. For a bodyweight exercise the hint is reps only, "Last · Oct 9: 12 · 10 · 8 reps", and the
weight field is out of the way: `.field-weight` renders `hidden` with its input `disabled` while
the selected exercise is bodyweight, by the `kind` on the exercise list it is handed, and the
select's `change` listener toggles both through `#syncWeight()`. A disabled input is neither
validated nor in the form data, so the form posts no `weight` and the API stores 0. Its hint ends
in "best 15 reps" from the exercise's `bestReps` when it has one. For an assisted exercise the weight
field stays, required, but its label reads "Assistance (kg)" — `weightLabel()` in the template and
again in `#syncWeight()` on a selection change — and the hint reads "Last · Oct 9: 8×30 · 8×30 · 6×25
kg assist · least 25 kg", ending in the list's `leastWeight` when it has one.

Reps and weight are prefilled from two sources: an exercise with sets in this workout starts from
its last one there; one without starts from the first set of its last session — on a selection
change, and on the first render of a workout without sets. The lookups are cached per exercise in a
`LastSessionCache` the view owns and hands to the form, because every render of the view creates a
new form; a resolved lookup renders from the cache in `template()`, so the hint survives a logged
set, and only a pending one fills the hint in place, once it resolves and only if that exercise is
still selected. A failed lookup shows no hint and no toast.

For the same reason the form keeps what was typed into it in its `draft`, from its first `input`
until a set is logged, and the view carries that draft from the form a render replaces to the one
it creates. So a +1, × or move elsewhere on the page keeps the selected exercise, reps, weight and
notes, and no prefill overwrites them.

For an exercise not in the workout whose last session was found, an outline "Add last session's N
sets" button follows the hint, below the `<form>` so it is not part of its submit. It posts the
selected exercise through `setFacade.addExercises(workoutId, [exerciseId])` and emits the same
`set-logged` a logged set does, so the view reloads and opens that exercise's group; a failure
toasts. `#adding`, which `template()` reads, keeps it disabled and ignores clicks while it runs.

### Set rows

`gz-set-row` leaves the exercise to its group: it shows no exercise name, and its number counts
within its exercise. The rows are not boxes of their own but the exercise's lines, edge to edge
inside the accordion item and divided by a `--border` line the view draws between them, since a
row's shadow root cannot see its siblings. Every row keeps a 3px leading bar, transparent until the
set is done and `--success` after, with a `--success` number, so done sets stand out and every
row's content stays aligned.

It leads with a done toggle, a button the size of +1 that is `.outline` while the set is not done
and Oat's default fill once it is, with `aria-pressed` to match. A click PATCHes `{ done }` through
`setFacade` and emits `set-updated` (`SET_UPDATED_EVENT`) with the set the API answers, as a saved
field does, and the view swaps that set into its data without a request. +1 and ×
emit `sets-changed` instead, and the view reloads the workout; the exercises for `gz-add-set-form`
it loads only once, since nothing on the page changes one.

A set not done has no Edit button: the row is a form whose weight and reps are inputs in Oat's
`fieldset.group`, with the unit and "reps" as labels beside them, and whose notes are a third input
— reps, weight and notes only, since a set's exercise is fixed once it is saved. There is no save
button: a committed `change` (blur) or Enter, which the row catches on `keydown` because a form of
several fields without a submit button ignores it, PATCHes just the fields that differ from the
set, and nothing when none do or a field is invalid. The row runs its requests one after another,
so a change saved by the blur of a click on the done toggle lands before the set is locked.

A save never re-renders the view. If it did, it would replace the field the blur moved to, and a
phone would close its keyboard, which a later `focus()` outside a tap does not reopen. Instead,
`#patchWorkout()` stores the data through `replaceData()` and replaces only what holds no field:
the heading, the totals line, the progress strip and each group's `<summary>`. It hands each row
its set and hands `gz-add-set-form` the sets through `updateSets()`, which does not render. A saved
field updates its row's volume in place, and the row's `set` setter skips rendering when handed
the set it already holds, so only the done toggle, which the view hands a new set, re-renders a
row. The workout's details save the same way. Marking the workout done or reopening it locks or
unlocks every row, and a reload after +1, × or a logged set adds or removes rows, so those still
re-render. Around them `gz-workout-detail` asks the focused row for `focusedField()` and hands it
to the replacing row's `restoreField()`, with whatever was typed there by then.

A done row mirrors the backend's lock: it keeps its fields and × in place but disabled, keeps +1,
and mutes its load. A done workout locks every row, as the backend locks its sets: the view sets
each row's `locked` before its `set`, and a locked row disables its toggle, fields, +1 and ×
whatever the set's own state. The view hands each row its group's `kind` the same way; a
bodyweight row has no weight input, `×` or volume, saves and duplicates its set without a weight,
and its delete confirmation names it "12 reps". An assisted row keeps its weight input, labeled
"kg assist" with the `aria-label` "Assistance", has no volume, and its delete confirmation names it
"30 kg assist × 8" through `formatAssistance()` in `ui/format.ts`.

### The progress strip

Once the session has sets, `gz-workout-detail` opens with a progress strip, its first child: one
line in a floating `--card` box with `--radius-medium` and `--shadow-medium`, holding the label
"x/y sets", a native `<progress>` filling the rest of the width, and the percentage, floored
(`Math.floor(x * 100 / y)`) so it reads 100% only when every set is done; the numbers use tabular
figures and do not wrap, and the full sentence, "x of y sets done", is the bar's `aria-label`. The
fill is Oat's `--primary` until every set is done, then `--success`, with a ✓ before the label. The
strip follows the sets, not the workout's `done` flag, so it stays, read-only, on a done workout;
without sets there is none.

It is sticky at `top: var(--header-height)`, so it sits flush below the header while the workout
scrolls behind it, and `app.css` gives the document
`:root:has(gz-workout-detail) { scroll-padding-top }` of the header plus 3rem, so a field the view
focuses after a re-render is scrolled into view below the strip rather than under it; `:has()` sees
the view because it is light DOM. Every re-render makes a new `<progress>`, which would jump to its
value, so the view keeps the value it last showed in `#barValue`, renders the new bar at that value
with the real count in `data-value`, and in `afterRender()` forces a layout (`void bar.offsetWidth`)
before setting the real value, so Oat's width transition on `::-webkit-progress-value` slides it in
Chromium. Firefox's `::-moz-progress-bar` has no transition and jumps, as does every browser under
`prefers-reduced-motion`. `#barValue` starts `null`, and a render without sets sets it back to
`null`, so a first render shows the value without a slide. The label, percentage and `aria-label`
always show the real count.

### Finishing a workout

"Mark workout done" PATCHes `{ done: true }` through `workoutFacade`, toasts "Workout done" and
shows the workout it answers, keeping the loaded exercises, since that response carries none. When
some exercise still has sets not done, it first asks through the confirmation dialog, like the
app's other confirmations, listing each incomplete exercise as "<name> — x/y sets" in the workout's
order; Cancel sends nothing, and with every set done it asks nothing. "Reopen workout" PATCHes
`{ done: false }` and shows the answer the same way, without asking or toasting. Either one toasts
a failure and changes nothing.

## Exercises

### The list

The exercises list searches by name and filters by muscle group and by type, through a "Search"
`<input type="search">` and two `<select>`s beside its heading: "Muscle group" offers "All", the
muscle groups and "No muscle group", and "Type" offers "All", "Weighted", "Bodyweight" and
"Assisted". The three live in the URL as `?search=<text>`, `?muscleGroup=<group>` or
`?muscleGroup=none` and `?type=weighted`, `?type=bodyweight` or `?type=assisted`, beside `?page=`,
as an `ExerciseFilterDto` that `parseExerciseFilter` reads and `exercisesPath` writes, both in
`features/exercises/internal/exercise-filter.ts`, since `pagePath` only knows `?page`; an unknown
value of either select reads as "All", and an empty or over-120-character search as none. The
search is trimmed and matched on the server, so it spans every page. It applies on `change` (Enter
or leaving the field) and on the `search` event, which Chrome and Safari fire alone when the ✕
clears the field, and only when it differs from the URL's search: the two events can both arrive
for one Enter, and the view in hand is stale by then. It is not applied while typing, since each
navigation renders a fresh view and would take the field's focus and caret. When the field still
had the focus as the search applied (Enter or the ✕, not leaving it), the fresh view focuses its
own field with the caret at the end, once `gz-app` has revealed it. Changing any filter
keeps the others and navigates to page 1, and a `page-change` keeps all three. With a filter the
subtitle reads "3 of 12 exercises", from the page's `total` and `all`, and an empty page names what
is filtered: "No Legs exercises yet.", "No bodyweight exercises yet." or "No weighted exercises
without a muscle group.", and with a search `No weighted Legs exercises match "squat".`. Adding an
exercise drops the search and navigates to its own group (`none` when it has none), and to its own
type while a type is chosen, then to the page of that filtered list that now holds it, found
through `exerciseFacade.position()` with the same filter, so the new card is always in view; should
that request fail after the exercise was created, the list reloads the page it is on instead.

The list keeps its add form in a collapsed `<details class="add">`, "Add an exercise", which starts
open only while there are no exercises at all, whatever the filter. Its muscle group is a
`<select>` of "None" and the muscle groups, as in "Edit exercise", both rendered by
`muscleGroupOptions` in `features/exercises/internal/muscle-groups.ts`. Its `MUSCLE_GROUPS` is the
frontend's own copy of the backend's list, since `src/shared/` holds no values; both are typed
against `MuscleGroup` in `src/shared/muscle-group.ts`, and a test on each side pins the full list.
Below the fields both forms have a "Type" `<select name="kind">` of Weighted, Bodyweight and
Assisted, rendered by `kindOptions` in `exercise-filter.ts` beside the filter's
`typeFilterOptions` and labeled by its `KIND_LABELS`; the add form starts on Weighted and the edit
form on the exercise's kind, and both send `kind`. A bodyweight or assisted exercise's card joins
its muscle group, its kind's label and its notes with `·`, and its page reads "Chest · Bodyweight"
or "Back · Assisted" under its name, or the label alone without a group. A bodyweight card reads
"15 reps best" from `bestReps`, and an assisted one "17.5 kg assist least" from `leastWeight`.

### The exercise page

`gz-exercise-detail` puts the progress first: the name and muscle group, a row of `gz-tile`s,
`gz-progress-chart` and `gz-session-table`, and last a collapsed `<details class="edit">`, "Edit
exercise", holding the save form and a danger "Delete exercise" button. It keeps no open state,
unlike the workout's "Details & notes": only a successful save reloads the view, which closes the
section while the toast confirms the save, and a failed save or a metric switch re-renders nothing.
A bodyweight exercise speaks in reps: its tiles are Sessions, Best set ("15 reps"), Top set (the
latest session's `topReps`, with its change against the previous session) and Total reps; the view
sets `kind` on `gz-progress-chart` and `gz-session-table` before their `sessions`, so the
chart offers Top set and Total reps from its `BODYWEIGHT_METRICS`, falling back to the first for a
remembered weighted metric, and the table shows Date · Sets · Top set · Reps with the change on
Reps. An assisted exercise speaks in assistance: its tiles are Sessions, Best set ("17.5 kg assist ×
8", the least assisted), Least assistance (the latest session's `leastWeight`, "−2.5 kg vs. previous
session") and Effective volume, summed over the sessions that have one; the chart offers Least
assistance, Effective volume and Total reps from its `ASSISTED_METRICS`, a session without an
effective volume passed to `gz-chart` as `NaN`, which it leaves out; and the table shows Date ·
Sets · Reps · Least assist · Effective volume ("–" without one), where `changeTemplate()`'s
`lowerIsBetter` colors a drop in assistance `up`.

### Muscle-group icons

A muscle group is drawn by `gz-muscle-group-icon`. Its `group` attribute picks one of the inline
stroke SVGs in `currentColor`, kept in a `Record<MuscleGroup, RawHtml>` so a group without a
drawing fails typecheck. Without `label` the icon is decorative (`aria-hidden`), as beside the
group's name on an exercise card and in the exercise header; with `label` it is announced as
`role="img"` with that `aria-label` and an SVG `<title>` as its tooltip. A missing or unknown
`group` renders nothing and sets `hidden` on the host, so an exercise without a group leaves no
gap. The muscle group `<select>`s carry it too: they are `select.rich`, which `shared.css` turns
into a customizable select (`appearance: base-select`) where the browser has one, so each group's
option shows its icon and a `<selectedcontent>` copies it into the closed select; any other browser
drops the markup and shows today's text-only list.

## Statistics

The Statistics page, `gz-stats` at `/stats`, shows one month of `gz-calendar` from
`stats/internal/`, a Monday-first grid built by `monthGrid()` in `internal/month.ts`, from
`statsFacade.calendar(month)`. The month lives in the URL as `?month=YYYY-MM`: `parseMonth()` reads
it and falls back to the current month by the browser's date (`todayIso()`), which is why the API
requires it rather than guessing a timezone. The ‹ and › buttons are buttons for the same reason
`gz-pagination`'s are — `linkPath` leaves a link with a query to the browser — and since an
`internal/` component does not route, `gz-calendar` emits a composed `month-change` carrying the
month. `gz-stats` loads that month's calendar and only then pushes `?month=` with
`history.pushState()` and shows it in place, rather than calling `navigate()`, which would remount
the page and fetch the month-independent section below again; a failed month keeps the shown one
and its URL and toasts. Back and Forward still go through `gz-app`, which remounts the page. › is
disabled on the current month and any later one.

A day with one workout is a plain link to it, which `gz-app` routes; a day with several is an
`ot-dropdown` whose button shows their count and whose `<menu popover>`, one id per day, links each
workout with its level and %. Each workout day shows a marker for its progression, a
`gz-progress-marker` element shared with the section below, for the fraction the API computes (see
"Statistics" in `docs/backend.md`), bucketed by `progressionLevel()` in `internal/progression.ts`:
▲ in `--success` from +2.5%, ▼ in `--danger` from −2.5%, ■ in `--muted` in between, and a dashed
`--primary` ring when nothing was compared — drawn, not a ◌ glyph, which fonts do not center.
Today's date sits in a filled `--primary` circle. `PROGRESSION_THRESHOLD` there is the one place
that 2.5% is written, and its `LEVELS` table gives the tiles, the menu items and the legend under
the grid the same icons and words. The exact %, the number of compared exercises and, on a day of
several, the number of workouts are in the tile's `title` and `aria-label`; the markers are filled
circles in Oat's tokens, so the multi-workout button stays an Oat `.ghost` button rather than
taking a color of its own.

Below the calendar, `gz-exercise-progress` lists every exercise trained in the last `RECENT_DAYS`
days from `statsFacade.recentExercises(since)`, loaded beside the calendar with `Promise.all` but
caught on its own, so a failure toasts and leaves an error line in the section's place while the
calendar still shows; `since` is `daysBefore(todayIso(), RECENT_DAYS)`, `daysBefore` from `ui/format.ts` and
`RECENT_DAYS` from `internal/dates.ts`, by the browser's date and independent of the calendar's month. Each exercise is an `article.card` in a
plain `<section>`, a grid that collapses to one column on a phone: the name linking to the
exercise, its overall marker and %, then its last three sessions, each linking to its workout with
its volume, total reps for a bodyweight exercise or effective volume for an assisted one ("–"
without one), and its marker and % against the session
before. Marker and % share one `role="img"` span whose `title` and `aria-label` say what was
compared, for the overall value the date of the session it compares against (`progressionSince`).
The sessions are an `<ol>` whose items lay out on a shared grid with `subgrid`, not
`display: contents`, which drops the list's semantics in WebKit. The markers are the same
`gz-progress-marker` the calendar uses, which owns their CSS so neither shadow root copies it, and
the cards render in the order the API sends.

## Weight

The Weight page, `gz-weight` at `/weight`, is the body weight log: one weigh-in per date (see
"Weight" in `docs/backend.md`). It opens with the heading and, as its subtitle, the latest weight
and its 30-day change, "82.4 kg · ▼ 0.6 kg in 30 days", or "Log your first weigh-in to start the
trend." without any. The value shown is always the API's `latest`, the newest weigh-in overall,
never merely the newest one loaded.

### Range and trend

The range — `30d`, `90d`, `1y` or `all`, `90d` by default — lives in the URL as `?range=`, with
`90d` as the bare `/weight`, and `internal/range.ts` reads and writes it: `parseRange()` reads
anything unknown as `90d`, `rangeFrom()` is the first date shown and `loadSince()` the first one
loaded, 6 days earlier, so the 7-day average is complete at the left edge; `all` has neither. One
`weighInFacade.list(since)` request feeds the chart, the history and the subtitle. The Trend card
switches the range with a row of buttons styled like `gz-progress-chart`'s metric switch — `outline`
unless current, with `aria-pressed` — and, like `gz-stats`' months, loads the new range, then pushes
its URL and shows it in place without remounting, guarded by a token against a slower earlier
answer; a failure toasts and keeps the shown range. Back and Forward go through `gz-app`.

`internal/trend.ts` holds the math. `averageAt(items, date)` is the mean of the weigh-ins in the 7
calendar days ending on that date, so a gap leaves fewer to average rather than shifting the window.
`trendPoints(items, from)` gives each weigh-in from `from` on its average over every loaded item,
and the chart plots them by date, its line through the averages and its dots at the weigh-ins,
under the hint "Dots are single weigh-ins; the line is their 7-day average." The history lists
only the weigh-ins from `from` on, so the 6 extra days are not shown. `change(items, today)` is the
average of the 7 days ending today minus that of the 7 days ending 30 days ago, anchored at today
rather than at the newest weigh-in, since every range loads at least today − 36 days and so always
holds both windows; it reads "▼ 0.6 kg", "▲ 0.3 kg" or, below 0.05 either way, "± 0 kg", each "in
30 days". Without one of the two windows, after a week without weigh-ins, the subtitle shows the
latest weigh-in's date instead.

### Logging a weigh-in

The "Log a weigh-in" card is a form of a date, defaulting to the browser's today (`todayIso()`) and
going no later, and a weight prefilled with `latest`'s, submitted by "Log". Before it PUTs, it finds
the date's current weigh-in: among the loaded items when the date is on or after the loaded
`since`, and otherwise through `weighInFacade.get(date)`, where a 404 means there is none — so a
date outside the shown range is still asked about. When there is one it asks first, "Replace
weigh-in?" with "Oct 12 · 82.9 kg → 82.4 kg", and Cancel sends nothing. It then toasts "Weigh-in
logged" or "Weigh-in replaced" and reloads the page. A failed lookup toasts and sends nothing.

### The history

Below the form, the history lists the weigh-ins newest first as `gz-weigh-in-row`s from
`weight/internal/`, each handed its weigh-in in `afterRender()`. A row is the date, the weight as an
input with "kg" in Oat's `fieldset.group`, and a `.ghost` × named "Delete Oct 13's weigh-in". Like
`gz-set-row`, it has no save button: a committed `change` or Enter PUTs the weight when it differs
and is valid, one request after another, and emits `weigh-in-saved` with the weigh-in the API
answers; the page swaps it into its data and re-renders without a request, keeping the focused field
through `focusedField()` and `restoreField()` as `gz-workout-detail` does. × asks "Delete
weigh-in?" in a danger dialog, then DELETEs and emits `weigh-in-deleted` with the date, and the page
drops that row. A failure toasts and changes nothing. Both inputs take any decimal (`step="any"`)
between 20 and 500, since the API keeps two decimals and a stored 82.46 would otherwise read as
invalid.

### Importing from EufyLife

Between the Trend card and the history, `gz-weigh-in-import` from `weight/internal/` imports a CSV
the EufyLife app exports under Me → Data → Export All Data. `internal/eufy.ts` parses it in the
browser: `parseEufyCsv(text)` finds the `Time`, `Family Members` and `WEIGHT (kg)` columns by name
and ignores the rest, takes the date from the `YYYY-MM-DD hh:mm:ss` time as written, and keeps each
day's last reading per family member, oldest first, since the API keeps one weigh-in per date. A
reading with no weight, or 0, is skipped. A file
without those columns, or a row whose time it cannot read, throws an `EufyFormatError`, which the
card shows in an error alert.

Choosing a file reads it at once and enables Import. With more than one family member, a select
offers each with its count ("eufy · 115 weigh-ins"), and a line below shows the chosen member's
count and first and last dates. Only that select and line re-render, since a render would clear
the file input. Import asks "Import 115 weigh-ins?", noting that a weigh-in already logged on one
of the dates is replaced, then posts them through `weighInFacade.importAll()`, toasts "Imported 115
weigh-ins" (with ", 3 replaced" when any were), resets the form and emits `weigh-ins-imported`,
on which the page reloads. A failed import toasts the API's message and keeps the file chosen.

### The dashboard tile

The dashboard's fourth tile is Body weight, drawn by `gz-weight-tile`, which sits at the weight
feature's root because the dashboard renders it, so the trend math stays inside `weight`. The
dashboard loads `weighInFacade.list()` from 36 days back — the 30-day change's two 7-day windows —
beside its summary, caught on its own like `gz-stats`' recent exercises: a failure toasts and hands
the tile `null`, and the rest of the dashboard still shows. The tile wraps
`<gz-tile label="Body weight" href="/weight">` and shows `latest`'s weight with the 30-day change,
else `latest`'s date, else "–" with "Log your weight". Its host stretches, so the tiles keep equal
heights. `gz-tile` takes an optional `href`: with one, its label is a link whose `::after` covers
the tile, as in `article.open-card`, so the whole tile opens `/weight` and Ctrl-click still opens a
tab. The Workouts tile's hint is "318 sets · 4,120 reps"; `SummaryDto.exerciseCount` stays in the
API, unread by the dashboard.

## Loading

The frontend is TypeScript on disk and JavaScript on the wire. `src/backend/features/static` runs
each module through `Bun.Transpiler` as it is requested — tens of microseconds per file, the whole
frontend in a couple of milliseconds — and hands the result back as `text/javascript`. Served from
source, nothing is written to disk and nothing is bundled: specifiers are left untouched, so a
module imports `'../../ui/format.ts'` and the browser fetches the file of that name, and editing a
module and reloading is the whole edit loop. A deployed build (`bun run build`) serves the whole
frontend as one bundle at `/main.ts` instead, carrying Oat's script and every stylesheet as text,
so nothing fetches a sheet there, and links Oat, `ui/shared.css` and `ui/app.css` joined in that
order as one `/main.css`. Its page drops the `oat.js` script and the preloads, so a first visit
asks for the page, one stylesheet and one script (see "Single-file build" in `docs/backend.md`).
Oat's CSS and `shared.css` then travel twice, once in each, which costs bytes but no round trip,
since both download in parallel and are kept for good. A lazily imported view still runs only when
first opened. `src/frontend/` is the web root, so a module's URL is its path below it:
`src/frontend/app/gz-app.component.ts` is served at `/app/gz-app.component.ts`.

The transpiler **erases types without checking them**, and throws only when a file will not parse.
A type error transpiles happily and ships; `bun run typecheck` is the only gate that catches it. A
file that does not parse comes back as a 500 naming it, which the toast then reports.

A route's script and stylesheet arrive the first time that route is opened, and never otherwise.
Opening the dashboard fetches only the components the dashboard renders; the chart is downloaded
only once you open an exercise or the Weight page. Two pieces make that safe: `define()` awaits the component's
stylesheet before registering the element, and a top-level `await` blocks the modules that import
it — so the `await import('./gz-exercise-detail.component.ts')` in the exercise route's `view()`
resolves only when that view _and_ everything it renders have their scripts and their CSS. A lazily
loaded page is fully styled on its first paint; there is no flash of unstyled content to guard
against.

Only the shell (`gz-app`, `gz-header`, `gz-theme-toggle`, `gz-breadcrumbs`) with `ui/view.ts`,
`http/errors.ts`, `ui/toast.ts` and `app/tab-title.ts`, which `gz-app` imports, `app/routes.ts`
with the features' route files, the auth facade with its API class and `http/http.ts`, which
`gz-header` imports for Log out, and Oat plus `ui/shared.css` load up front. `gz-app` guards
against two navigations resolving out of order and reports a failed import through the toast.

Served from source, modules and stylesheets arrive a level of imports at a time: the browser learns
of a module only once it has fetched and parsed the module importing it, and the chain from
`main.ts` is several imports deep. Over localhost that costs next to nothing, and the deployed
bundle has no waterfall at all, so nothing preloads modules or component stylesheets. `index.html`
itself preloads `/vendor/oat.css` and `/ui/shared.css` for `fetch()` beside linking them as
stylesheets, because a stylesheet link's response cannot answer a `fetch()`, and the top-level
`await` in `styles.ts` holds back every component module until both have loaded. `crossorigin` is
load-bearing there: it gives the preload the CORS mode `fetch()` uses in `styles.ts`, and without
it the fetch would not reuse the preload and would go to the network a second time. Even so, each
of the two is downloaded twice on a first visit, once per mode, which is why the build inlines
them.

On a repeat visit nothing but the index page needs asking about. The server names every module,
stylesheet and Oat file by a versioned URL, `/ui/format.ts?v=<content hash>`, and lets the browser
keep that for good, since the bytes behind it can never change (see "Pages" in `docs/backend.md`).
The index page links its own files by those URLs, and its import map rewrites every other one: a
module still imports `'../../ui/format.ts'`, which resolves to the plain URL as before and is then
mapped to the versioned one. So `import.meta.url` carries the version, and anything that keys by a
module's URL takes its pathname, as `styles.ts` does. `styles.ts` fetches a sheet by the versioned
URL it looks up in the import map, which `import.meta.resolve()` would also give in a browser but
not under bun test, where it resolves against the file system; a page without a map, as in the
tests, fetches the plain URL. `index.html`'s preloads name the same versioned URLs, so they still
match what is fetched. When this was introduced, opening the dashboard a second time from source in
headless Edge with 100 ms of added latency sent 4 requests for static files rather than 49, and it
was defined after about 265 ms rather than 1175 ms; the first visit was unchanged. The import map
makes the index page a few kilobytes larger, and the index page is still revalidated on every
visit, since it names the versions. A built page leaves the map out, since nothing in it looks a
URL up there.

Styled is not the same as ready, though: a view fetches its data once connected, and until then it
renders a "Loading…" line. Swapped in straight away, every page switch would collapse the page to
that line for a frame or two and expand it again. So `gz-app` keeps the outgoing view on screen
until the incoming one is ready. It connects the new view `hidden` beside the old one, awaits its
`ready` promise, then removes the old view, reveals the new one and scrolls to the top. `ready`
lives on `GzView` and starts out settled; a view replaces it with its first `reload()` on connect,
which catches its own errors so the promise never rejects. `gz-app` waits only for a `GzView`;
anything else, such as its not-found line, is swapped in straight away. The wait is capped at
300 ms (`SLOW_VIEW_MS`), after which a slow API shows the view's loading state rather than a
navigation that seems to do nothing. Two details hold this together. `shared.css` sets
`:host([hidden]) { display: none }`, because its own `:host { display: block }` outranks the
browser's `[hidden]` rule. And the swap removes the other children rather than calling
`replaceChildren(view)`, because moving an already connected view reconnects it and it would fetch
a second time.

## Hot reload

`bun run start:dev` sets `GAINZ_DEV=1`, and the server then injects `dev/hot.ts` into the index page
and opens `/dev/ws`, over which it pushes one message per file saved under `src/frontend/` (the
backend half is described in `docs/backend.md`). `bun start` does neither, and neither does a built
`dist/gainz.js`, whatever `GAINZ_DEV` says.

Saving a `.css` restyles the page in place, with no reload and no lost form state or scroll
position. That costs nothing because every component adopts its `CSSStyleSheet` objects by
reference: `reloadSheet` in `ui/styles.ts` refetches into the **same** object, and every live
instance picks the change up without re-rendering. It refetches with `cache: 'no-cache'`, because
the sheet's versioned URL may sit in the browser's cache for good while the file under it has
changed; the server answers a version that is no longer current with the current bytes. A
stylesheet in the document rather than a shadow root — `ui/app.css`, and the `<link>`s to Oat's
`oat.css` and `ui/shared.css` — is swapped for a fresh `<link>`, the old one removed only once the
new one has loaded. A stylesheet the page has never fetched reloads the page.

Saving a `.ts` or `index.html` reloads the page, because a module cannot be evaluated a second
time: `customElements.define` throws on a tag it already knows, and `define()` returns early for
one, so a re-run module would quietly keep the old class. Before reloading, `hot.ts` sends a `HEAD`
for the module; a file that will not parse answers 500, and rather than reload into a blank page
the client reports it through the toast and waits for the next save. Saving `manifest.webmanifest`
or an icon reloads the page too.

**`styles.ts` keys its sheets by pathname.** `loadStyles` receives a module's absolute
`import.meta.url`, but `BASE_HREFS` are pathnames and the server reports a change as a pathname, so
the key is normalized to `/ui/tile/gz-tile.component.css`. Revert that and every component
stylesheet silently misses the lookup and falls back to a full reload, while `shared.css` keeps
swapping and hides the regression.

Bun's own HMR is not used. It exists only behind its bundler, which would rewrite the page's
scripts and stylesheets to hashed bundle URLs and break the module-URL-is-its-path property
`styles.ts` finds a component's stylesheet by. With no `import.meta.hot.accept()` handlers it would
full-reload anyway.

## Theming

`src/frontend/ui/theme.ts` holds the preference and sets it as `data-theme` on `<html>` alone.
`ui/app.css` turns that attribute into `color-scheme: light` or `color-scheme: dark`. Oat colors
every token with `light-dark()` under `:root { color-scheme: light dark }`, and `color-scheme` is
an inherited property, so the choice reaches every shadow root with no per-host mirroring. With no
attribute set, Oat's `light dark` follows the system. The brand and contrast tokens — `--primary`,
`--background`, `--card`, `--muted`, `--border` and the rest — are overridden in `app.css`, again
with `light-dark()`, and `ui/contrast.test.ts` checks every pair against WCAG AA. The control is
`gz-theme-toggle`, an icon-only `<button>` in the header that calls `toggleTheme()`. It holds a sun
and a moon SVG and shows the sun in light mode and the moon in dark mode, and its `aria-label`
flips between "Turn on dark mode" and "Turn off dark mode". A theme change toggles the icons'
`hidden` attributes and the label in place, without re-rendering the button and dropping its focus.

A visitor who has never touched the theme toggle is seeded from `prefers-color-scheme` once, at
load. The first flip stores an explicit choice that wins from then on, so the page does not follow
the operating system around afterwards.

A `<meta name="theme-color">` colors the Android status bar and an installed desktop window's title
bar. It mirrors `--card`, so the bar blends into the header: `#fff` in light mode, `#202024` in
dark. The inline script in `index.html` sets it before the first paint, from the stored choice or
else the system, and `applyTheme()` keeps it in step with the toggle. The two colors therefore live
in three places — `--card` in `app.css`, the inline script and `THEME_COLORS` in `theme.ts` —
because the script runs before any stylesheet or module, and `theme.test.ts` keeps them equal. The
manifest's `theme_color` and `background_color` carry the light values, because a manifest has no
dark variant: the meta tag overrides `theme_color` once the page loads, and `background_color` only
shows on the splash screen.

Oat is served from `node_modules` at `/vendor/oat.css` and `/vendor/oat.js` through an explicit
allowlist in `src/backend/features/static` — installing a package never publishes anything the app
did not ask to serve. A single-file build serves neither: its page reaches Oat only through
`/main.css` and the bundle.

## Installing

`manifest.webmanifest` makes gainz installable from the browser menu in Chrome on Android (a real
app, a WebAPK, not a shortcut) and in desktop Chrome and Edge; the installed app opens standalone
at `/`. There is no service worker. Installing from the menu has not needed one since Chrome 108 on
Android and 112 on desktop, a pass-through `fetch` handler would only slow every request, and
offline support is a decision of its own. Without one there is no automatic install banner.

The icon is a white barbell on `#2563eb`. `icons/icon.svg` is the favicon and the "any" icon, and
`icons/icon-maskable.svg` draws the same barbell on a full-bleed background, already inside the
maskable safe zone, for Android's adaptive mask. The PNGs beside them exist because the Android
WebAPK needs raster icons at 192 and 512 — with SVG icons alone Chrome offers only a shortcut — and
the manifest lists them first. iOS is not targeted, so there is no `apple-touch-icon`.

The PNGs are rasterized once, by hand, whenever an SVG changes. In a Chromium browser, load the SVG
into an `Image`, draw it with `drawImage(img, 0, 0, size, size)` onto a canvas of that size — the
explicit size matters, because the SVGs carry only a `viewBox` — and save
`canvas.toBlob(…, 'image/png')`: `icon-192.png` and `icon-512.png` from `icon.svg`,
`icon-maskable-512.png` from `icon-maskable.svg`. Look at each one before committing it.
`static.routes.test.ts` checks that every PNG's real size matches the manifest.

## Tests

The frontend's tests run under `bun test` with the backend's, in the same process. Most need no DOM
and run without one: the `html` template's escaping, `format.ts`, the router, the paging
arithmetic, the theme preference, the HTTP client and the URL each facade method requests. That is
why `html.ts` is its own module rather than part of `base.ts`: importing `base.ts` evaluates
`class extends HTMLElement` and, through `styles.ts`, a top-level `fetch` of the stylesheets.

A component test calls `useDom()` from `src/frontend/testing.ts`, which installs a
[happy-dom](https://github.com/capricorn86/happy-dom) window's globals for that file and puts Bun's
back after its last test. It is per file rather than a `bunfig.toml` preload because the backend's
route tests make real requests and need Bun's own `fetch`, `Response` and `URL`, all of which the
window replaces. There is one window for the whole process, created by the first file that asks:
bun caches a component module across files, so the class it registered keeps extending that
window's `HTMLElement` and stays in that window's `customElements`, and a fresh window would leave
later files with neither. Between tests `useDom()` empties `document.body` and `localStorage`. For
the same reason `src/scripts/build-bundle.test.ts` runs the built bundle in a child process,
`build-bundle.probe.ts`, with a window of its own: in-process, a component another file had already
defined would make the bundle's `define()` return early.

Because a static import runs before any hook, a component test `await import()`s the component in
`beforeAll`, after `useDom()`, and then creates it by tag name and reads its open `shadowRoot` —
or, for `gz-login`'s form and `gz-app`'s view, the host's light DOM. Under `useDom()`, `fetch`
answers a `.css` URL with an empty `200`, so stylesheets load silently, and rejects anything else
with an error naming the method and URL; a test that needs an API answer puts `useFetch()` on top.
A test sets a component's attributes before appending it, because happy-dom does not call
`attributeChangedCallback` for attributes already present at upgrade. happy-dom has no popovers,
so `gz-header`'s dropdown is not tested, and with every sheet empty no test asserts styling.
`gz-app`'s tests mostly use paths no route matches, so no feature view or API is loaded; they also
open `/login` and a workout, with the API faked, for the breadcrumb and the tab title, and reset
`document.title` before each test, since happy-dom keeps the `<title>` it wrote in `<head>`. Its
hidden/`ready` view swap is not covered yet.

`src/frontend/testing.ts` also holds the stubs. `useFetch()` replaces `fetch` with one that records
each request and answers `200 {}` unless told otherwise: `respondWith()` sets the answer for every
request, and `respondTo('GET /api/exercises', …)` one for a single method and URL, which a view
that loads from two URLs needs. `useToasts()`, called after `useDom()`, replaces Oat's `window.ot`
and returns the messages `toast()` and `toastError()` showed. `useGlobals()` installs whatever
browser global a test needs and puts back what was there after every test — which matters because
bun test runs every file in one process, and the backend's route tests make real requests. A
module that reads the browser when it loads, as `theme.ts` reads the stored choice, is imported
with a query string (`./theme.ts?3`) so each test gets a fresh instance evaluated against its own
stubs. A component test that imports the plain `ui/theme.ts` instead shares its state with the
component, so it resets the theme before each test.

Beside the stubs, `testing.ts` holds the DOM helpers every component test shares. `openDialog()`
returns the open confirmation dialog's shadow root, so a test clicks its `confirm` or `cancel` like
a user; happy-dom opens and closes a dialog synchronously, so it is called right after the click
that opens one. `mount(tag, attributes)` creates an element and sets its attributes before
appending it to the body, for the happy-dom reason above. `shadow()` and `find()` fail the test
with a message naming the host or the selector instead of returning null, so a test reads
`find(shadow(view), testId('heading'))` without a guard. A test finds an element by the
`data-testid` its template gives it, through `testId('heading')`, which builds the selector, never
by tag, class or structure, which change with the markup and the styling. A test id only has to be
unique within its shadow root, so `heading` or `empty` recurs from view to view. A test asserts a
class or attribute on an element found that way: a done card is `find(card, testId('card'))` with
the class `done`, not a match for `article.done`. Plain selectors remain only for assertions about
every element of a kind, such as no `button` in the details form or no `select` in a set row, and
for the `gz-login` element `gz-app` creates. `type()`, `choose()` and `submit()` dispatch the
bubbling `input`, `change` and cancelable `submit` events a user's input would. `settle()` waits
long enough for a view's faked requests, all answered at once, to land and render.
`collect('page-change')` returns the details of each composed custom event heard on the body,
outside every shadow root, and `useFetch()`'s `sent('POST /api/…')` reads back the bodies of the
requests made under the same `'<METHOD> <url>'` name `respondTo()` uses.

Domain test data lives in each feature's test-only `<feature>.fixtures.ts`, mirroring the backend's
fixtures, such as `exercise()` and `session()` in `features/exercises/` and `set()` in
`features/workouts/`. Each builds a DTO from fixed defaults and one object of overrides, so a call
site names exactly the values its assertions read. The single-file build leaves `*.fixtures.ts`
out, as it does tests.

`bun fmt` formats the markup inside an `html` tagged template, so a test that compares exact output
keeps its template free of markup and interpolates the parts it needs instead.
