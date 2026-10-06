import { beforeAll, beforeEach, expect, test } from 'bun:test';
import { find, mount, settle, submit, type, useDom, useFetch } from '../../testing.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-login.component.ts');
});

beforeEach(() => {
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":true}');
});

async function logIn(password: string): Promise<HTMLElement> {
  const view = mount('gz-login');
  await settle();
  type(find<HTMLInputElement>(view, 'input[name="password"]'), password);
  submit(find(view, 'form'));
  await settle();
  return view;
}

function alertText(view: HTMLElement): string | null {
  const alert = find<HTMLElement>(view, '[role="alert"]');
  return alert.hidden === true ? null : alert.textContent;
}

test('has the form in the light DOM as soon as it connects, where password managers search', async () => {
  history.replaceState(null, '', '/login');
  mount('gz-login');

  expect(document.querySelector('gz-login > form input[type="password"]')).not.toBeNull();
  await settle();
});

test('posts the password and goes to next', async () => {
  history.replaceState(null, '', '/login?next=%2Fworkouts%2F12');
  fake.respondTo('POST /api/auth/login', 204);

  const view = await logIn('pw');

  expect(fake.sent('POST /api/auth/login')).toEqual([{ password: 'pw' }]);
  expect(location.pathname).toBe('/workouts/12');
  expect(alertText(view)).toBeNull();
});

test('a wrong password says so and stays', async () => {
  history.replaceState(null, '', '/login');
  fake.respondTo('POST /api/auth/login', 401, '{"error":"Wrong password"}');

  const view = await logIn('nope');

  expect(alertText(view)).toBe('Wrong password.');
  expect(location.pathname).toBe('/login');
});

test("a lockout shows the server's message", async () => {
  history.replaceState(null, '', '/login');
  fake.respondTo('POST /api/auth/login', 429, '{"error":"Too many failed logins; try again in 60 s"}');

  const view = await logIn('pw');

  expect(alertText(view)).toBe('Too many failed logins; try again in 60 s');
});

test('without a login on the server, goes straight to next', async () => {
  history.replaceState(null, '', '/login?next=%2Fworkouts%2F12');
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":false}');

  mount('gz-login');
  await settle();

  expect(location.pathname).toBe('/workouts/12');
  expect(fake.sent('POST /api/auth/login')).toEqual([]);
});
