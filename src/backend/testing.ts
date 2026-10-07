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
import { type LogLevel, entryText, setLogSink } from './shared/log.ts';

export interface TestServer {
  api: (path: string, init?: RequestInit) => Promise<Response>;
  post: (path: string, body: unknown) => Promise<Response>;
  patch: (path: string, body: unknown) => Promise<Response>;
  logs: () => LogLine[];
}

export interface LogLine {
  level: LogLevel;
  text: string;
}

export function useLogs(): () => LogLine[] {
  let lines: LogLine[] = [];
  let restore = (): void => {};

  beforeEach(() => {
    lines = [];
    restore = setLogSink((entry) => {
      lines.push({ level: entry.level, text: entryText(entry) });
    });
  });

  afterEach(() => {
    restore();
  });

  return () => lines;
}

// Hooks are registered here, not at module top level, so each test file gets its own database.
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

  // After the hooks above: afterEach runs in registration order, so the server stops while captured.
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

export function useTempDir(): () => string {
  let dir = '';

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'gainz-'));
  });

  afterEach(() => {
    // Windows releases the handle a moment after close(), so retry rather than fail on EBUSY.
    rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 20 });
  });

  return () => dir;
}

// Bun types `json()` as `Promise<any>` with no generic overload, so the shape is asserted once here.
export async function body<T>(res: Response): Promise<T> {
  const parsed: unknown = await res.json();
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- see above
  return parsed as T;
}

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
