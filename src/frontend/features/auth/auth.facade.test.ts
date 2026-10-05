import { expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { authFacade } from './auth.facade.ts';

const fetch = useFetch();

test('authFacade.enabled()', async () => {
  fetch.respondWith(200, '{"enabled":true}');

  expect(await authFacade.enabled()).toBe(true);
  expect(fetch.requests).toMatchObject([{ method: 'GET', url: '/api/auth/status' }]);
});

test('authFacade.login()', async () => {
  await authFacade.login('pw');

  expect(fetch.requests).toMatchObject([{ method: 'POST', url: '/api/auth/login', body: { password: 'pw' } }]);
});

test('authFacade.logout()', async () => {
  await authFacade.logout();

  expect(fetch.requests).toMatchObject([{ method: 'POST', url: '/api/auth/logout' }]);
});
