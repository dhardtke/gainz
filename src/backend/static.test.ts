import { describe, expect, test } from 'bun:test';
import { useServer } from './testing';

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

  test('refuses to transpile anything outside src/frontend/', async () => {
    // Encoded, so the URL parser cannot normalise the traversal away before
    // resolveStaticPath sees it.
    expect((await api('/%2e%2e/backend/server.ts')).status).toBe(404);
    expect((await api('/%2e%2e/backend/transpile.ts')).status).toBe(404);
  });
});
