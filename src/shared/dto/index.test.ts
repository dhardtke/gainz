import { describe, expect, test } from 'bun:test';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const transpiler = new Bun.Transpiler({ loader: 'ts' });

/** Every declaration file in this directory — this test, the one runtime module, excluded. */
function declarationFiles(): string[] {
  return readdirSync(import.meta.dir).filter((name) => name.endsWith('.ts') && !name.endsWith('.test.ts'));
}

describe('the shared DTO module', () => {
  test('declares types only, so nothing here survives transpilation', async () => {
    const files = declarationFiles();
    expect(files.length).toBeGreaterThan(0);

    for (const name of files) {
      const source = await Bun.file(join(import.meta.dir, name)).text();
      // A runtime statement would make the frontend's `import type` a real fetch,
      // and `src/shared/` is not served — see the header comment in index.ts.
      expect(`${name}: ${transpiler.transformSync(source).trim()}`).toBe(`${name}: `);
    }
  });
});
