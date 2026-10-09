---
date: 2026-09-15T20:30:58.603777+00:00
git_commit: 748297973a1d9a8de6d6a0d30c6ddc2793bad698
branch: main
topic: 'Extract gz-header out of gz-app'
tags: [plan, frontend, gz-app, gz-header, refactor]
status: complete
---

# PLAN: Extract gz-header out of gz-app

`gz-app` is the application shell, but most of it is the header: the brand, the page links rendered
twice, the hamburger dropdown, the theme toggle, the loop that highlights the current page, and
three quarters of its stylesheet. This plan moves all of that into a `gz-header` component beside it
in `app/`, leaving `gz-app` with the page layout, link interception and the view swap. The header
looks and behaves exactly as before.

## Acceptance Criteria

- A new `<gz-header>` in `app/` renders the whole header: brand, inline links, the narrow-screen
  hamburger dropdown, divider and `<gz-theme-toggle>`. It looks and behaves as it does today, in
  both themes, above and below 560 px.
- `gz-header`'s `:host` is the sticky element with the bottom border, and still sticks while the
  page scrolls.
- `gz-header` builds its links from `ROUTES`; on first render and on every route change it puts
  `contrast` and `aria-current="page"` on the current page, `secondary` on the rest, and closes the
  dropdown.
- `gz-app` renders `<gz-header>`, `<main>`, `<footer>` and `<gz-toast>`, and holds no nav markup,
  nav CSS, link-highlight loop or dropdown close. It keeps link interception, scroll-to-top, the
  render token and the view swap.
- Links inside `gz-header`'s shadow root are still routed through `navigate()` without a full
  page load.
- The static-route test's minimum component count rises from 11 to 12.
- `docs/frontend.md` and `docs/styling-guidelines.md` name `gz-header` where they now name `gz-app`
  for the header.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass.

## Technical Key Decisions and Tradeoffs

1. **`gz-header` owns the whole `<header>`; its `:host` is sticky with the border.**
   - Why: the header's look lives in one file, and `gz-app` becomes just the page layout.
   - Impact: a `<header>` inside `gz-header`'s shadow root would have the `gz-header` host as its
     containing block — exactly as tall as itself — and never stick. So `position: sticky`, `top`,
     `z-index` and the border move from `header` in `gz-app.component.css` to `:host` in
     `gz-header.component.css`. The background needs no rule there: `ui/shared.css` already makes
     every host `display: block`, and Pico's `:where(:host)` paints `--pico-background-color` on it.
2. **`gz-header` imports `ROUTES` itself.**
   - Why: `routes.ts` loads on every page already, and both modules are in `app/`, which lint
     allows. No property handoff, so no risk of assigning to an un-upgraded element.
   - Impact: `gz-app` still imports `ROUTES`, only for `matchRoute`.
3. **`gz-header` subscribes to `onRouteChange` itself.**
   - Why: the same pattern `gz-theme-toggle` uses with `onThemeChange`; `gz-app` needs no
     knowledge of `gz-header`'s API.
   - Impact: `GzHeaderComponent` stays unexported; `gz-app` imports its module for the side effect,
     as it imports `gz-theme-toggle` today, and `gz-header` takes over that toggle import. Both
     components listen for the same `popstate`; their order does not matter, since the highlight
     updates synchronously either way and the view follows asynchronously.

## Current State

```
<gz-app> (shadow root)                         app/gz-app.component.ts
├── <header>  sticky top, bottom border        app/gz-app.component.css:9-74
│   └── <nav class="container">
│       ├── <ul> <a.brand> gainz <span.tag>              .brand at :76-94
│       ├── <ul class="links">  a.secondary[data-path] × ROUTES[].nav   (hidden ≤ 560px)
│       ├── <ul class="menu">   <details.dropdown> ☰ + the same links   (shown ≤ 560px)
│       └── <ul class="icons">  ::before divider, <gz-theme-toggle>
├── <main class="container">   ← view swapped in here
├── <footer class="container">
└── <gz-toast>
```

- `template()` (`gz-app.component.ts:127-174`) builds `navItems` from `ROUTES` and renders the
  header markup.
- `#renderView` (`:74-102`) bumps the render token, runs the `nav a[data-path]` loop swapping
  `secondary`/`contrast` and `aria-current`, closes `details.dropdown`, scrolls to the top, then
  calls `#swapView`. It runs from `afterRender` and from the `onRouteChange` subscription.
- The click listener on the host (`:21-34`) finds anchors through `composedPath()`, so it already
  reaches links in nested shadow roots.
- `gz-app.component.css:9-94` is header, nav, hamburger reset, divider and brand; only `:host`,
  `main` and `footer` are about the shell.
- Pico is adopted into every component's shadow root (`ui/styles.ts:20`), so Pico's `nav` and
  `details.dropdown` rules apply wherever the `<nav>` lives.

## Desired End State

The page is unchanged:

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ gainz lifting log                       Dashboard  Workouts  Exercises  │  ☀   │  ← <gz-header>, sticky
 └───────────────────────────────────────────────────────────────────────────────┘
   <main> view …                                                                    ← <gz-app>
   Weights in kilograms · estimated 1RM uses the Epley formula.
```

Markup:

```
<gz-app> (shadow root)                         app/gz-app.component.ts
├── <gz-header> (shadow root)  :host sticky, border      app/gz-header.component.ts
│   └── <header>
│       └── <nav class="container">
│           ├── <ul> <a.brand>
│           ├── <ul class="links">
│           ├── <ul class="menu">  <details.dropdown>
│           └── <ul class="icons"> <gz-theme-toggle>
├── <main class="container">
├── <footer class="container">
└── <gz-toast>
```

Route change:

```
navigate() / Back / Forward ──► popstate
                                  ├──► gz-header #syncLinks   highlight + close dropdown
                                  └──► gz-app    #renderView  token, scrollTo, #swapView
```

## Abstractions and Code Reuse

- `src/frontend/app/`
  - `gz-header.component.ts` — new; `GzHeaderComponent extends GzElement`, not exported.
    - `template()` — the header markup moved from `gz-app`, wrapped in `<header>`.
    - `#syncLinks()` — the highlight loop and dropdown close moved from `#renderView`.
    - `connectedCallback`/`disconnectedCallback`/`afterRender` — subscribe, unsubscribe, sync.
  - `gz-header.component.css` — new; `:host` sticky rules plus the `header nav` and `.brand`
    blocks moved from `gz-app.component.css`.
  - `gz-app.component.ts` — template renders `<gz-header>`; `#renderView` loses the nav loop and
    dropdown close; imports `./gz-header.component.ts` instead of `./gz-theme-toggle.component.ts`;
    drops `isActive`.
  - `gz-app.component.css` — keeps `:host`, `main`, `footer`.
- `src/backend/features/static/static.routes.test.ts` — minimum component count 11 → 12.
- `docs/frontend.md`, `docs/styling-guidelines.md` — name `gz-header`.

Reused as is: `GzElement` (`$`, `$$`, render hooks), `onRouteChange` and `isActive` from
`router.ts`, `ROUTES`, `gz-theme-toggle`, `define()`.

## Logging & Observability

None; this is a presentation refactor.

## Implementation

Dependencies: None

Move the header into its own component and trim `gz-app` to the shell.

**Tasks**:

- [x] `src/frontend/app/gz-header.component.ts` — create:
  ```ts
  import type { RawHtml } from '../ui/html.ts';
  import { define, GzElement } from '../ui/base.ts';
  import { html } from '../ui/html.ts';
  import { isActive, onRouteChange } from './router.ts';
  import { ROUTES } from './routes.ts';
  import './gz-theme-toggle.component.ts';

  /** Sticky page header: brand, page links (a dropdown on narrow screens) and the theme toggle. */
  class GzHeaderComponent extends GzElement {
    #unsubscribe: (() => void) | null = null;

    connectedCallback(): void {
      super.connectedCallback();
      this.#unsubscribe = onRouteChange(() => {
        this.#syncLinks();
      });
    }

    disconnectedCallback(): void {
      super.disconnectedCallback();
      this.#unsubscribe?.();
      this.#unsubscribe = null;
    }

    afterRender(): void {
      this.#syncLinks();
    }

    #syncLinks(): void {
      // Pico's nav hides the underline its aria-current styling relies on, so the
      // current page also swaps secondary for contrast to stand out.
      for (const link of this.$$<HTMLAnchorElement>('nav a[data-path]')) { … as today … }
      const menu = this.$<HTMLDetailsElement>('details.dropdown');
      if (menu) {
        menu.open = false;
      }
    }

    template(): RawHtml {
      const navItems = ROUTES.flatMap((route) => (route.nav ? [route.nav] : []));
      return html`
        <header>
          <nav class="container">… brand, links, menu, icons exactly as in gz-app today …</nav>
        </header>
      `;
    }
  }

  await define('gz-header', GzHeaderComponent, import.meta.url);
  ```
  Move the loop body and the markup verbatim from `gz-app.component.ts:84-98` and `:130-166`.
  `super.connectedCallback()` renders, which runs `afterRender` and so the first sync; the
  subscription starts after it.
- [x] `src/frontend/app/gz-header.component.css` — create. Header comment describing the sticky
      header. Move `gz-app.component.css:9-94` over, with the sticky declarations lifted onto the
      host and the nav rules still nested under `header nav`, so the prefix keeps outranking
      Pico's summary focus rules:
  ```css
  :host {
    position: sticky;
    top: 0;
    z-index: 10;
    border-bottom: 1px solid var(--pico-muted-border-color);
  }

  header nav {
    /* … the existing `& nav { … }` block, unchanged … */
  }

  .brand {
    /* … unchanged … */
  }
  ```
- [x] `src/frontend/app/gz-app.component.ts` `template()` — replace the `<header>…</header>` block
      with `<gz-header></gz-header>` and drop `navItems`.
- [x] `src/frontend/app/gz-app.component.ts` `#renderView` — delete the link loop, its comment and
      the dropdown close, leaving the token bump, `scrollTo` and `#swapView`. Rewrite the JSDoc:
      it no longer updates the header; keep the point that the outgoing view stays put until the
      next one is ready.
- [x] `src/frontend/app/gz-app.component.ts:22-23` — the click-listener comment names the views'
      and the header's shadow roots as what retargets the event.
- [x] `src/frontend/app/gz-app.component.ts` imports — replace `import './gz-theme-toggle.component.ts'`
      with `import './gz-header.component.ts'`, and drop `isActive` from the router import.
- [x] `src/frontend/app/gz-app.component.css` — delete the moved `header` and `.brand` blocks; keep
      `:host`, `main`, `footer`; change the header comment to "Application shell: header, centred
      content column, footer."
- [x] `src/backend/features/static/static.routes.test.ts:30` — `toBeGreaterThanOrEqual(12)`.
- [x] `docs/frontend.md`:
  - tree (`:11`) — `app/        gz-app, gz-header, gz-theme-toggle, router.ts, routes.ts`
  - `:23-24` — `app/` is the shell: `gz-app`, the `gz-header` it renders at the top with the
    `gz-theme-toggle` inside it, …
  - `:66-78` — `gz-header` builds the header from the routes' `nav` entries, highlights the
    current page and closes the dropdown on route change through its own `onRouteChange`
    subscription; its host is the sticky element, because a `<header>` inside its shadow root
    would be only as tall as its host and could never stick.
  - `:80-81` — `composedPath()` is needed because the views' and the header's shadow roots
    retarget the event.
  - `:86` — Back/Forward reach `gz-app` and `gz-header` through `onRouteChange`.
  - `:131-133` — "the other four components stay private" becomes five.
  - `:157` — the shell loaded up front is `gz-app`, `gz-header`, `gz-toast`, `gz-theme-toggle`.
- [x] `docs/styling-guidelines.md:27-28` — the hamburger `<summary>` is in `gz-header`.

**Automated Verification**:

- [x] `bun test src/backend/features/static/static.routes.test.ts` passes, including the stylesheet
      beside `app/gz-header.component.ts`
- [x] `bun test` passes
- [x] `bun run typecheck` passes
- [x] `bun run lint` passes
- [x] `bun run fmt:check` passes

**Manual Verification**:

- [x] Wide and ≤ 560 px, light and dark: the header looks exactly as before — brand, links or
      hamburger, divider, theme icon, bottom border.
- [x] Scrolling a long page (a workout with many sets) keeps the header stuck to the top over the
      content.
- [x] Clicking a header link navigates without a full reload; the current page is highlighted at
      `/`, `/workouts/…` and `/exercises/…`, including after Back/Forward and on a hard reload of
      a deep link.
- [x] The narrow-screen menu opens, highlights the current page, and closes after picking a link
      and after Back/Forward.
- [x] The theme toggle still flips the theme and keeps focus.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- `docs/agents/plans/2026-09-15-pico-nav-header-and-theme-toggle.md` — how the current header was
  built
- `src/frontend/app/gz-theme-toggle.component.ts` — subscribe/unsubscribe pattern followed here
- `.oxlintrc.json:261` — import boundaries for `app/**/gz-*.component.ts`
