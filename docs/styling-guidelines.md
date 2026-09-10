### Styling guidelines

- Pico CSS provides typography, colours, form controls, tables and both themes. Hand-written CSS
  is a thin layer built from Pico's own `--pico-*` custom properties.
- **No CSS in JavaScript.** Every rule lives in an external `.css` file — `css/app.css` for the
  document, `css/shared.css` for utilities adopted by every component, `<tag>.css` for a component.
- **No stylesheet declares a font size.** `app.css` pins `--pico-font-size: 100%`, and
  `shared.css` sets `font-size: inherit` on `:host` (Pico's percentage would otherwise multiply at
  each nested shadow host). Emphasis is weight and colour.
- **Colour buttons with Pico's own variant classes** (`secondary`, `contrast`, `outline`, …), never
  with custom CSS or `--pico-*` overrides on the button.
- Shadow roots don't inherit document styles, so Pico is adopted into each one _and_ linked in
  `index.html`. Theme is mirrored onto every host as `data-theme` because Pico reaches a shadow
  root only via `:host`.
- **CSS keeps double quotes**, while the TypeScript around it uses single ones. Double quotes are
  the prevailing CSS convention, so `.oxfmtrc.json` overrides `singleQuote` back off for
  `**/*.css`; that file is plain JSON and cannot carry a comment saying why, so the reason lives
  here.
