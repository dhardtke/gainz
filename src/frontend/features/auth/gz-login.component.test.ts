import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { find, mount, settle, shadow, submit, type, useDom, useFetch } from '../../testing.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-login.component.ts');
});

beforeEach(() => {
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":true}');
});

async function logIn(password: string): Promise<ShadowRoot> {
  const root = shadow(mount('gz-login'));
  await settle();
  type(find<HTMLInputElement>(root, 'input[name="password"]'), password);
  submit(find(root, 'form'));
  await settle();
  return root;
}

function alertText(root: ShadowRoot): string | null {
  const alert = find<HTMLElement>(root, '[role="alert"]');
  return alert.hidden === true ? null : alert.textContent;
}

test('posts the password and goes to next', async () => {
  history.replaceState(null, '', '/login?next=%2Fworkouts%2F12');
  fake.respondTo('POST /api/auth/login', 204);

  const root = await logIn('pw');

  expect(fake.sent('POST /api/auth/login')).toEqual([{ password: 'pw' }]);
  expect(location.pathname).toBe('/workouts/12');
  expect(alertText(root)).toBeNull();
});

test('a wrong password says so and stays', async () => {
  history.replaceState(null, '', '/login');
  fake.respondTo('POST /api/auth/login', 401, '{"error":"Wrong password"}');

  const root = await logIn('nope');

  expect(alertText(root)).toBe('Wrong password.');
  expect(location.pathname).toBe('/login');
});

test("a lockout shows the server's message", async () => {
  history.replaceState(null, '', '/login');
  fake.respondTo('POST /api/auth/login', 429, '{"error":"Too many failed logins; try again in 60 s"}');

  const root = await logIn('pw');

  expect(alertText(root)).toBe('Too many failed logins; try again in 60 s');
});

test('without a login on the server, goes straight to next', async () => {
  history.replaceState(null, '', '/login?next=%2Fworkouts%2F12');
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":false}');

  mount('gz-login');
  await settle();

  expect(location.pathname).toBe('/workouts/12');
  expect(fake.sent('POST /api/auth/login')).toEqual([]);
});
