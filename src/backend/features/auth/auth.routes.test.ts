import { beforeEach, describe, expect, test } from 'bun:test';
import type { AuthStatusDto } from '../../../shared/dto/auth.ts';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { HealthDto } from '../../../shared/dto/meta.ts';
import { body, type LogLine, useServer } from '../../testing.ts';
import { issue } from './internal/session-cookie.ts';

const DAY_MS = 24 * 60 * 60 * 1000;
const hash = await Bun.password.hash('right', { algorithm: 'bcrypt', cost: 4 });
let now = 0;

beforeEach(() => {
  now = Date.UTC(2026, 0, 1);
});

const { api, post, logs } = useServer({ auth: { passwordHash: hash, now: () => now } });

function login(password: string): Promise<Response> {
  return post('/api/auth/login', { password });
}

/** The `name=value` pair of a `Set-Cookie` header, ready to send back as a `Cookie` header. */
function cookieOf(res: Response): string {
  const header = res.headers.get('set-cookie') ?? '';
  expect(header).toStartWith('gainz_session=');
  return header.split(';', 1)[0] ?? '';
}

async function loggedIn(): Promise<string> {
  const res = await login('right');
  expect(res.status).toBe(204);
  return cookieOf(res);
}

function workouts(cookie: string): Promise<Response> {
  return api('/api/workouts', { headers: { Cookie: cookie } });
}

describe('the guard', () => {
  test('refuses the data routes without a cookie', async () => {
    const res = await api('/api/workouts');
    expect(res.status).toBe(401);
    expect(await body<ErrorDto>(res)).toEqual({ error: 'Not logged in' });
    expect((await post('/api/workouts', { performedOn: '2026-01-01' })).status).toBe(401);
  });

  test('leaves health, the auth status, the /api 404s, the frontend and the vendor files public', async () => {
    const health = await api('/api/health');
    expect(health.status).toBe(200);
    expect((await body<HealthDto>(health)).auth).toBe(true);
    const status = await api('/api/auth/status');
    expect(status.status).toBe(200);
    expect(await body<AuthStatusDto>(status)).toEqual({ enabled: true });
    expect((await api('/api/nope')).status).toBe(404);
    const page = await api('/');
    expect(page.status).toBe(200);
    expect(page.headers.get('content-type')).toContain('text/html');
    expect((await api('/vendor/oat.css')).status).toBe(200);
  });

  test('lets a fresh cookie through without re-setting it', async () => {
    const res = await workouts(await loggedIn());
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toBeNull();
  });

  test('renews a cookie issued more than a day ago', async () => {
    const cookie = await loggedIn();
    now += 2 * DAY_MS;
    const res = await workouts(cookie);
    expect(res.status).toBe(200);
    expect(cookieOf(res)).not.toBe(cookie);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=7776000');
  });

  test('refuses an expired cookie', async () => {
    const cookie = await loggedIn();
    now += 91 * DAY_MS;
    expect((await workouts(cookie)).status).toBe(401);
  });

  test('refuses a tampered or malformed cookie', async () => {
    const cookie = await loggedIn();
    const last = cookie.at(-1) === 'A' ? 'B' : 'A';
    const [expiresAt = '', signature = ''] = cookie.slice('gainz_session='.length).split('.');
    for (const bad of [`${cookie.slice(0, -1)}${last}`, `gainz_session=${expiresAt}${signature}`, `gainz_session=soon.${signature}`]) {
      expect({ bad, status: (await workouts(bad)).status }).toEqual({ bad, status: 401 });
    }
  });

  test('refuses a cookie signed with another password hash', async () => {
    const forged = issue('some other hash', now).split(';', 1)[0] ?? '';
    expect((await workouts(forged)).status).toBe(401);
  });
});

describe('login', () => {
  test('refuses a wrong password', async () => {
    const res = await login('wrong');
    expect(res.status).toBe(401);
    expect(await body<ErrorDto>(res)).toMatchObject({ error: 'Wrong password' });
  });

  test('refuses a malformed body', async () => {
    for (const payload of [{}, { password: 1 }, { password: '' }]) {
      expect({ payload, status: (await post('/api/auth/login', payload)).status }).toEqual({ payload, status: 400 });
    }
    const res = await api('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: 'nope' });
    expect(res.status).toBe(400);
  });

  test('sets a 90-day, HttpOnly, Secure, SameSite=Lax cookie', async () => {
    const res = await login('right');
    expect(res.status).toBe(204);
    const header = res.headers.get('set-cookie') ?? '';
    for (const part of ['gainz_session=', 'Max-Age=7776000', 'HttpOnly', 'Secure', 'SameSite=Lax', 'Path=/']) {
      expect(header).toContain(part);
    }
  });

  test('locks for 60 s after 5 failures, even for the right password', async () => {
    for (let i = 0; i < 5; i++) {
      expect((await login('wrong')).status).toBe(401);
    }
    const locked = await login('right');
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBe('60');
    expect(logs()).toContainEqual({ level: 'warn', text: 'auth login locked for 60 s after 5 failed attempts' });
  });

  test('a success resets the count', async () => {
    for (let i = 0; i < 5; i++) {
      await login('wrong');
    }
    now += 61_000;
    expect((await login('right')).status).toBe(204);
    for (let i = 0; i < 5; i++) {
      expect((await login('wrong')).status).toBe(401);
    }
    const locked = await login('wrong');
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBe('60');
  });

  test('doubles the lock with each further failure', async () => {
    for (let i = 0; i < 5; i++) {
      await login('wrong');
    }
    now += 61_000;
    expect((await login('wrong')).status).toBe(401);
    const locked = await login('wrong');
    expect(locked.status).toBe(429);
    expect(locked.headers.get('retry-after')).toBe('120');
  });

  test('reserves concurrent attempts before verifying them', async () => {
    const statuses = await Promise.all(Array.from({ length: 10 }, async () => (await login('wrong')).status));
    expect(statuses.filter((status) => status === 429).length).toBeGreaterThanOrEqual(5);
  });

  test('a lockout does not touch an existing cookie', async () => {
    const cookie = await loggedIn();
    for (let i = 0; i < 6; i++) {
      await login('wrong');
    }
    expect((await login('right')).status).toBe(429);
    expect((await workouts(cookie)).status).toBe(200);
  });
});

describe('the auth log', () => {
  /** The auth feature's lines, without the access log's that sit between them. */
  function authLogs(): LogLine[] {
    return logs().filter((line) => line.text.startsWith('auth '));
  }

  test('logs an accepted password at info', async () => {
    await loggedIn();
    expect(authLogs()).toEqual([{ level: 'info', text: 'auth login' }]);
  });

  test('logs a wrong password at warn', async () => {
    await login('wrong');
    expect(authLogs()).toEqual([{ level: 'warn', text: 'auth wrong password' }]);
  });

  test('logs the fifth wrong password, then the lockout it starts', async () => {
    for (let i = 0; i < 5; i++) {
      await login('wrong');
    }
    expect(authLogs().slice(-2)).toEqual([
      { level: 'warn', text: 'auth wrong password' },
      { level: 'warn', text: 'auth login locked for 60 s after 5 failed attempts' },
    ]);
  });

  test('logs nothing for a locked attempt', async () => {
    for (let i = 0; i < 5; i++) {
      await login('wrong');
    }
    const before = authLogs().length;
    expect((await login('right')).status).toBe(429);
    expect(authLogs()).toHaveLength(before);
  });
});

describe('logout', () => {
  test('expires the cookie', async () => {
    const res = await api('/api/auth/logout', { method: 'POST' });
    expect(res.status).toBe(204);
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});
