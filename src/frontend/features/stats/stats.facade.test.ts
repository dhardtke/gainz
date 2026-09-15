import { expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { statsFacade } from './stats.facade.ts';

const fetch = useFetch();

test('statsFacade.summary()', async () => {
  await statsFacade.summary();

  expect(fetch.requests).toMatchObject([{ method: 'GET', url: '/api/stats/summary' }]);
});
