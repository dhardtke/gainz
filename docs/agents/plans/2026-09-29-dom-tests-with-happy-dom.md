---
date: 2026-09-29T14:39:32.641510+00:00
git_commit: 225bdabbd75624c2e184daa9c6e44b8504f3cd37
branch: main
topic: 'DOM tests for frontend components with happy-dom'
tags: [plan, frontend, tests, happy-dom, gz-tile, gz-pagination, gz-theme-toggle, gz-app]
status: done
---

# PLAN: DOM tests for frontend components with happy-dom

The frontend's tests run under `bun test` without a DOM, so no test has ever mounted a component.
Several plans pulled logic into pure modules (`linkPath`, `pagination.ts`, `toggleTheme`) only so
it could be tested, and left what the components do with it to manual checks. This plan adds
happy-dom as the test DOM, a `useDom()` helper that installs it for one test file at a time, and a
first set of component tests: `gz-tile`, `gz-pagination`, `gz-theme-toggle` and `gz-app`'s link
routing. Feature views and `gz-app`'s hidden/`ready` view swap are left to a later plan.

## Acceptance Criteria

- `bun test` still runs the whole suite in one process, and the backend's tests keep Bun's own
  `fetch`, `Response`, `URL` and `setTimeout` and see no `document`, whatever order files run in.
- A frontend test file calls `useDom()` and then `await import()`s a component module; it can then
  mount the component, query its open shadow root and dispatch events at it.
- Under `useDom()`, a `fetch` of a `.css` URL answers an empty `200`, and any other fetch rejects
  with an error naming the method and URL.
- Tests cover:
  - `gz-tile`: its attributes render, `value` falls back to `–`, the hint shows only when set, and
    an attribute change re-renders.
  - `gz-pagination`: page buttons and gaps, disabled Previous/Next at the ends, `aria-current` on
    the current page, a composed `page-change` carrying the page number, and the past-last-page
    message with its Go to page 1 button.
  - `gz-theme-toggle`: the icon and `aria-label` follow the theme, a click toggles it, the same
    button survives the click with its focus, and a theme change made elsewhere is reflected.
  - `gz-app`: a plain click on a link inside a shadow root is routed, a modifier, middle-button,
    `target` or `/api` click is left alone, and `navigate()` and a `popstate` re-render the view.
- `docs/frontend.md`'s "## Tests" section describes the DOM setup and its known limits.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **Globals come from a per-file `useDom()`, not a `bunfig.toml` preload.**
   - Why: happy-dom's window replaces `fetch`, `Request`, `Response`, `Headers`, `URL`, `Event`,
     `EventTarget`, `setTimeout`, `FormData` and `location`; a preload would run the backend's
     route tests, which make real HTTP requests, on those.
   - Impact: a DOM test file cannot statically import a component (static imports evaluate before
     any hook, and `class extends HTMLElement` would throw); it `await import()`s it in
     `beforeAll`, after `useDom()`'s own `beforeAll`.
2. **One happy-dom `GlobalWindow` per process, created lazily and installed/restored per file.**
   - Why: bun's module cache is shared across files, so a component module evaluated by one file
     keeps extending that window's `HTMLElement` and stays registered in that window's
     `customElements`. A fresh window per file would leave later files with stale classes and an
     empty registry. `@happy-dom/global-registrator` is not used because it creates a new window on
     every `register()`.
   - Impact: `useDom()` copies the shared window's properties onto `globalThis` in `beforeAll`,
     saving each descriptor, and puts them back in `afterAll`; it clears `document.body` and
     `localStorage` after every test so files and tests do not see each other's leftovers.
3. **The base `fetch` under `useDom()` answers `.css` with an empty `200` and rejects anything else.**
   - Why: `styles.ts` fetches `/vendor/oat.css` and `/ui/shared.css` at load and `define()` fetches
     each component's sheet; they load silently and empty. A test that forgets to stub an API call
     fails naming it rather than reaching a network.
   - Impact: tests do not assert styling. A future view test layers `useFetch()` over the base.
4. **Scope is `gz-tile`, `gz-pagination`, `gz-theme-toggle` and `gz-app`'s routing.**
   - Why: it proves shadow DOM, delegated `data-action` clicks, composed events and
     `composedPath()` across shadow roots without involving the API.
   - Impact: feature views, `gz-header`'s dropdown and `gz-app`'s view swap stay manually verified.
5. **`gz-app` is driven only through unmatched paths, with main-frame navigation disabled.**
   - Why: a matched route imports a real feature view, which fetches the API when connected. The
     not-found view is plain markup and shows the routed path.
   - Impact: the window is created with `navigation.disableMainFrameNavigation` and
     `navigation.disableFallbackToSetURL`, so a click `gz-app` leaves alone cannot navigate or
     reset the test window; a test asserts on the event's `defaultPrevented` and on `location`.

## Current State

```
bun test  (one process; files run one after another)
├── src/backend/**/*.test.ts   real Bun.serve + Bun's fetch/Response/URL
└── src/frontend/**/*.test.ts  no DOM: no HTMLElement, document, window, localStorage
      ├── pure modules only: html, format, router, routes, pagination, theme, http, facades
      └── src/frontend/testing.ts
            useGlobals()  stub a global, restore it after each test
            useFetch()    record requests, answer 200 {}
```

Importing any component evaluates DOM code at load:

```
gz-tile.component.ts
 ├─ ui/base.ts        class GzElement extends HTMLElement; attachShadow; adoptedStyleSheets
 │   └─ ui/styles.ts  top-level await fetch('/vendor/oat.css'), fetch('/ui/shared.css')
 └─ await define()    fetch('/ui/tile/gz-tile.component.css'); customElements.define
```

- `src/frontend/ui/base.ts:14` — `GzElement`, `data-action` click/submit delegation, `emit()`
- `src/frontend/ui/styles.ts:54` — the top-level `await Promise.all(BASE_HREFS.map(load))`
- `src/frontend/ui/base.ts:119` — `define()` awaits `loadStyles` before `customElements.define`
- `src/frontend/app/gz-app.component.ts:24` — the click listener: `composedPath()` → `linkPath` → `navigate`
- `src/frontend/app/gz-app.component.ts:57` — `#viewElement`: `Nothing lives at ${path}.` for no match
- `src/frontend/ui/theme.ts:42` — `current` is read from `localStorage`/`matchMedia` once, at load
- `src/backend/features/static/internal/embed.ts:13` — the build already leaves out `/testing.ts` and `*.test.ts`
- `docs/frontend.md` "## Tests" — says there is no DOM and nothing mounts a component

Measured with happy-dom 20.14.5 under Bun 1.4.2 (in a scratch directory, not the repository):
custom elements, upgrade and `connectedCallback`, open shadow roots, `CSSStyleSheet` with
`adoptedStyleSheets`, `composedPath()` across shadow roots and `requestAnimationFrame` work.
`showPopover`/`hidePopover` and `popovertarget` are not implemented and `:popover-open` never
matches; `attributeChangedCallback` does not fire for attributes already present at upgrade;
`CSSStyleSheet.replace()` resolves with `undefined` rather than the sheet. Installing a window's
properties onto `globalThis` and putting the saved descriptors back restores Bun's globals exactly.

## Desired End State

```
bun test  (one process)
├── src/backend/**/*.test.ts          Bun's globals, untouched
├── src/frontend/**/*.test.ts         pure-module tests, unchanged
├── src/frontend/testing.test.ts      useDom() installs and restores
└── component tests
      ui/tile/gz-tile.component.test.ts
      ui/pagination/gz-pagination.component.test.ts
      app/gz-theme-toggle.component.test.ts
      app/gz-app.component.test.ts

A DOM test file:

  useDom();                                   beforeAll: install shared window + base fetch
  beforeAll(async () => {                     afterEach: clear body + localStorage
    await import('./gz-tile.component.ts');   afterAll:  restore every saved global
  });
  test('…', () => {
    const tile = document.createElement('gz-tile');
    document.body.append(tile);
    expect(tile.shadowRoot?.querySelector('.value')?.textContent).toBe('–');
  });
```

## Abstractions and Code Reuse

- `package.json` — `happy-dom` `20.14.5` in `devDependencies` (added with `bun add -d happy-dom`;
  `bunfig.toml`'s `install.exact` keeps it pinned). `bun.lock` updates with it.
- `src/frontend/testing.ts`
  - `useDom()` — new. Reuses the save-a-descriptor/put-it-back idea of `useGlobals()`, but saves in
    `beforeAll` and restores in `afterAll`, because the component modules a file imports must see
    the DOM for all its tests. It imports `happy-dom` with `await import()` inside `beforeAll`, so
    a file that never calls `useDom()` does not load happy-dom.
  - `useGlobals()`, `useFetch()` — unchanged.
- `src/frontend/testing.test.ts` — new: `useDom()` installs a DOM and the base fetch inside one
  `describe`, and a following `describe` finds Bun's own globals back.
- `src/frontend/ui/tile/gz-tile.component.test.ts` — new.
- `src/frontend/ui/pagination/gz-pagination.component.test.ts` — new.
- `src/frontend/app/gz-theme-toggle.component.test.ts` — new.
- `src/frontend/app/gz-app.component.test.ts` — new, with a test-only `gz-test-link` element whose
  shadow root holds the anchor under test.
- `src/scripts/build.test.ts` — one more URL in the test-only-files-404 check.
- `docs/frontend.md` — "## Tests" rewritten; no other document changes. `AGENTS.md`'s commands are
  unchanged (`bun test` runs the new files) and no document is added to `docs/`.

No production module changes. Component classes stay private to their modules: tests create
elements by tag name and read their open `shadowRoot`.

## Logging & Observability

None in production code. Under `useDom()`, an unstubbed non-CSS request rejects with:

```
useDom: unexpected fetch GET /api/workouts; stub it with useFetch()
```

## Implementation

### Phase 1: DOM test harness and the `ui/` components

Dependencies: None

Adds happy-dom, `useDom()` and its own test, tests for the two data-free `ui/` components, and the
documentation of the setup.

**Tasks**:

- [x] Add the dependency: `bun add -d happy-dom@20.14.5`, and confirm `package.json` records the
      exact version with no range.
- [x] `src/frontend/testing.ts`: add `useDom()`. Shape (types and doc comment as the file's other
      helpers have them):

      ```ts
      import type { GlobalWindow } from 'happy-dom'; // type-only: erased, so happy-dom still loads lazily

      /** Created once: component modules are cached across files and keep this window's classes. */
      let shared: GlobalWindow | undefined;

      /**
       * Installs a happy-dom window's globals for the current test file (or describe block) and puts
       * Bun's back afterwards. Import components with `await import()` after this, never statically.
       */
      export function useDom(): void {
        const saved = new Map<PropertyKey, PropertyDescriptor | undefined>();

        beforeAll(async () => {
          const { GlobalWindow } = await import('happy-dom');
          shared ??= new GlobalWindow({
            url: 'http://localhost/',
            settings: { navigation: { disableMainFrameNavigation: true, disableFallbackToSetURL: true } },
          });
          // copy every own property (string and symbol keys) of `shared` onto globalThis,
          // skipping constructor/global/globalThis/undefined/NaN and values already identical,
          // saving each previous descriptor in `saved` first — the same walk
          // @happy-dom/global-registrator's register() does
          // then install the base fetch: '.css' → new Response('', { status: 200 }), else reject with
          // new Error(`useDom: unexpected fetch ${method} ${url}; stub it with useFetch()`)
        });

        afterEach(() => {
          document.body.replaceChildren();
          localStorage.clear();
        });

        afterAll(() => {
          // put each saved descriptor back; delete a key that had none
        });
      }
      ```

      The window is never closed: it lives for the process, like the modules that depend on it.
      Resolve `fetch`'s URL the way `useFetch()` does (`string`, `URL` or `Request`).
- [x] `src/frontend/testing.test.ts`: at the top, keep references to Bun's `fetch`, `Response`,
      `URL`, `setTimeout` and `EventTarget`. `describe('useDom', …)` calls `useDom()` and tests:
      - `document`, `HTMLElement` and `customElements` exist, and `location.href` is `http://localhost/`;
      - `await fetch('/ui/shared.css')` answers `200` with an empty body;
      - `fetch('/api/workouts')` rejects with a message containing `GET /api/workouts`;
      - `document.body` is empty again in a second test after the first appended to it.
      A following `describe('after useDom', …)` tests that each kept reference is identical to the
      current global again and that `typeof document` is `'undefined'`.
- [x] `src/frontend/ui/tile/gz-tile.component.test.ts`: `useDom()`, then
      `beforeAll(async () => { await import('./gz-tile.component.ts'); })`, and a local `mount(attributes)`
      that creates `gz-tile`, sets the attributes **before** appending (so `connectedCallback`
      renders them; happy-dom does not fire `attributeChangedCallback` for attributes present at
      upgrade) and returns it. Tests:
      - label, value and hint render in `.label`, `.value` and `.hint`;
      - without `value`, `.value` reads `–`;
      - without `hint`, there is no `.hint`;
      - setting `value` on a mounted tile re-renders it;
      - a label holding markup is shown as text, not parsed (`<b>` stays text; no `b` element).
- [x] `src/frontend/ui/pagination/gz-pagination.component.test.ts`: same setup for
      `./gz-pagination.component.ts`, a `mount(page, pages, noun?)`, and a helper returning the
      shadow root's buttons' text. Tests:
      - page 5 of 12 reads `← Previous`, `1`, `…`, `4`, `5`, `6`, `…`, `12`, `Next →`; the `…`
        buttons are disabled; only `5` carries `aria-current="page"`;
      - Previous is disabled on page 1 and Next on the last page;
      - clicking `Page 6` dispatches `page-change` with `detail` `6`, heard by a listener on
        `document.body` (so it bubbles and crosses the shadow root), and `Next →` on page 5 sends `6`;
      - a disabled button's `click()` sends nothing (Previous on page 1). If happy-dom turns out to
        dispatch clicks on disabled buttons, which the component relies on the browser not doing,
        drop this test and record the gap in the docs' list of limits and in Implementation Notes;
      - page 4 of 3 with `noun="workouts"` shows `No workouts on this page.` and no `nav`, and
        clicking `Go to page 1` sends `1`; without `noun` it reads `No items on this page.`;
      - changing `page` on a mounted pager re-renders it.
- [x] `src/scripts/build.test.ts`: add `/ui/tile/gz-tile.component.test.ts` to the URLs the
      "carries neither the dev client nor anything test-only" test expects a `404` for, beside
      `/testing.ts` and `/ui/html.test.ts`, so a component test is shown to stay out of the build.
- [x] `docs/frontend.md`, "## Tests": replace the opening paragraph's "there is no DOM there" with
      the current setup, keeping the section's existing points (the stubs, the `?N` fresh import,
      the oxfmt note). Cover:
      - pure-module tests still run without a DOM, and `html.ts` stays apart from `base.ts` for them;
      - `useDom()` installs a happy-dom window per file rather than by preload, and why (the
        backend's tests share the process and need Bun's own `fetch`/`Response`/`URL`);
      - the one shared window, and why (cached component modules keep its `HTMLElement` and registry);
      - components are `await import()`ed after `useDom()`, never statically;
      - the base fetch: empty `.css`, loud rejection otherwise, `useFetch()` on top;
      - attributes are set before appending, because happy-dom skips `attributeChangedCallback`
        for attributes present at upgrade;
      - what it cannot test: popovers (`gz-header`'s dropdown), and styling, since sheets load empty.

**Automated Verification**:

- [x] `bun test src/frontend/testing.test.ts` passes, including the restored-globals `describe`.
- [x] `bun test src/frontend/ui` passes (tile, pagination and the existing pure tests).
- [x] `bun test` passes as a whole: the backend's route tests still run on Bun's globals.
- [x] `bun test src/frontend/ui/tile/gz-tile.component.test.ts src/backend/features/static/static.routes.test.ts`
      passes, a DOM file followed by a request-making backend file in one process.
- [x] `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.
- [x] `bun test src/backend/features/static/static.routes.test.ts src/frontend/ui/tile/gz-tile.component.test.ts`
      passes, the reverse order.
- [x] `bun run build` passes, and `bun test src/scripts/build.test.ts` passes with the new URL.

### Phase 2: `gz-theme-toggle`

Dependencies: Phase 1

Tests that the toggle mirrors the theme and survives its own click.

**Tasks**:

- [x] `src/frontend/app/gz-theme-toggle.component.test.ts`: `useDom()`, then in `beforeAll`
      `await import('./gz-theme-toggle.component.ts')` and keep the plain `../ui/theme.ts` module
      from `await import('../ui/theme.ts')` — the same instance the component uses, unlike
      `theme.test.ts`'s `?N` copies. `beforeEach` calls `theme.setTheme('light')`, because the
      module's `current` outlives each test. A `mount()` appends a `gz-theme-toggle` and returns
      its shadow root's `button`. Tests:
      - in light mode the sun is shown, the moon carries `hidden`, and the label is `Turn on dark mode`;
      - a click makes `currentTheme()` `'dark'`, sets `data-theme="dark"` on `<html>`, shows the
        moon, hides the sun and flips the label to `Turn off dark mode`;
      - the button is the same element after the click, and one focused before the click is still
        the shadow root's `activeElement` after it;
      - `theme.setTheme('dark')` called elsewhere updates a mounted toggle's icon and label;
      - once the toggle is removed, `setTheme()` no longer reaches it: its label stays as it was.
- [x] `docs/frontend.md`, "## Tests": one sentence that a component test importing the plain
      `ui/theme.ts` shares its state with the component, so it resets the theme before each test.

**Automated Verification**:

- [x] `bun test src/frontend/app/gz-theme-toggle.component.test.ts` passes.
- [x] `bun test src/frontend/ui/theme.test.ts src/frontend/app/gz-theme-toggle.component.test.ts`
      passes in that order and in the reverse order: the `?N` copies and the plain module do not
      disturb each other.
- [x] `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

### Phase 3: `gz-app` link routing

Dependencies: Phase 1

Tests that `gz-app` routes plain link clicks from inside shadow roots and leaves the rest to the
browser, using only paths no route matches.

**Tasks**:

- [x] `src/frontend/app/gz-app.component.test.ts`: `useDom()`, then in `beforeAll`
      `await import('./gz-app.component.ts')` and define a test-only `gz-test-link` (skipped when
      `customElements.get` already knows it) whose constructor attaches an open shadow root holding
      one `<a>` whose `href`, `target` and `download` come from its attributes when connected.
      `beforeEach` calls `history.replaceState(null, '', '/nowhere')`. Helpers:
      - `mountApp()` appends a `gz-app` and waits for it to settle;
      - `settle()` awaits `Bun.sleep(0)`, enough for `#swapView`'s awaits on a non-`GzElement` view;
      - `notFound(app)` returns the text of `main > p.empty` in the app's shadow root;
      - `link(app, attributes)` appends a `gz-test-link` to the app's `main` and returns its anchor;
      - `click(anchor, init)` dispatches `new MouseEvent('click', { bubbles: true, composed: true, cancelable: true, ...init })`
        and returns whether the default was prevented.

      Tests:
      - on mount the view reads `Nothing lives at /nowhere.` and the header is rendered;
      - a plain click on `/elsewhere` is prevented, `location.pathname` becomes `/elsewhere`, the
        view reads `Nothing lives at /elsewhere.`, and the `gz-header` is the same element as before;
      - `test.each` over a Ctrl, Meta, Shift and Alt click, a middle-button click (`button: 1`),
        `target="_blank"`, `download`, `/api/workouts`, `/elsewhere?x=1` and `/file.txt`: not
        prevented, `location.pathname` stays `/nowhere`, and the view is unchanged;
      - `navigate('/somewhere')` from `./router.ts` re-renders to `Nothing lives at /somewhere.`;
      - after `history.replaceState(null, '', '/back-here')` and a dispatched `popstate`, as the
        browser fires on Back, the view reads `Nothing lives at /back-here.`;
      - once removed, the app no longer listens: a `popstate` after removal does not throw and a
        re-mounted app renders the current path.
- [x] `docs/frontend.md`, "## Tests": one sentence that `gz-app`'s tests use only paths no route
      matches, so no feature view or API is loaded, and that the hidden/`ready` view swap is not
      covered yet.

**Automated Verification**:

- [x] `bun test src/frontend/app/gz-app.component.test.ts` passes.
- [x] `bun test src/frontend/app` passes: the router, routes, toggle and app tests together.
- [x] `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `useFetch()` builds its recorded headers with Bun's `Headers.prototype.toJSON()`, which happy-dom's
  `Headers` lacks. No test in this plan combines `useFetch()` with `useDom()`; the plan that adds
  view tests changes that line to `Object.fromEntries(new Headers(init?.headers))`.
- happy-dom does not dispatch `click()` on a disabled button, so `gz-pagination`'s
  disabled-Previous test stays and no gap is recorded in the docs.
- `useFetch()`'s URL resolution moved into a private `urlOf()` in `testing.ts`, which `useDom()`'s
  base fetch shares.
- `testing.test.ts` checks the rejection with `.then()` rather than `expect(…).rejects`: oxlint's
  `await-thenable` and `no-confusing-void-expression` reject awaiting it, and `http.test.ts`
  already reads rejections the same way.

## References

- `docs/frontend.md` — "## Tests", "## Loading"
- `docs/agents/research/2026-09-10-test-suite-structure.md` — the open question on DOM-level tests
- `docs/agents/plans/2026-09-15-path-based-frontend-routing.md` — why `linkPath` is pure
- `docs/agents/plans/2026-09-29-paginate-workouts-and-exercises.md` — `gz-pagination`'s behavior
- Bun, DOM testing: https://bun.com/docs/test/dom
- happy-dom `IBrowserSettings` (`navigation.disableMainFrameNavigation`, `disableFallbackToSetURL`)
  and `@happy-dom/global-registrator`'s `GlobalRegistrator.register()`, whose property walk
  `useDom()` follows
