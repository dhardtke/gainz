import { beforeAll, expect, test } from 'bun:test';
import { mount, text, useDom } from '../../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-tile.component.ts');
});

test('renders its label, value and hint', () => {
  const tile = mount('gz-tile', { label: 'Workouts', value: '12', hint: 'this month' });
  expect(text(tile, '.label')).toBe('Workouts');
  expect(text(tile, '.value')).toBe('12');
  expect(text(tile, '.hint')).toBe('this month');
});

test('shows a dash without a value', () => {
  expect(text(mount('gz-tile', { label: 'Workouts' }), '.value')).toBe('–');
});

test('leaves the hint out when it has none', () => {
  expect(mount('gz-tile', { label: 'Workouts', value: '12' }).shadowRoot?.querySelector('.hint')).toBeNull();
});

test('re-renders when an attribute changes', () => {
  const tile = mount('gz-tile', { label: 'Workouts', value: '12' });
  tile.setAttribute('value', '13');
  expect(text(tile, '.value')).toBe('13');
});

test('shows markup in its label as text', () => {
  const tile = mount('gz-tile', { label: '<b>bold</b>' });
  expect(text(tile, '.label')).toBe('<b>bold</b>');
  expect(tile.shadowRoot?.querySelector('b')).toBeNull();
});
