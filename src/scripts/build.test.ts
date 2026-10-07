import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Embedded } from '../backend/shared/embedded.ts';
import { body, opens, waitForUrl } from '../backend/testing.ts';
import { build } from './build.ts';

const FRONTEND = resolve(import.meta.dir, '..', 'frontend');

describe('single-file build', () => {
  let dir = '';
  let embedded: Embedded;
  let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  let origin = '';
  let stdout = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gainz-build-'));
    ({ embedded } = await build(join(dir, 'out')));

    const deploy = join(dir, 'deploy');
    mkdirSync(deploy);
    copyFileSync(join(dir, 'out', 'gainz.js'), join(deploy, 'gainz.js'));

    proc = Bun.spawn([process.execPath, 'gainz.js'], {
      cwd: deploy,
      env: { ...process.env, PORT: '0', GAINZ_DB: join(deploy, 'data', 'gainz.sqlite'), GAINZ_DEV: '1' },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    const started = await waitForUrl(proc.stdout, () => new Response(proc?.stderr).text());
    origin = new URL(started.url).origin;
    stdout = started.stdout;
  }, 60_000);

  afterAll(async () => {
    if (proc) {
      proc.kill();
      await proc.exited;
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  function get(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${origin}${path}`, init);
  }

  test('serves the index page without the hot-reload client, whatever GAINZ_DEV says', async () => {
    for (const path of ['/', '/workouts/3']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      const text = await res.text();
      expect(text).toContain('<!doctype html>');
      expect(text).not.toContain('/dev/hot.ts');
    }
    expect(stdout).not.toContain('hot reload: on');
  });

  test('stamps the index page with the commit, the build time in UTC and any workflow run ID', async () => {
    const head = Bun.spawnSync(['git', 'rev-parse', 'HEAD']).stdout.toString().trim();
    const text = await (await get('/')).text();
    const stamp = /^<!doctype html>\r?\n<!-- gainz ([0-9a-f]{40})(?:-dirty)?, built (\S+Z)(?:, run (\d+))? -->\r?\n/.exec(text);
    expect(stamp?.[1]).toBe(head);
    expect(Math.abs(Date.now() - Date.parse(stamp?.[2] ?? ''))).toBeLessThan(120_000);
    expect(stamp?.[3]).toBe(Bun.env.GITHUB_RUN_ID);
  });

  test('never opens a socket at /dev/ws', async () => {
    const socket = new WebSocket(`${origin.replace(/^http/, 'ws')}/dev/ws`);
    expect(await opens(socket)).toBe(false);
    socket.close();
  });

  test('serves the frontend as one whitespace-minified bundle at /main.ts, and no other module', async () => {
    const main = await get('/main.ts');
    expect(main.headers.get('content-type')).toStartWith('text/javascript');
    const bundle = await main.text();
    expect(bundle).toBe(embedded.pages['/main.ts']?.body ?? '');
    expect(bundle).toContain('customElements.define');
    expect(bundle).toContain('"/ui/tile/gz-tile.component.ts"');
    expect(bundle).not.toContain(': string');
    expect(bundle).not.toContain('sourceMappingURL');
    expect(bundle).not.toContain('import.meta');

    for (const url of ['/app/gz-app.component.ts', '/ui/format.ts', '/ui/inline-styles.ts', '/features/exercises/internal/gz-chart.component.ts']) {
      expect({ url, status: (await get(url)).status }).toEqual({ url, status: 404 });
    }
  });

  test('preloads only the stylesheets index.html names, by versions it serves for good', async () => {
    const page = await (await get('/')).text();
    const preloaded = [...page.matchAll(/<link rel="(?:modulepreload|preload)" href="([^"]+)"/g)].map((match) => match[1] ?? '');
    expect(page).not.toContain('rel="modulepreload"');
    expect(page).not.toContain('data-lazy-preloads');
    expect(preloaded.some((url) => url.startsWith('/vendor/oat.css?v='))).toBe(true);
    expect(preloaded.some((url) => url.startsWith('/ui/shared.css?v='))).toBe(true);
    expect(page).toMatch(/<script type="importmap">\{"imports":\{"\//);
    for (const url of preloaded) {
      const res = await get(url);
      expect({ url, status: res.status, cache: res.headers.get('cache-control') }).toEqual({ url, status: 200, cache: 'public, max-age=31536000, immutable' });
    }
  });

  test('serves every component stylesheet, the app stylesheet and Oat', async () => {
    const urls = ['/ui/app.css', '/vendor/oat.css', '/vendor/oat.js'];
    for await (const entry of new Bun.Glob('**/gz-*.component.ts').scan({ cwd: FRONTEND })) {
      urls.push(`/${entry.replaceAll('\\', '/').replace(/\.ts$/, '.css')}`);
    }
    expect(urls.length).toBeGreaterThan(3);
    for (const url of urls) {
      expect({ url, status: (await get(url)).status }).toEqual({ url, status: 200 });
    }
    expect((await get('/vendor/oat.js')).headers.get('content-type')).toStartWith('text/javascript');
  });

  test('serves the manifest and the icons byte for byte as they are on disk', async () => {
    for (const url of ['/manifest.webmanifest', '/icons/icon.svg', '/icons/icon-192.png', '/icons/icon-maskable-512.png']) {
      const source = Bun.file(join(FRONTEND, url));
      const res = await get(url);
      expect({ url, status: res.status }).toEqual({ url, status: 200 });
      expect(res.headers.get('content-type')).toBe(source.type);
      expect(new Uint8Array(await res.arrayBuffer())).toEqual(await source.bytes());
    }
    expect(embedded.pages['/icons/icon-192.png']?.base64).toBe(true);
    expect(embedded.pages['/index.html']?.base64).toBeUndefined();
  });

  test('carries neither the dev client nor anything test-only', async () => {
    expect(await Bun.file(join(FRONTEND, 'features', 'exercises', 'exercises.fixtures.ts')).exists()).toBe(true);
    for (const url of ['/dev/hot.ts', '/testing.ts', '/ui/html.test.ts', '/ui/tile/gz-tile.component.test.ts', '/features/exercises/exercises.fixtures.ts']) {
      expect({ url, status: (await get(url)).status }).toEqual({ url, status: 404 });
    }
  });

  test('keeps the path guards', async () => {
    expect((await get('/ui/../main.ts')).status).toBe(200);
    for (const url of ['/%2e%2e/backend/http/server.ts', '/%zz', '/vendor/%6fat.css']) {
      expect({ url, status: (await get(url)).status }).toEqual({ url, status: 404 });
    }
  });

  test('ran the embedded migrations into the database GAINZ_DB names', async () => {
    expect(await body<unknown>(await get('/api/health'))).toMatchObject({ status: 'ok' });
    expect((await get('/api/workouts')).status).toBe(200);
    expect(existsSync(join(dir, 'deploy', 'data', 'gainz.sqlite'))).toBe(true);
  });

  test('answers a revalidation with 304', async () => {
    const etag = (await get('/main.ts')).headers.get('etag') ?? '';
    expect(etag).not.toBe('');
    expect((await get('/main.ts', { headers: { 'If-None-Match': etag } })).status).toBe(304);
  });

  test('refuses a verb it does not serve', async () => {
    expect((await get('/', { method: 'POST' })).status).toBe(405);
  });

  test('links a source map that points back at the sources', async () => {
    expect(readFileSync(join(dir, 'out', 'gainz.js'), 'utf8')).toContain('//# sourceMappingURL=gainz.js.map');
    const map = await body<{ sources: string[] }>(new Response(Bun.file(join(dir, 'out', 'gainz.js.map'))));
    expect(map.sources.some((source) => source.replaceAll('\\', '/').endsWith('src/backend/main.ts'))).toBe(true);
  });

  test('names the Bun that built it, for the server to run it with', () => {
    expect(readFileSync(join(dir, 'out', 'bun-version'), 'utf8')).toBe(`${Bun.version}\n`);
  });
});

describe('single-file build with GAINZ_PASSWORD_HASH set', () => {
  let dir = '';
  let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  let origin = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gainz-build-auth-'));
    await build(join(dir, 'out'));
    const hash = await Bun.password.hash('right', { algorithm: 'bcrypt', cost: 4 });
    proc = Bun.spawn([process.execPath, join(dir, 'out', 'gainz.js')], {
      cwd: dir,
      env: { ...process.env, PORT: '0', GAINZ_DB: join(dir, 'gainz.sqlite'), GAINZ_PASSWORD_HASH: hash },
      stdout: 'pipe',
      stderr: 'pipe',
    });
    origin = new URL((await waitForUrl(proc.stdout, () => new Response(proc?.stderr).text())).url).origin;
  }, 60_000);

  afterAll(async () => {
    if (proc) {
      proc.kill();
      await proc.exited;
    }
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  test('guards the API and says so in the health check', async () => {
    expect((await fetch(`${origin}/api/workouts`)).status).toBe(401);
    expect(await body<unknown>(await fetch(`${origin}/api/health`))).toMatchObject({ auth: true });
  });
});
