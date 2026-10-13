import { expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { statsFacade } from './stats.facade.ts';

const fetch = useFetch();

test('statsFacade.summary()', async () => {
  await statsFacade.summary('2026-09-12');

  expect(fetch.requests).toMatchObject([{ method: 'GET', url: '/api/stats/summary?since=2026-09-12' }]);
});

test('statsFacade.calendar()', async () => {
  await statsFacade.calendar('2026-10');

  expect(fetch.requests).toMatchObject([{ method: 'GET', url: '/api/stats/calendar?month=2026-10' }]);
});

test('statsFacade.recentExercises()', async () => {
  await statsFacade.recentExercises('2026-09-12');

  expect(fetch.requests).toMatchObject([{ method: 'GET', url: '/api/stats/exercises?since=2026-09-12' }]);
});
