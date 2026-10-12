import { beforeAll, expect, test } from 'bun:test';
import { find, mount, shadow, useDom } from '../../../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-progress-marker.component.ts');
});

test.each([
  ['up', '▲'],
  ['held', '■'],
  ['down', '▼'],
  ['none', ''],
])('renders %s as %p', (level, icon) => {
  const marker = find<HTMLElement>(shadow(mount('gz-progress-marker', { level })), '.marker');
  expect(marker.dataset.level).toBe(level);
  expect(marker.textContent).toBe(icon);
  expect(marker.getAttribute('aria-hidden')).toBe('true');
});

test.each<Record<string, string>>([{}, { level: 'sideways' }])('renders an unknown level (%o) as none', (attributes) => {
  expect(find<HTMLElement>(shadow(mount('gz-progress-marker', attributes)), '.marker').dataset.level).toBe('none');
});

test('follows a changed level', () => {
  const host = mount('gz-progress-marker', { level: 'up' });
  host.setAttribute('level', 'down');
  expect(find<HTMLElement>(shadow(host), '.marker').dataset.level).toBe('down');
});
