/**
 * Announces a page's whole static module graph in its `<head>`, so the browser fetches it in one
 * round trip instead of one per level of imports.
 *
 * Unbundled, the browser learns of a module only once it has fetched and parsed the module that
 * imports it, so the shell's import chain is a waterfall of round trips. Before each
 * `<script type="module" src>` this writes a `<link rel="modulepreload">` for every module that
 * script reaches through static imports, and a `<link rel="preload" as="fetch">` for the stylesheet
 * beside each that has one, which `ui/styles.ts` would otherwise fetch only once the module runs.
 * Dynamic imports — the lazily loaded routes — are left alone.
 */
import { posix } from 'node:path';

/** Where the walk reads the web root: modules transpiled, by URL. */
export interface PreloadSource {
  /** The module at `url` as the browser receives it, or null if there is none. */
  module: (url: string) => Promise<string | null>;
  exists: (url: string) => Promise<boolean>;
}

const scanner = new Bun.Transpiler({ loader: 'js' });

/** Every module `entry` imports statically, nearest first, without `entry` itself. */
async function staticGraph(entry: string, source: PreloadSource): Promise<string[]> {
  const seen = new Set([entry]);
  const queue = [entry];
  for (let url = queue.shift(); url !== undefined; url = queue.shift()) {
    const code = await source.module(url);
    if (code === null) {
      continue;
    }
    // Scanned after transpiling, so an import only types needed is already gone.
    for (const { kind, path } of scanner.scanImports(code)) {
      if (kind !== 'import-statement' || !(path.startsWith('./') || path.startsWith('../') || path.startsWith('/'))) {
        continue;
      }
      const target = posix.normalize(posix.join(posix.dirname(url), path));
      if (!seen.has(target)) {
        seen.add(target);
        queue.push(target);
      }
    }
  }
  return [...seen].slice(1);
}

async function preloadTags(entry: string, source: PreloadSource): Promise<string> {
  const tags: string[] = [];
  for (const url of await staticGraph(entry, source)) {
    tags.push(`<link rel="modulepreload" href="${url}" />`);
    const sheet = url.replace(/\.ts$/, '.css');
    // `crossorigin` gives the preload the CORS mode `fetch()` uses, or the fetch would not reuse it.
    if (sheet !== url && (await source.exists(sheet))) {
      tags.push(`<link rel="preload" href="${sheet}" as="fetch" crossorigin />`);
    }
  }
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
