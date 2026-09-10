import { describe, expect, test } from 'bun:test';
import { useServer } from './testing';

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
