import { describe, expect, test } from 'bun:test';
import type { ErrorBody } from '../testing';
import { body, useServer } from '../testing';

const { api } = useServer();

describe('health and routing', () => {
  test('health endpoint responds', async () => {
    const res = await api('/api/health');
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ status: 'ok', app: 'gainz' });
  });

  test('unknown api endpoint returns a JSON 404', async () => {
    const res = await api('/api/nope');
    expect(res.status).toBe(404);
    expect((await body<ErrorBody>(res)).error).toContain('not found');
  });
});
