import { describe, expect, test } from 'bun:test';
import { useServer } from '../testing.ts';
import { queryDate } from './http.ts';

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
});

describe('queryDate', () => {
  test('reads a date', () => {
    expect(queryDate(new URLSearchParams('since=2026-10-12'), 'since')).toBe('2026-10-12');
  });

  test.each(['', 'since=', 'since=2026-1-05', 'since=2026-13-01', 'since=abc'])('rejects %p', (query) => {
    expect(() => queryDate(new URLSearchParams(query), 'since')).toThrow('"since" must be a date in YYYY-MM-DD format');
  });
});
