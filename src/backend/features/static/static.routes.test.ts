import { describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { useServer } from '../../testing.ts';
import { FRONTEND_DIR } from './internal/paths.ts';

const { api } = useServer();

describe('static files', () => {
  test('serves the frontend at the root', async () => {
    const res = await api('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    const page = await res.text();
    expect(page).toContain('gainz');
    // Hot reload is development-only and must stay off unless GAINZ_DEV=1 asks for it.
    expect(page).not.toContain('/dev/hot.ts');
  });

  test('rejects directory traversal below src/frontend/', async () => {
    const res = await api('/../package.json');
    expect(res.status).toBe(404);
  });

  test('serves the app stylesheets', async () => {
    for (const path of ['/ui/app.css', '/ui/shared.css', '/app/gz-app.component.css']) {
      const res = await api(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
    }
  });

  test('serves a stylesheet beside every component module', async () => {
    const modules = await Array.fromAsync(new Bun.Glob('**/gz-*.component.ts').scan(FRONTEND_DIR));
    expect(modules.length).toBeGreaterThanOrEqual(11);
    for (const file of modules) {
      // scan() yields backslashes on Windows.
      const res = await api(`/${file.replaceAll('\\', '/').replace(/\.ts$/, '.css')}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
    }
  });

  test("serves Oat's stylesheet and script from node_modules at fixed vendor paths", async () => {
    const css = await api('/vendor/oat.css');
    expect(css.status).toBe(200);
    expect(css.headers.get('content-type')).toContain('text/css');
    expect(await css.text()).toContain('@layer theme,base,components');

    const js = await api('/vendor/oat.js');
    expect(js.status).toBe(200);
    expect(js.headers.get('content-type')).toContain('text/javascript');
    expect(await js.text()).toContain('customElements.define("ot-dropdown"');
  });

  test('exposes only the allowlisted vendor files, not node_modules', async () => {
    expect((await api('/vendor/oat.min.css')).status).toBe(404);
    expect((await api('/vendor/pico.css')).status).toBe(404);
    expect((await api('/node_modules/@knadh/oat/package.json')).status).toBe(404);
  });

  test('answers HEAD with the headers and no body', async () => {
    const res = await api('/ui/format.ts', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(await res.text()).toBe('');
  });

  test('returns 404 for a .ts file that does not exist', async () => {
    expect((await api('/nope.ts')).status).toBe(404);
  });

  test('answers a verb other than GET or HEAD with 405', async () => {
    // `/vendor/oat.css` is the load-bearing case: it has its own { GET, HEAD } route, so the
    // 405 can only come from an unmatched verb falling through to `/*`.
    for (const path of ['/', '/ui/app.css', '/vendor/oat.css']) {
      const res = await api(path, { method: 'POST' });
      expect(res.status).toBe(405);
      expect(await res.text()).toBe('Method not allowed');
    }
  });

  test('serves the index page for an extension-less client route', async () => {
    const res = await api('/workouts');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  test('a trailing-slash directory with no index is a 404, but the path without one is not', async () => {
    for (const path of ['/ui/', '/app/']) {
      expect((await api(path)).status).toBe(404);
    }
    // No trailing slash: still an extension-less client route for the single-page app.
    const res = await api('/ui');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
  });

  test('refuses to transpile anything outside src/frontend/', async () => {
    // Encoded, so the URL parser cannot normalise the traversal away before
    // resolveStaticPath sees it.
    expect((await api('/%2e%2e/backend/http/server.ts')).status).toBe(404);
    expect((await api('/%2e%2e/backend/features/static/internal/transpile.ts')).status).toBe(404);
  });
});

describe('revalidation', () => {
  const tagOf = async (path: string): Promise<string> => {
    const res = await api(path);
    expect(res.status).toBe(200);
    return res.headers.get('etag') ?? '';
  };

  test('every served file carries a strong ETag and no-cache', async () => {
    for (const path of ['/', '/workouts', '/ui/app.css', '/vendor/oat.css', '/vendor/oat.js', '/main.ts']) {
      const res = await api(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).toMatch(/^"[0-9a-z]+"$/);
      expect(res.headers.get('cache-control')).toBe('no-cache');
    }
  });

  test('the root and a client route share the index page tag', async () => {
    expect(await tagOf('/workouts')).toBe(await tagOf('/'));
  });

  test('a matching If-None-Match gets an empty 304', async () => {
    for (const path of ['/ui/app.css', '/vendor/oat.css', '/vendor/oat.js', '/workouts']) {
      const etag = await tagOf(path);
      for (const method of ['GET', 'HEAD']) {
        const res = await api(path, { method, headers: { 'If-None-Match': etag } });
        expect(res.status).toBe(304);
        expect(await res.text()).toBe('');
        expect(res.headers.get('etag')).toBe(etag);
        expect(res.headers.get('cache-control')).toBe('no-cache');
      }
    }
  });

  test('a list, a weak tag and * all match', async () => {
    const etag = await tagOf('/ui/app.css');
    for (const header of [`"stale", ${etag}`, `W/${etag}`, '*']) {
      const res = await api('/ui/app.css', { headers: { 'If-None-Match': header } });
      expect(res.status).toBe(304);
    }
  });

  test('a stale tag gets the full body', async () => {
    const res = await api('/ui/app.css', { headers: { 'If-None-Match': '"stale"' } });
    expect(res.status).toBe(200);
    expect((await res.text()).length).toBeGreaterThan(0);
  });

  test('editing a file changes its tag', async () => {
    const path = resolve(FRONTEND_DIR, '__etag.css');
    await Bun.write(path, 'a { color: red; }\n');
    try {
      const before = await tagOf('/__etag.css');
      await Bun.write(path, 'a { color: blue; }\n');
      const res = await api('/__etag.css', { headers: { 'If-None-Match': before } });
      expect(res.status).toBe(200);
      expect(res.headers.get('etag')).not.toBe(before);
    } finally {
      await unlink(path);
    }
  });

  test('error responses carry no ETag', async () => {
    for (const res of [await api('/nope.css'), await api('/vendor/oat.scss'), await api('/', { method: 'POST' })]) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.headers.get('etag')).toBeNull();
    }
  });
});
