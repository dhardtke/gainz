# Styling guidelines

- **Oat first.** [Oat](https://oat.ink) provides typography, colors, form controls, tables and both
  themes. Hand-written CSS is a thin layer built from Oat's unprefixed tokens (`--primary`,
  `--muted-foreground`, `--border`, `--space-*`, `--radius-medium`, …), so it follows the active
  theme. Before writing a box of your own, check whether Oat already draws it: **a card is `.card`**,
  a dropdown is `<ot-dropdown>`, a loading state is `aria-busy="true"`, layout is
  `.vstack` / `.hstack` / `.gap-*`, a scrolling table is `<div class="table">`, and a toast is
  `toast()` from `ui/toast.ts`, which calls `ot.toast()`. Hand-rolling one of these produces a box that
  competes with Oat and has to be re-themed by hand. Never name a bespoke class after an Oat
  component or utility — `.row`, `.badge`, `.toast`, `.error`, `.small` and `.table` are all Oat's.
- **No CSS in JavaScript.** Every rule lives in an external `.css` file — `ui/app.css` for the
  document, `ui/shared.css` for utilities adopted by every component, and a component's `<tag>.component.css`
  beside its `<tag>.component.ts`.
- **Selectors nest.** A rule that would repeat a prefix — `article.open-card`,
  `article.open-card:hover .open`, `article.open-card .actions` — nests instead as
  `article.open-card { &:hover .open { … } & .actions { … } }`, so each block reads as one component
  and the media queries that only adjust it sit inside it. There is no preprocessor: this is the
  browser's own nesting, and `&` is always written explicitly.
- **Every page fits a 320px-wide screen.** Narrow-screen rules live in the stylesheet of the
  component they adjust, at the existing breakpoints (560px header, 640px open cards, 720px
  forms and set rows), and a wide child shrinks or wraps rather than widening the page. Two traps: Oat's
  `.table` has a 320px `min-width`, which `shared.css` undoes, and a grid item with an
  `aspect-ratio` takes its width from its height unless it is stretched.
- **No stylesheet declares a font size.** Body text is Oat's `1rem` everywhere, headings come from
  Oat's fluid scale, and emphasis is weight and color. Oat sets no root or `:host` font size, so
  nothing has to be pinned. For the same reason `gz-chart` draws only geometry in SVG and positions
  its axis labels as HTML over the plot: a font size inside a `viewBox` is measured in user units,
  so the browser would scale the lettering with the chart instead of matching the page.
- **Color buttons only with Oat's variants** — `data-variant="secondary|danger"`, `.outline`,
  `.ghost`, `.icon` — never with custom CSS or token overrides on the button. No exceptions remain:
  the header's icon-only controls are `.ghost.icon` buttons.
- Shadow roots don't inherit document styles, so Oat is adopted into each one _and_ linked in
  `index.html`. Its tokens are declared on `:root` and reach every shadow root by inheritance. The
  theme is `data-theme` on `<html>`, which `app.css` turns into `color-scheme`; Oat's
  `light-dark()` tokens follow it everywhere.
- **CSS keeps double quotes**, while the TypeScript around it uses single ones. Double quotes are
  the prevailing CSS convention, so `.oxfmtrc.json` overrides `singleQuote` back off for
  `**/*.css`; that file is plain JSON and cannot carry a comment saying why, so the reason lives
  here.
