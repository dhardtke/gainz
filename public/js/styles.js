/**
 * Loads the app's stylesheets and hands them to components as constructable
 * `CSSStyleSheet` objects.
 *
 * Shadow roots do not inherit the document's stylesheets, so each component
 * adopts Pico plus the shared utilities plus its own file. Adopting is by
 * reference: the CSS is fetched and parsed a single time no matter how many
 * elements use it.
 *
 * Pico and the shared utilities are fetched up front, behind the top-level
 * await below, because every component adopts both. A component's own sheet is
 * fetched when its module loads: `define()` in base.js awaits `loadStyles`
 * before registering the element, so by the time an instance can exist,
 * `stylesFor` can answer synchronously. That is what lets a route be loaded on
 * demand without ever painting it unstyled.
 */

/** Adopted by every component, in this order, before its own sheet. */
const BASE_HREFS = ["/vendor/pico.css", "/css/shared.css"];

/** @param {string} tagName */
const componentHref = (tagName) => `/components/${tagName}/${tagName}.css`;

/** @type {Map<string, CSSStyleSheet>} */
const sheets = new Map();

/** @type {Map<string, Promise<void>>} */
const pending = new Map();

/**
 * @param {string} href
 * @returns {Promise<void>}
 */
async function load(href) {
  try {
    const response = await fetch(href);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

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

await Promise.all(BASE_HREFS.map(load));

/**
 * Fetches one component's stylesheet, at most once. Repeat and concurrent calls
 * share the first fetch, so a component that two routes have in common — a stat
 * tile, say — is still loaded a single time.
 *
 * @param {string} tagName
 * @returns {Promise<void>}
 */
export function loadStyles(tagName) {
  const href = componentHref(tagName);
  if (sheets.has(href)) {
    return Promise.resolve();
  }
  if (!pending.has(href)) {
    pending.set(href, load(href));
  }
  return pending.get(href) ?? Promise.resolve();
}

/**
 * The stylesheets a component should adopt: Pico, the shared utilities, and its
 * own file. Synchronous by design, because it is called from a constructor, and
 * safe because `define()` awaits `loadStyles` before registering the element.
 *
 * @param {string} tagName
 * @returns {CSSStyleSheet[]}
 */
export function stylesFor(tagName) {
  const own = sheets.get(componentHref(tagName));
  const base = BASE_HREFS.flatMap((href) => {
    const sheet = sheets.get(href);
    return sheet ? [sheet] : [];
  });
  return own ? [...base, own] : base;
}
