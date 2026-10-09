---
date: 2026-10-06T11:35:51.384584+00:00
git_commit: 98847b2d742b89e7180137d6a187fdfbd0479373
branch: main
topic: 'Breadcrumbs through the whole app, and tab titles'
tags: [plan, frontend, gz-app, gz-breadcrumbs, router, gz-view, workouts, exercises]
status: implemented
---

# PLAN: Breadcrumbs through the whole app, and tab titles

Gives every page below the top level a consistent breadcrumb, rendered by the shell from the route
table, and gives every page a browser tab title from the same names. It replaces the inconsistent
ways up that exist today (`← Exercises` on one detail page, nothing on the other, "Back to all …"
links in error states). This is the `TODO.md` item "Breadcrumbs through the whole app".

## Acceptance Criteria

- `/workouts/:id` shows `Workouts › <workout title, else its date>` and `/exercises/:id` shows
  `Exercises › <exercise name>` as the first line of `<main>`. The parent crumb is a link to the
  bare list path (`/workouts`, `/exercises`), which `gz-app` routes without a reload. The current
  crumb is text with `aria-current="page"`, not a link.
- The dashboard, both lists, the login page and the not-found line show no breadcrumb.
- While a detail view is still loading past `SLOW_VIEW_MS`, or after its error or 404, the current
  crumb reads `Workout` / `Exercise`. Once the view has loaded it shows the entity name. It follows
  a rename (the workout's "Details & notes" form, the exercise's "Edit exercise" form) without a
  navigation.
- The trail is location-based: `/exercises/7` shows `Exercises › …` however it was reached,
  including from a workout's "Exercise history →" link.
- The breadcrumb is `<nav aria-label="Breadcrumb"><ol>`. It is styled with Oat tokens only and
  declares no font size. The `›` separator is drawn by CSS and hidden from screen readers. The trail
  stays on one line at 320 px: the parent crumb keeps its width and the current crumb truncates with
  an ellipsis.
- The tab title is `<page name> · gainz`: `Workouts · gainz`, `Push day · gainz`,
  `Exercise · gainz` while it loads, `Log in · gainz`, `Not found · gainz`. The dashboard keeps
  `index.html`'s `gainz — lifting log`.
- `← Exercises` in `gz-exercise-detail` and `GzView.backLink`, with its "Back to all …" error link,
  are gone.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test --parallel` pass.
  `docs/frontend.md` describes the breadcrumb, the route fields, the view's title hook and the tab
  title. `TODO.md` no longer lists the item.

## Technical Key Decisions and Tradeoffs

1. **Location-based trail:** the trail is derived only from the matched route, never from history.
   - Why: it is predictable and works for deep links and reloads. Browser Back already covers
     "where I came from".
   - Impact: no session state. A parent crumb always links to the bare list path, never to
     `?page=N`, which `linkPath` would leave to the browser as a full reload anyway.
2. **Routes declare it as plain data:** `RouteDef` gains `title?: string` (the page name: the tab
   title, and the current crumb until the view names its entity) and `parents?: Crumb[]` (the pages
   above it, outermost first; a route without parents shows no breadcrumb). `Crumb` is the
   `{ path, label }` shape `nav` already uses.
   - Why: one source of truth beside `nav`, and route files stay type-only importers of `app/`,
     as the lint boundary demands.
   - Impact: every route but the dashboard gets a `title`, and the two detail routes get `parents`.
3. **Only pages below the top level show a trail, with no Dashboard root:** the top-level pages
   are already marked by the header's `aria-current`.
   - Why: a one-item trail would repeat the highlighted header link.
   - Impact: the trail is two items deep today: `Workouts › Push day`.
4. **The shell renders it:** a new `app/gz-breadcrumbs` component, shell-owned like `gz-header`,
   sits in `gz-app`'s `<main>` above the `<slot>`. `gz-app` hands it a trail on every swap.
   - Why: no view can forget it, and its position is the same on every page.
   - Impact: the view stays `gz-app`'s light-DOM child behind the slot, so the password-manager
     constraint is untouched.
5. **Views name their entity through `GzView`:** a `titleFor(data)` hook (`null` by default), a
   `pageTitle` getter (the hook's answer for the loaded data, `null` while loading or after an
   error), and a `page-title` event that `GzView` emits after every `reload()`. `gz-app` reads the
   shown view's `pageTitle` at the swap and again on every `page-title` from the shown view. An
   event from a view still loading hidden is ignored, because the swap reads it anyway.
   - Why: only the view has the name, `ui/` cannot import `app/`, and the reload after a save
     re-emits it, so a rename reaches the trail and the tab.
   - Impact: `gz-workout-detail`'s heading text moves into one `workoutName()` helper, so the
     heading and the crumb cannot disagree.
6. **The back links are removed:** `← Exercises` and `GzView.backLink` with its `errorTemplate`
   branch.
   - Why: the shell's trail stays above an error and offers the same way up. Both detail views
     were `backLink`'s only users.
   - Impact: `errorTemplate` is back to the single error line, and three tests drop their
     back-link expectations.
7. **The tab title lives in `app/tab-title.ts`:** `APP_TITLE` (`gainz — lifting log`) and
   `tabTitle(name)`, which returns `${name} · gainz` for a name and `APP_TITLE` for none.
   - Why: a pure module is testable without a DOM, and a test can hold `APP_TITLE` equal to
     `index.html`'s `<title>`, the way `theme.test.ts` holds the theme colors equal.
   - Impact: the app's title lives in two places, with a test keeping them in step.

## Current State

```
gz-app (shadow root)
├── <gz-header>              brand · Dashboard · Workouts · Exercises · Log out · theme
│                            built from ROUTES[].nav, aria-current on the active one
└── <main class="container">
      └── <slot>  ← the view, gz-app's light-DOM child

ROUTES (app/routes.ts:13) = stats ▸ workouts ▸ exercises ▸ auth
  /                 gz-dashboard        nav: Dashboard
  /workouts         gz-workout-list     nav: Workouts     (?page=N)
  /workouts/:id     gz-workout-detail   —
  /exercises        gz-exercise-list    nav: Exercises    (?page=N)
  /exercises/:id    gz-exercise-detail  —
  /login            gz-login            —
  (no match)        <p data-testid="not-found">, made by gz-app
```

- `RouteDef` (`src/frontend/app/router.ts:5`) has `pattern`, `keys`, `view` and an optional
  `nav: { path, label }`. It carries no page name and no parent.
- The tab always reads `gainz — lifting log` (`src/frontend/index.html:9`).
- The ways up are inconsistent:

  | Page                    | Way back up                                                                      |
  | ----------------------- | -------------------------------------------------------------------------------- |
  | Exercise detail         | `<p><a href="/exercises">← Exercises</a></p>` (`gz-exercise-detail.component.ts:94`) |
  | Workout detail          | none, the `<hgroup>` is first (`gz-workout-detail.component.ts:239`)             |
  | Either detail, on error | `GzView.backLink` "Back to all …" below the message (`ui/view.ts:27`, `:38`)      |

- `gz-app.#swapView` (`gz-app.component.ts:102`) connects a `GzView` hidden, waits for `ready` or
  300 ms, then removes the other children and reveals it. `#viewElement` matches the route itself
  and builds the not-found `<p>` when nothing matches.
- `GzElement.emit(name, detail)` (`ui/base.ts:89`) dispatches a bubbling, composed `CustomEvent`.
- Oat has no breadcrumb component (`node_modules/@knadh/oat/css/` has none).

Exercise detail today:

```
┌──────────────────────────────────────┐
│ ← Exercises                          │
│ Back Squat                           │
│ Legs                                 │
│ [tile][tile][tile][tile]             │
```

Workout detail today:

```
┌──────────────────────────────────────┐
│ Push day                             │
│ 6 Oct 2026 · today                   │
│ 12 sets · 3 exercises · …   4/12 done│
```

## Desired End State

```
gz-app (shadow root)
├── <gz-header>
└── <main class="container">
      ├── <gz-breadcrumbs>   ← trail from the matched route + the shown view's pageTitle
      │                        (hidden when the route has no parents)
      └── <slot>             ← the view

route ──► title?, parents? ──┐
                             ├─► gz-app: trail = parents ? { parents, current } : null
view ──► pageTitle ──────────┘          document.title = tabTitle(name)
   └── 'page-title' after every reload ─► gz-app re-reads it (only for the shown view)
```

Route data:

```
  /                 (no title)                         → tab "gainz — lifting log", no trail
  /workouts         title 'Workouts'                   → "Workouts · gainz", no trail
  /workouts/:id     title 'Workout',  parents Workouts → "Push day · gainz",  Workouts › Push day
  /exercises        title 'Exercises'                  → "Exercises · gainz", no trail
  /exercises/:id    title 'Exercise', parents Exercises→ "Back Squat · gainz", Exercises › Back Squat
  /login            title 'Log in'                     → "Log in · gainz", no trail
  (no match)        'Not found' (gz-app)               → "Not found · gainz", no trail
```

Desktop, ready:

```
┌──────────────────────────────────────────────┐
│ Workouts › Push day — heavy bench            │   muted link › foreground text
│                                              │
│ Push day — heavy bench                       │   <h1>
│ 6 Oct 2026 · today                           │
│ 12 sets · 3 exercises · …          4/12 done │
```

320 px, a long name:

```
┌──────────────────────┐
│ Workouts › Push day …│   one line, only the current crumb truncates
│                      │
│ Push day — heavy     │
│ bench                │
```

Slow load (past 300 ms) or 404:

```
┌──────────────────────┐
│ Exercises › Exercise │
│                      │
│ Exercise not found   │   (no "Back to all exercises" any more)
```

Exercise detail, ready:

```
┌──────────────────────────────────────┐
│ Exercises › Back Squat               │
│                                      │
│ Back Squat                           │
│ Legs                                 │
│ [tile][tile][tile][tile]             │
```

Markup of the trail:

```html
<nav aria-label="Breadcrumb" data-testid="breadcrumb">
  <ol class="unstyled">
    <li><a class="unstyled" href="/workouts" data-testid="crumb">Workouts</a></li>
    <li><span aria-current="page" data-testid="current">Push day</span></li>
  </ol>
</nav>
```

## Abstractions and Code Reuse

- Reuses `GzElement` and `define()` for the new component, `GzElement.emit()` for the event, the
  `html` template's escaping for labels, `gz-app`'s existing link interception for the parent
  crumb, `shared.css`'s `:host([hidden]) { display: none }` to hide the component, and the
  `{ path, label }` shape of `nav`.
- `src/frontend/`
  - `app/router.ts` - adds `Crumb`, and `title`, `parents` on `RouteDef`. `nav` is typed as `Crumb`.
  - `app/tab-title.ts` (new) - `APP_TITLE`, `tabTitle(name)`.
  - `app/tab-title.test.ts` (new) - the format, and `APP_TITLE` equal to `index.html`'s `<title>`.
  - `app/gz-breadcrumbs.component.ts` / `.css` (new) - `GzBreadcrumbsComponent`, a `trail`
    property, hidden while `null`.
  - `app/gz-breadcrumbs.component.test.ts` (new).
  - `app/gz-app.component.ts` - renders `<gz-breadcrumbs>` in `<main>`, sets the trail and
    `document.title` on every swap and every `page-title` from the shown view.
    - `#viewElement` - returns the match beside the element, so the swap knows the route.
    - `#showPage` (new) - computes the name, the trail and the tab title.
  - `app/gz-app.component.test.ts` - tab title and trail for not-found, login and a workout.
  - `app/routes.test.ts` - titles, parents, and every parent naming a real route by its title.
  - `ui/view.ts` - adds `PAGE_TITLE_EVENT`, `titleFor()`, `pageTitle`, emits after `reload()`.
    Removes `backLink` and its `errorTemplate` branch.
  - `ui/view.test.ts` - the new hook and event. The back-link test goes.
  - `features/workouts/workouts.routes.ts` - `title`, `parents`.
  - `features/workouts/gz-workout-detail.component.ts` - `workoutName()`, `titleFor()`. Removes `backLink`.
  - `features/workouts/gz-workout-detail.component.test.ts` - `pageTitle`, and no back link on a 404.
  - `features/exercises/exercises.routes.ts` - `title`, `parents`.
  - `features/exercises/gz-exercise-detail.component.ts` - `titleFor()`. Removes `backLink` and `← Exercises`.
  - `features/exercises/gz-exercise-detail.component.test.ts` - `pageTitle`, and no back link on a 404.
  - `features/auth/auth.routes.ts` - `title: 'Log in'`.
- `docs/frontend.md` - tree, shell, routes, `GzView`, exercise detail, Loading and Tests paragraphs.
- `TODO.md` - drops "Breadcrumbs through the whole app".

## Logging & Observability

None. The frontend has no logging.

## Implementation

Dependencies: None

One vertical slice: route data, the shell's breadcrumb and tab title, the views' names, the back
links' removal, tests and docs together. Splitting it would leave a state with two overlapping ways
up, or names declared but never shown.

**Tasks**:

- [x] `src/frontend/app/router.ts`: export `Crumb` and extend `RouteDef`:

  ```ts
  /** A link to a page: a header link or a breadcrumb. */
  export interface Crumb {
    path: string;
    label: string;
  }

  export interface RouteDef {
    pattern: RegExp;
    keys: string[];
    view: (params: Record<string, string>) => Promise<Element>;
    /**
     * The page's name: the tab title, and the last breadcrumb until its view names what it shows.
     * Without one the tab keeps the app's own title.
     */
    title?: string;
    /** The pages above this one, outermost first; a route without any shows no breadcrumb. */
    parents?: Crumb[];
    /** A header link; `path` is explicit because a regex cannot be turned back into an href. */
    nav?: Crumb;
  }
  ```

- [x] `src/frontend/app/tab-title.ts` (new):

  ```ts
  /** The document's own title, as `index.html` declares it; the dashboard keeps it. */
  export const APP_TITLE = 'gainz — lifting log';

  /** The tab title for a page of that name, or the app's own title for none. */
  export function tabTitle(name: string | null): string {
    return name === null ? APP_TITLE : `${name} · gainz`;
  }
  ```

- [x] `src/frontend/app/tab-title.test.ts` (new): `tabTitle('Workouts')` is `'Workouts · gainz'`,
      `tabTitle(null)` is `APP_TITLE`, and `APP_TITLE` equals the `<title>` text read from
      `src/frontend/index.html` through `Bun.file` (follow how `ui/theme.test.ts` reads it).
- [x] Route data:
  - `features/workouts/workouts.routes.ts`: the list gets `title: 'Workouts'`. The detail gets
    `title: 'Workout'` and `parents: [{ path: '/workouts', label: 'Workouts' }]`.
  - `features/exercises/exercises.routes.ts`: the list gets `title: 'Exercises'`. The detail gets
    `title: 'Exercise'` and `parents: [{ path: '/exercises', label: 'Exercises' }]`.
  - `features/auth/auth.routes.ts`: `title: 'Log in'`.
  - `features/stats/stats.routes.ts`: unchanged. The dashboard has no `title`.
- [x] `src/frontend/app/routes.test.ts`: add tests that
  - the titles by path are `/` → `undefined`, `/workouts` → `'Workouts'`, `/workouts/1` →
    `'Workout'`, `/exercises` → `'Exercises'`, `/exercises/1` → `'Exercise'`, `/login` → `'Log in'`
  - only the two detail routes have `parents`, `[{ path: '/workouts', label: 'Workouts' }]` and
    `[{ path: '/exercises', label: 'Exercises' }]`
  - every parent's `path` matches a route whose `title` equals the parent's `label`, so a crumb
    cannot drift from the page it links to
- [x] `src/frontend/ui/view.ts`:
  - add `export const PAGE_TITLE_EVENT = 'page-title';`, documented as the event a view emits after
    every load, whose `pageTitle` the shell then reads
  - add the hook and getter:

    ```ts
    /** The name of what the loaded data shows, for the breadcrumb and the tab; none by default. */
    titleFor(_data: Data): string | null {
      return null;
    }

    /** `titleFor()` of the loaded data, or null while loading or after an error. */
    get pageTitle(): string | null {
      return this.#state.status === 'ready' ? this.titleFor(this.#state.data) : null;
    }
    ```

  - in `reload()`, after `this.render()`, call `this.emit(PAGE_TITLE_EVENT)`, and extend its doc
    comment to say so
  - remove `backLink` and the `if (!this.backLink)` branch of `errorTemplate`, which returns only
    `<p class="error-text" data-testid="error">`
  - update the class comment if it mentions the back link
- [x] `src/frontend/ui/view.test.ts`: delete "offers its back link below an error". Give
      `GzTestView` a `titleFor(data)` returning `data`, and add tests that
  - `pageTitle` is `null` while loading, `'x'` once the load resolves with `'x'`, and `null` after
    a rejected load
  - `page-title` is heard on the body (`collect('page-title')` from `testing.ts`) once after the
    first load, again after `reload()`, and also after an error
- [x] `src/frontend/app/gz-breadcrumbs.component.ts` (new), `export class GzBreadcrumbsComponent`
      (exported, unlike `GzHeaderComponent`, because `gz-app` types the element it drives):
  - export `interface Trail { parents: readonly Crumb[]; current: string }`
  - `trail` property (`Trail | null`, default `null`). The setter stores it, sets `hidden` when it
    is `null`, and calls `render()`
  - in `connectedCallback` set `this.hidden = this.trail === null`, so it starts hidden without
    hiding a trail set before connect
  - template: the markup under "Desired End State", empty while `trail` is `null`, labels through
    `html`
  - the class comment says it is the shell's, fed by `gz-app` from the route and the view, and
    that the parent links are plain anchors `gz-app` routes
  - ends with `await define('gz-breadcrumbs', GzBreadcrumbsComponent, import.meta.url);`
- [x] `src/frontend/app/gz-breadcrumbs.component.css` (new), nested selectors, Oat tokens only, no
      font size, no colors derived from tokens:

  ```css
  /* Breadcrumb trail above a view: muted links, the current page in plain text, one line. */

  :host {
    margin-block-end: var(--space-4);
  }

  ol {
    display: flex;
    gap: var(--space-2);
    margin: 0;
    white-space: nowrap;
    color: var(--muted-foreground);

    & li {
      display: flex;
      gap: var(--space-2);
      flex: none;
      min-width: 0;
      margin: 0;

      /* Drawn, and read as nothing: the list already says these are steps. The plain line is for
         engines without alt text for generated content, which drop the second declaration. */
      & + li::before {
        content: "›";
        content: "›" / "";
      }

      &:last-child {
        flex: 0 1 auto;
      }
    }

    & [aria-current="page"] {
      overflow: hidden;
      text-overflow: ellipsis;
      color: var(--foreground);
    }
  }
  ```

  The list and the links take Oat's `.unstyled` (`utilities.css`: `:is(ul, ol).unstyled` drops
  bullets and padding, `a.unstyled` inherits the muted color and turns `--primary` on hover), and
  `shared.css` already makes `:host` a block, so none of that is repeated here. Oat's base sheet
  gives every `li` a bottom margin, which `margin: 0` resets. Check the host's margin against the
  space between the old `← Exercises` line and the heading, and match it if it differs.
- [x] `src/frontend/app/gz-breadcrumbs.component.test.ts` (new), with `useDom()`, `mount`, `shadow`,
      `find` and `testId`:
  - a new element is `hidden` and renders no `breadcrumb`
  - with a trail of one parent it is not hidden. The `breadcrumb` nav has
    `aria-label="Breadcrumb"`. One `crumb` link has the parent's `href` and label. The `current`
    element has the current text and `aria-current="page"`, and it is not an anchor
  - labels are escaped (`<b>` shows as text)
  - setting `trail` back to `null` hides it again
- [x] `src/frontend/app/gz-app.component.ts`:
  - import `./gz-breadcrumbs.component.ts` (and its type), `tabTitle`, `PAGE_TITLE_EVENT`, and
    `RouteMatch` as a type
  - template: `<main class="container"><gz-breadcrumbs data-testid="breadcrumbs"></gz-breadcrumbs><slot data-testid="view-slot"></slot></main>`
  - `#viewElement(path)` returns `{ match: RouteMatch | null; view: Element }`, so the swap knows
    the route
  - keep the shown view and its route in `#shown: { route: RouteDef | null; view: Element } | null`,
    set when `#swapView` reveals a view
  - add `#showPage()`, called right after the reveal in `#swapView`:

    ```ts
    /** Names the shown page in the breadcrumb and the tab: the view's own name, else the route's. */
    #showPage(): void {
      if (!this.#shown) {
        return;
      }
      const { route, view } = this.#shown;
      const viewTitle = view instanceof GzView ? view.pageTitle : null;
      const name = route ? (viewTitle ?? route.title ?? null) : 'Not found';
      document.title = tabTitle(name);
      const breadcrumbs = this.$<GzBreadcrumbsComponent>('gz-breadcrumbs');
      if (breadcrumbs) {
        const parents = route?.parents ?? [];
        breadcrumbs.trail = parents.length > 0 ? { parents, current: name ?? '' } : null;
      }
    }
    ```

  - in the constructor, listen for `PAGE_TITLE_EVENT` on the host and call `#showPage()` only when
    `event.target === this.#shown?.view`. A hidden incoming view's event is ignored, because the
    swap reads its title anyway
  - update the class comment: the shell also renders the breadcrumb above the view and names the
    page in the tab
- [x] `src/frontend/app/gz-app.component.test.ts`: update the top comment, which will now also
      open a workout. happy-dom's `document.title` setter writes a `<title>` into `<head>`, which
      `useDom()` does not clear between tests, so a `beforeEach` resets `document.title` to
      `APP_TITLE`. Add tests that
  - the not-found path sets `document.title` to `'Not found · gainz'` and leaves the `breadcrumbs`
    element in the shell's shadow root hidden
  - `/login` (navigated to, waiting for `gz-login` as the 401 test does) sets
    `'Log in · gainz'` with the breadcrumb hidden
  - `/workouts/3`, with `respondTo('GET /api/workouts/3', …)` and `respondTo('GET /api/exercises', …)`
    answered as `gz-workout-detail.component.test.ts` answers them (reuse its fixtures from
    `workouts.fixtures.ts` / `exercises.fixtures.ts`): once the view is shown, the trail's `crumb`
    is `Workouts` → `/workouts`, its `current` is the workout's title, and the tab is
    `'<title> · gainz'`
  - `/workouts/3` answered 404 shows the current crumb `Workout` and the tab `'Workout · gainz'`
  - a `page-title` dispatched from the shown view after its title changed updates the trail (stub
    the workout's next `GET` with a new title and call the view's `reload()`)
- [x] `src/frontend/features/workouts/gz-workout-detail.component.ts`:
  - add a module-level `workoutName(workout)` returning `workout.title ?? formatDate(workout.performedOn)`,
    used by `#headerTemplate`'s `<h1>`
  - `override titleFor({ workout }: WorkoutDetailData): string { return workoutName(workout); }`
  - remove `override backLink`
- [x] `src/frontend/features/workouts/gz-workout-detail.component.test.ts`: rename "shows a missing
      workout with a way back…" to say it shows the error without a toast, and delete its
      back-link expectations (the link no longer exists in `ui/view.ts`). Add tests that
      `pageTitle` is the title, the formatted date for an untitled workout, and `null` on a 404.
- [x] `src/frontend/features/exercises/gz-exercise-detail.component.ts`:
  - `#headerTemplate` returns only the `<hgroup>` (drop the wrapping `<div>` and the `← Exercises` `<p>`)
  - `override titleFor(progress: ExerciseProgressDto): string { return progress.exercise.name; }`
  - remove `override backLink`
  - check `gz-exercise-detail.component.css` for rules aimed at the removed `<div>`/`<p>` and drop them
- [x] `src/frontend/features/exercises/gz-exercise-detail.component.test.ts`: update the missing
      exercise test like the workout's, and add tests that `pageTitle` is the exercise's name,
      `null` on a 404, and the new name after a successful "Edit exercise" save whose reload
      answers with it, with a `page-title` heard after that reload (`collect('page-title')`).
- [x] `docs/frontend.md`:
  - tree: `app/` lists `gz-breadcrumbs` and `tab-title.ts`
  - the `app/` paragraph: the shell also holds `gz-breadcrumbs` and `tab-title.ts`
  - the `GzView` sentence (lines ~40–43): drop `backLink`, and describe `titleFor()`, `pageTitle`
    and the `page-title` event emitted after every `reload()`
  - the routes paragraph (~155–162): a route may carry `title` and `parents`. Describe the
    location-based trail on pages with parents only, rendered by `gz-app` in `<main>` above the
    slot, its fallback to the route's `title` until the shown view names its entity, the ignored
    events of a view still loading hidden, parents linking to bare list paths, and the tab title
    through `tabTitle()` with the dashboard keeping `APP_TITLE`
  - the shell paragraph (~163–170, "`gz-app` renders `gz-header` above its `<main>`…"): `<main>`
    holds `gz-breadcrumbs` above the `<slot>`, in the shell's shadow root, while the view stays
    in the light DOM
  - a short description of the breadcrumb's look: Oat's `.unstyled` muted links, a CSS `›` read as
    nothing, the current crumb in `--foreground` with an ellipsis on one line
  - the exercise detail paragraph (~259): it no longer starts with "the back link"
  - Loading: the up-front shell list includes `gz-breadcrumbs` and `tab-title.ts`
  - Tests (~479): replace "`gz-app`'s tests use only paths no route matches, so no feature view or
    API is loaded…" — they now also open `/login` and a workout with the API faked, and reset
    `document.title` between tests
- [x] `TODO.md`: remove "Breadcrumbs through the whole app".

**Automated Verification**:

- [x] `bun test --parallel src/frontend/app/tab-title.test.ts` passes
- [x] `bun test --parallel src/frontend/app/routes.test.ts` passes, including the parent-names-its-route test
- [x] `bun test --parallel src/frontend/ui/view.test.ts` passes, with no back-link test left
- [x] `bun test --parallel src/frontend/app/gz-breadcrumbs.component.test.ts` passes
- [x] `bun test --parallel src/frontend/app/gz-app.component.test.ts` passes, including the trail, fallback, rename and tab-title tests
- [x] `bun test --parallel src/frontend/features/workouts/gz-workout-detail.component.test.ts src/frontend/features/exercises/gz-exercise-detail.component.test.ts` passes
- [x] `bun test --parallel` passes, including `static.routes.test.ts` finding `gz-breadcrumbs.component.css`
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes (`app/` imports no `internal/`, route files stay type-only)
- [x] `bun run fmt:check` passes
- [x] `rg -n "backLink|back-link|← Exercises" src/frontend docs/frontend.md` finds nothing

**Manual Verification**:

- [x] With `bun run start:dev`, open a workout from the dashboard: the trail reads `Workouts › <title>`,
      and clicking `Workouts` opens the list without a full page reload
- [x] Open an exercise through a workout's "Exercise history →": the trail reads `Exercises › <name>`
- [x] Rename a workout in "Details & notes": the trail and the tab title follow without navigating
- [x] At 320 px wide, a workout with a long title keeps the trail on one line, with `Workouts` intact
      and the title ending in an ellipsis. Check both themes
- [x] The dashboard, both lists and `/login` show no trail. The tabs read `gainz — lifting log`,
      `Workouts · gainz`, `Exercises · gainz` and `Log in · gainz`
- [x] `/workouts/999999` shows `Workouts › Workout` above "Workout not found", with no "Back to all workouts"

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `routes.test.ts` checks the routes with parents by matching `/workouts/1` and `/exercises/1`
  against them, since comparing `matchRoute(...)?.route` objects did not typecheck.
- The detail views' test `mountView()` now returns `GzView<unknown>`, so `pageTitle` is reachable
  without a type assertion, which lint forbids.
- `gz-breadcrumbs.component.test.ts` also covers a trail set before the element is connected.
- `docs/frontend.md` also lists `GzBreadcrumbsComponent` among the exported components.

## References

- `TODO.md` — "Breadcrumbs through the whole app"
- `docs/frontend.md` — shell, routes, `GzView`, loading, tests
- `docs/styling-guidelines.md` — Oat tokens, no font sizes, 320 px
- `docs/agents/plans/2026-09-14-per-feature-route-modules.md` — the route-table model `title` and `parents` extend
- `docs/agents/plans/2026-09-15-extract-gz-header.md` — the shell split `gz-breadcrumbs` follows
- `src/frontend/app/router.ts`, `src/frontend/app/gz-app.component.ts`, `src/frontend/ui/view.ts`
