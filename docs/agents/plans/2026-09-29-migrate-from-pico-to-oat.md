---
date: 2026-09-29T11:59:36.176359+00:00
git_commit: b0c7752f7be4802f6fd2ec518a718311ae8b0f83
branch: main
topic: 'Migrate from Pico CSS to Oat'
tags: [plan, frontend, styling, static, build, theming, oat, pico]
status: implemented
---

# PLAN: Migrate from Pico CSS to Oat

Replace `@picocss/pico` 2.1.1 with `@knadh/oat` 0.8.0 as the frontend's UI library: its stylesheet
styles the document and every component shadow root, and its JavaScript supplies the narrow-screen
nav dropdown and the toasts. Based on
[`docs/agents/research/2026-09-29-migrating-from-pico-to-oat.md`](../research/2026-09-29-migrating-from-pico-to-oat.md),
which is the source for every Pico usage and Oat fact below not re-derived here.

## Acceptance Criteria

- `@knadh/oat` `0.8.0` (pinned exactly) replaces `@picocss/pico`; no `pico` / `--pico-*` reference
  remains in `src/`, `package.json`, `bun.lock`, `README.md`, `AGENTS.md` or the living `docs/*.md`,
  apart from one line of ETag history in `docs/backend.md` that names Pico as the past cause.
- `/vendor/oat.css` (`text/css`) and `/vendor/oat.js` (`text/javascript`) are served with a strong
  ETag and `no-cache`, both from disk and from the single-file build; `/vendor/pico.css` is a 404.
- The document and every component shadow root are styled by Oat. The theme toggle switches light /
  dark through `data-theme` on `<html>` alone (→ `color-scheme`), with no per-host mirroring and no
  flash of the wrong theme on load.
- Cards are `.card`; buttons are coloured only through Oat's variants (`data-variant`, `.outline`,
  `.ghost`, `.icon`); layout uses Oat's utilities; `shared.css` holds only gainz-specific classes.
- At ≤560px the nav links are an `<ot-dropdown>` with a popover menu; wider screens show them inline.
- `toast()` / `toastError()` show Oat toasts at the bottom right; `<gz-toast>` no longer exists.
- `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test` pass; the built
  `dist/gainz.js` serves the app.

## Technical Key Decisions and Tradeoffs

1. **Header menu:** Oat's `<ot-dropdown>` — a `popovertarget` trigger and a `<menu popover>` of
   `role="menuitem"` links — replaces Pico's `<details class="dropdown">`.
   - Why: a library component instead of fighting Oat's accordion styling of every `<details>`.
   - Impact: Oat's JavaScript must be served; `ot-dropdown` works inside gainz's shadow root because
     it uses no shadow DOM, queries its own children, and `popovertarget` IDs resolve per tree.
2. **Oat JS:** the whole `oat.min.js`, served at `/vendor/oat.js` and loaded by a classic
   `<script src="/vendor/oat.js" defer>` placed before `/main.ts`.
   - Why: Oat's documented entry point; one allowlist entry. Deferred and module scripts run in
     document order, so `ot-dropdown` and `window.ot` exist before any gainz module runs.
   - Impact: vendor files stop being CSS-only — their content type comes from `Bun.file(path).type`
     (verified: `text/css;charset=utf-8` / `text/javascript;charset=utf-8`), as page files already do.
3. **Palette:** Oat's defaults, no token overrides.
   - Why: nothing bespoke to keep in sync with a pre-1.0 library.
   - Impact: the app turns neutral (near-black / near-white primary) instead of Pico blue.
4. **Utilities:** Oat's `.vstack`, `.hstack`, `.gap-2`, `.justify-between`, `.text-light` and
   `.badge.outline` replace gainz's `.stack`, `.stack-sm`, `.row`, `.row-between`, `.muted` and
   bespoke `.badge`.
   - Why: no parallel vocabulary, and `.row` (Oat's 12-column grid) and `.badge` collide with Oat.
   - Impact: every feature template changes; `shared.css` keeps only `.grow`, `.fields`/`.field`,
     `.mono`, `.nowrap`, `.error-text`, `.empty`, `article.open-card`, `.num`. The stack gap
     tightens from 1rem to 0.75rem.
5. **Toasts:** `toast()` / `toastError()` keep their signatures, move to `ui/toast.ts`, and call
   `window.ot.toast()`; `<gz-toast>` and its CSS are deleted.
   - Why: a library component, rendered in the top layer above an open dropdown.
   - Impact: a `Window.ot` declaration; toasts lose their × button (Oat pauses on hover instead).
6. **Font sizes:** Oat's fluid h1–h4 clamps are accepted. `app.css`'s `--pico-font-size` pin and
   `shared.css`'s `:host { font-size: inherit }` are removed — Oat sets no root or `:host` size.
   "No stylesheet declares a font size" stays absolute.
7. **Button sizes:** `.compact` is dropped; row buttons use Oat's default (~39px, thumb-sized).
8. **Button mapping:** `secondary outline` → `outline`; `danger` → `ghost` + `data-variant="danger"`;
   metric switch pressed → plain (primary), others → `outline`, `aria-pressed` kept; theme toggle and
   menu trigger → `ghost icon`.
9. **Smaller calls:** `<hgroup>` stays with a `.text-light` subtitle; nav links are
   `--muted-foreground`, the current page (`aria-current="page"`) `--foreground`;
   `.overflow-auto` → `.table`; `data-theme` lives on `<html>` only; `.vstack > *` drops block
   margins in `shared.css`, mirroring what Oat's own `.hstack > *` does.
10. **Not touched:** historical records in `docs/agents/` (AGENTS.md forbids editing them) and the
    commit-message examples in `.agents/skills/commit/references/examples.md` (they record past
    commits). The four user-level agent memories stated in Pico terms are rewritten in Oat terms.

## Current State

```
bun install ─► node_modules/@picocss/pico/css/pico.min.css
                 │ VENDOR_FILES['/vendor/pico.css']   (paths.ts; type hard-coded text/css in
                 │                                     web-files.ts:64 and embed.ts:46)
      ┌──────────┴────────────────────────────┐
 index.html <link>                      styles.ts BASE_HREFS = [pico, shared]
 + no-flash script sets                 adopted by every GzElement shadow root
   html[data-theme]                     + base.ts:42-55 mirrors data-theme onto every host
                                          (Pico themes a shadow root only via :host)
```

Hand-written CSS reads 30 `--pico-*` properties (104 references in 11 files); templates rely on bare
`<article>` cards, `<hgroup>`, `details.dropdown`, `aria-busy`, and button classes `secondary`,
`outline`, `contrast`, plus gainz's own `compact` and `danger`. `gz-toast` renders its own toast
stack in a shadow root.

Header today (Pico nav):

```
wide  ┌───────────────────────────────────────────────────────────────────┐
      │ gainz lifting log              Dashboard  Workouts  Exercises │ ☾ │
      └───────────────────────────────────────────────────────────────────┘
≤560  ┌──────────────────────────────┐   ☰ = <details class="dropdown"> summary
      │ gainz                  ☰ │ ☾ │   links: a.secondary, current: a.contrast
      └──────────────────────────────┘
```

## Desired End State

```
bun install ─► node_modules/@knadh/oat/{oat.min.css, oat.min.js}
                 │ VENDOR_FILES['/vendor/oat.css', '/vendor/oat.js']  (type from Bun.file().type)
      ┌──────────┴──────────────────────────┬─────────────────────────────┐
 index.html <link /vendor/oat.css>     <script defer /vendor/oat.js>   styles.ts BASE_HREFS =
 app.css: :root[data-theme] →           → ot-dropdown, window.ot        [oat.css, shared.css]
   color-scheme (inherits into                                          adopted per shadow root;
   every shadow root)                                                   tokens inherit from :root
```

Header after (same layout, Oat look):

```
wide  ┌───────────────────────────────────────────────────────────────────┐
      │ gainz lifting log              Dashboard  Workouts  Exercises │ ☾ │
      └───────────────────────────────────────────────────────────────────┘
        links: --muted-foreground; current page: --foreground + aria-current

≤560  ┌──────────────────────────────┐        open  ┌──────────────────────────────┐
      │ gainz                  ☰ │ ☾ │              │ gainz                  ☰ │ ☾ │
      └──────────────────────────────┘              │               ┌────────────┐ │
        ☰ = button.ghost.icon[popovertarget]         │               │ Dashboard  │ │
                                                    │               │ Workouts   │ │
                                                    │               │ Exercises  │ │
                                                    │               └────────────┘ │
                                                       <menu popover> positioned by ot-dropdown,
                                                       light-dismiss + Esc, arrow keys between items
```

Toasts: Oat's `.toast-container` popover in the document's top layer, bottom right; error toasts
carry a `--danger` left border, success a `--success` one.

## Abstractions and Code Reuse

- `package.json` / `bun.lock` — `@knadh/oat` `0.8.0` replaces `@picocss/pico` `2.1.1`
- `src/backend/features/static/internal/`
  - `paths.ts` — `VENDOR_FILES`: `/vendor/oat.css` → `@knadh/oat/oat.min.css`, `/vendor/oat.js` →
    `@knadh/oat/oat.min.js`; doc comment "third-party files"
  - `web-files.ts` — `DiskWebFiles.vendor`: `type: file.type`; message "Vendor file missing"
  - `embed.ts` — vendor loop: `type: file.type`; message "Vendor file missing"
- `src/backend/shared/embedded.ts` — comments name Oat (`/vendor/oat.css`)
- `src/scripts/build.ts` — doc comment names Oat
- `src/frontend/`
  - `index.html` — link `/vendor/oat.css`, `<script defer src="/vendor/oat.js">`, comments
  - `ui/styles.ts` — `BASE_HREFS = ['/vendor/oat.css', '/ui/shared.css']`, comments
  - `ui/base.ts` — theme mirroring removed; `disconnectedCallback` stays (empty) for subclasses' `super` calls
  - `ui/theme.ts` — `applyThemeTo` unexported (only `<html>`), header comment rewritten
  - `ui/toast.ts` — **new**: `toast`, `toastError`, `ToastKind`, `Window.ot` declaration
  - `ui/gz-toast.component.{ts,css}` — **deleted**
  - `ui/app.css`, `ui/shared.css`, `ui/gz-tile.component.{ts,css}` — Oat tokens / `.card`
  - `app/gz-app.component.{ts,css}`, `app/gz-header.component.{ts,css}`,
    `app/gz-theme-toggle.component.{ts,css}` — shell
  - `features/**/*.component.{ts,css}` — templates and tokens
  - `dev/hot.ts` — import `toastError` from `../ui/toast.ts`

Token mapping used throughout Phase 2 (research §7):

| Pico | Oat |
|---|---|
| `--pico-muted-color` | `--muted-foreground` |
| `--pico-primary` | `--primary` |
| `--pico-spacing` (1rem), `× 0.5`, `× 1.5` | `--space-4`, `--space-2`, `--space-6` |
| `--pico-del-color` | `--danger` |
| `--pico-ins-color` | `--success` |
| `--pico-muted-border-color` | `--border` |
| `--pico-border-radius` | `--radius-medium` |
| `--pico-card-sectioning-background-color` | `--muted` |
| `--pico-card-background-color` | `--card` |
| `--pico-font-family-monospace` | `--font-mono` |
| `--pico-contrast` | `--foreground` |

Pico's per-button hooks (`--pico-background-color`, `--pico-color`, …), nav spacing variables and
`--pico-font-size` have no counterpart; the rules using them are replaced by Oat variants or deleted.
Hex fallbacks such as `var(--pico-del-color, #c0392b)` go — Oat always defines its tokens.

## Logging & Observability

No change. The existing `gainz: could not load stylesheet …` console error in `styles.ts` covers
`/vendor/oat.css` the same way it covered Pico.

## Implementation

### Phase 1: Serve Oat as vendor files

Dependencies: None

Install Oat and serve both of its files next to Pico, from disk and from the single-file build, with
each file's own content type. The frontend still uses Pico, so the app is unchanged.

**Tasks**:

- [x] `package.json` / `bun.lock`: `bun add --exact @knadh/oat@0.8.0`
- [x] `src/backend/features/static/internal/paths.ts`: add `'/vendor/oat.css': '@knadh/oat/oat.min.css'`
      and `'/vendor/oat.js': '@knadh/oat/oat.min.js'` to `VENDOR_FILES`; reword the doc comment from
      "Third-party stylesheets" to "Third-party files".
- [x] `src/backend/features/static/internal/web-files.ts`: `DiskWebFiles.vendor` answers
      `type: file.type` instead of the hard-coded `'text/css;charset=utf-8'`; the missing-file
      message becomes ``'Vendor file missing — run `bun install`'``.
- [x] `src/backend/features/static/internal/embed.ts`: the vendor loop stores `type: file.type`, with
      the same reworded message.
- [x] `src/backend/shared/embedded.ts`: `EmbeddedWeb.vendor` comment example becomes `/vendor/oat.css`.
- [x] `src/backend/features/static/static.routes.test.ts`: add a test "serves Oat's stylesheet and
      script from node_modules at fixed vendor paths" — `/vendor/oat.css` is 200, `text/css`, body
      contains `@layer theme,base,components`; `/vendor/oat.js` is 200, `text/javascript`, body contains
      `customElements.define("ot-dropdown"`. Add `/vendor/oat.js` to the ETag/no-cache and 304 loops.
- [x] `src/scripts/build.test.ts`: the vendor test also requests `/vendor/oat.css` and `/vendor/oat.js`
      and asserts `/vendor/oat.js`'s content type starts with `text/javascript`.
- [x] `docs/backend.md` (static-feature section, around `:178-217`): `VENDOR_FILES` holds third-party
      files of any type, each typed by Bun's MIME lookup like page files; drop "fixed vendor
      `Content-Type`".

**Automated Verification**:

- [x] `bun test src/backend/features/static/static.routes.test.ts` passes, including the new Oat test
- [x] `bun test src/scripts/build.test.ts` passes
- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test` pass

### Phase 2: Switch the frontend to Oat

Dependencies: Phase 1

Move the document, every shadow root, every template and every stylesheet to Oat in one step — a
half-migrated frontend has no working intermediate state — then remove Pico and rewrite the docs
and memories that describe it.

**Tasks — loading and theming**:

- [x] `src/frontend/index.html`: `<link rel="stylesheet" href="/vendor/oat.css" />`; add
      `<script src="/vendor/oat.js" defer></script>` directly before the `/main.ts` module script;
      rewrite the comment: Oat styles the document and is also adopted into every shadow root, where
      its tokens (declared on `:root`) and body typography arrive by inheritance; `oat.js` is deferred
      so it runs before the modules that use `ot-dropdown` and `window.ot`. The no-flash script stays.
- [x] `src/frontend/ui/styles.ts`: `BASE_HREFS = ['/vendor/oat.css', '/ui/shared.css']`; replace
      "Pico" with "Oat" in the comments.
- [x] `src/frontend/ui/app.css`: delete the `--pico-font-size` block and its comment; add
      ```css
      /* Oat colours every token with light-dark() under `color-scheme: light dark`; the chosen theme
         narrows it. color-scheme inherits, so this reaches every shadow root with no mirroring. */
      :root[data-theme="light"] {
        color-scheme: light;
      }

      :root[data-theme="dark"] {
        color-scheme: dark;
      }
      ```
- [x] `src/frontend/ui/theme.ts`: rewrite the header comment (the theme is a `data-theme` attribute on
      `<html>`, which `app.css` turns into `color-scheme`); make `applyThemeTo` a private
      `applyTheme()` that sets the attribute on `document.documentElement`, and update both call
      sites (`setTheme` and the module-level call at the bottom). Reword that bottom comment
      (`:89-91`): the unstored case leaves the attribute off so Oat's `color-scheme: light dark`
      paints the first frame.
- [x] `src/frontend/ui/theme.test.ts`: delete "applyThemeTo mirrors the current theme onto a component
      host". The existing `setTheme` tests already assert `data-theme` on `<html>`.
- [x] `src/frontend/ui/base.ts`: remove the `applyThemeTo`/`onThemeChange` import, `#stopThemeSync`
      and the mirroring in `connectedCallback`; keep `disconnectedCallback(): void {}` because
      subclasses call `super.disconnectedCallback()`; the class comment says "styled by Oat".

**Tasks — shared CSS and toasts**:

- [x] `src/frontend/ui/shared.css`: rewrite over Oat tokens (mapping table above):
  - `:host { display: block; }` only; drop the font-size comment and rule
  - delete `.stack`, `.stack-sm`, `.row`, `.row-between`, `.muted`, `.badge`, `button.compact`,
    `button.danger`, `.field > label`, the `margin-bottom: 0` cancellations, the submit-width rule and
    `table { margin-bottom: 0 }`
  - add `.vstack > * { margin-block: 0; }` with a comment: the gap sets the rhythm, as Oat's own
    `.hstack > *` does
  - keep `.grow`, `.fields`/`.field` (gap `var(--space-2)`), `.mono` (`--font-mono`), `.nowrap`,
    `.error-text` (`--danger`), `.empty` (`--space-6`, `--border`, `--radius-medium`,
    `--muted-foreground`), `article.open-card` (hover `--primary`; comment "Oat's `.card` is the
    card"), `:is(td, th).num`
- [x] `src/frontend/ui/toast.ts` (new): move `ToastKind`, `toast` and `toastError` here;
      `toast(message, kind = 'info')` calls
      `window.ot.toast(message, undefined, { variant: kind === 'error' ? 'danger' : kind, placement: 'bottom-right', duration: kind === 'error' ? 6000 : 3000 })`;
      declare `interface Window { ot: { toast: (message: string, title?: string, options?: { variant?: string; placement?: string; duration?: number }) => HTMLElement } }`
      in `declare global`, with a comment that `index.html` loads `oat.js` before any module.
- [x] Delete `src/frontend/ui/gz-toast.component.ts` and `.css`; remove `<gz-toast></gz-toast>` from
      `gz-app`; point every `toast`/`toastError` import at `ui/toast.ts` (`gz-app`, `dev/hot.ts`,
      `gz-dashboard`, `gz-exercise-list`, `gz-exercise-detail`, `gz-workout-list`,
      `gz-workout-detail`, `gz-set-row`).
- [x] `src/frontend/ui/gz-tile.component.ts`: `<article class="card">`;
      `gz-tile.component.css`: select `article.card`, padding `var(--space-3) var(--space-4)`,
      `--muted-foreground` for `.label` and `.hint`.

**Tasks — app shell**:

- [x] `src/frontend/app/gz-app.component.ts`: shell comment says "header and view slot" (toasts
      live in the document now). `gz-app.component.css`: `main` padding
      `var(--space-6) 0 var(--space-12)`; footer `--muted-foreground`.
- [x] `src/frontend/app/gz-header.component.ts`: new template —
      ```html
      <header>
        <nav class="container">
          <a class="brand" href="/"><strong>gainz</strong><span class="tag">lifting log</span></a>
          <ul class="links unstyled">…<li><a href data-path>…</a></li>…</ul>
          <ot-dropdown class="menu">
            <button class="ghost icon" popovertarget="nav-menu" aria-label="Menu"><svg…/></button>
            <menu popover id="nav-menu">…<a role="menuitem" href data-path>…</a>…</menu>
          </ot-dropdown>
          <gz-theme-toggle></gz-theme-toggle>
        </nav>
      </header>
      ```
      `#syncLinks` toggles only `aria-current="page"` (no `secondary`/`contrast` classes) and closes
      the menu with `menu.hidePopover()` when `menu.matches(':popover-open')`; update its comment.
- [x] `src/frontend/app/gz-header.component.css`: `:host` keeps sticky/top/z-index, adds
      `background-color: var(--background)`, border `1px solid var(--border)`; `nav` is
      `display: flex; align-items: center; gap: var(--space-4); padding-block: var(--space-2)`;
      `.links` flex with `gap: var(--space-4)`, `margin-inline-start: auto`, `li { margin: 0 }`;
      links `--muted-foreground`, `&[aria-current="page"]` and `:hover` `--foreground`;
      `.menu { display: none; margin-inline-start: auto }`, swapped with `.links` at
      `max-width: 560px`; `menu[popover] a[role="menuitem"]` colour `--foreground`;
      `gz-theme-toggle` gets `border-inline-start: 1px solid var(--border)` and
      `padding-inline-start: var(--space-2)` as the divider; `.brand strong` `--primary`, `.tag`
      `--muted-foreground`; delete the dropdown-summary and `ul.icons` rules.
- [x] `src/frontend/app/gz-theme-toggle.component.ts`: button classes `theme-toggle ghost icon`.
      `gz-theme-toggle.component.css`: `.theme-toggle` keeps only `color: var(--foreground)`; delete
      every `--pico-*` hook and the nav-spacing margins; the `svg.icon-theme-toggle` rules stay.

**Tasks — features**:

- [x] Templates, applying across `gz-dashboard`, `gz-exercise-list`, `gz-exercise-detail`,
      `gz-workout-list`, `gz-workout-detail`, `gz-set-row`:
  - bare `<article>` → `<article class="card">`; `article.open-card` → `article.card.open-card`;
    `article class="stack-sm"` → `class="card vstack gap-2"`; `add-form stack-sm` → `card add-form vstack gap-2`
  - `stack` → `vstack`; `stack-sm` → `vstack gap-2`; `row` → `hstack gap-2`;
    `row-between` → `hstack justify-between gap-2`; `muted` → `text-light`
  - `class="badge"` → `class="badge outline"`
  - `secondary outline compact` / `secondary outline` → `outline`
  - `class="danger"` → `class="ghost" data-variant="danger"`; `danger compact` likewise
  - `<hgroup>` subtitle `<p>` → `<p class="text-light">`
  - `<div class="overflow-auto">` → `<div class="table">`
  - metric switch buttons: `class="${pressed ? '' : 'outline'}"`, `aria-pressed` kept
- [x] Component CSS over Oat tokens (mapping table): `gz-exercise-detail.component.css` (delete the
      `margin-bottom` and `[aria-pressed]` override; `.up` `--success`, `.down` `--danger`),
      `gz-set-row.component.css`, `gz-chart.component.css`, `gz-workout-detail.component.css`
      (`.add-form` border `--primary`). `gz-dashboard`, `gz-exercise-list`, `gz-workout-list` CSS
      update only comments that name Pico or `shared.css`'s card.

**Tasks — remove Pico and update tests**:

- [x] `package.json` / `bun.lock`: `bun remove @picocss/pico`.
- [x] `src/backend/features/static/internal/paths.ts`: drop the `/vendor/pico.css` entry.
- [x] `src/backend/features/static/static.routes.test.ts`: delete the Pico test; the allowlist test,
      retitled "exposes only the allowlisted vendor files, not node_modules", asserts `/vendor/oat.min.css`, `/vendor/pico.css` and `/node_modules/@knadh/oat/package.json`
      are 404; the 405, ETag, 304 and error loops use `/vendor/oat.css` / `/vendor/oat.scss`, and the
      405 comment names `/vendor/oat.css`.
- [x] `src/scripts/build.test.ts`: test title "…the app stylesheet and Oat"; drop `/vendor/pico.css`;
      the path-guard case becomes `/vendor/%6fat.css`.
- [x] `src/frontend/app/router.test.ts`: the file link is `/vendor/oat.css`.
- [x] `src/scripts/build.ts` and `src/backend/shared/embedded.ts`: comments say Oat, not Pico.

**Tasks — documentation and memories**:

- [x] `docs/styling-guidelines.md`: rewrite —
  - **Oat first**: typography, colours, forms, tables, both themes; hand-written CSS uses Oat's
    unprefixed tokens (`--primary`, `--muted-foreground`, `--border`, `--space-*`, …). Check Oat
    before hand-rolling: a card is `.card`, a dropdown is `<ot-dropdown>`, loading is
    `aria-busy="true"`, layout is `.vstack`/`.hstack`/`.gap-*`, a scrolling table is
    `<div class="table">`, a toast is `toast()` → `ot.toast()`. Never name a bespoke class after an
    Oat component or utility (`.row`, `.badge`, `.toast`, `.error`, `.small`, `.table` are Oat's).
  - no CSS in JavaScript and nested selectors — unchanged
  - **no font sizes**: body text is Oat's 1rem, headings Oat's fluid scale; no pins needed; keep the
    `gz-chart` SVG-label reasoning
  - **buttons** are coloured only by Oat's variants (`data-variant="secondary|danger"`, `.outline`,
    `.ghost`, `.icon`); no exceptions remain
  - Oat is adopted into every shadow root and linked in `index.html`; its tokens sit on `:root` and
    reach shadow roots by inheritance; the theme is `data-theme` on `<html>` → `color-scheme`
  - CSS double quotes — unchanged
- [x] `docs/frontend.md` (`:3-6, 72-81, 173-175, 184-189, 208-232, 234-238`): index.html
      links Oat and loads `oat.js`; the header uses `<ot-dropdown>`; up-front loading names Oat; hot
      reload's document `<link>` swap covers `oat.css`; theming table → `data-theme` on `<html>` +
      `color-scheme`, no host mirroring; vendor serving names both files; toasts are `ui/toast.ts`
      over `ot.toast()`.
- [x] `docs/backend.md`: the allowlist sentence (`:179`) names `/vendor/oat.css` and
      `/vendor/oat.js` instead of `/vendor/pico.css`; the ETag history's "kept a stale Pico after `bun install`" stays as history
      but is reworded to "a stale vendor file (Pico, at the time)"; no other Pico mention remains.
- [x] `README.md` (`:7-8, 18`): "styled with Oat"; `bun install` comment "(Oat + dev tooling)".
- [x] `AGENTS.md` (`:8, 47`): `bun install # deps (Oat + dev types/tooling)`; index entry
      "`docs/styling-guidelines.md` — Oat, no CSS in JavaScript, no font sizes".
- [x] Agent memories in `~/.claude/projects/C--Users-DominikHa-IdeaProjects-gainz/memory/`, restated
      in Oat terms with the same intent:
  - `gainz-styling-picocss-external-css.md` → styles with Oat, external `.css`, no font sizes
  - `gainz-check-pico-component-before-hand-rolling.md` → check Oat's components and utilities first;
    never name a bespoke class after one
  - `gainz-no-nested-pico-cards.md` → never nest `.card`s; a list of open cards goes in a plain
    `<section class="vstack gap-2">`
  - `gainz-no-custom-button-colors.md` → buttons coloured only by Oat's variants, never custom CSS
    or token overrides on the button

**Automated Verification**:

- [x] `bun run typecheck`, `bun run lint`, `bun run fmt:check` and `bun test` pass
- [x] `git grep -n -i pico -- src package.json bun.lock README.md AGENTS.md ':(glob)docs/*.md'`
      prints only the reworded history line in `docs/backend.md`
- [x] `git grep -n -e '--pico-' -e 'gz-toast' -e 'overflow-auto' -e 'compact' -- src` prints nothing
- [x] `git grep -n -E 'class="([^"]* )?(stack|stack-sm|row|row-between|muted|secondary|contrast)[" ]' -- src/frontend`
      prints nothing (the `[" ]` terminator keeps `row-view` from matching)
- [x] `bun test src/backend/features/static/static.routes.test.ts` shows `/vendor/pico.css` is 404
- [x] `bun run build` succeeds and `bun test src/scripts/build.test.ts` passes

**Manual Verification**:

- [ ] `bun run start:dev`: dashboard, workout list, workout detail, exercise list and exercise
      detail render with Oat styling — cards, badges, tables, forms, row buttons — in light and dark
- [ ] The theme toggle switches every component at once, and a reload after choosing the opposite
      of the system theme paints no flash of the other theme
- [ ] At ≤560px the ☰ button opens the menu under the header; a link navigates and closes it; Esc
      and clicking outside close it; arrow keys move between items
- [ ] Saving, deleting and a failed request (stop the server) show toasts at the bottom right,
      coloured by kind, that fade out
- [ ] On a phone-sized viewport the set rows' Edit / +1 / × buttons are comfortably tappable and the
      tables scroll horizontally inside their cards
- [ ] `bun run build`, then run `dist/gainz.js`: the app loads with Oat and the dropdown works

## Implementation Notes

During implementation, document user feedback, problems, and decisions here.

- `static.routes.test.ts` "serves a stylesheet beside every component module" asserted at least 12
  components; deleting `gz-toast` leaves 11, so the floor is now 11.
- The `git grep -i pico` check also prints the allowlist test's `/vendor/pico.css` 404 assertion —
  required by the same plan, so it stays.
- Oat leaves `<hgroup>` unstyled, so its `h1` kept a `--space-6` bottom margin above the subtitle;
  `shared.css` adds `hgroup > * { margin-block: 0 }`. The dashboard's title-and-subtitle `<div>`
  became an `<hgroup>` to share it.
- The three renamed memories got Oat file names (`gainz-styling-oat-external-css`,
  `gainz-check-oat-component-before-hand-rolling`, `gainz-no-nested-cards`); the Pico-named files
  were removed.

## References

- Research: `docs/agents/research/2026-09-29-migrating-from-pico-to-oat.md`
- Oat 0.8.0 package (`oat.min.css`, `oat.min.js`, `css/*.css`, `js/*.js`): https://registry.npmjs.org/@knadh/oat
- Oat docs: https://oat.ink — source: https://github.com/knadh/oat
- `src/backend/features/static/internal/{paths,web-files,embed}.ts` — vendor serving
- `src/frontend/ui/{styles,base,theme}.ts`, `src/frontend/index.html` — loading and theming
- `docs/styling-guidelines.md`, `docs/frontend.md`, `docs/backend.md` — living docs to rewrite
