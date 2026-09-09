/**
 * Loads the app's stylesheets once and hands them to components as
 * constructable `CSSStyleSheet` objects.
 *
 * Shadow roots do not inherit the document's stylesheets, so each component
 * adopts Pico plus the shared utilities plus its own file. Adopting is by
 * reference: the CSS is fetched and parsed a single time no matter how many
 * elements use it.
 *
 * The top-level await below means every module that imports this one — which
 * is every component, through base.js — waits for the CSS before any element
 * is defined. That is what keeps the first paint from flashing unstyled.
 */

/** Adopted by every component, in this order, before its own sheet. */
const BASE_HREFS = ["/vendor/pico.css", "/css/shared.css"];

/** One stylesheet per custom element, named after its tag. */
const COMPONENTS = [
  "gz-app",
  "gz-chart",
  "gz-dashboard",
  "gz-exercise-detail",
  "gz-exercise-list",
  "gz-set-row",
  "gz-stat-tile",
  "gz-toast",
  "gz-workout-detail",
  "gz-workout-list",
];

const componentHref = (tagName) => `/css/${tagName}.css`;

const sheets = new Map();

async function load(href) {
  try {
    const response = await fetch(href);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const sheet = new CSSStyleSheet();
    // replace() rather than replaceSync(): it tolerates @import instead of throwing.
    await sheet.replace(await response.text());
    sheets.set(href, sheet);
  } catch (cause) {
    // An unstyled component is easier to diagnose than a blank page, so carry
    // on with an empty sheet and say loudly what went missing.
    console.error(`gainz: could not load stylesheet ${href}`, cause);
    sheets.set(href, new CSSStyleSheet());
  }
}

await Promise.all([...BASE_HREFS, ...COMPONENTS.map(componentHref)].map(load));

/**
 * The stylesheets a component should adopt: Pico, the shared utilities, and
 * its own file when it has one.
 */
export function stylesFor(tagName) {
  const own = sheets.get(componentHref(tagName));
  const base = BASE_HREFS.map((href) => sheets.get(href));
  return own ? [...base, own] : base;
}
