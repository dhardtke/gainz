import { beforeAll, expect, test } from 'bun:test';
import { find, mount, shadow, useDom } from '../../../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-progress-marker.component.ts');
});

test.each([
  ['up', true],
  ['held', true],
  ['down', true],
  ['none', false],
])('renders %s, with an arrow: %p', (level, arrow) => {
  const marker = find<HTMLElement>(shadow(mount('gz-progress-marker', { level })), '.marker');
  expect(marker.dataset.level).toBe(level);
  expect(marker.querySelector('svg') !== null).toBe(arrow);
  expect(marker.getAttribute('aria-hidden')).toBe('true');
});

test('draws each arrow differently', () => {
  const arrows = ['up', 'held', 'down'].map((level) => find(shadow(mount('gz-progress-marker', { level })), 'svg').innerHTML);
  expect(new Set(arrows).size).toBe(3);
});

test.each<Record<string, string>>([{}, { level: 'sideways' }])('renders an unknown level (%o) as none', (attributes) => {
  expect(find<HTMLElement>(shadow(mount('gz-progress-marker', attributes)), '.marker').dataset.level).toBe('none');
});

test('follows a changed level', () => {
  const host = mount('gz-progress-marker', { level: 'up' });
  host.setAttribute('level', 'down');
  expect(find<HTMLElement>(shadow(host), '.marker').dataset.level).toBe('down');
});
