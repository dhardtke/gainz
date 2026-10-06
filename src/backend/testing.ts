/**
 * Test-only. The harness every *.test.ts under src/backend/ builds its fixtures from;
 * no production module imports it.
 */
import { afterEach, beforeEach } from 'bun:test';
import type { Server } from 'bun';
import type { Database } from 'bun:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from './db/db.ts';
import type { AuthOptions } from './features/auth/auth.facade.ts';
import { HttpError } from './http/errors.ts';
import { startServer } from './http/server.ts';
import { type LogLevel, setLogSink } from './shared/log.ts';

/** The request helpers a test file gets from `useServer()`, and the lines the server logged. */
export interface TestServer {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  post: (path: string, body: unknown) => Promise<Response>;
  patch: (path: string, body: unknown) => Promise<Response>;
  logs: () => LogLine[];
}

/** One line written through `log`, as `useLogs()` captures it. */
export interface LogLine {
  level: LogLevel;
  text: string;
}

/** Captures every line written through `log` during each test, so the suite prints nothing. */
export function useLogs(): () => LogLine[] {
  let lines: LogLine[] = [];
  let restore = (): void => {};

  beforeEach(() => {
    lines = [];
    restore = setLogSink((level, text) => {
      lines.push({ level, text });
    });
  });

  afterEach(() => {
    restore();
  });

  return () => lines;
}

/**
 * Gives the calling test file a real server on port 0 over an in-memory
 * database, torn down and rebuilt around every test.
 *
 * The lifecycle hooks are registered from inside this function rather than at
 * the module's top level, so each file that calls it gets its own hooks and its
 * own database instead of sharing one through the module cache.
 *
 * Auth is off unless `options.auth` names a password hash; the auth feature, and with it the login
 * throttle, is rebuilt with the server for every test.
 */
export function useServer(options: { auth?: AuthOptions } = {}): TestServer {
  let db: Database;
  let server: Server<undefined>;
  let base = '';

  beforeEach(() => {
    db = openDatabase(':memory:');
    server = startServer(db, 0, options.auth);
    base = server.url.origin;
  });

  afterEach(async () => {
    await server.stop(true);
    db.close();
  });

  // After the hooks above: Bun runs afterEach hooks in registration order, so the server stops
  // while its lines are still captured.
  const logs = useLogs();

  function api(path: string, init?: RequestInit): Promise<Response> {
    return fetch(`${base}${path}`, init);
  }

  function post(path: string, body: unknown): Promise<Response> {
    return api(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  function patch(path: string, body: unknown): Promise<Response> {
    return api(path, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  return { api, post, patch, logs };
}

/** A throwaway directory, made before each test and removed after it. */
export function useTempDir(): () => string {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gainz-'));
  });

  afterEach(() => {
    // Recursive, so the WAL/SHM sidecars of any file database written here go too. Windows releases
    // the handle a moment after close(), so retry rather than fail the test on EBUSY.
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  return () => dir;
}

/**
 * Reads a response body as the shape the endpoint documents.
 *
 * Bun types `json()` as `Promise<any>` and offers no generic overload, so the
 * claim has to be asserted somewhere. Here it is asserted once, and each call
 * site names the shape it is claiming.
 */
export async function body<T>(res: Response): Promise<T> {
  const parsed: unknown = await res.json();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return parsed as T;
}

/** The element at `index`, failing the test rather than typing as possibly-absent. */
export function at<T>(items: T[], index: number): T {
  const item = items[index];
  if (item === undefined) {
    throw new Error(`expected an element at index ${index}, but the array holds ${items.length}`);
  }
  return item;
}

export function tables(database: Database): string[] {
  return database
    .query<{ name: string }, []>("SELECT name FROM sqlite_master WHERE type = 'table'")
    .all()
    .map((row) => row.name);
}

/** Runs `fn` and returns the `HttpError` it throws, failing the test if it throws nothing or something else. */
export function thrown(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return err;
    }
    throw err;
  }
  throw new Error('Expected an HttpError');
}

/** Resolves true once the socket opens, false if it errors or closes first. */
export function opens(socket: WebSocket): Promise<boolean> {
  return new Promise((done) => {
    socket.addEventListener('open', () => {
      done(true);
    });
    socket.addEventListener('error', () => {
      done(false);
    });
    socket.addEventListener('close', () => {
      done(false);
    });
  });
}

/** Reads `stream` until a line announces the server's URL, returning that URL and everything read. */
export async function waitForUrl(stream: ReadableStream<Uint8Array>, stderr: () => Promise<string>): Promise<{ url: string; stdout: string }> {
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
        throw new Error(`the server exited before it started: ${await stderr()}`);
      }
      stdout += decoder.decode(chunk.value, { stream: true });
    }
  };
  const timeout = Bun.sleep(15_000).then(async () => {
    throw new Error(`the server did not start within 15 s: ${await stderr()}`);
  });
  const url = await Promise.race([read(), timeout]);
  reader.releaseLock();
  return { url, stdout };
}
