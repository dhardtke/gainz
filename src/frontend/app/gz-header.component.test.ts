import { beforeAll, expect, test } from 'bun:test';
import { find, mount, shadow, useDom } from '../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-header.component.ts');
});

/**
 * Opens the narrow-screen menu as far as the header sees it: Oat is not loaded here, and happy-dom
 * has no ToggleEvent, so a plain event carries its `newState`.
 */
function open(root: ShadowRoot): void {
  find(root, 'menu[popover]').dispatchEvent(Object.assign(new Event('toggle'), { newState: 'open' }));
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
