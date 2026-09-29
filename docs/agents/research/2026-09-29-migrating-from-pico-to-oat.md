---
date: 2026-09-29T11:41:46.866506+00:00
git_commit: b0c7752f7be4802f6fd2ec518a718311ae8b0f83
branch: main
topic: "Migrating gainz from Pico CSS to Oat"
tags: [research, codebase, frontend, styling, pico, oat, static, build, theming]
status: complete
---

# Research: Migrating gainz from Pico CSS to Oat

## Research Question

What would migrating gainz from Pico CSS (`@picocss/pico` 2.1.1) to Oat (`@knadh/oat` 0.8.0, a small
semantic UI library with a few web components, no build step) touch? Cover every place Pico is used —
how it is loaded and served, which Pico components, classes and `--pico-*` variables, theming via
`data-theme`, button variants, cards, dropdown, forms, grid, nav — how each maps to Oat, the gaps,
what Oat's JavaScript would need in a no-build-step frontend, the single-file build, the docs and
agent memories that name Pico, and the risks (Oat is pre-1.0; mobile behaviour).

## Summary

Pico enters gainz through **one file** and reaches every pixel through **two paths**:

1. `/vendor/pico.css` — an allowlisted `node_modules` file served by the static feature and embedded
   by the single-file build — is `<link>`ed by `index.html` for the document **and** fetched into a
   constructable `CSSStyleSheet` that every component adopts into its shadow root, ahead of
   `ui/shared.css` and its own `.css` file.
2. Hand-written CSS is a thin layer over **30 distinct `--pico-*` custom properties** (104 references
   across 11 of the 14 `.css` files), and the templates lean on Pico's classless components:
   bare `<article>` as a card, `<hgroup>`, `<details class="dropdown">` in the nav, `aria-busy`,
   button classes `secondary` / `outline` / `contrast`, `.container` and `.overflow-auto`.

Oat 0.8.0 is shaped differently from Pico in four ways that decide most of a migration:

| Concern | Pico 2.1.1 (as used today) | Oat 0.8.0 |
|---|---|---|
| Shadow DOM | Ships `:host` next to `:root`; gainz adopts it per shadow root | Light DOM only: no `:host`, tokens on `:root`, `body`-level typography; own components use no shadow DOM |
| Dark mode | `data-theme` attribute, mirrored onto `<html>` and every host | `color-scheme` + `light-dark()` in every colour token; no `data-theme` selector at all |
| Card | Bare `<article>` | `.card` class; bare `<article>` unstyled |
| Tokens | `--pico-*` prefix | Unprefixed (`--primary`, `--border`, `--space-4`, …) |

Oat also claims several class names gainz already defines for itself: `.badge`, `.row`, `.toast`,
`.error`, `.small`, `.table`.

```
gainz/
├── package.json                                  "@picocss/pico": "2.1.1" — only runtime dependency
├── src/frontend/
│   ├── index.html                                <link> /vendor/pico.css, no-flash data-theme script
│   ├── ui/
│   │   ├── styles.ts                             BASE_HREFS = [pico, shared]; adopted per shadow root
│   │   ├── base.ts                               adopts sheets; mirrors data-theme onto each host
│   │   ├── theme.ts                              light/dark state, data-theme, localStorage
│   │   ├── app.css                               pins --pico-font-size: 100%
│   │   ├── shared.css                            utilities over --pico-* (29 refs), .badge, .row, button.danger
│   │   ├── gz-tile.component.{ts,css}            bare <article> card
│   │   └── gz-toast.component.{ts,css}           .toast / .error / .success over --pico-*
│   ├── app/
│   │   ├── gz-app.component.{ts,css}             main.container, footer.container
│   │   ├── gz-header.component.{ts,css}          Pico <nav>, details.dropdown, secondary/contrast links
│   │   └── gz-theme-toggle.component.{ts,css}    icon button reset via --pico-* (18 refs)
│   └── features/…/*.component.{ts,css}           articles, hgroup, aria-busy, button variants, tables
├── src/backend/features/static/
│   ├── internal/paths.ts                         VENDOR_FILES allowlist
│   ├── internal/web-files.ts                     disk/embedded vendor lookup, fixed text/css type
│   ├── internal/embed.ts                         embeds vendor files, fixed text/css type
│   └── static.routes(.test).ts                   one route per vendor URL; tests assert 'Pico CSS'
├── src/backend/shared/embedded.ts                EmbeddedWeb { pages, vendor }
├── src/scripts/build(.test).ts                   single-file build; test asserts /vendor/pico.css
└── docs/ styling-guidelines.md, frontend.md, backend.md, README.md, AGENTS.md
```

```
         bun install → node_modules/@picocss/pico/css/pico.min.css
                                   │  VENDOR_FILES['/vendor/pico.css']
             ┌─────────────────────┴──────────────────────┐
     disk (bun start)                         embedded (dist/gainz.js)
     DiskWebFiles.vendor                      embedWebRoot() → EMBEDDED.vendor
             └─────────────────────┬──────────────────────┘
                     GET /vendor/pico.css  (text/css, ETag, no-cache)
             ┌─────────────────────┴──────────────────────┐
   index.html <link>  → document                styles.ts fetch → CSSStyleSheet
   (:root, body, html[data-theme])              adopted by every GzElement shadow root
                                                (:host rules, data-theme on each host)
```

## Detailed Findings

### 1. How Pico is installed, served and embedded

- `package.json:21-23` — `@picocss/pico` 2.1.1 is the only runtime dependency (pinned in `bun.lock`).
- `src/backend/features/static/internal/paths.ts:9-17` — `VENDOR_FILES` maps the URL
  `/vendor/pico.css` to the specifier `@picocss/pico/css/pico.min.css`; `resolveVendorPath`
  (`:23-33`) resolves it with `Bun.resolveSync` from the repository root. The comment calls it an
  allowlist of "third-party stylesheets".
- `src/backend/features/static/static.routes.ts:16-22` — one `{ GET, HEAD }` route per `vendorUrls()`
  entry, beside the `/*` web-root route.
- `src/backend/features/static/internal/web-files.ts:53-65` — `DiskWebFiles.vendor` answers the file's
  bytes with a **hard-coded** `text/css;charset=utf-8`; `EmbeddedWebFiles.vendor` (`:94-97`) looks
  the literal pathname up in `EMBEDDED.vendor`.
- `src/backend/features/static/internal/embed.ts:39-47` — the build embeds each vendor URL as text,
  again with a hard-coded `text/css;charset=utf-8`, and throws "Vendor stylesheet missing — run
  `bun install`" if it is absent.
- `src/backend/shared/embedded.ts:16-21` — `EmbeddedWeb.vendor` is keyed by literal URL.
- `src/scripts/build.ts:1-5,42` — the doc comment names Pico; the log line counts vendor files.

Oat's npm package `@knadh/oat` publishes `oat.min.css` (31,718 B minified / 7,107 B gzip),
`oat.min.js` (10,421 B / 3,756 B), and the unbundled sources under `css/` and `js/`. Its CSS is one
self-contained file: no `@import` (verified), native nesting and `@layer` only. A CSS-only switch is
therefore the same shape as today — one `VENDOR_FILES` entry. Serving `oat.min.js` as well would be
the first non-CSS vendor file: both `web-files.ts:64` and `embed.ts:46` fix the type to CSS, and the
error messages say "Vendor stylesheet".

### 2. How Pico reaches the document and the shadow roots

- `src/frontend/index.html:28-34` — links `/vendor/pico.css` then `/ui/app.css`; the comment says the
  same file is adopted into every shadow root, "which is why Pico 2 ships :host selectors next to its
  :root ones". `:40` uses `<main class="container">` inside `<noscript>`.
- `src/frontend/ui/styles.ts:20` — `BASE_HREFS = ['/vendor/pico.css', '/ui/shared.css']`, fetched up
  front behind a top-level `await` (`:54`) and filled into constructable sheets with
  `sheet.replace()` (`:34-52`). `stylesFor()` (`:83-91`) returns `[pico, shared, own]`.
- `src/frontend/ui/base.ts:23` — `this.root.adoptedStyleSheets = stylesFor(this.localName)` for every
  `GzElement`.
- `src/frontend/dev/hot.ts:45-72` — hot reload refills adopted sheets and swaps document `<link>`s,
  covering the vendor link too.

Oat against this mechanism (from its source; see [Oat facts](#oat-080-facts-used-in-this-report)):

- Oat contains **no `:host` selector** (verified: 0 matches). Its tokens sit on `:root`
  (`css/01-theme.css`), which never matches inside a shadow root. Custom properties inherit across the
  shadow boundary, so inside components the tokens would resolve from the document — which already
  loads the same file via `index.html:33`.
- Oat's typography base is `body, dialog, [popover] { font-family; font-size: var(--text-regular);
  color }`. Inside a shadow root no `body` matches; font family, size and colour would arrive by
  ordinary inheritance from the document `body`.
- Everything in Oat is inside `@layer theme, base, components, animations, utilities`. Layers are
  scoped per tree, and unlayered rules beat layered ones, so gainz's unlayered `shared.css` and
  component sheets would override Oat regardless of adoption order.
- Oat's base resets `* { margin: 0 }`. Several `shared.css` rules exist only to cancel Pico's margins
  and full-width submit buttons (`shared.css:33-38`, `:75-79`, `:86-93`, `:176-181`, `:203-205`).

### 3. Theming: `data-theme`

- `src/frontend/index.html:14-27` — inline script sets `data-theme` on `<html>` from
  `localStorage['gainz:theme']` before first paint.
- `src/frontend/ui/theme.ts:1-17` — documents why the attribute is mirrored onto every host: Pico's
  light theme reaches a shadow root via `:host(:not([data-theme=dark]))`, its dark one only as a bare
  `[data-theme=dark]`, which inherits from `<html>`. `applyThemeTo` (`:59-61`) sets the attribute;
  `setTheme` (`:63-75`) persists and dispatches `gz-theme-change`; `:89-92` pins the attribute for
  visitors with no stored choice.
- `src/frontend/ui/base.ts:42-55` — each component mirrors the theme onto its host and re-mirrors on
  change.
- `src/frontend/app/gz-theme-toggle.component.ts:10-57` — sun/moon button calls `toggleTheme()`.
- `src/frontend/ui/theme.test.ts` — covers stored/system resolution, `setTheme`, `applyThemeTo` on a
  host (`:160-169`), `toggleTheme`.

Oat's colour tokens are all `light-dark(light, dark)` (24 occurrences) under
`:root { color-scheme: light dark }`, with no `data-theme` selector (verified: 0). Its docs switch
theme with `style.colorScheme = 'dark' | 'light'`; oat.ink sets it on `document.documentElement` and
stores the choice in localStorage. `color-scheme` is an inherited property, so a value on `<html>`
reaches into shadow trees without per-host mirroring. The docs suggest scoping custom dark-palette
overrides under a `[data-theme="dark"]` selector the app sets itself.

### 4. Font sizing

- `src/frontend/ui/app.css:1-8` — pins `--pico-font-size: 100%` against Pico's viewport-scaled root.
- `src/frontend/ui/shared.css:5-17` — `:host { font-size: inherit }` against Pico's
  `:host, :root { font-size: var(--pico-font-size) }` compounding per nesting level.
- `docs/styling-guidelines.md:19-28` — records both reasons.

Oat sets no root and no `:host` font size; body text is `--text-regular` = `--text-6` = `1rem`.
h1–h4 scale with the viewport through `clamp(…vw…)` (e.g. `--text-1: clamp(1.75rem, 1.5rem + 1.1vw,
2.25rem)`). Components use fixed rem steps: `--text-7` (0.875rem) for buttons, inputs, labels, tables;
`--text-8` (0.75rem) for badges, `.small` buttons, hints.

### 5. Pico components and classes in templates, and their Oat counterparts

| Pico feature in gainz | Where | Oat 0.8.0 counterpart |
|---|---|---|
| Bare `<article>` card | `gz-tile.component.ts:18-22`; `gz-exercise-list:87`; `gz-exercise-detail:197,249,309`; `gz-workout-list:89`; `gz-workout-detail:273,305,406`; `article.open-card` in dashboard `:87`, exercise list `:57`, workout list `:134` | `.card` (e.g. `<article class="card">`); bare `article` is unstyled (0 `article` selectors) |
| `<hgroup>` title + subtitle | `gz-exercise-detail:190`, `gz-workout-detail:267` | Not styled |
| `<nav class="container">` with `<ul>` groups spread by `space-between` | `gz-header.component.ts:53-86`, CSS `gz-header.component.css:8-65` | No generic `nav`/`header` styling; `nav[data-topnav]` is the sticky top bar of Oat's sidebar layout (`data-sidebar-layout`, `aside[data-sidebar]`, `[data-sidebar-toggle]`, off-canvas ≤768px) |
| `<details class="dropdown">` hamburger menu, `<ul dir="rtl">` | `gz-header.component.ts:62-83`, CSS `:35-56` | Oat styles every `details` as an accordion (border, radius, chevron, joined siblings). Dropdown is `<ot-dropdown>` with `[popovertarget]` + `<menu popover>` (JS) |
| Link colour classes `a.secondary` / `a.contrast` + `aria-current` | `gz-header.component.ts:29-47,59-61` | No link variants; links unstyled-underline by default since 0.8.0 |
| `button.secondary` | `outline compact` combos in `gz-exercise-detail:315-322`, `gz-workout-list:143-151,161`, `gz-workout-detail:430`, `gz-set-row:131,153-154` | `data-variant="secondary"` (attribute, not class) |
| `button.outline` | same places | `.outline` (also `.ghost`) |
| `.contrast` | nav links only | None |
| Plain primary `<button>` / `type="submit"` | every form | Classless `button` / `[type=submit]` |
| `button.danger` (gainz's own, over `--pico-*`) | `shared.css:183-194`; `gz-exercise-detail:194`, `gz-workout-detail:271`, `gz-set-row:155` | `data-variant="danger"` (optionally `.ghost`) |
| `button.compact` (gainz's own) | `shared.css:176-181`; list/row buttons | `.small` |
| Pressed metric button `[aria-pressed=true]` | `gz-exercise-detail.component.css:17-22` | None |
| Icon-only nav button reset | `gz-theme-toggle.component.css:5-24` | `.ghost` + `.icon` |
| `aria-busy="true"` loading | `<p aria-busy>` in dashboard `:50`, exercise list `:72`, exercise detail `:290`, workout list `:114`, workout detail `:363` | Same attribute; `data-spinner="small|large|overlay"` modifiers |
| `.container` | `gz-app:112,114`, header nav, `index.html:40` | `.container` (max `--container-max` 1280px + padding) |
| `.overflow-auto` table wrapper | `gz-exercise-detail:251`, `gz-workout-detail:408` | `<div class="table">` |
| Classless `table`/`th`/`td` | exercise detail, workout detail | Classless, with row hover |
| Classless `label`/`input`/`select`/`textarea` | every form, `.fields`/`.field` rows | Classless; full-width text inputs and select; `[data-field]` wrapper with `[data-hint]`/`.error` |
| `<textarea>`, `input type=date/number` | detail forms | Classless |

Not used anywhere in templates: `<dialog>`, `role="group"`, `role="switch"`, `role="button"`,
`aria-invalid`, `data-tooltip`, `<fieldset>`, `<progress>`, `class="grid"` layout. `gz-chart` uses
native `title` tooltips on `.dot` spans (`gz-chart.component.ts:143-147`); `<line class="grid">` is an
SVG class, not a layout grid.

### 6. gainz class names that Oat also defines

Checked against `oat.min.css` 0.8.0:

| Class | gainz meaning | Oat meaning |
|---|---|---|
| `.badge` | Pill in `shared.css:116-125`, used in lists and workout totals | Badge component (5 selectors), with `data-variant`, `.outline`, nested remove button |
| `.row` | Flex row, `shared.css:40-45` | 12-column CSS grid (`--grid-cols`), 4 columns ≤768px |
| `.toast` | `gz-toast.component.css:12-48` inside its shadow root | Toast component (JS `ot.toast()` container appended to `body`) |
| `.error` | `.toast.error` modifier | Field error message, hidden unless the field is `aria-invalid` |
| `.small` | not used by gainz | Button/avatar size |
| `.table` | not used by gainz | Table scroll wrapper |

Not claimed by Oat: `.stack`, `.stack-sm`, `.row-between`, `.grow`, `.fields`, `.field`, `.muted`,
`.mono`, `.nowrap`, `.error-text`, `.empty`, `.compact`, `.danger`, `.open-card`, `.num`.

### 7. `--pico-*` custom properties and nearest Oat tokens

References per file: `shared.css` 29, `gz-theme-toggle` 18, `gz-header` 10, `gz-set-row` 9,
`gz-exercise-detail` 8, `gz-toast` 8, `gz-chart` 7, `gz-app` 2, `gz-tile` 2, `app.css` 1,
`gz-workout-detail` 1. None occur in `.ts` or `.html`.

| Pico property (uses) | Oat token with the closest role |
|---|---|
| `--pico-muted-color` (12) | `--muted-foreground` |
| `--pico-primary` (8) | `--primary` |
| `--pico-spacing` (7) | `--space-*` scale (`--space-1`…`--space-18`) |
| `--pico-del-color` (7) | `--danger` |
| `--pico-muted-border-color` (6) | `--border` |
| `--pico-background-color` / `-border-color` / `-color` (5 each), `--pico-box-shadow` (3), `--pico-underline` (1) | Per-element Pico button hooks; Oat buttons read `--primary` / `--_variant-color` and have no per-button hooks |
| `--pico-border-radius` (4) | `--radius-medium` |
| `--pico-card-sectioning-background-color` (3) | `--muted` / `--faint` |
| `--pico-ins-color` (3) | `--success` |
| `--pico-card-background-color` (2) | `--card` |
| `--pico-card-box-shadow` (1) | `--shadow-small` / `--shadow-medium` |
| `--pico-contrast`, `--pico-contrast-hover` (2 each) | `--foreground` |
| `--pico-contrast-focus`, `--pico-outline-width` (2 each) | `--ring` (Oat draws a 2px `:focus-visible` outline) |
| `--pico-primary-background` / `-border` / `-inverse` (1 each) | `--primary` / `--primary-foreground` |
| `--pico-form-element-border-color` (1) | `--input` |
| `--pico-font-family-monospace` (1) | `--font-mono` |
| `--pico-border-width` (2) | none |
| `--pico-nav-link-spacing-*`, `--pico-nav-element-spacing-horizontal` (5) | none |
| `--pico-block-spacing-vertical` (1) | none (`main` gets `padding-block-start: var(--space-8)`) |
| `--pico-font-size` (2) | none (see §4) |

Oat's full token list: colours `--background --foreground --card --card-foreground --primary
--primary-foreground --secondary --secondary-foreground --muted --muted-foreground --faint
--faint-foreground --accent --danger --danger-foreground --success --success-foreground --warning
--warning-foreground --border --input --ring`; `--space-*`; `--radius-small|medium|large|full`;
`--text-1…8`, `--text-regular`, `--leading-normal`; `--font-sans --font-mono`, font weights;
`--shadow-small|medium|large`; `--transition(-fast)`; `--z-dropdown --z-modal`; plus
`--grid-cols --grid-gap --container-max --container-pad --sidebar-width`. The only non-Pico custom
property gainz declares, `--theme-toggle-duration`, does not collide.

### 8. Oat's JavaScript against a no-build-step, shadow-DOM frontend

gainz today uses none of the behaviours Oat's JS provides (no tabs, dialogs, tag inputs, uploads;
toasts are its own `gz-toast`). What the JS is:

- `oat.min.js` is a classic IIFE bundle (`esbuild --format=iife`); there is no bundled ESM file. The
  npm package also ships the unbundled sources under `js/` as native ES modules
  (`import { OtBase } from './base.js'`).
- Loading it registers `ot-tabs`, `ot-dropdown`, `ot-taginput`, `ot-upload` (4 `customElements.define`
  calls, verified), sets `window.ot.toast`, adds a `commandfor` polyfill and a dialog `touchstart`
  shim, a document click listener for the sidebar, and a `DOMContentLoaded` title→tooltip pass.
- None of the four elements use shadow DOM (0 `attachShadow`); they enhance light-DOM children via
  `this.querySelector`, so they work when placed inside a gainz shadow root together with their
  children, provided the adopted Oat sheet styles those children.
- Document-scoped pieces do not see into shadow roots: `tooltip.js` observes and queries
  `document.body`; the `commandfor` polyfill uses `document.getElementById`; the sidebar's delegated
  `closest()` sees only the retargeted host; `ot.toast()` appends its container to `body`.
- Serving the JS through the vendor mechanism meets the fixed `text/css` type in `web-files.ts:64`
  and `embed.ts:46` (§1). `index.html` loads only `/main.ts` as a module today.

### 9. Tests that name Pico

- `src/backend/features/static/static.routes.test.ts:44-49` — `/vendor/pico.css` is 200, `text/css`,
  body contains `'Pico CSS'`; `:51-54` — `/vendor/pico.scss` and
  `/node_modules/@picocss/pico/package.json` are 404; `:67-75, 108-115, 121-131, 162-167` use
  `/vendor/pico.css` / `/vendor/pico.scss` as the vendor-route case for 405, ETag, 304 and error paths.
- `src/scripts/build.test.ts:122-131` — the built file serves `/vendor/pico.css`; `:141` includes the
  encoded `/vendor/%70ico.css` as a path-guard case.
- `src/frontend/app/router.test.ts:165-167` — a link to `/vendor/pico.css` is left to the browser.
- `src/frontend/ui/theme.test.ts` — the `data-theme` behaviour of §3.
- No test mounts a component or asserts on template markup (`docs/frontend.md:242-245`).

### 10. Documentation, skills and memories that name Pico

Living docs:

- `docs/styling-guidelines.md` — "Pico first" (`:3-10`: `<article>` card, `<hgroup>`,
  `<details class="dropdown">`, `aria-busy`, `--pico-*`), no font sizes (`:19-28`), button colours
  from Pico's variant classes with the two nav exceptions (`:29-34`), Pico adopted per shadow root and
  `data-theme` mirrored (`:35-37`).
- `docs/frontend.md:3-6, 72-81, 173-175, 184-189, 197-201, 208-232, 234-238` — index.html links, Pico
  nav header, up-front loading, hot reload of Pico's `<link>`, theming table, vendor serving.
- `docs/backend.md:178-217` — `VENDOR_FILES`, `WebFiles`, fixed vendor `Content-Type`, 405
  fall-through, ETag history ("kept a stale Pico after `bun install`").
- `README.md:7-8, 18` — "styled with Pico CSS"; `bun install` comment.
- `AGENTS.md:8, 47` (`CLAUDE.md` is a symlink to it) — install comment; index entry "Pico, no CSS in
  JavaScript, no font sizes".
- `.agents/skills/commit/references/examples.md:69-90, 130-132` — example commit messages that
  mention Pico (behind the `.claude/skills` symlink).

Historical records under `docs/agents/` mention Pico in 20 files (most in
`plans/2026-09-15-pico-nav-header-and-theme-toggle.md`, 54 mentions). `AGENTS.md` forbids editing
those.

Agent memories (user-level, outside the repository) whose rule is stated in Pico terms:

- `gainz-styling-picocss-external-css` — the project styles with Pico, external `.css`, no font sizes.
- `gainz-check-pico-component-before-hand-rolling` — check Pico before hand-rolling a box; don't name
  bespoke classes after Pico components.
- `gainz-no-nested-pico-cards` — never nest Pico cards (`<article>`).
- `gainz-no-custom-button-colors` — colour buttons only through Pico's variant classes.

## Oat 0.8.0 facts used in this report

Collected from the `knadh/oat` source at tag v0.8.0 / master `32955ad` (2026-09-28), the npm
registry, and cross-checked against `https://cdn.jsdelivr.net/npm/@knadh/oat@0.8.0/oat.min.css|js`.

- **Maintenance.** First commit 2026-01-13; 15 releases from v0.1.0 (2026-02-11) to v0.8.0
  (2026-09-08), roughly monthly since April. Single maintainer (Kailash Nadh), 27 commit authors,
  2 open issues and 1 open PR of 85 issues total; last commit 2026-09-28. MIT. Stated scope: stay under
  ~10 KB "forever" and cover ~90 % of common components (issue #74).
- **Stability.** README: "sub v1 and is likely to have breaking changes until it hits v1". No roadmap
  to 1.0 (issue #173 closed without a visible reply). Breaking changes so far: v0.4.0 (`.spinner` →
  `aria-busy`; toast API and ES modules; dark mode → `light-dark()`; `.sr-only` removed), v0.4.1
  (`.text-*` → `.align-*`), v0.6.2 (`data-field="error"` → `aria-invalid`), v0.7.0 (`data-variant`
  centralised), v0.8.0 (links no longer underlined, labelled a "breaking (visual) change"). `master`
  already carries three post-0.8.0 CSS changes (button `font-family: inherit`, dialog `overflow`,
  input selector excludes button types).
- **Mobile.** One breakpoint, `max-width: 768px` (grid collapses to 4 columns; sidebar becomes an
  off-canvas overlay, also hard-coded in `sidebar.js`). No `pointer: coarse` handling. Approximate
  control sizes from the CSS: default button ~39px tall, `.small` ~28px, `.large` 3rem, `.icon`
  2.5rem, checkbox/radio 1rem, switch 1.5×3rem. Mobile-specific code: tap-highlight removal, dialog
  backdrop `touchstart` shim, `.table` scroll wrapper, `dialog { width: min(100% - 2rem, 32rem) }`,
  `100dvh` sidebar. Mobile-related issues #85, #91, #161, #174 closed; #185 (tooltip clipped by
  sidebar) open. The docs claim the grid uses container queries; the CSS uses `@media`.
- **Look.** "Influenced by the shadcn aesthetic" (oat.ink). Neither the repo nor the issues mention
  Pico.
- **Sources.** https://github.com/knadh/oat, https://oat.ink, https://registry.npmjs.org/@knadh/oat,
  https://github.com/knadh/oat/issues/74, /114, /173, /185.

## Code References

- `package.json:21-23` — `@picocss/pico` dependency
- `src/backend/features/static/internal/paths.ts:15-17` — `VENDOR_FILES` allowlist
- `src/backend/features/static/internal/web-files.ts:53-65` — disk vendor read, fixed `text/css`
- `src/backend/features/static/internal/embed.ts:39-47` — embedded vendor files, fixed `text/css`
- `src/backend/features/static/static.routes.ts:16-22` — per-vendor-URL routes
- `src/backend/shared/embedded.ts:16-21` — `EmbeddedWeb.vendor`
- `src/frontend/index.html:14-34` — no-flash theme script, Pico and app stylesheet links
- `src/frontend/ui/styles.ts:20,54,83-91` — base sheets, up-front load, adoption order
- `src/frontend/ui/base.ts:23,42-55` — adoption and `data-theme` mirroring per host
- `src/frontend/ui/theme.ts:1-17,59-92` — theme model built around Pico's `data-theme` selectors
- `src/frontend/ui/app.css:6-8` — `--pico-font-size: 100%`
- `src/frontend/ui/shared.css:5-17,33-38,75-93,116-125,176-194,203-205` — font-size inherit, Pico
  margin/width cancellations, `.badge`, `.compact`, `.danger`
- `src/frontend/app/gz-header.component.ts:29-86` and `.css:8-65` — Pico nav and dropdown
- `src/frontend/app/gz-theme-toggle.component.css:5-24` — icon button reset via `--pico-*`
- `src/frontend/ui/gz-toast.component.css:12-48` — `.toast`, `.error`, `.success`
- `src/frontend/features/exercises/gz-exercise-detail.component.ts:188-331` — hgroup, forms, table,
  metric switch
- `src/frontend/features/workouts/gz-workout-detail.component.ts:266-438` — hgroup, forms, sets, table
- `src/frontend/features/workouts/internal/gz-set-row.component.ts:109-157` — edit form and row actions
- `src/backend/features/static/static.routes.test.ts:44-167`, `src/scripts/build.test.ts:122-141` —
  tests naming `/vendor/pico.css`

## Architecture Documentation

- **One stylesheet, two consumers.** The vendor sheet is both a document stylesheet and the first
  adopted sheet of every shadow root. Pico supports this by shipping `:host` selectors; the
  `data-theme` mirroring and the `:host { font-size: inherit }` fix exist because of how those
  `:host` rules behave.
- **Vendor allowlist.** Third-party files are single, explicitly listed `node_modules` files served at
  fixed URLs, typed as CSS, with ETag + `no-cache`, and embedded by URL into the single-file build.
- **Thin hand-written layer.** Component CSS is external, nested, uses the library's tokens for every
  colour, border, radius and most spacing, and declares no font sizes.
- **Styling by semantics.** Templates use elements and ARIA state (`article`, `hgroup`, `details`,
  `aria-busy`, `aria-current`, `aria-pressed`) plus a small set of library variant classes; bespoke
  classes cover layout (`.stack`, `.row`, `.fields`) and gainz-specific pieces (`.open-card`,
  `.badge`, `.empty`).

## Open Questions

- How Oat's layered, `:root`-scoped, `body`-typed CSS renders when adopted into a shadow root in
  practice (inherited tokens and fonts, `* { margin: 0 }`, `light-dark()` resolved per element) —
  inferred from source, not observed in a browser.
- Whether Oat's submit buttons are full-width inside forms, as Pico's are; `shared.css` currently
  assumes Pico's behaviour.
- How Oat's accordion styling of every `details` interacts with the header's hamburger
  `<details class="dropdown">`.
- Whether Oat's ~39px default button and 1rem checkbox meet the touch sizes gainz gets from Pico today
  (Pico's sizes were not measured for this report).
- Whether a post-0.8.0 release changes any of the facts above (three CSS commits are already on
  `master`).
