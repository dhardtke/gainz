import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import type { Embedded } from '../backend/shared/embedded.ts';
import { body, opens, useTempDir } from '../backend/testing.ts';
import { build } from './build.ts';

const FRONTEND = resolve(import.meta.dir, '..', 'frontend');

/** Reads `stream` until a line announces the server's URL, returning that URL and everything read. */
async function waitForUrl(stream: ReadableStream<Uint8Array>, stderr: () => Promise<string>): Promise<{ url: string; stdout: string }> {
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let stdout = '';
  const read = async (): Promise<string> => {
    for (;;) {
      const url = /gainz is running on (\S+)/.exec(stdout)?.[1];
      if (url !== undefined) {
        return url;
      }
      const chunk = await reader.read();
      if (chunk.done) {
        throw new Error(`the built server exited before it started: ${await stderr()}`);
      }
      stdout += decoder.decode(chunk.value, { stream: true });
    }
  };
  const timeout = Bun.sleep(15_000).then(async () => {
    throw new Error(`the built server did not start within 15 s: ${await stderr()}`);
  });
  const url = await Promise.race([read(), timeout]);
  reader.releaseLock();
  return { url, stdout };
}

describe('single-file build', () => {
  let dir = '';
  let embedded: Embedded;
  let proc: Bun.Subprocess<'ignore', 'pipe', 'pipe'> | undefined;
  let origin = '';
  let stdout = '';

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'gainz-build-'));
    ({ embedded } = await build(join(dir, 'out')));

    // Only the one file, far from the repository: nothing else may be needed to run it.
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
    // Windows keeps a live process's working directory and SQLite handles locked a moment longer.
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

  test('serves each module at its own URL, whitespace-minified and without a source map', async () => {
    const app = await get('/app/gz-app.component.ts');
    expect(app.headers.get('content-type')).toStartWith('text/javascript');
    expect(await app.text()).toBe(embedded.pages['/app/gz-app.component.ts']?.body ?? '');

    const chart = await (await get('/features/exercises/internal/gz-chart.component.ts')).text();
    expect(chart).toContain('../../../ui/format.ts');
    expect(chart).toContain('await define(');
    expect(chart).not.toContain(': string');
    expect(chart).not.toContain('sourceMappingURL');
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

  test('carries neither the dev client nor anything test-only', async () => {
    // Present in the sources, so its 404 proves the exclusion rather than a misspelled path.
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

describe('a module that does not parse', () => {
  const tempDir = useTempDir();

  test('fails the build, naming the file', async () => {
    const broken = join(FRONTEND, '__broken.ts');
    await Bun.write(broken, 'export const oops: = ;\n');
    try {
      const failure = await build(tempDir()).then(
        () => null,
        (err: unknown) => err,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(String(failure)).toMatch(/src\/frontend\/__broken\.ts/);
    } finally {
      await unlink(broken);
    }
  });
});
