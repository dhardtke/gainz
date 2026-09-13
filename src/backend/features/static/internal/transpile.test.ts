import { describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { useServer } from '../../../testing.ts';

const { api } = useServer();

describe('typescript modules', () => {
  test('serves a .ts module as JavaScript with its types erased', async () => {
    const res = await api('/format.ts');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');

    const body = await res.text();
    expect(body).toContain('export const UNIT');
    // The source annotates every export; none of that may reach the browser.
    expect(body).not.toContain(': string');
    expect(body).not.toContain('| null | undefined');
  });

  test('leaves import specifiers alone, so a URL names a real file', async () => {
    const body = await (await api('/components/gz-chart/gz-chart.ts')).text();
    expect(body).toContain('from "../../format.ts"');
  });

  test('serves the entry point index.html names', async () => {
    const page = await (await api('/')).text();
    expect(page).toContain('src="/main.ts"');

    const res = await api('/main.ts');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(await res.text()).toContain('./components/gz-app/gz-app.ts');
  });

  test('strips type-only imports, so src/shared/ is never fetched at runtime', async () => {
    const body = await (await api('/components/gz-set-row/gz-set-row.ts')).text();
    // `src/shared/` is outside the web root: a surviving specifier would be a 404 on
    // every page load. That the module erases to nothing is pinned by src/shared/shared.test.ts.
    expect(body).not.toContain('shared/dto');
  });

  test('keeps the load-bearing top-level await that pairs a module with its CSS', async () => {
    const body = await (await api('/components/gz-chart/gz-chart.ts')).text();
    expect(body).toContain('await define("gz-chart"');
  });

  test('reports a module that will not parse', async () => {
    const broken = resolve(import.meta.dir, '..', '..', '..', '..', 'frontend', '__broken.ts');
    await Bun.write(broken, 'export const oops: = ;\n');
    try {
      const res = await api('/__broken.ts');
      expect(res.status).toBe(500);
      expect(await res.text()).toContain('__broken.ts');
    } finally {
      await unlink(broken);
    }
  });
});
