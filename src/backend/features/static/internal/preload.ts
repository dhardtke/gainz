/**
 * Announces a page's module graph in its `<head>`, so the browser fetches it a level at a time no
 * longer: in one round trip for the shell, and in one for each lazily loaded view.
 *
 * Unbundled, the browser learns of a module only once it has fetched and parsed the module that
 * imports it, so an import chain is a waterfall of round trips. Before each
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

/** Where the walk reads the web root: modules transpiled, by URL. */
export interface PreloadSource {
  /** The module at `url` as the browser receives it, or null if there is none. */
  module: (url: string) => Promise<string | null>;
  exists: (url: string) => Promise<boolean>;
}

const scanner = new Bun.Transpiler({ loader: 'js' });

interface Graph {
  /** `root` and every module it imports statically that `known` lacks, nearest first. */
  modules: string[];
  /** The targets of their dynamic imports. */
  lazy: string[];
}

async function walk(root: string, source: PreloadSource, known: ReadonlySet<string>): Promise<Graph> {
  const seen = new Set([root]);
  const queue = [root];
  const lazy: string[] = [];
  for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
    const code = await source.module(url);
    if (code === null) {
      continue;
    }
    // Scanned after transpiling, so an import only types needed is already gone.
    for (const { kind, path } of scanner.scanImports(code)) {
      if (!(path.startsWith('./') || path.startsWith('../') || path.startsWith('/'))) {
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(url), path));
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

/** `modules`, each followed by the stylesheet beside it if there is one. */
async function withSheets(modules: string[], source: PreloadSource): Promise<string[]> {
  const files: string[] = [];
  for (const url of modules) {
    files.push(url);
    const sheet = url.replace(/\.ts$/, '.css');
    if (sheet !== url && (await source.exists(sheet))) {
      files.push(sheet);
    }
  }
  return files;
}

/** Every lazily imported module reachable from `shell`, with the files it adds to what is loaded. */
async function lazyFiles(shell: Graph, source: PreloadSource): Promise<Record<string, string[]>> {
  const known = new Set(shell.modules);
  const map: Record<string, string[]> = {};
  const queue = [...shell.lazy];
  for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
    if (known.has(url) || map[url] !== undefined) {
      continue;
    }
    const graph = await walk(url, source, known);
    map[url] = await withSheets(graph.modules, source);
    queue.push(...graph.lazy);
  }
  return map;
}

async function preloadTags(entry: string, source: PreloadSource): Promise<string> {
  const shell = await walk(entry, source, new Set());
  const tags = (await withSheets(shell.modules.slice(1), source)).map((url) =>
    // `crossorigin` gives the preload the CORS mode `fetch()` uses, or the fetch would not reuse it.
    url.endsWith('.css') ? `<link rel="preload" href="${url}" as="fetch" crossorigin />` : `<link rel="modulepreload" href="${url}" />`,
  );
  // A `</script>` inside a URL would end the element early; `<` is the same JSON string.
  const map = JSON.stringify(await lazyFiles(shell, source)).replaceAll('<', '\\u003c');
  tags.push(`<script type="application/json" data-lazy-preloads>${map}</script>`);
  return tags.map((tag) => `${tag}\n    `).join('');
}

/** `html` with the preloads for each of its module scripts inserted right before that script. */
export function withPreloads(html: string, source: PreloadSource): Promise<string> {
  return new HTMLRewriter()
    .on('script[type="module"][src^="/"]', {
      element: async (el) => {
        const src = el.getAttribute('src');
        if (src !== null) {
          el.before(await preloadTags(src, source), { html: true });
        }
      },
    })
    .transform(new Response(html))
    .text();
}
