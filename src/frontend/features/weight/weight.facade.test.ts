import { expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { weighInFacade } from './weight.facade.ts';

const fetch = useFetch();

test('weighInFacade.list()', async () => {
  await weighInFacade.list('2026-07-09');
  await weighInFacade.list(null);

  expect(fetch.requests).toMatchObject([
    { method: 'GET', url: '/api/weigh-ins?since=2026-07-09' },
    { method: 'GET', url: '/api/weigh-ins' },
  ]);
});

test('weighInFacade.get()', async () => {
  await weighInFacade.get('2026-10-13');

  expect(fetch.requests).toMatchObject([{ method: 'GET', url: '/api/weigh-ins/2026-10-13' }]);
});

test('weighInFacade.put()', async () => {
  await weighInFacade.put('2026-10-13', { weight: 82.4 });

  expect(fetch.requests).toMatchObject([{ method: 'PUT', url: '/api/weigh-ins/2026-10-13', body: { weight: 82.4 } }]);
});

test('weighInFacade.delete()', async () => {
  fetch.respondWith(204);
  await weighInFacade.delete('2026-10-13');

  expect(fetch.requests).toMatchObject([{ method: 'DELETE', url: '/api/weigh-ins/2026-10-13', body: undefined }]);
});
