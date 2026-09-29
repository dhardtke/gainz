/**
 * Loads the app's stylesheets and hands them to components as constructable
 * `CSSStyleSheet` objects.
 *
 * Shadow roots do not inherit the document's stylesheets, so each component
 * adopts Oat plus the shared utilities plus its own file. Adopting is by
 * reference: the CSS is fetched and parsed a single time no matter how many
 * elements use it.
 *
 * Oat and the shared utilities are fetched up front, behind the top-level
 * await below, because every component adopts both. A component's own sheet is
 * fetched when its module loads, from the `.css` file beside that module's own
 * URL: `define()` in base.ts awaits `loadStyles`
 * before registering the element, so by the time an instance can exist,
 * `stylesFor` can answer synchronously. That is what lets a route be loaded on
 * demand without ever painting it unstyled.
 */

/** Adopted by every component, in this order, before its own sheet. */
const BASE_HREFS = ['/vendor/oat.css', '/ui/shared.css'];

const sheets = new Map<string, CSSStyleSheet>();

/** Tag name → the stylesheet beside the module that defined it. */
const hrefs = new Map<string, string>();

const pending = new Map<string, Promise<void>>();

/**
 * Fills the sheet for `href`, creating it on first use. A repeat call refills the
 * same object, because components adopt it by reference: that is what lets
 * `reloadSheet` restyle every live instance without re-rendering one.
 */
async function load(href: string): Promise<void> {
  const sheet = sheets.get(href) ?? new CSSStyleSheet();
  sheets.set(href, sheet);
  try {
    const response = await fetch(href);
    if (!response.ok) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error(`HTTP ${response.status}`);
    }

    // replace() rather than replaceSync(): it tolerates @import instead of throwing.
    await sheet.replace(await response.text());
  } catch (cause) {
    // An unstyled component is easier to diagnose than a blank page (or, on a
    // hot reload, a stale one), so carry on empty and say loudly what went missing.
    console.error(`gainz: could not load stylesheet ${href}`, cause);
    await sheet.replace('');
  }
}

await Promise.all(BASE_HREFS.map(load));

/**
 * Fetches one component's stylesheet, at most once. Repeat and concurrent calls
 * share the first fetch, so a component that two routes have in common — a stat
 * tile, say — is still loaded a single time.
 *
 * @param moduleUrl the defining module's `import.meta.url`; its `.css` sibling is the sheet.
 */
export function loadStyles(tagName: string, moduleUrl: string): Promise<void> {
  // A pathname, not the absolute import.meta.url: BASE_HREFS are pathnames and
  // dev/hot.ts is told which path changed, so every key must be the same shape.
  // Keyed by URL instead, a component's sheet would never be found to swap.
  const href = new URL(moduleUrl, location.href).pathname.replace(/\.ts$/, '.css');
  hrefs.set(tagName, href);
  // `pending` alone de-duplicates: `sheets` holds the sheet before its fetch settles.
  let promise = pending.get(href);
  if (!promise) {
    promise = load(href);
    pending.set(href, promise);
  }
  return promise;
}

/**
 * The stylesheets a component should adopt: Oat, the shared utilities, and its
 * own file. Synchronous by design, because it is called from a constructor, and
 * safe because `define()` awaits `loadStyles` before registering the element.
 */
export function stylesFor(tagName: string): CSSStyleSheet[] {
  const href = hrefs.get(tagName);
  const own = href === undefined ? undefined : sheets.get(href);
  const base = BASE_HREFS.flatMap((href) => {
    const sheet = sheets.get(href);
    return sheet ? [sheet] : [];
  });
  return own ? [...base, own] : base;
}

/**
 * Refetches a stylesheet this module tracks into the sheet components already
 * adopt. It exists for dev/hot.ts and is inert otherwise.
 *
 * @returns whether `href` was tracked, so the caller can fall back for one that is not.
 */
export async function reloadSheet(href: string): Promise<boolean> {
  if (!sheets.has(href)) {
    return false;
  }
  await load(href);
  return true;
}
