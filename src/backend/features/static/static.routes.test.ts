import { describe, expect, test } from 'bun:test';
import { useServer } from '../../testing.ts';

const { api } = useServer();

describe('static files', () => {
  test('serves the frontend at the root', async () => {
    const res = await api('/');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/html');
    expect(await res.text()).toContain('gainz');
  });

  test('rejects directory traversal below src/frontend/', async () => {
    const res = await api('/../package.json');
    expect(res.status).toBe(404);
  });

  test('serves the app stylesheets', async () => {
    for (const path of ['/css/app.css', '/css/shared.css', '/components/gz-app/gz-app.css']) {
      const res = await api(path);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/css');
    }
  });

  test('serves Pico from node_modules at a fixed vendor path', async () => {
    const res = await api('/vendor/pico.css');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/css');
    expect(await res.text()).toContain('Pico CSS');
  });

  test('exposes only the allowlisted vendor file, not node_modules', async () => {
    expect((await api('/vendor/pico.scss')).status).toBe(404);
    expect((await api('/node_modules/@picocss/pico/package.json')).status).toBe(404);
  });

  test('answers HEAD with the headers and no body', async () => {
    const res = await api('/format.ts', { method: 'HEAD' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/javascript');
    expect(await res.text()).toBe('');
  });

  test('returns 404 for a .ts file that does not exist', async () => {
    expect((await api('/nope.ts')).status).toBe(404);
  });

  test('answers a verb other than GET or HEAD with 405', async () => {
    // `/vendor/pico.css` is the load-bearing case: it has its own { GET, HEAD } route, so the
    // 405 can only come from an unmatched verb falling through to `/*`.
    for (const path of ['/', '/css/app.css', '/vendor/pico.css']) {
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
    for (const path of ['/css/', '/components/']) {
      expect((await api(path)).status).toBe(404);
    }
    // No trailing slash: still an extension-less client route for the single-page app.
    const res = await api('/css');
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
