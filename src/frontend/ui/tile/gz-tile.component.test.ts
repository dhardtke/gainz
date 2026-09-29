import { beforeAll, expect, test } from 'bun:test';
import { useDom } from '../../testing.ts';

useDom();

beforeAll(async () => {
  await import('./gz-tile.component.ts');
});

/**
 * Mounts a tile. The attributes are set before it is appended, so its first render shows
 * them: happy-dom skips attributeChangedCallback for attributes present at upgrade.
 */
function mount(attributes: Record<string, string>): HTMLElement {
  const tile = document.createElement('gz-tile');
  for (const [name, value] of Object.entries(attributes)) {
    tile.setAttribute(name, value);
  }
  document.body.append(tile);
  return tile;
}

function text(tile: HTMLElement, selector: string): string | undefined {
  return tile.shadowRoot?.querySelector(selector)?.textContent;
}

test('renders its label, value and hint', () => {
  const tile = mount({ label: 'Workouts', value: '12', hint: 'this month' });
  expect(text(tile, '.label')).toBe('Workouts');
  expect(text(tile, '.value')).toBe('12');
  expect(text(tile, '.hint')).toBe('this month');
});

test('shows a dash without a value', () => {
  expect(text(mount({ label: 'Workouts' }), '.value')).toBe('–');
});

test('leaves the hint out when it has none', () => {
  expect(mount({ label: 'Workouts', value: '12' }).shadowRoot?.querySelector('.hint')).toBeNull();
});

test('re-renders when an attribute changes', () => {
  const tile = mount({ label: 'Workouts', value: '12' });
  tile.setAttribute('value', '13');
  expect(text(tile, '.value')).toBe('13');
});

test('shows markup in its label as text', () => {
  const tile = mount({ label: '<b>bold</b>' });
  expect(text(tile, '.label')).toBe('<b>bold</b>');
  expect(tile.shadowRoot?.querySelector('b')).toBeNull();
});
