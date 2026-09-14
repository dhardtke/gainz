# Styling guidelines

- Pico CSS provides typography, colours, form controls, tables and both themes. Hand-written CSS
  is a thin layer built from Pico's own `--pico-*` custom properties, so it follows the active
  theme.
- **No CSS in JavaScript.** Every rule lives in an external `.css` file — `ui/app.css` for the
  document, `ui/shared.css` for utilities adopted by every component, and a component's `<tag>.css`
  beside its `<tag>.ts`.
- **Selectors nest.** A rule that would repeat a prefix — `.workout`, `.workout:hover`,
  `.workout a` — nests instead, so each block reads as one component and the media queries that
  only adjust it sit inside it. There is no preprocessor: this is the browser's own nesting, and
  `&` is always written explicitly.
- **No stylesheet declares a font size.** Body text is one size everywhere, headings come from
  Pico's scale, and emphasis is weight and colour. Two rules hold that in place: `app.css` pins
  `--pico-font-size: 100%`, because Pico otherwise grows the root font with the viewport up to
  `131.25%`; and `shared.css` sets `font-size: inherit` on `:host`, because Pico applies
  `font-size: var(--pico-font-size)` to `:host, :root` — written to land once at the document
  root, but every component adopts Pico, so the percentage re-applied at each shadow host and
  _multiplied_ with nesting. `gz-app > gz-dashboard > gz-tile` reached 39px from a 20px root.
  For the same reason `gz-chart` draws only geometry in SVG and positions its axis labels as HTML
  over the plot: a font size inside a `viewBox` is measured in user units, so the browser would
  scale the lettering with the chart instead of matching the page.
- **Colour buttons with Pico's own variant classes** (`secondary`, `contrast`, `outline`, …), never
  with custom CSS or `--pico-*` overrides on the button.
- Shadow roots don't inherit document styles, so Pico is adopted into each one _and_ linked in
  `index.html`. Theme is mirrored onto every host as `data-theme` because Pico reaches a shadow
  root only via `:host`.
- **CSS keeps double quotes**, while the TypeScript around it uses single ones. Double quotes are
  the prevailing CSS convention, so `.oxfmtrc.json` overrides `singleQuote` back off for
  `**/*.css`; that file is plain JSON and cannot carry a comment saying why, so the reason lives
  here.
