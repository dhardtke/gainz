import { beforeAll, expect, test } from 'bun:test';
import { choose, collect, find, mount, openDialog, settle, shadow, submit, testId, useDom, useFetch, useToasts } from '../../../testing.ts';
import { formatDate } from '../../../ui/format.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

const IMPORT = 'POST /api/weigh-ins/import';

const EXPORT = [
  'Time,Family Members,WEIGHT (kg),BMI',
  '2026-10-13 09:06:07,eufy,72.85,23.2',
  '2026-10-12 09:08:31,eufy,72.65,23.1',
  '2026-10-12 07:00:00,eufy,73.1,23.3',
  '2026-10-12 16:02:04,luki,4.05,0',
].join('\n');

beforeAll(async () => {
  await import('./gz-weigh-in-import.component.ts');
});

async function chooseFile(contents: string): Promise<ShadowRoot> {
  const root = shadow(mount('gz-weigh-in-import'));
  const input = find<HTMLInputElement>(root, testId('import-file'));
  Object.defineProperty(input, 'files', { value: [new File([contents], 'weight.csv', { type: 'text/csv' })], configurable: true });
  input.dispatchEvent(new Event('change', { bubbles: true }));
  await settle();
  return root;
}

function importButton(root: ShadowRoot): HTMLButtonElement {
  return find<HTMLButtonElement>(root, testId('import'));
}

test('disables Import until a file is read', () => {
  const root = shadow(mount('gz-weigh-in-import'));
  expect(importButton(root).disabled).toBe(true);
  expect(find<HTMLElement>(root, '.member').hidden).toBe(true);
});

test('offers each family member and summarizes the chosen one', async () => {
  const root = await chooseFile(EXPORT);
  expect(find<HTMLElement>(root, '.member').hidden).toBe(false);
  const select = find<HTMLSelectElement>(root, testId('import-member'));
  expect(Array.from(select.options, (option) => option.textContent)).toEqual(['eufy · 2 weigh-ins', 'luki · 1 weigh-in']);
  expect(find(root, testId('import-summary')).textContent).toBe(`2 weigh-ins · ${formatDate('2026-10-12')} – ${formatDate('2026-10-13')}`);
  choose(select, 'luki');
  expect(find(root, testId('import-summary')).textContent).toBe(`1 weigh-in · ${formatDate('2026-10-12')} – ${formatDate('2026-10-12')}`);
  expect(importButton(root).disabled).toBe(false);
});

test("imports the chosen member's weigh-ins once confirmed", async () => {
  fake.respondTo(IMPORT, 200, JSON.stringify({ created: 1, replaced: 1 }));
  const imported = collect('weigh-ins-imported');
  const root = await chooseFile(EXPORT);
  submit(find(root, testId('import-form')));
  await settle();
  const dialog = openDialog();
  expect(find(dialog, testId('title')).textContent).toBe('Import 2 weigh-ins?');
  find<HTMLButtonElement>(dialog, testId('confirm')).click();
  await settle();
  expect(fake.sent(IMPORT)).toEqual([
    {
      items: [
        { measuredOn: '2026-10-12', weight: 72.65 },
        { measuredOn: '2026-10-13', weight: 72.85 },
      ],
    },
  ]);
  expect(toasts).toEqual(['Imported 2 weigh-ins, 1 replaced']);
  expect(imported).toHaveLength(1);
  expect(importButton(root).disabled).toBe(true);
});

test('sends nothing when the import is cancelled', async () => {
  const root = await chooseFile(EXPORT);
  submit(find(root, testId('import-form')));
  await settle();
  find<HTMLButtonElement>(openDialog(), testId('cancel')).click();
  await settle();
  expect(fake.sent(IMPORT)).toEqual([]);
});

test('shows why a file cannot be imported', async () => {
  const root = await chooseFile('Date,Weight\n2026-10-12,82.4');
  expect(find(root, testId('import-error')).textContent).toBe('Not a EufyLife export: it has no "Time" and "WEIGHT (kg)" columns.');
  expect(importButton(root).disabled).toBe(true);
});

test('says when the file holds no weigh-ins', async () => {
  const root = await chooseFile('Time,WEIGHT (kg)\n');
  expect(find(root, testId('import-error')).textContent).toBe('The file holds no weigh-ins.');
});

test('toasts a failed import and keeps the file', async () => {
  fake.respondTo(IMPORT, 400, '{"error":"\\"items[0].weight\\" on 2026-10-12 must be a number between 20 and 500"}');
  const imported = collect('weigh-ins-imported');
  const root = await chooseFile(EXPORT);
  choose(find<HTMLSelectElement>(root, testId('import-member')), 'luki');
  submit(find(root, testId('import-form')));
  await settle();
  find<HTMLButtonElement>(openDialog(), testId('confirm')).click();
  await settle();
  expect(toasts).toEqual(['"items[0].weight" on 2026-10-12 must be a number between 20 and 500']);
  expect(imported).toEqual([]);
  expect(importButton(root).disabled).toBe(false);
});
