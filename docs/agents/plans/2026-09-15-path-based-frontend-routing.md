---
date: 2026-09-15T13:29:58.932809+00:00
git_commit: 60e8c0262ebd3302e8cb0aff3d5fc99fbab2b09d
branch: main
topic: 'Path-based frontend routing'
tags: [plan, frontend, router, gz-app]
status: implemented
---

# PLAN: Path-based frontend routing

The frontend routes on the URL hash: the address bar reads `/#/workouts/3`, links are
`href="#/…"`, and `app/router.ts` listens for `hashchange`. This plan moves routing onto real
paths — `/workouts/3` — using the History API, while keeping every other part of the shell as it
is: route matching, lazy views, the stale-navigation token and the header highlighting.

The server needs no change. `StaticController.frontend` already answers any extension-less path
that is not a file with `index.html` (`src/backend/features/static/internal/static.controller.ts:55-62`),
and `static.routes.test.ts:72-86` already pins that, including `/ui` without a trailing slash. Every
URL the page itself loads is absolute (`/main.ts`, `/vendor/pico.css`, `/ui/app.css`, `/api…`,
and stylesheets derived from `import.meta.url`), so a page opened at `/workouts/3` loads the same
files as one opened at `/`.

## Acceptance Criteria

- The address bar shows real paths (`/`, `/workouts`, `/workouts/3`, `/exercises`, `/exercises/7`);
  no `#` appears anywhere the app puts one.
- Reloading or opening any route URL directly renders that route.
- Clicking an in-app link swaps the view without a full page load and adds one history entry.
- Ctrl/Cmd/Shift/Alt-click, a non-left-button click, and links with a `target` other than `_self`
  or with `download` keep their normal browser behaviour.
- `navigate()` to the current path adds no history entry but re-renders the view.
- Back and Forward render the matching route.
- The header nav highlighting (`aria-current` / `outline`) follows every change, including Back
  and Forward.
- Every route change scrolls to the top, as today.
- An unknown path still shows "Nothing lives at <path>."
- Old `#/…` URLs are not handled: such a URL opens the dashboard.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass;
  `docs/frontend.md` and the `router.ts` header comment describe path routing.

## Technical Key Decisions and Tradeoffs

1. **Link interception:** one click listener on the `gz-app` host element that finds the `<a>`
   through `event.composedPath()` and hands it to a pure `linkPath()` in `router.ts`.
   - Why: templates keep plain `<a href="/…">`, and no link can forget to opt in. Links sit in
     nested open shadow roots, so `event.target` is retargeted to the child view's host by the time
     the event reaches `gz-app`; `composedPath()` still holds the original anchor.
   - Impact: the decision of which clicks to route is unit-tested without a DOM; `gz-app` only
     gathers the inputs and calls `navigate()`. The listener sits on the host rather than on
     `this.root` because the DOM types give a `ShadowRoot` click listener a plain `Event`, while
     `HTMLElementEventMap` types it as a `MouseEvent`; `click` is composed, so the host still
     sees clicks from inside every nested shadow root.
2. **Which clicks are routed:** a primary-button click with no modifier and not already
   `defaultPrevented`, on a link whose `target` is empty or `_self`, without `download`, on the
   same origin, whose path is not `/api` or below it and has no file extension, and whose URL has
   no query string or fragment.
   - Why: everything else is either a browser gesture (new tab, save link) or a URL the router does
     not own. The extension rule mirrors the server's fallback, which also only treats
     extension-less paths as client routes. No link in the app today has a query or a fragment,
     and `currentPath()` reads only the pathname, so routing such a link would silently drop part
     of it.
   - Impact: any link the rule rejects falls through to a normal browser navigation, which still
     works — only without the in-page swap.
3. **Route-change signal:** `navigate()` calls `history.pushState` (unless already on that path)
   and then dispatches a `popstate` event itself; `onRouteChange` listens to `popstate`.
   - Why: `pushState` fires no event. This mirrors today's `navigate()`, which re-dispatches
     `hashchange` for the current route, so one listener covers links, `navigate()` and
     Back/Forward alike.
   - Impact: `onRouteChange`'s signature is unchanged; `gz-app` keeps calling it as it does.
4. **Scroll:** every route change scrolls to the top, as today; no scroll restoration.
   - Why: each view renders `Loading…` and fetches in `connectedCallback`, so a saved position
     cannot be applied right after the swap, and waiting for the page to grow or for per-view
     ready signals was judged not worth it.
   - Impact: Back into a long list lands at its top.
5. **Old `#/` URLs:** not redirected; `main.ts` drops its hash redirect.
   - Why: a personal app with no bookmarks worth preserving.
   - Impact: `/#/workouts/3` renders the dashboard.
6. **Server:** unchanged.
   - Why: the extension-less fallback and its tests already exist.
   - Impact: a route path must stay extension-less and must not equal a file under
     `src/frontend/` — true of every route today.

## Current State

```
 click <a href="#/workouts/3">                navigate('/workouts/3')   (after create / repeat)
             │                                         │
             ▼                                         ▼
     browser sets location.hash ◄──────── location.hash = '#/…'   (or dispatch
             │                                                     hashchange if same)
             ▼
   window 'hashchange' ──► onRouteChange ──► gz-app #renderView
                                               ├─ currentPath() = hash minus '#'
                                               ├─ nav aria-current / outline via isActive()
                                               ├─ scrollTo(top)
                                               └─ #swapView → matchRoute(ROUTES) → view() → <main>

 load: main.ts ── no hash? ──► location.replace('#/')
```

- `src/frontend/app/router.ts:37-57` — `currentPath`, `navigate`, `onRouteChange` are the only
  code that knows about the hash; `matchRoute` and `isActive` work on paths.
- `src/frontend/main.ts:8-11` — the hashless redirect.
- `src/frontend/app/gz-app.component.ts:111` and `:118` — brand link `href="#/"` and nav links
  `href="#${item.path}"`; `:59-61` a comment naming `hashchange`.
- Ten view-template links (`href="#/…"`):
  - `features/stats/gz-dashboard.component.ts:80`, `:87`
  - `features/workouts/gz-workout-list.component.ts:151`
  - `features/workouts/gz-workout-detail.component.ts:367`, `:422`
  - `features/workouts/internal/gz-set-row.component.ts:148`
  - `features/exercises/gz-exercise-list.component.ts:130`
  - `features/exercises/gz-exercise-detail.component.ts:172`, `:197`, `:209`
- `navigate()` callers, unchanged by this plan: `gz-dashboard.component.ts:42`,
  `gz-workout-list.component.ts:58`, `:80`, `gz-workout-detail.component.ts:124`.
- `src/frontend/app/router.test.ts` stubs `location`, `window` and `HashChangeEvent` through
  `useGlobals()` and tests `currentPath`, `isActive` and `navigate` against the hash.
- `docs/frontend.md:3-6` describes the `#/` redirect; `:24` calls `router.ts` "a generic hash
  matcher".

## Desired End State

```
 click <a href="/workouts/3">  (in any shadow root)
             │  composed click bubbles to gz-app's root
             ▼
   gz-app host: anchor = composedPath() → <a>;  path = linkPath(event, anchor, location.origin)
             │ null → browser handles it (new tab, download, /api, other origin, …)
             │ path → preventDefault(); navigate(path)
             ▼
   navigate(path): path ≠ location.pathname ? history.pushState(null, '', path)
                   window.dispatchEvent(new PopStateEvent('popstate'))
             │
 Back/Forward ──► browser 'popstate' ─┐
             ▼                        ▼
   window 'popstate' ──► onRouteChange ──► gz-app #renderView   (unchanged)
                                            └─ currentPath() = location.pathname

 load: main.ts only imports the shell.
 server: GET /workouts/3 ──► extension-less fallback ──► index.html   (unchanged)
```

Address bar, before and after, on a workout:

```
 before  ┌──────────────────────────────────────────┐
         │ localhost:3000/#/workouts/3              │
         └──────────────────────────────────────────┘
 after   ┌──────────────────────────────────────────┐
         │ localhost:3000/workouts/3                │
         └──────────────────────────────────────────┘
```

The rendered pages are unchanged.

## Abstractions and Code Reuse

- `src/frontend/`
  - `main.ts` — drop the hash redirect; the module only imports the shell.
  - `app/router.ts` — header comment rewritten for path routing.
    - `currentPath` — returns `location.pathname`.
    - `navigate` — `pushState` when the path differs, then dispatch `popstate`.
    - `onRouteChange` — listens to `popstate`.
    - `LinkClick`, `LinkTarget`, `linkPath` — new: the pure rule for which clicks to route.
    - `RouteDef`, `RouteMatch`, `matchRoute`, `isActive` — unchanged.
  - `app/router.test.ts` — stubs `location`/`history`/`window`/`PopStateEvent`; `currentPath`,
    `isActive` and `navigate` retargeted to paths; new `linkPath` suite.
  - `app/gz-app.component.ts` — a constructor adding the click listener on the host; brand
    and nav `href`s without `#`; the `#renderView` comment no longer names `hashchange`.
  - `features/stats/gz-dashboard.component.ts`, `features/workouts/gz-workout-list.component.ts`,
    `features/workouts/gz-workout-detail.component.ts`,
    `features/workouts/internal/gz-set-row.component.ts`,
    `features/exercises/gz-exercise-list.component.ts`,
    `features/exercises/gz-exercise-detail.component.ts` — `href="#/…"` → `href="/…"`.
- `docs/frontend.md` — opening paragraph, the `router.ts` description, and a new paragraph on
  navigation and link interception.

`app/routes.ts`, the three `*.routes.ts`, `app/routes.test.ts`, the backend and
`static.routes.test.ts` are untouched: they already speak in paths.

## Logging & Observability

None. The app logs nothing on navigation today, and this changes nothing about how a failed view
import is reported (the toast in `gz-app`'s `#swapView`).

## Implementation

Dependencies: None.

Switch the router to paths, route in-app link clicks through it, drop every `#` from the
templates, and document the result. The app works end to end on real paths when this is done.

**Tasks**:

- [x] `src/frontend/app/router.ts` — rewrite the header comment: the router works on real paths
      through the History API; the server hands `index.html` to any extension-less path, which is
      what makes a deep link survive a reload.
- [x] `src/frontend/app/router.ts` — `currentPath()` returns `location.pathname`; update its doc
      comment ("The path the page is at").
- [x] `src/frontend/app/router.ts` — `navigate(path)`:

      ```ts
      export function navigate(path: string): void {
        if (location.pathname !== path) {
          history.pushState(null, '', path);
        }
        // pushState fires no event, and the same route must refresh too: tell the listeners.
        window.dispatchEvent(new PopStateEvent('popstate'));
      }
      ```

- [x] `src/frontend/app/router.ts` — `onRouteChange` adds and removes a `popstate` listener
      instead of `hashchange`.
- [x] `src/frontend/app/router.ts` — add the link rule:

      ```ts
      /** The parts of a click that decide whether it is a plain in-page navigation; a MouseEvent fits. */
      export interface LinkClick {
        button: number;
        ctrlKey: boolean;
        metaKey: boolean;
        shiftKey: boolean;
        altKey: boolean;
        defaultPrevented: boolean;
      }

      export interface LinkTarget {
        /** Absolute, as `HTMLAnchorElement.href` reports it. */
        href: string;
        target: string;
        download: boolean;
      }

      /**
       * The path to route a link click to, or null when the browser should handle it: a new-tab
       * or save gesture, another origin, the API, a file, or a URL with a query or fragment.
       */
      export function linkPath(click: LinkClick, link: LinkTarget, origin: string): string | null
      ```

      Rules, in order: `defaultPrevented`, `button !== 0` or any modifier → null; `target` not
      `''`/`_self` or `download` → null; `new URL(link.href, origin)` with a different `origin`
      → null; `search` or `hash` non-empty → null; pathname `/api` or starting `/api/` → null;
      last path segment containing a `.` → null; otherwise the pathname.
- [x] `src/frontend/app/gz-app.component.ts` — add a constructor that calls `super()` and adds a
      click listener on the host with `this.addEventListener('click', (event) => { … })` — not on
      `this.root`, whose click listener the DOM types give a plain `Event` without `button` or
      modifier keys. The arrow has a block body with early returns (lint's
      `no-confusing-void-expression`), and is not a method reference (`unbound-method`):

      ```ts
      this.addEventListener('click', (event) => {
        const anchor = event
          .composedPath()
          .find((target): target is HTMLAnchorElement => target instanceof HTMLAnchorElement);
        if (!anchor) {
          return;
        }
        const path = linkPath(
          event,
          { href: anchor.href, target: anchor.target, download: anchor.hasAttribute('download') },
          location.origin,
        );
        if (path === null) {
          return;
        }
        event.preventDefault();
        navigate(path);
      });
      ```

      A short comment says why `composedPath()` rather than `event.target` (retargeting across the
      views' shadow roots). Import `linkPath` and `navigate` from `./router.ts`.
- [x] `src/frontend/app/gz-app.component.ts` — brand link `href="/"`; nav links
      `href="${item.path}"`; reword the `#renderView` comment to "navigate() dispatches popstate
      for the current path on purpose, so this runs re-entrantly".
- [x] `src/frontend/main.ts` — remove the hash redirect and its comment, leaving the doc comment
      and the shell import.
- [x] Replace `href="#/` with `href="/` in `gz-dashboard.component.ts` (2), `gz-workout-list.component.ts`
      (1), `gz-workout-detail.component.ts` (2), `gz-set-row.component.ts` (1),
      `gz-exercise-list.component.ts` (1) and `gz-exercise-detail.component.ts` (3).
- [x] `src/frontend/app/router.test.ts` — replace the stubs in `beforeEach`: `location` as
      `{ pathname: '/', origin: 'http://gainz.test' }`; `history` as an object whose method is
      fully annotated, because `useGlobals()` takes `unknown` and gives it no contextual types
      (strict mode and `explicit-function-return-type` would reject it otherwise):
      `pushState(_state: unknown, _title: string, url: string): void { pushes++; location.pathname = url; }`;
      `window` as an `EventTarget` counting
      `popstate` events; `PopStateEvent` as `class extends Event {}`. Keep the `matchRoute` suite.
- [x] `src/frontend/app/router.test.ts` — `currentPath` is `location.pathname`; `isActive` suite
      retargeted from `location.hash = '#/…'` to `location.pathname = '/…'`, same assertions.
- [x] `src/frontend/app/router.test.ts` — `navigate` suite:
  - to another route pushes that path once and dispatches `popstate` once;
  - to the current route pushes nothing and dispatches `popstate` once;
  - a `popstate` the browser fires (dispatched on the stub `window`) reaches an `onRouteChange`
    listener;
  - `onRouteChange` returns a function that stops listening.
- [x] `src/frontend/app/router.test.ts` — `linkPath` suite, with a plain left click on
      `http://gainz.test/workouts/3` as the baseline; every `href` below is written absolute
      (`http://gainz.test/api`, …), as `LinkTarget` documents:
  - the baseline routes to `/workouts/3`, and `/` routes to `/`;
  - each of `ctrlKey`, `metaKey`, `shiftKey`, `altKey` → null (`test.each`);
  - `button: 1` → null; `defaultPrevented: true` → null;
  - `target: '_blank'` → null, `target: '_self'` → `/workouts/3`; `download: true` → null;
  - `http://elsewhere.test/workouts/3` → null;
  - `/api`, `/api/health` → null, while `/apiary` routes;
  - `/vendor/pico.css` → null;
  - `/workouts?x=1` and `/workouts#top` → null.
- [x] `docs/frontend.md` — opening paragraph: drop the `#/` redirect sentence; say `main.ts`
      imports the shell, and that routes are real paths the server answers with `index.html`
      because they carry no extension.
- [x] `docs/frontend.md` — in the `app/` description, "a generic hash matcher" → "a generic path
      router"; after the paragraph on `nav` (ending "…reaches its views only through `import()`."),
      add a paragraph: links are plain `<a href="/…">`; `gz-app` listens for clicks on its shadow
      root, finds the anchor through `composedPath()` because the views' shadow roots retarget
      the event, and routes it through `navigate()` when `router.ts`'s `linkPath` says it is a
      plain same-origin click on an extension-less, non-`/api` path without query or fragment;
      `navigate()` pushes a history entry and dispatches `popstate`, so links, `navigate()` and
      Back/Forward all reach `gz-app` through the one `onRouteChange` listener; a route path must
      therefore stay extension-less and must not name a file under `src/frontend/`.

**Automated Verification**:

- [x] `bun test src/frontend/app/router.test.ts` passes, including the new `linkPath` suite
- [x] `bun test` passes (including the unchanged `routes.test.ts` and `static.routes.test.ts`)
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes
- [x] `Get-ChildItem -Recurse -File src/frontend, docs/frontend.md | Select-String -Pattern '#/|hashchange|location\.hash'`
      prints nothing

**Manual Verification**:

- [x] With `bun start`, `/` shows the dashboard and the address bar reads `/`, not `/#/`
- [x] Clicking Workouts, a workout, an exercise link in it, Exercises and an exercise swaps the
      view without a full reload (the header stays, no white flash) and the address bar shows each
      path; the active nav button follows
- [x] Reloading on `/workouts/<id>` and `/exercises/<id>` renders that page
- [x] Back and Forward walk through the visited pages and the nav highlight follows
- [x] Ctrl/Cmd-click and middle-click on a workout link open it in a new tab, which renders the
      workout
- [x] Creating a workout and repeating one from the list land on the new workout's path;
      deleting a workout from its detail page lands on `/workouts`
- [x] Clicking the Workouts nav button while already on `/workouts` reloads the list without
      adding a history entry (one Back leaves the page)
- [x] `/nope` shows "Nothing lives at /nope."

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- Planning: scroll restoration on Back/Forward was considered and dropped — views render
  `Loading…` and fetch after connecting, so a position cannot be restored right after the swap,
  and waiting on page height or per-view ready signals was not worth it.
- Planning: old `#/…` URLs are deliberately not redirected.
- Implementation: the last `docs/frontend.md` task said `gz-app` listens "on its shadow root", but
  decision 1 and the `gz-app` task put the listener on the host; the doc says "on its host" to match
  the code.
- Implementation: oxfmt keeps the `composedPath()` and `linkPath(...)` calls in `gz-app` on one line
  each rather than the wrapped form shown in the plan.

## References

- `src/frontend/app/router.ts`, `src/frontend/app/router.test.ts`
- `src/frontend/app/gz-app.component.ts`
- `src/frontend/main.ts`
- `src/backend/features/static/internal/static.controller.ts:55-62` — the extension-less fallback
- `src/backend/features/static/static.routes.test.ts:72-86` — its tests
- `src/backend/features/meta/meta.routes.ts:20-32` — why `/api` itself never reaches the frontend
- `docs/frontend.md`, `docs/backend.md:169-176`
- `docs/agents/plans/2026-09-14-per-feature-route-modules.md` — the plan that made `router.ts`
  route-agnostic
