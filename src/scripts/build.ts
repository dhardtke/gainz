/**
 * Builds the server and the frontend into one minified `gainz.js` (plus a linked source map), so a
 * deployment is one file run with `bun`. The frontend, Oat and the migrations go in through a
 * replacement for `src/backend/shared/embedded.ts`; the frontend stays one module per URL, never bundled.
 */
import { relative, resolve } from 'node:path';
import { MIGRATIONS_DIR, readMigrations } from '../backend/db/migrations.ts';
import type { Embedded } from '../backend/shared/embedded.ts';
import { createStaticFacade } from '../backend/features/static/static.facade.ts';

const SRC = resolve(import.meta.dir, '..');

export interface BuildResult {
  outfile: string;
  bytes: number;
  embedded: Embedded;
}

export async function build(outdir: string): Promise<BuildResult> {
  const web = await createStaticFacade().embed();
  const embedded: Embedded = { ...web, migrations: readMigrations(MIGRATIONS_DIR) };
  // Bun.build throws on failure by default (`throw: true`), so there is no success check.
  await Bun.build({
    entrypoints: [resolve(SRC, 'backend/main.ts')],
    target: 'bun',
    outdir,
    naming: 'gainz.js',
    minify: true,
    sourcemap: 'linked',
    files: { [resolve(SRC, 'backend/shared/embedded.ts')]: `export const EMBEDDED = ${JSON.stringify(embedded)};` },
  });
  const outfile = resolve(outdir, 'gainz.js');
  return { outfile, bytes: Bun.file(outfile).size, embedded };
}

async function main(): Promise<void> {
  const { outfile, bytes, embedded } = await build('dist');
  const shown = relative(process.cwd(), outfile).replaceAll('\\', '/');
  console.log(`built ${shown} (${Math.round(bytes / 1024)} KB) and ${shown}.map`);
  const count = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`;
  console.log(
    `  embedded ${count(Object.keys(embedded.pages).length, 'frontend file')}, ${count(Object.keys(embedded.vendor).length, 'vendor file')}, ${count(embedded.migrations.length, 'migration')}`,
  );
}

if (import.meta.main) {
  await main();
}
