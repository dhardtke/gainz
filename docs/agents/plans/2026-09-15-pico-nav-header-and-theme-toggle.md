---
date: 2026-09-15T18:04:07.234013+00:00
git_commit: 9e86b873d6445644d0ff547d0b746b8725a969e4
branch: main
topic: 'Pico nav header and sun/moon theme toggle'
tags: [plan, frontend, gz-app, gz-theme-toggle, theme, pico]
status: ready
---

# PLAN: Pico nav header and sun/moon theme toggle

The header in `gz-app` is a Pico `<nav>` in name only: its page links are shrunken outline buttons
held to size by overrides in `gz-app.component.css`, and the theme is a labelled Pico switch. This
plan rebuilds it the way [picocss.com](https://picocss.com/) builds its own header — plain nav
links, a thin divider, and an icon-only theme toggle whose sun morphs into a moon — and folds the
links into a Pico dropdown on narrow screens.

The theme preference itself (`ui/theme.ts`: stored choice, system seed, host mirroring, the
no-flash script in `index.html`) keeps its behaviour; only the control that drives it changes.

## Acceptance Criteria

- The header is a Pico `<nav>`: brand on the left; page links, a thin vertical divider and an
  icon-only theme toggle on the right.
- Inactive page links carry `secondary`; the current page carries `contrast` and
  `aria-current="page"`. `gz-app.component.css` holds no colour rule for the page links; its only
  colour overrides are the hamburger summary's reset.
- The theme toggle is a `<button>` with picocss.com's sun/moon icon: a sun in light mode, a moon in
  dark mode, morphing over 0.4 s on a click.
- The toggle's `aria-label` is "Turn on dark mode" in light mode and "Turn off dark mode" in dark
  mode.
- A page load paints the correct icon with no animation, and a click or keypress leaves focus on
  the button.
- Under `prefers-reduced-motion: reduce` the icon swaps without animating; where CSS `d: path()` is
  unsupported (Safari) the cutout jumps, but the end state is still correct.
- A theme change made anywhere (e.g. another toggle instance) keeps the icon and label in step.
- Stored preference, system seed and the no-flash script behave exactly as before.
- Below 560 px the page links fold into a Pico `<details class="dropdown">` whose summary is a
  bare hamburger icon labelled "Menu" — no field border, background or chevron, styled like the
  theme toggle; the current page is highlighted in it, and it closes after a route change.
- `bun test`, `bun run typecheck`, `bun run lint` and `bun run fmt:check` pass;
  `docs/frontend.md` and `docs/styling-guidelines.md` describe the new header and toggle.

## Technical Key Decisions and Tradeoffs

1. **Layout copies picocss.com:** brand `<ul>`, links `<ul>`, then an icons `<ul>` whose `::before`
   draws the divider.
   - Why: matches the reference; Pico's nav distributes and spaces the lists itself.
   - Impact: the compact-row overrides in `gz-app.component.css:16-37` are deleted; one divider
     rule is added.
2. **Active link swaps `secondary` ↔ `contrast`, keeping `aria-current="page"`.**
   - Why: Pico's `nav li a:not(:hover) { text-decoration: none }` hides the underline its
     `aria-current` styling relies on, so `aria-current` alone barely shows; the variant classes are
     Pico's own and need no CSS.
   - Impact: `#renderView` toggles `secondary`/`contrast` instead of `outline`.
3. **The toggle is a `<button>`, reset to look like a nav link, with a label that flips.**
   - Why: it is an action, not a navigation — it answers Space as well as Enter, cannot be
     middle-clicked into a new tab, and is announced as a button.
   - Impact: `gz-theme-toggle.component.css` overrides `--pico-*` properties on the button, which
     `docs/styling-guidelines.md` otherwise forbids; the guideline gains this as a named exception.
4. **The icon is inline SVG in the `gz-theme-toggle` template; the morph lives in its `.css`;
   flips toggle the `moon` class rather than re-rendering.**
   - Why: no CSS in JavaScript; a re-render would destroy the focused button.
   - Impact: `template()` reads `currentTheme()` for the first paint, so a dark load starts as a
     moon with nothing to transition; `onThemeChange` updates class and label in place.
5. **`toggleTheme()` is added to `ui/theme.ts`.**
   - Why: the one new piece of logic that can be tested without a DOM.
   - Impact: the component handler is a single call; `theme.test.ts` gains tests.
6. **Narrow screens get a hamburger dropdown; both link lists are rendered and media queries show
   one.**
   - Why: every page stays one tap away without crowding a 360 px row; no resize listener.
   - Impact: Pico draws a role-less dropdown `<summary>` as a form field with a chevron, so
     `gz-app.component.css` resets its border, background, colour and `::after` to match the theme
     toggle, and the styling-guidelines exception covers icon controls in the header nav. The
     existing `nav a[data-path]` loop highlights both lists; `#renderView` also closes
     the `<details>`. Pico's `details.dropdown[open] > summary::before` lays a fixed full-viewport
     layer under the open menu, so a click outside closes it — that first click is swallowed rather
     than reaching the page. Inside the dropdown Pico sets the link `color` directly, so
     `secondary`/`contrast` have no visible effect there; the current page shows through Pico's
     `aria-current` hover background instead.

## Current State

```
gz-app (shadow root)                                  app/gz-app.component.ts:123-151
└── <header>  sticky, bottom border                   app/gz-app.component.css:9-38
    └── <nav class="container">
        ├── <ul> <li> <a.brand> gainz <span.tag>lifting log   (tag hidden ≤ 560px)
        └── <ul>
            ├── <li> <a role=button class="secondary outline" data-path="/">Dashboard      ┐ ROUTES[].nav
            ├── <li> <a role=button ...  data-path="/workouts">Workouts                   │
            ├── <li> <a role=button ...  data-path="/exercises">Exercises                 ┘
            └── <li> <gz-theme-toggle> (shadow root)          app/gz-theme-toggle.component.ts:47-56
                        <label><input type=checkbox role=switch data-action="toggle-theme">
                               <span.label>Dark mode</span></label>
```

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ gainz lifting log     [█Dashboard█] [ Workouts ] [ Exercises ]   (● ) Dark mode │
 └───────────────────────────────────────────────────────────────────────────────┘
```

- `#renderView` (`gz-app.component.ts:84-93`) drops `outline` and sets `aria-current="page"` on the
  active link, so the current page is a solid secondary button.
- `gz-app.component.css:16-37` shrinks Pico's nav gaps, `li` padding and button padding into one
  compact row.
- `gz-theme-toggle` syncs `input.checked` from `currentTheme()` in `afterRender` and on
  `onThemeChange`, and calls `setTheme(checked ? 'dark' : 'light')` from `handleAction`. Its CSS
  hides the "Dark mode" text at ≤ 560 px.
- `gz-app` routes every anchor click it sees through `composedPath()` and `linkPath`
  (`gz-app.component.ts:21-34`, `router.ts:84-107`).
- Pico's nav rules (`nav li`, `nav li button`, `nav details.dropdown`) apply only inside the shadow
  root that holds the `<nav>` — `gz-app`'s — not inside `gz-theme-toggle`'s own shadow root.

## Desired End State

Wide (> 560 px), light mode:

```
 ┌───────────────────────────────────────────────────────────────────────────────┐
 │ gainz lifting log                       Dashboard  Workouts  Exercises  │  ☀   │
 └───────────────────────────────────────────────────────────────────────────────┘
                                          ▲ contrast   ▲ secondary (grey)
                                          aria-current="page"
```

Wide, dark mode — the sun has morphed into a moon:

```
 │ gainz lifting log                       Dashboard  Workouts  Exercises  │  ☾   │
```

Narrow (≤ 560 px), menu open on `/workouts`:

```
 ┌──────────────────────────────────────┐
 │ gainz                        ☰  │  ☀ │
 │                   ┌───────────┐      │
 │                   │ Dashboard │      │
 │                   │▓Workouts ▓│  ← aria-current, Pico dropdown hover background
 │                   │ Exercises │      │
 │                   └───────────┘      │
 └──────────────────────────────────────┘
```

Markup:

```
gz-app (shadow root)
└── <header>
    └── <nav class="container">
        ├── <ul> <li> <a.brand> gainz <span.tag>lifting log
        ├── <ul class="links">                                  (display: none ≤ 560px)
        │   └── <li> <a class="secondary|contrast" href data-path [aria-current]> …  × ROUTES[].nav
        ├── <ul class="menu">                                   (display: none > 560px)
        │   └── <li> <details class="dropdown">
        │             <summary aria-label="Menu"> <svg hamburger>
        │             <ul dir="rtl"> <li> <a class="secondary|contrast" href data-path> …
        └── <ul class="icons">   ::before = divider
            └── <li> <gz-theme-toggle> (shadow root)
                        <button type="button" class="theme-toggle" data-action="toggle-theme"
                                aria-label="Turn on dark mode">
                          <svg class="icon-theme-toggle [moon]" viewBox="0 0 32 32"> … </svg>
```

## Abstractions and Code Reuse

- `src/frontend/`
  - `ui/theme.ts` — add `toggleTheme()`; everything else unchanged.
  - `ui/theme.test.ts` — tests for `toggleTheme()`.
  - `app/gz-app.component.ts` — new nav markup; `#renderView` swaps variant classes and closes the
    dropdown.
    - `template` — brand/links/menu/icons lists, one shared `navItems` array rendered twice.
    - `#renderView` — `secondary` ↔ `contrast`, `aria-current`, `details.open = false`.
  - `app/gz-app.component.css` — drop compact overrides; add divider, breakpoint visibility.
  - `app/gz-theme-toggle.component.ts` — `<button>` + SVG template; sync class and label in place.
    - `#syncSwitch` → `#syncIcon`
    - `handleAction` — calls `toggleTheme()`.
  - `app/gz-theme-toggle.component.css` — link-look reset, icon sizing, morph, reduced motion.
- `docs/frontend.md` — header and Theming sections.
- `docs/styling-guidelines.md` — button-colour exception for the nav icon button.

Reused as is: `isActive` (`router.ts:58`), `onThemeChange`/`currentTheme`/`setTheme`, the
`data-action` delegation in `GzElement`, Pico's `nav`, `details.dropdown` and variant classes.

## Logging & Observability

None; this is presentation only.

## Implementation

### Phase 1: Pico nav header

Dependencies: None

Rebuild the header as a Pico nav with plain `secondary`/`contrast` links and the divider group. The
existing switch moves into the icons list unchanged, so the header is fully usable at the end of
this phase.

**Tasks**:

- [ ] `app/gz-app.component.ts` `template()` — replace the second `<ul>` with a `<ul class="links">`
      of plain links and a `<ul class="icons">` holding `<gz-theme-toggle>`:
  ```ts
  const navItems = ROUTES.flatMap((route) => (route.nav ? [route.nav] : []));
  // …
  <ul class="links">
    ${navItems.map((item) => html`<li><a class="secondary" href="${item.path}" data-path="${item.path}">${item.label}</a></li>`)}
  </ul>
  <ul class="icons">
    <li><gz-theme-toggle></gz-theme-toggle></li>
  </ul>
  ```
- [ ] `app/gz-app.component.ts` `#renderView` — replace the `outline` toggle with
      `link.classList.toggle('contrast', active)` and `link.classList.toggle('secondary', !active)`;
      keep the `aria-current` handling and update the comment above the loop to name the classes.
- [ ] `app/gz-app.component.css` — delete the `& ul`, `& li` and `& a[role="button"]` blocks and the
      `padding-block` on `nav`; keep `header` (sticky, background, border), `.brand`, `main`,
      `footer`. Pico's `nav { justify-content: space-between }` would centre a middle `<ul>`, so
      push the links against the divider; and add the divider, both nested under `header nav`:
  ```css
  & ul.links {
    margin-inline-start: auto;
  }

  & ul.icons::before {
    display: block;
    height: 1.125rem;
    margin-inline: var(--pico-nav-element-spacing-horizontal);
    border-left: var(--pico-border-width) solid var(--pico-form-element-border-color);
    content: "";
  }
  ```
- [ ] `docs/frontend.md` — in the paragraph on `nav: { path, label }`, describe the header: a Pico
      `<nav>` whose links are `secondary`, with `contrast` and `aria-current="page"` on the current
      page, followed by a divider and the theme toggle.

**Automated Verification**:

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test` passes

**Manual Verification**:

- [ ] At `/`, `/workouts/…` and `/exercises/…` the matching link is full-contrast and the others grey,
      including after Back/Forward.
- [ ] The divider sits between Exercises and the switch, vertically centred, in both themes.

### Phase 2: Sun/moon theme toggle

Dependencies: Phase 1

Replace the switch with picocss.com's animated icon button.

**Tasks**:

- [ ] `ui/theme.ts` — add:
  ```ts
  export function toggleTheme(): void {
    setTheme(current === 'dark' ? 'light' : 'dark');
  }
  ```
- [ ] `ui/theme.test.ts` — in the `setTheme` describe (or a new `toggleTheme` describe): toggling from
      light stores and applies `dark` and notifies listeners once; toggling twice returns to `light`
      with `gainz:theme` stored as `light`.
- [ ] `app/gz-theme-toggle.component.ts` `template()` — render the button with the icon in the
      current state, SVG copied from picocss.com:
  ```ts
  const dark = currentTheme() === 'dark';
  return html`
    <button type="button" class="theme-toggle" data-action="toggle-theme"
            aria-label="${dark ? 'Turn off dark mode' : 'Turn on dark mode'}">
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" fill="currentColor"
           aria-hidden="true" class="icon-theme-toggle ${dark ? 'moon' : ''}">
        <clipPath id="theme-toggle-cutout"><path d="M0-11h25a1 1 0 0017 13v30H0Z" /></clipPath>
        <g clip-path="url(#theme-toggle-cutout)">
          <circle cx="16" cy="16" r="8.4" />
          <path d="M18.3 3.2c0 1.3-1 2.3-2.3 2.3s-2.3-1-2.3-2.3S14.7.9 16 .9s2.3 1 2.3 2.3zm-4.6 25.6c0-1.3 1-2.3 2.3-2.3s2.3 1 2.3 2.3-1 2.3-2.3 2.3-2.3-1-2.3-2.3zm15.1-10.5c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zM3.2 13.7c1.3 0 2.3 1 2.3 2.3s-1 2.3-2.3 2.3S.9 17.3.9 16s1-2.3 2.3-2.3zm5.8-7C9 7.9 7.9 9 6.7 9S4.4 8 4.4 6.7s1-2.3 2.3-2.3S9 5.4 9 6.7zm16.3 21c-1.3 0-2.3-1-2.3-2.3s1-2.3 2.3-2.3 2.3 1 2.3 2.3-1 2.3-2.3 2.3zm2.4-21c0 1.3-1 2.3-2.3 2.3S23 7.9 23 6.7s1-2.3 2.3-2.3 2.4 1 2.4 2.3zM6.7 23C8 23 9 24 9 25.3s-1 2.3-2.3 2.3-2.3-1-2.3-2.3 1-2.3 2.3-2.3z" />
        </g>
      </svg>
    </button>
  `;
  ```
      The `clipPath` id lives in this element's shadow root; fragment references inside shadow trees
      have had engine bugs, hence the cross-browser manual check below.
- [ ] `app/gz-theme-toggle.component.ts` — rename `#syncSwitch` to `#syncIcon`: toggle `moon` on the
      `svg` and set the button's `aria-label` from `currentTheme()`, without re-rendering (keep the
      existing comment's point about focus). Keep the `onThemeChange` subscription; `afterRender` no
      longer needs to sync because the template already paints the current state.
- [ ] `app/gz-theme-toggle.component.ts` `handleAction` — `if (action === 'toggle-theme') toggleTheme();`;
      import `toggleTheme` and drop the `setTheme` import.
- [ ] `app/gz-theme-toggle.component.ts` — rewrite the comments that describe the old switch: the
      class JSDoc ("Switch for the colour theme: off is light, on is dark."), the `connectedCallback`
      comment ("switch position"), and the template comment about the duplicated `aria-label`
      (delete it; the label is now the only name the button has).
- [ ] `app/gz-theme-toggle.component.css` — replace the switch rules. The button lives in this
      shadow root, out of reach of Pico's `nav li button` rule, so it sets its own nav-link spacing:
  ```css
  .theme-toggle {
    --pico-background-color: transparent;
    --pico-border-color: transparent;
    --pico-color: var(--pico-contrast);
    --pico-box-shadow: none;
    display: inline-flex;
    margin: calc(var(--pico-nav-link-spacing-vertical) * -1) calc(var(--pico-nav-link-spacing-horizontal) * -1);
    padding: calc(var(--pico-nav-link-spacing-vertical) - var(--pico-border-width) * 2) var(--pico-nav-link-spacing-horizontal);

    &:is(:hover, :active, :focus) {
      --pico-background-color: transparent;
      --pico-border-color: transparent;
      --pico-color: var(--pico-contrast-hover);
      --pico-box-shadow: none;
    }

    &:focus-visible {
      --pico-box-shadow: 0 0 0 var(--pico-outline-width) var(--pico-contrast-focus);
    }
  }

  svg.icon-theme-toggle {
    --theme-toggle-duration: 0.4s;
    width: auto;
    height: 1.125rem;

    & :first-child path {
      transition-duration: calc(var(--theme-toggle-duration) * 0.6);
      transition-property: transform, d;
      transition-timing-function: cubic-bezier(0, 0, 0.5, 1);
    }

    & g :is(circle, path) {
      transform-origin: center;
      transition: transform calc(var(--theme-toggle-duration) * 0.65) cubic-bezier(0, 0, 0, 1.25)
        calc(var(--theme-toggle-duration) * 0.35);
    }

    &.moon {
      & g circle {
        transform: scale(1.4);
        transition-delay: 0s;
      }

      & g path {
        transform: scale(0.75);
        transition-delay: 0s;
      }

      & :first-child path {
        d: path("M-9 3h25a1 1 0 0017 13v30H0Z");
        transform: translate3d(-9px, 14px, 0);
        transition-delay: calc(var(--theme-toggle-duration) * 0.4);
        transition-timing-function: cubic-bezier(0, 0, 0, 1.25);
      }
    }

    @media (prefers-reduced-motion: reduce) {
      --theme-toggle-duration: 0s;
    }
  }
  ```
      Remove the `label`, `input[role="switch"]` and `.label` rules, and change the file's header
      comment from "Colour-theme switch" to describe the icon button.
- [ ] `docs/styling-guidelines.md` — extend the button-colour bullet: the one exception is an
      icon-only control in the header nav, which resets Pico's button or dropdown-summary styling so
      it reads as a nav link, because an action belongs in a `<button>` and Pico has no link-look
      button variant. Name `gz-theme-toggle` as the instance (Phase 3 adds the hamburger).
- [ ] `docs/frontend.md` — in Theming, describe the toggle button: it shows a sun in light mode and a
      moon in dark mode, morphs between them by toggling a class in place so focus survives, flips its
      `aria-label`, and calls `toggleTheme()`. Reword "A visitor who has never touched the switch"
      to name the theme toggle.

**Automated Verification**:

- [ ] New `toggleTheme` tests in `src/frontend/ui/theme.test.ts` pass: `bun test src/frontend/ui/theme.test.ts`
- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test` passes (including the `static.routes.test.ts` check that every component has its `.css`)

**Manual Verification**:

- [ ] Clicking the icon switches theme and morphs sun → moon → sun in Chrome/Firefox; in Safari the
      end state is correct.
- [ ] In Chrome, Firefox and Safari the moon shows its crescent cutout, i.e. the shadow-root
      `clip-path="url(#theme-toggle-cutout)"` reference resolves.
- [ ] Reloading in dark mode shows the moon immediately with no animation; the stored choice and a
      first visit on a dark system still behave as before.
- [ ] Tab to the icon, press Space and Enter: theme flips, focus ring stays on the button, and a
      screen reader announces "Turn on/off dark mode, button".
- [ ] With reduced motion enabled in the OS, the icon swaps instantly.

### Phase 3: Narrow-screen dropdown

Dependencies: Phase 1

Fold the page links into a hamburger dropdown at ≤ 560 px.

**Tasks**:

- [ ] `app/gz-app.component.ts` `template()` — between `links` and `icons`, add the menu, rendering
      the same `navItems` with the same classes and `data-path`:
  ```ts
  <ul class="menu">
    <li>
      <details class="dropdown">
        <summary aria-label="Menu">
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" aria-hidden="true">
            <path d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </summary>
        <ul dir="rtl">
          ${navItems.map((item) => html`<li><a class="secondary" href="${item.path}" data-path="${item.path}">${item.label}</a></li>`)}
        </ul>
      </details>
    </li>
  </ul>
  ```
- [ ] `app/gz-app.component.ts` `#renderView` — after the link loop, close the menu:
      `const menu = this.$<HTMLDetailsElement>('details.dropdown'); if (menu) menu.open = false;`
- [ ] `app/gz-app.component.css` — nested under `header nav`: size the hamburger svg
      (`height: 1.125rem; width: auto;`), give `ul.menu` the same `margin-inline-start: auto` as
      `ul.links`, hide `ul.menu` by default, and at `max-width: 560px` hide `ul.links` and show
      `ul.menu` (same breakpoint as `.brand .tag`).
- [ ] `app/gz-app.component.css` — reset the summary to a bare icon, nested under `header nav`. The
      `header nav` prefix outranks Pico's `details.dropdown > summary:not([role]):focus` and
      `nav details.dropdown > summary:not([role]):focus-visible`:
  ```css
  & details.dropdown > summary:not([role]) {
    border-color: transparent;
    background-color: transparent;
    color: var(--pico-contrast);

    &::after {
      display: none;
    }

    &:is(:hover, :active, :focus) {
      border-color: transparent;
      background-color: transparent;
      color: var(--pico-contrast-hover);
      box-shadow: none;
    }

    &:focus-visible {
      box-shadow: 0 0 0 var(--pico-outline-width) var(--pico-contrast-focus);
    }
  }
  ```
- [ ] `docs/styling-guidelines.md` — add the header's hamburger summary as the second instance of the
      nav icon-control exception.
- [ ] `docs/frontend.md` — add to the header description: below 560 px the links render a second
      time inside a Pico dropdown behind a hamburger, CSS shows one list at a time, the
      `nav a[data-path]` loop highlights both, and `gz-app` closes the dropdown on route change.

**Automated Verification**:

- [ ] `bun run typecheck` passes
- [ ] `bun run lint` passes
- [ ] `bun run fmt:check` passes
- [ ] `bun test` passes

**Manual Verification**:

- [ ] At ≤ 560 px width only the hamburger shows; above it only the inline links show.
- [ ] The hamburger has no border, background or chevron, matches the theme icon's colour and hover,
      and shows a focus ring only for keyboard focus.
- [ ] Opening the menu lists Dashboard, Workouts, Exercises right-aligned, with the current page
      highlighted; picking one navigates and closes the menu.
- [ ] Back/Forward with the menu open closes it and updates the highlight.
- [ ] Brand, hamburger, divider and theme icon fit one row at 360 px in both themes.

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

## References

- picocss.com header markup and `main-*.css` (`svg.icon-theme-toggle`, `body>header … nav ul.icons:before`),
  fetched 2026-09-15
- Pico nav docs: https://picocss.com/docs/nav
- Pico dropdown docs: https://picocss.com/docs/dropdown
- `node_modules/@picocss/pico/css/pico.orange.css` — `nav li`, `nav li button`, `nav details.dropdown`,
  `aria-current` link rules
- `docs/agents/plans/2026-09-15-path-based-frontend-routing.md` — the current `#renderView` and link
  interception
