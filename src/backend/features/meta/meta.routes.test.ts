import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import { body, useServer } from '../../testing.ts';

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
    expect((await body<ErrorDto>(res)).error).toContain('not found');
  });

  test('the bare /api prefix returns a JSON 404, but /apix does not', async () => {
    const res = await api('/api');
    expect(res.status).toBe(404);
    expect((await body<ErrorDto>(res)).error).toContain('not found');
    // Every verb, not just GET: the key claims the URL before the static method gate.
    expect((await api('/api', { method: 'POST' })).status).toBe(404);
    expect((await api('/apix')).headers.get('content-type')).toContain('text/html');
  });
});
