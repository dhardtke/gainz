import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { WeighInDto, WeighInListDto } from '../../../shared/dto/weight.ts';
import { body, useServer } from '../../testing.ts';
import { putWeighIn } from './weight.fixtures.ts';

const { api, put, del } = useServer();

async function list(query = ''): Promise<WeighInListDto> {
  const res = await api(`/api/weigh-ins${query}`);
  expect(res.status).toBe(200);
  return body<WeighInListDto>(res);
}

describe('PUT /api/weigh-ins/:date', () => {
  test('creates a new date with 201', async () => {
    const res = await put('/api/weigh-ins/2026-10-13', { weight: 82.4 });
    expect(res.status).toBe(201);
    expect(await body<WeighInDto>(res)).toEqual({ measuredOn: '2026-10-13', weight: 82.4 });
  });

  test('replaces an existing date with 200', async () => {
    await putWeighIn(put, '2026-10-13', 82.4);

    const res = await put('/api/weigh-ins/2026-10-13', { weight: 81.9 });
    expect(res.status).toBe(200);
    expect(await body<WeighInDto>(res)).toEqual({ measuredOn: '2026-10-13', weight: 81.9 });
    expect((await list()).items).toEqual([{ measuredOn: '2026-10-13', weight: 81.9 }]);
  });

  test('rounds the weight to 0.01', async () => {
    expect((await putWeighIn(put, '2026-10-13', 82.456)).weight).toBe(82.46);
  });

  test('accepts the weight as a numeric string', async () => {
    const res = await put('/api/weigh-ins/2026-10-13', { weight: '82.4' });
    expect(res.status).toBe(201);
    expect((await body<WeighInDto>(res)).weight).toBe(82.4);
  });

  test.each([{ weight: 19.99 }, { weight: 500.01 }, {}, { weight: 'abc' }])('answers %p with 400', async (dto) => {
    expect((await put('/api/weigh-ins/2026-10-13', dto)).status).toBe(400);
    expect((await list()).items).toEqual([]);
  });

  test.each(['2026-1-5', '2026-02-30', 'today'])('answers the date %p with 400', async (date) => {
    const res = await put(`/api/weigh-ins/${date}`, { weight: 82.4 });
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('Invalid date');
  });
});

describe('GET /api/weigh-ins/:date', () => {
  test("answers the date's weigh-in", async () => {
    await putWeighIn(put, '2026-10-13', 82.4);

    const res = await api('/api/weigh-ins/2026-10-13');
    expect(res.status).toBe(200);
    expect(await body<WeighInDto>(res)).toEqual({ measuredOn: '2026-10-13', weight: 82.4 });
  });

  test('answers a date without one with 404', async () => {
    const res = await api('/api/weigh-ins/2026-10-13');
    expect(res.status).toBe(404);
    expect((await body<ErrorDto>(res)).error).toBe('Weigh-in not found');
  });
});

describe('DELETE /api/weigh-ins/:date', () => {
  test('deletes the weigh-in, then answers 404', async () => {
    await putWeighIn(put, '2026-10-13', 82.4);

    expect((await del('/api/weigh-ins/2026-10-13')).status).toBe(204);
    expect((await list()).items).toEqual([]);
    expect((await del('/api/weigh-ins/2026-10-13')).status).toBe(404);
  });

  test('answers a malformed date with 400', async () => {
    expect((await del('/api/weigh-ins/2026-02-30')).status).toBe(400);
  });
});

describe('GET /api/weigh-ins', () => {
  test('lists from since on, oldest first', async () => {
    await putWeighIn(put, '2026-10-13', 82.4);
    await putWeighIn(put, '2026-10-01', 83.1);
    await putWeighIn(put, '2026-09-30', 83.5);
    await putWeighIn(put, '2026-10-05', 82.9);

    const answer = await list('?since=2026-10-01');
    expect(answer.since).toBe('2026-10-01');
    expect(answer.items.map((item) => item.measuredOn)).toEqual(['2026-10-01', '2026-10-05', '2026-10-13']);
  });

  test('lists everything without since', async () => {
    await putWeighIn(put, '2026-10-13', 82.4);
    await putWeighIn(put, '2025-01-01', 90);

    const answer = await list();
    expect(answer.since).toBeNull();
    expect(answer.items.map((item) => item.measuredOn)).toEqual(['2025-01-01', '2026-10-13']);
  });

  test('answers latest even when since leaves it out of items', async () => {
    await putWeighIn(put, '2026-09-01', 83.5);
    await putWeighIn(put, '2026-08-01', 84);

    const answer = await list('?since=2026-10-01');
    expect(answer.items).toEqual([]);
    expect(answer.latest).toEqual({ measuredOn: '2026-09-01', weight: 83.5 });
  });

  test('answers latest null with no weigh-ins', async () => {
    expect(await list()).toEqual({ since: null, items: [], latest: null });
  });

  test.each(['?since=bad', '?since=2026-02-30'])('answers %p with 400', async (query) => {
    const res = await api(`/api/weigh-ins${query}`);
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"since" must be a date in YYYY-MM-DD format');
  });
});
