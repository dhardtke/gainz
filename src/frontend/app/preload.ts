/**
 * Fetches a lazily loaded view's whole module graph at once, rather than a level of imports at a
 * time as the browser discovers it.
 *
 * The server writes a map into the index page, `<script type="application/json"
 * data-lazy-preloads>`, from each module the app imports dynamically to the scripts and
 * stylesheets that module's static imports add to the shell. `preloadModule()` turns an entry into
 * the same `<link>`s the server writes for the shell, so calling it right before the `import()`
 * has every file of the view in flight in one round trip.
 */

/** Module URL path → the files it adds, `.ts` modules and `.css` stylesheets. */
type LazyPreloads = Record<string, string[]>;

let lazyPreloads: LazyPreloads | undefined;

/** Every file a link has been added for, so none is fetched twice. */
const requested = new Set<string>();

function readLazyPreloads(): LazyPreloads {
  const map: LazyPreloads = {};
  for (const script of document.querySelectorAll('script[type="application/json"][data-lazy-preloads]')) {
    try {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- written by the server's preload.ts
      Object.assign(map, JSON.parse(script.textContent) as LazyPreloads);
    } catch (cause) {
      // Without the map views still load, a level at a time; say why rather than fail the route.
      console.error('gainz: could not read the lazy preloads', cause);
    }
  }
  return map;
}

/**
 * Starts fetching everything `moduleUrl` needs that is not loaded yet. Without an entry for it —
 * the module is in the shell, or the page carries no map — it does nothing.
 *
 * @param moduleUrl an absolute URL, as `import.meta.resolve()` returns it.
 */
export function preloadModule(moduleUrl: string): void {
  lazyPreloads ??= readLazyPreloads();
  for (const href of lazyPreloads[new URL(moduleUrl).pathname] ?? []) {
    if (requested.has(href)) {
      continue;
    }
    requested.add(href);
    const link = document.createElement('link');
    if (href.endsWith('.css')) {
      // `fetch()` in styles.ts reuses only a preload made in its own CORS mode.
      link.rel = 'preload';
      link.as = 'fetch';
      link.crossOrigin = 'anonymous';
    } else {
      link.rel = 'modulepreload';
    }
    link.href = href;
    document.head.append(link);
  }
}
