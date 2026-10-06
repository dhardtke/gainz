/**
 * Prepares an HTML page for the browser: it names every file the page may load by a versioned
 * URL, so a browser can cache those for good, and it announces the page's module graph, so the
 * graph arrives in one round trip rather than a level of imports at a time.
 *
 * **Versions.** Every module, stylesheet and vendor file is named `<url>?v=<tag>`, where the tag is
 * the same content hash its ETag carries; `StaticController` caches a response for good when the
 * `v` it was asked for is the content's current tag. The page's own `src` and `href` attributes are
 * rewritten to those URLs, and an import map from each plain URL to its versioned one goes before
 * the first module script. That map is what versions everything the page does not name: a module's
 * relative imports resolve to plain URLs, which the map then rewrites, and `ui/styles.ts` reads it
 * to fetch a component's stylesheet by its versioned URL.
 *
 * **Preloads.** Unbundled, the browser learns of a module only once it has fetched and parsed the
 * module that imports it, so an import chain is a waterfall of round trips. Before each
 * `<script type="module" src>` this writes a `<link rel="modulepreload">` for every module that
 * script reaches through static imports, and a `<link rel="preload" as="fetch">` for the stylesheet
 * beside each that has one, which `ui/styles.ts` would otherwise fetch only once the module runs.
 *
 * A dynamic `import()` is not preloaded, since lazy loading is its point. Instead each target gets
 * an entry in a JSON map written beside the links, `<script type="application/json"
 * data-lazy-preloads>`: the files its own static graph adds to the shell's, which
 * `app/preload.ts` turns into the same links right before the view is imported.
 */
import { posix } from 'node:path';

/** Where a page reads the web root. */
export interface PageSource {
  /** The module at `url` as the browser receives it, or null if there is none. */
  module: (url: string) => Promise<string | null>;
  /** Every module, stylesheet and vendor file a page may load, by URL, mapped to its content tag. */
  tags: () => Promise<Record<string, string>>;
}

/** What one render knows about the web root. */
interface Root {
  source: PageSource;
  tags: Record<string, string>;
}

const scanner = new Bun.Transpiler({ loader: 'js' });

/** `url` as the page names it: versioned when it has a tag. */
function versioned(root: Root, url: string): string {
  const tag = root.tags[url];
  return tag === undefined ? url : `${url}?v=${tag}`;
}

interface Graph {
  /** `root` and every module it imports statically that `known` lacks, nearest first. */
  modules: string[];
  /** The targets of their dynamic imports. */
  lazy: string[];
}

async function walk(url: string, root: Root, known: ReadonlySet<string>): Promise<Graph> {
  const seen = new Set([url]);
  const queue = [url];
  const lazy: string[] = [];
  for (let next = queue.shift(); next !== undefined; next = queue.shift()) {
    const code = await root.source.module(next);
    if (code === null) {
      continue;
    }
    // Scanned after transpiling, so an import only types needed is already gone.
    for (const { kind, path } of scanner.scanImports(code)) {
      if (!(path.startsWith('./') || path.startsWith('../') || path.startsWith('/'))) {
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(next), path));
      if (kind === 'dynamic-import') {
        lazy.push(target);
      } else if (kind === 'import-statement' && !seen.has(target) && !known.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return { modules: [...seen], lazy };
}

/** `modules`, each followed by the stylesheet beside it if there is one, all versioned. */
function withSheets(modules: string[], root: Root): string[] {
  const files: string[] = [];
  for (const url of modules) {
    files.push(versioned(root, url));
    const sheet = url.replace(/\.ts$/, '.css');
    if (sheet !== url && root.tags[sheet] !== undefined) {
      files.push(versioned(root, sheet));
    }
  }
  return files;
}

/** Every lazily imported module reachable from `shell`, with the files it adds to what is loaded. */
async function lazyFiles(shell: Graph, root: Root): Promise<Record<string, string[]>> {
  const known = new Set(shell.modules);
  const map: Record<string, string[]> = {};
  const queue = [...shell.lazy];
  for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
    if (known.has(url) || map[url] !== undefined) {
      continue;
    }
    const graph = await walk(url, root, known);
    map[url] = withSheets(graph.modules, root);
    queue.push(...graph.lazy);
  }
  return map;
}

/** JSON safe inside a `<script>`: a `</script>` in a URL would end it early, and `\u003c` reads the same. */
function scriptJson(value: unknown): string {
  return JSON.stringify(value).replaceAll('<', '\\u003c');
}

async function preloadTags(entry: string, root: Root): Promise<string[]> {
  const shell = await walk(entry, root, new Set());
  const tags = withSheets(shell.modules.slice(1), root).map((url) =>
    // `crossorigin` gives the preload the CORS mode `fetch()` uses, or the fetch would not reuse it.
    url.split('?', 1)[0]?.endsWith('.css') === true
      ? `<link rel="preload" href="${url}" as="fetch" crossorigin />`
      : `<link rel="modulepreload" href="${url}" />`,
  );
  tags.push(`<script type="application/json" data-lazy-preloads>${scriptJson(await lazyFiles(shell, root))}</script>`);
  return tags;
}

/** `html` with its files versioned, an import map, and the preloads for each module script. */
export async function renderPage(html: string, source: PageSource): Promise<string> {
  const root: Root = { source, tags: await source.tags() };
  const imports = Object.fromEntries(Object.keys(root.tags).map((url) => [url, versioned(root, url)]));
  let mapped = false;
  return new HTMLRewriter()
    .on('script[src^="/"]', {
      element: async (el) => {
        const src = el.getAttribute('src') ?? '';
        if (el.getAttribute('type') === 'module') {
          // The map must come before anything loads a module, the preloads included.
          const tags = mapped ? [] : [`<script type="importmap">${scriptJson({ imports })}</script>`];
          mapped = true;
          tags.push(...(await preloadTags(src, root)));
          el.before(tags.map((tag) => `${tag}\n    `).join(''), { html: true });
        }
        el.setAttribute('src', versioned(root, src));
      },
    })
    .on('link[href^="/"]', {
      element: (el) => {
        el.setAttribute('href', versioned(root, el.getAttribute('href') ?? ''));
      },
    })
    .transform(new Response(html))
    .text();
}
