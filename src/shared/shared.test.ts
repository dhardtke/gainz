import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join, relative } from 'node:path';

const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** Every declaration file under `src/shared/` — the tests themselves excluded. */
function declarationFiles(dir: string = import.meta.dir): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      return declarationFiles(path);
    }
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });
}

describe('the shared module', () => {
  test('declares types only, so nothing here survives transpilation', async () => {
    const files = declarationFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const path of files) {
      const name = relative(import.meta.dir, path);
      const source = await Bun.file(path).text();
      // A runtime statement would make the frontend's `import type` a real fetch,
      // and `src/shared/` is not served — see the header comment in dto/index.ts.
      expect(`${name}: ${transpiler.transformSync(source).trim()}`).toBe(`${name}: `);
    }
  });
});
