import { beforeAll, expect, test } from 'bun:test';
import { collect, find, mount, settle, shadow, useDom, useFetch } from '../../../testing.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import { set } from '../workouts.fixtures.ts';
import type { GzSetRowComponent } from './gz-set-row.component.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-set-row.component.ts');
});

function mountRow(value: LiftSetDto, { index = 1, last = false }: { index?: number; last?: boolean } = {}): GzSetRowComponent {
  const row = mount<GzSetRowComponent>('gz-set-row');
  row.index = index;
  row.last = last;
  row.set = value;
  return row;
}

function toggle(row: HTMLElement): HTMLButtonElement {
  return find<HTMLButtonElement>(shadow(row), "[data-action='toggle-done']");
}

test('offers a set not done as an outlined, unpressed toggle', () => {
  const row = mountRow(set({ id: 7 }));
  expect(toggle(row).getAttribute('aria-pressed')).toBe('false');
  expect(toggle(row).classList.contains('outline')).toBe(true);
});

test('marks a set done and emits sets-changed', async () => {
  const changed = collect('sets-changed');
  const row = mountRow(set({ id: 7 }));
  toggle(row).click();
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([{ done: true }]);
  expect(changed).toHaveLength(1);
});

test('marks a done set as not done', async () => {
  const row = mountRow(set({ id: 7, done: true }));
  expect(toggle(row).getAttribute('aria-pressed')).toBe('true');
  expect(toggle(row).classList.contains('outline')).toBe(false);
  toggle(row).click();
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([{ done: false }]);
});

function actions(row: HTMLElement): (string | undefined)[] {
  return Array.from(shadow(row).querySelectorAll<HTMLElement>('[data-action]')).map((element) => element.dataset.action);
}

test('freezes a done set: only the toggle and +1 remain', () => {
  const row = mountRow(set({ id: 7, done: true }));
  expect(actions(row)).toEqual(['toggle-done', 'move-up', 'move-down', 'duplicate']);
});

test('offers every action on a set not done', () => {
  const row = mountRow(set({ id: 7 }));
  expect(actions(row)).toEqual(['toggle-done', 'move-up', 'move-down', 'edit', 'duplicate', 'delete']);
});

function arrow(row: HTMLElement, direction: 'up' | 'down'): HTMLButtonElement {
  return find<HTMLButtonElement>(shadow(row), `[data-action='move-${direction}']`);
}

test('disables ▲ on the first row and ▼ on the last', () => {
  const first = mountRow(set({ id: 7 }), { index: 1 });
  expect([arrow(first, 'up').disabled, arrow(first, 'down').disabled]).toEqual([true, false]);

  const middle = mountRow(set({ id: 8 }), { index: 2 });
  expect([arrow(middle, 'up').disabled, arrow(middle, 'down').disabled]).toEqual([false, false]);

  const last = mountRow(set({ id: 9 }), { index: 3, last: true });
  expect([arrow(last, 'up').disabled, arrow(last, 'down').disabled]).toEqual([false, true]);
});

test('moves a set down and emits set-moved rather than sets-changed', async () => {
  const moved = collect('set-moved');
  const changed = collect('sets-changed');
  const row = mountRow(set({ id: 7 }), { index: 2 });
  arrow(row, 'down').click();
  await settle();
  expect(fake.sent('POST /api/sets/7/move')).toEqual([{ direction: 'down' }]);
  expect(moved).toEqual([{ id: 7, direction: 'down' }]);
  expect(changed).toEqual([]);
});

test('moves a done set', async () => {
  const row = mountRow(set({ id: 7, done: true }), { index: 2 });
  arrow(row, 'up').click();
  await settle();
  expect(fake.sent('POST /api/sets/7/move')).toEqual([{ direction: 'up' }]);
});

test('focuses the arrow that moved the set, or the other one at an edge', () => {
  const first = mountRow(set({ id: 7 }), { index: 1 });
  first.focusMove('up');
  expect(shadow(first).activeElement).toBe(arrow(first, 'down'));

  const middle = mountRow(set({ id: 8 }), { index: 2 });
  middle.focusMove('down');
  expect(shadow(middle).activeElement).toBe(arrow(middle, 'down'));
});
