import { describe, expect, test } from 'bun:test';
import { useServer } from '../testing.ts';
import { optionalQueryDate, optionalQueryString, pathDate, queryDate } from './http.ts';
import { MAX_BODY_BYTES } from './server.ts';

const { api, post } = useServer();

describe('request bodies', () => {
  test('rejects malformed JSON', async () => {
    const res = await api('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not json',
    });
    expect(res.status).toBe(400);
  });

  test('rejects a non-object body', async () => {
    const res = await post('/api/exercises', ['Bench Press']);
    expect(res.status).toBe(400);
  });

  test.each([[undefined], ['text/plain'], ['application/x-www-form-urlencoded']])('rejects a body sent as %p', async (type) => {
    const res = await api('/api/exercises', {
      method: 'POST',
      headers: type === undefined ? {} : { 'Content-Type': type },
      body: '{"name":"Squat"}',
    });
    expect(res.status).toBe(415);
  });

  test('accepts application/json with a charset', async () => {
    const res = await api('/api/exercises', {
      method: 'POST',
      headers: { 'Content-Type': 'Application/JSON; charset=utf-8' },
      body: '{"name":"Squat"}',
    });
    expect(res.status).toBe(201);
  });

  // Headers only: Bun refuses by Content-Length and closes, so a fetch still uploading would see a reset.
  test('refuses a body over the limit', async () => {
    const { hostname, port } = new URL(await api('/api/health').then((res) => res.url));
    const { promise, resolve } = Promise.withResolvers<string>();
    let response = '';
    const socket = await Bun.connect({
      hostname,
      port: Number(port),
      socket: {
        data: (_socket, chunk) => {
          response += chunk.toString();
          resolve(response);
        },
        close: () => {
          resolve(response);
        },
      },
    });
    socket.write(`POST /api/exercises HTTP/1.1\r\nHost: ${hostname}\r\nContent-Type: application/json\r\nContent-Length: ${MAX_BODY_BYTES + 1}\r\n\r\n`);
    expect(await promise).toStartWith('HTTP/1.1 413');
    socket.end();
  });
});

describe('queryDate', () => {
  test('reads a date', () => {
    expect(queryDate(new URLSearchParams('since=2026-10-12'), 'since')).toBe('2026-10-12');
  });

  test.each(['', 'since=', 'since=2026-1-05', 'since=2026-13-01', 'since=abc'])('rejects %p', (query) => {
    expect(() => queryDate(new URLSearchParams(query), 'since')).toThrow('"since" must be a date in YYYY-MM-DD format');
  });
});

describe('pathDate', () => {
  test('reads a date', () => {
    expect(pathDate('2026-10-12')).toBe('2026-10-12');
  });

  test.each([undefined, '', '2026-13-01', '2026-02-30'])('rejects %p', (raw) => {
    expect(() => pathDate(raw)).toThrow('Invalid date');
  });
});

describe('optionalQueryDate', () => {
  test('reads a date', () => {
    expect(optionalQueryDate(new URLSearchParams('since=2026-10-12'), 'since')).toBe('2026-10-12');
  });

  test.each(['', 'since='])('reads %p as null', (query) => {
    expect(optionalQueryDate(new URLSearchParams(query), 'since')).toBeNull();
  });

  test.each(['since=2026-13-01', 'since=2026-02-30', 'since=abc'])('rejects %p', (query) => {
    expect(() => optionalQueryDate(new URLSearchParams(query), 'since')).toThrow('"since" must be a date in YYYY-MM-DD format');
  });
});

describe('optionalQueryString', () => {
  test('reads and trims a value', () => {
    expect(optionalQueryString(new URLSearchParams('search=%20squat%20'), 'search', 120)).toBe('squat');
  });

  test.each(['', 'search=', 'search=%20%20'])('reads %p as null', (query) => {
    expect(optionalQueryString(new URLSearchParams(query), 'search', 120)).toBeNull();
  });

  test('rejects a value over the maximum length', () => {
    expect(() => optionalQueryString(new URLSearchParams({ search: 'a'.repeat(121) }), 'search', 120)).toThrow('"search" must be at most 120 characters');
  });
});
