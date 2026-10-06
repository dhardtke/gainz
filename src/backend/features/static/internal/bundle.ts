/**
 * Bundles the frontend into one ES module for the single-file build.
 *
 * Served from source, the browser learns of a module only once it has fetched and parsed the one
 * importing it, a waterfall that costs next to nothing over localhost and a round trip per level of
 * imports over a real network. One bundle has no waterfall, so the build ships the whole frontend
 * as one file at `/main.ts`. Bun wraps a dynamically imported view, which still runs only on its
 * first `import()`.
 *
 * Two things the bundle would otherwise lose, the plugin below puts back:
 *
 * - A component finds its stylesheet beside its own module, through `import.meta.url`, which in a
 *   bundle would name the bundle. Each module's `import.meta.url` is rewritten to its own URL path,
 *   so `"/ui/tile/gz-tile.component.ts"` still leads to `/ui/tile/gz-tile.component.css`.
 * - In a bundle each `await define(…)` holds back the next module until its sheet is in hand, so
 *   fetched sheets would arrive one round trip after another. `ui/inline-styles.ts` is replaced by
 *   a map of every component stylesheet to its text, which `ui/styles.ts` reads instead of fetching.
 *
 * Whitespace is minified and nothing else, with no source map, so names survive in every trace.
 */
import { relative, resolve } from 'node:path';
import type { BunPlugin } from 'bun';
import { log } from '../../../shared/log.ts';
import { FRONTEND_DIR } from './paths.ts';

const INLINE_STYLES = resolve(FRONTEND_DIR, 'ui', 'inline-styles.ts');

/** The URL path the frontend file at `path` is served at. */
function urlOf(path: string): string {
  // Windows separators.
  return `/${relative(FRONTEND_DIR, path).replaceAll('\\', '/')}`;
}

/** Every component stylesheet's URL path → its text. */
async function componentStyles(): Promise<Record<string, string>> {
  const styles: Record<string, string> = {};
  for await (const entry of new Bun.Glob('**/*.component.css').scan({ cwd: FRONTEND_DIR })) {
    const path = resolve(FRONTEND_DIR, entry);
    styles[urlOf(path)] = await Bun.file(path).text();
  }
  return styles;
}

const frontend: BunPlugin = {
  name: 'gainz-frontend',
  setup(build) {
    build.onLoad({ filter: /\.ts$/ }, async ({ path }) => {
      if (resolve(path) === INLINE_STYLES) {
        return { contents: `export const INLINE_STYLES = ${JSON.stringify(await componentStyles())};`, loader: 'ts' };
      }
      // Textual, so it would also rewrite one inside a string; bundle.test.ts checks none is left.
      return { contents: (await Bun.file(path).text()).replaceAll('import.meta.url', JSON.stringify(urlOf(path))), loader: 'ts' };
    });
  },
};

/** The first error of a failed `Bun.build`, as `src/frontend/<url>:<line>:<column>: <message>`. */
function describeFailure(cause: unknown): string {
  const first: unknown = cause instanceof AggregateError ? cause.errors[0] : cause;
  if (first instanceof BuildMessage || first instanceof ResolveMessage) {
    const position = first.position;
    const where = position === null ? '' : `src/frontend${urlOf(position.file)}:${position.line}:${position.column}: `;
    return `${where}${first.message}`;
  }
  return String(first);
}

/** The frontend reachable from `entry` as one ES module. Throws, naming the file, if it fails. */
export async function bundleFrontend(entry = resolve(FRONTEND_DIR, 'main.ts')): Promise<string> {
  try {
    const result = await Bun.build({
      entrypoints: [entry],
      target: 'browser',
      format: 'esm',
      minify: { whitespace: true },
      sourcemap: 'none',
      plugins: [frontend],
    });
    const [output] = result.outputs;
    if (output === undefined) {
      // noinspection ExceptionCaughtLocallyJS
      throw new Error('Bun.build wrote no output');
    }
    return await output.text();
  } catch (cause) {
    const failure = describeFailure(cause);
    log.error('static', `could not bundle ${failure}`);
    throw new Error(`Could not bundle ${failure}`, { cause });
  }
}
