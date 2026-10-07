import { beforeAll, expect, test } from 'bun:test';
import { collect, find, mount, settle, shadow, testId, useDom, useFetch } from '../../../testing.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import { set } from '../workouts.fixtures.ts';
import type { GzSetRowComponent } from './gz-set-row.component.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-set-row.component.ts');
});

function mountRow(value: LiftSetDto, { index = 1, locked = false }: { index?: number; locked?: boolean } = {}): GzSetRowComponent {
  const row = mount<GzSetRowComponent>('gz-set-row');
  row.index = index;
  row.locked = locked;
  row.set = value;
  return row;
}

function toggle(row: HTMLElement): HTMLButtonElement {
  return find<HTMLButtonElement>(shadow(row), testId('toggle-done'));
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

test('freezes a done set: its fields and × stay visible but disabled', () => {
  const row = mountRow(set({ id: 7, done: true }));
  expect(actions(row)).toEqual(['toggle-done', 'duplicate', 'delete']);
  const fields = Array.from(shadow(row).querySelectorAll<HTMLInputElement>('input'));
  expect(fields.map(({ name, disabled }) => [name, disabled])).toEqual([
    ['weight', true],
    ['reps', true],
    ['notes', true],
  ]);
  expect(find<HTMLButtonElement>(shadow(row), testId('delete')).disabled).toBe(true);
  expect(toggle(row).disabled).toBe(false);
  expect(find<HTMLButtonElement>(shadow(row), testId('duplicate')).disabled).toBe(false);
});

test('locks every control of a row, for a set not done and for a done one', () => {
  for (const done of [false, true]) {
    const root = shadow(mountRow(set({ id: 7, done }), { locked: true }));
    const controls = ['toggle-done', 'weight', 'reps', 'notes', 'duplicate', 'delete'].map((id) => find<HTMLButtonElement>(root, testId(id)));
    expect(controls.map((control) => control.disabled)).toEqual([true, true, true, true, true, true]);
  }
});

test('marks the row of a done set, and only that one, as done', () => {
  expect(find(shadow(mountRow(set({ id: 7, done: true }))), testId('row')).classList.contains('done')).toBe(true);
  expect(find(shadow(mountRow(set({ id: 8 }))), testId('row')).classList.contains('done')).toBe(false);
});

test('offers every action on a set not done, and no Edit button', () => {
  const row = mountRow(set({ id: 7 }));
  expect(actions(row)).toEqual(['toggle-done', 'duplicate', 'delete']);
  expect(find<HTMLButtonElement>(shadow(row), testId('delete')).disabled).toBe(false);
});

test('leaves the exercise to its group: no name, no link', () => {
  const row = mountRow(set({ id: 7, exerciseId: 4, exerciseName: 'Bench Press' }));
  expect(shadow(row).querySelector("a[href^='/exercises/']")).toBeNull();
  expect(shadow(row).textContent).not.toContain('Bench Press');
});

function input(row: HTMLElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(shadow(row), testId(name));
}

function change(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

test('shows a set not done as inputs for reps, weight and notes, but not the exercise', () => {
  const row = mountRow(set({ id: 7, reps: 5, weight: 60, notes: 'Easy' }));
  expect([input(row, 'reps').value, input(row, 'weight').value, input(row, 'notes').value]).toEqual(['5', '60', 'Easy']);
  expect(shadow(row).querySelector('select')).toBeNull();
});

test('saves a committed change, sending only the field that differs', async () => {
  const changed = collect('sets-changed');
  const row = mountRow(set({ id: 7, reps: 5, weight: 60, notes: 'Easy' }));
  change(input(row, 'reps'), '6');
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([{ reps: 6 }]);
  expect(changed).toHaveLength(1);
});

test('has no save button', () => {
  const row = mountRow(set({ id: 7 }));
  expect(shadow(row).querySelector("[type='submit']")).toBeNull();
});

test('saves on Enter, once, even when the change is committed too', async () => {
  const row = mountRow(set({ id: 7, weight: 60 }));
  const weight = input(row, 'weight');
  weight.value = '62.5';
  weight.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  weight.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([{ weight: 62.5 }]);
});

test('saves nothing when nothing differs', async () => {
  const changed = collect('sets-changed');
  const row = mountRow(set({ id: 7, notes: null }));
  change(input(row, 'notes'), '  ');
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([]);
  expect(changed).toHaveLength(0);
});

test('saves nothing while a field is invalid', async () => {
  const row = mountRow(set({ id: 7 }));
  change(input(row, 'reps'), '');
  await settle();
  expect(fake.sent('PATCH /api/sets/7')).toEqual([]);
});

test('saves a pending change before marking the set done', async () => {
  const row = mountRow(set({ id: 7, reps: 5 }));
  change(input(row, 'reps'), '8');
  toggle(row).click();
  await settle();
  expect(fake.requests.map(({ body }) => body)).toEqual([{ reps: 8 }, { done: true }]);
});

test('hands back the focused field and what it holds', () => {
  const row = mountRow(set({ id: 7, weight: 60 }));
  input(row, 'weight').focus();
  input(row, 'weight').value = '70';
  expect(row.focusedField()).toEqual({ name: 'weight', value: '70' });
  const next = mountRow(set({ id: 7, weight: 60 }));
  next.restoreField({ name: 'weight', value: '70' });
  expect(shadow(next).activeElement).toBe(input(next, 'weight'));
  expect(input(next, 'weight').value).toBe('70');
});
