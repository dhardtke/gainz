import { beforeAll, expect, test } from 'bun:test';
import { collect, find, mount, openDialog, settle, shadow, testId, useDom, useFetch, useToasts } from '../../../testing.ts';
import type { WeighInDto } from '../../../../shared/dto/weight.ts';
import { formatBodyWeight } from '../../../ui/format.ts';
import type { GzWeighInRowComponent } from './gz-weigh-in-row.component.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-weigh-in-row.component.ts');
});

const URL = 'PUT /api/weigh-ins/2026-10-13';

function mountRow(weight = 82.4): GzWeighInRowComponent {
  const row = mount<GzWeighInRowComponent>('gz-weigh-in-row');
  row.weighIn = { measuredOn: '2026-10-13', weight };
  return row;
}

function input(row: HTMLElement): HTMLInputElement {
  return find<HTMLInputElement>(shadow(row), testId('weight'));
}

function change(field: HTMLInputElement, value: string): void {
  field.value = value;
  field.dispatchEvent(new Event('change', { bubbles: true }));
}

test('saves a changed weight and emits the answered weigh-in', async () => {
  const saved = collect('weigh-in-saved');
  const answered: WeighInDto = { measuredOn: '2026-10-13', weight: 81.9 };
  fake.respondTo(URL, 200, JSON.stringify(answered));
  const row = mountRow();
  change(input(row), '81.9');
  await settle();
  expect(fake.sent(URL)).toEqual([{ weight: 81.9 }]);
  expect(saved).toEqual([answered]);
});

function isWeighIn(value: unknown): value is WeighInDto {
  return typeof value === 'object' && value !== null && 'measuredOn' in value;
}

test('keeps its input when handed back the weigh-in it saved', async () => {
  const saved = collect('weigh-in-saved');
  fake.respondTo(URL, 200, JSON.stringify({ measuredOn: '2026-10-13', weight: 81.9 }));
  const row = mountRow();
  const field = input(row);
  change(field, '81.9');
  await settle();
  const [emitted] = saved;
  if (!isWeighIn(emitted)) {
    throw new Error('no weigh-in emitted');
  }
  row.weighIn = emitted;
  expect(input(row)).toBe(field);
});

test.each(['82.4', '', '19', '501'])('sends nothing for %p', async (value) => {
  const row = mountRow();
  change(input(row), value);
  await settle();
  expect(fake.requests).toEqual([]);
});

test('saves on Enter, once, even when the change is committed too', async () => {
  fake.respondTo(URL, 200, JSON.stringify({ measuredOn: '2026-10-13', weight: 83 }));
  const row = mountRow();
  const weight = input(row);
  weight.value = '83';
  weight.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  weight.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  expect(fake.sent(URL)).toEqual([{ weight: 83 }]);
});

test('toasts a failed save and emits nothing', async () => {
  const saved = collect('weigh-in-saved');
  fake.respondTo(URL, 400, '{"error":"\\"weight\\" must be between 20 and 500"}');
  const row = mountRow();
  change(input(row), '83');
  await settle();
  expect(toasts).toEqual(['"weight" must be between 20 and 500']);
  expect(saved).toEqual([]);
});

test('names the date in the delete button', () => {
  expect(find(shadow(mountRow()), testId('delete')).getAttribute('aria-label')).toMatch(/^Delete .+'s weigh-in$/);
});

test('deletes once confirmed and emits the date', async () => {
  const deleted = collect('weigh-in-deleted');
  fake.respondTo('DELETE /api/weigh-ins/2026-10-13', 204);
  const row = mountRow();
  find<HTMLButtonElement>(shadow(row), testId('delete')).click();
  await settle();
  const dialog = openDialog();
  expect(find(dialog, testId('title')).textContent).toBe('Delete weigh-in?');
  expect(find(dialog, testId('message')).textContent).toEndWith(` · ${formatBodyWeight(82.4)}`);
  find<HTMLButtonElement>(dialog, testId('confirm')).click();
  await settle();
  expect(fake.sent('DELETE /api/weigh-ins/2026-10-13')).toEqual([undefined]);
  expect(deleted).toEqual(['2026-10-13']);
});

test('sends nothing when the delete is cancelled', async () => {
  const deleted = collect('weigh-in-deleted');
  const row = mountRow();
  find<HTMLButtonElement>(shadow(row), testId('delete')).click();
  await settle();
  find<HTMLButtonElement>(openDialog(), testId('cancel')).click();
  await settle();
  expect(fake.requests).toEqual([]);
  expect(deleted).toEqual([]);
});

test('hands back the focused field and what it holds', () => {
  const row = mountRow();
  input(row).focus();
  input(row).value = '81';
  expect(row.focusedField()).toEqual({ name: 'weight', value: '81' });
  const next = mountRow();
  next.restoreField({ name: 'weight', value: '81' });
  expect(shadow(next).activeElement).toBe(input(next));
  expect(input(next).value).toBe('81');
});
