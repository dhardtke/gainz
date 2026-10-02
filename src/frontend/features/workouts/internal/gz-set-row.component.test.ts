import { beforeAll, expect, test } from 'bun:test';
import { collect, find, mount, settle, shadow, submit, useDom, useFetch } from '../../../testing.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import { set } from '../workouts.fixtures.ts';
import type { GzSetRowComponent } from './gz-set-row.component.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-set-row.component.ts');
});

function mountRow(value: LiftSetDto, { index = 1 }: { index?: number } = {}): GzSetRowComponent {
  const row = mount<GzSetRowComponent>('gz-set-row');
  row.index = index;
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
  expect(actions(row)).toEqual(['toggle-done', 'duplicate']);
});

test('offers every action on a set not done', () => {
  const row = mountRow(set({ id: 7 }));
  expect(actions(row)).toEqual(['toggle-done', 'edit', 'duplicate', 'delete']);
});

test('edits reps, weight and notes but not the exercise', async () => {
  const changed = collect('sets-changed');
  const row = mountRow(set({ id: 7, reps: 5, weight: 60, notes: 'Easy' }));
  find<HTMLButtonElement>(shadow(row), "[data-action='edit']").click();
  await settle();
  expect(shadow(row).querySelector('select')).toBeNull();
  find<HTMLInputElement>(shadow(row), "[name='reps']").value = '6';
  submit(find<HTMLFormElement>(shadow(row), "form[data-action='save']"));
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([{ reps: 6, weight: 60, notes: 'Easy' }]);
  expect(changed).toHaveLength(1);
});
