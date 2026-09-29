import { describe, expect, test } from 'bun:test';
import { unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { openDatabase } from '../../db/db.ts';
import { startServer } from '../../http/server.ts';
import { createStaticFacade } from '../static/static.facade.ts';
import { devRoutes } from './dev.routes.ts';

const CLIENT = '/dev/hot.ts';

/**
 * A server built with `GAINZ_DEV` set as asked. Not `useServer()`: the variable has to be set
 * before the route table is built, and it must never leak into the other test files this process
 * runs next — `static.routes.test.ts` asserts production behavior.
 */
async function withDev(enabled: boolean, fn: (origin: string) => Promise<void>): Promise<void> {
  const previous = process.env.GAINZ_DEV;
  if (enabled) {
    process.env.GAINZ_DEV = '1';
  } else {
    delete process.env.GAINZ_DEV;
  }
  const db = openDatabase(':memory:');
  const server = startServer(db, 0);
  try {
    await fn(server.url.origin);
  } finally {
    await server.stop(true);
    db.close();
    if (previous === undefined) {
      delete process.env.GAINZ_DEV;
    } else {
      process.env.GAINZ_DEV = previous;
    }
  }
}

function socketUrl(origin: string): string {
  return `${origin.replace(/^http/, 'ws')}/dev/ws`;
}

/** Resolves true once the socket opens, false if it errors or closes first. */
function opens(socket: WebSocket): Promise<boolean> {
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

function occurrences(text: string, needle: string): number {
  return text.split(needle).length - 1;
}

describe('hot reload switched off', () => {
  test('registers no route and injects no client', async () => {
    await withDev(false, async (origin) => {
      expect(devRoutes()).toEqual({});
      expect(await (await fetch(`${origin}/`)).text()).not.toContain(CLIENT);
    });
  });

  test('a socket at /dev/ws never connects', async () => {
    await withDev(false, async (origin) => {
      // No route means the single-page fallback answers /dev/ws with index.html — a 200, not a 404 —
      // so what is asserted is the connection, not a status code.
      const socket = new WebSocket(socketUrl(origin));
      expect(await opens(socket)).toBe(false);
      socket.close();
    });
  });
});

describe('hot reload switched on', () => {
  test('injects the client exactly once into the index page and every client route', async () => {
    await withDev(true, async (origin) => {
      for (const path of ['/', '/index.html', '/workouts']) {
        expect(occurrences(await (await fetch(`${origin}${path}`)).text(), CLIENT)).toBe(1);
      }
    });
  });

  test('pushes a change to a connected client', async () => {
    await withDev(true, async (origin) => {
      const socket = new WebSocket(socketUrl(origin));
      const file = resolve(createStaticFacade().webRoot(), '__hot.css');
      try {
        expect(await opens(socket)).toBe(true);
        const message = new Promise<unknown>((done) => {
          socket.addEventListener('message', (event) => {
            done(typeof event.data === 'string' ? JSON.parse(event.data) : event.data);
          });
        });
        await Bun.write(file, 'a { color: red; }\n');
        // A missed watcher event fails the test instead of hanging the suite.
        const timeout = Bun.sleep(2000).then(() => 'timed out');
        expect(await Promise.race([message, timeout])).toEqual({ swap: '/__hot.css' });
      } finally {
        socket.close();
        await unlink(file);
      }
    });
  });
});
