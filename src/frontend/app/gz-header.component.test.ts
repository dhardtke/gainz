import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, useDom, useFetch } from '../testing.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-header.component.ts');
});

/**
 * Opens the narrow-screen menu as far as the header sees it: Oat is not loaded here, and happy-dom
 * has no ToggleEvent, so a plain event carries its `newState`.
 */
function open(root: ShadowRoot): void {
  find(root, testId('menu')).dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
}

test('focuses the menu item of the current page when the menu opens', () => {
  history.replaceState(null, '', '/workouts');
  const root = shadow(mount('gz-header'));
  open(root);
  expect(root.activeElement?.textContent).toBe('Workouts');
});

test('leaves focus alone when no menu item is the current page', () => {
  history.replaceState(null, '', '/nowhere');
  const root = shadow(mount('gz-header'));
  open(root);
  expect(root.activeElement).toBeNull();
});

test('shows only the brand and the theme toggle on the login page', () => {
  history.replaceState(null, '', '/login');
  expect(find(shadow(mount('gz-header')), testId('nav')).classList.contains('login')).toBe(true);
});

test('elsewhere, ends both link lists with Log out, shown while the server asks for a login', async () => {
  history.replaceState(null, '', '/workouts');
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":true}');
  const root = shadow(mount('gz-header'));
  await settle();
  expect(find(root, testId('nav')).classList.contains('login')).toBe(false);
  expect(find(root, testId('nav')).classList.contains('auth')).toBe(true);
  expect(find(root, testId('links')).lastElementChild?.textContent).toBe('Log out');
  expect(find(root, testId('menu')).lastElementChild?.textContent).toBe('Log out');
});

test('hides Log out while the server asks for no login', async () => {
  history.replaceState(null, '', '/workouts');
  fake.respondTo('GET /api/auth/status', 200, '{"enabled":false}');
  const root = shadow(mount('gz-header'));
  await settle();
  expect(fake.requests.map((request) => request.url)).toContain('/api/auth/status');
  expect(find(root, testId('nav')).classList.contains('auth')).toBe(false);
});

test.each(['links-logout', 'menu-logout'])('Log out from %s logs out and lands on the login page', async (id) => {
  history.replaceState(null, '', '/workouts');
  fake.respondTo('POST /api/auth/logout', 204);
  const root = shadow(mount('gz-header'));
  find<HTMLAnchorElement>(root, testId(id)).click();
  await settle();
  expect(fake.sent('POST /api/auth/logout')).toHaveLength(1);
  expect(location.pathname).toBe('/login');
});
