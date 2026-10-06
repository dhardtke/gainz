/**
 * Prepares an HTML page for the browser: it names every file the page may load by a versioned
 * URL, so a browser can cache those for good. A deployed build is one bundle, so the page has no
 * module graph to announce.
 *
 * **Versions.** Every module, stylesheet and vendor file is named `<url>?v=<tag>`, where the tag is
 * the same content hash its ETag carries; `StaticController` caches a response for good when the
 * `v` it was asked for is the content's current tag. The page's own `src` and `href` attributes are
 * rewritten to those URLs, and an import map from each plain URL to its versioned one goes before
 * the first module script. That map is what versions everything the page does not name: a module's
 * relative imports resolve to plain URLs, which the map then rewrites, and `ui/styles.ts` reads it
 * to fetch a component's stylesheet by its versioned URL.
 */

/** Where a page reads the web root. */
export interface PageSource {
  /** Every module, stylesheet and vendor file a page may load, by URL, mapped to its content tag. */
  tags: () => Promise<Record<string, string>>;
}

/** `url` as the page names it: versioned when it has a tag. */
function versioned(tags: Record<string, string>, url: string): string {
  const tag = tags[url];
  return tag === undefined ? url : `${url}?v=${tag}`;
}

/** JSON safe inside a `<script>`: a `</script>` in a URL would end it early, and `<` reads the same. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

/** `html` with its files versioned and an import map before its first module script. */
export async function renderPage(html: string, source: PageSource): Promise<string> {
  const tags = await source.tags();
  const imports = Object.fromEntries(Object.keys(tags).map((url) => [url, versioned(tags, url)]));
  let mapped = false;
  return new HTMLRewriter()
    .on('script[src^="/"]', {
      element: (el) => {
        const src = el.getAttribute('src') ?? '';
        if (el.getAttribute('type') === 'module' && !mapped) {
          // The map must come before anything loads a module.
          el.before(`<script type="importmap">${scriptJson({ imports })}</script>\n    `, { html: true });
          mapped = true;
        }
        el.setAttribute('src', versioned(tags, src));
      },
    })
    .on('link[href^="/"]', {
      element: (el) => {
        el.setAttribute('href', versioned(tags, el.getAttribute('href') ?? ''));
      },
    })
    .transform(new Response(html))
    .text();
}
