import { afterAll, afterEach, beforeAll, expect, setSystemTime, test } from 'bun:test';
import { find, mount, openDialog, settle, shadow, submit, testId, useDom, useFetch, useToasts } from '../../testing.ts';
import type { WeighInDto, WeighInListDto } from '../../../shared/dto/weight.ts';
import type { Iso8601Date } from '../../../shared/flavors.ts';
import { formatBodyWeight, formatShortDate } from '../../ui/format.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

// The default 90-day range, plus the 6 days before it the first average needs.
const SINCE = '2026-07-09';
const LIST_URL = `GET /api/weigh-ins?since=${SINCE}`;

beforeAll(async () => {
  setSystemTime(new Date(2026, 9, 13, 12));
  await import('./gz-weight.component.ts');
});

afterAll(() => {
  setSystemTime();
});

afterEach(() => {
  history.replaceState(null, '', '/');
});

function weighIn(measuredOn: Iso8601Date, weight: number): WeighInDto {
  return { measuredOn, weight };
}

function answer(items: WeighInDto[], latest: WeighInDto | null = items.at(-1) ?? null, request = LIST_URL): void {
  const since = /since=([\d-]+)/.exec(request)?.[1] ?? null;
  const list: WeighInListDto = { since, items, latest };
  fake.respondTo(request, 200, JSON.stringify(list));
}

async function open(path = '/weight'): Promise<ShadowRoot> {
  history.replaceState(null, '', path);
  const view = mount('gz-weight');
  await settle();
  return shadow(view);
}

function dates(root: ShadowRoot): (string | undefined)[] {
  return Array.from(root.querySelectorAll<HTMLElement>('gz-weigh-in-row')).map((row) => row.dataset.date);
}

function log(root: ShadowRoot, date: Iso8601Date, weight: string): void {
  find<HTMLInputElement>(root, testId('date')).value = date;
  find<HTMLInputElement>(root, testId('weight')).value = weight;
  submit(find(root, testId('log-form')));
}

test('shows the empty state without weigh-ins', async () => {
  answer([]);
  const root = await open();
  expect(find(root, testId('subtitle')).textContent).toBe('Log your first weigh-in to start the trend.');
  expect(find(root, testId('history-empty')).textContent).toBe('No weigh-ins yet. Log one above.');
  expect(find<HTMLInputElement>(root, testId('date')).value).toBe('2026-10-13');
});

test('lists the weigh-ins newest first and prefills the latest weight', async () => {
  answer([weighIn('2026-10-01', 83.1), weighIn('2026-10-05', 82.9), weighIn('2026-10-13', 82.4)]);
  const root = await open();
  expect(dates(root)).toEqual(['2026-10-13', '2026-10-05', '2026-10-01']);
  expect(find<HTMLInputElement>(root, testId('weight')).value).toBe('82.4');
});

test('logs a new date without asking', async () => {
  answer([weighIn('2026-10-12', 82.9)]);
  fake.respondTo('PUT /api/weigh-ins/2026-10-13', 201, JSON.stringify(weighIn('2026-10-13', 82.4)));
  const root = await open();
  log(root, '2026-10-13', '82.4');
  await settle();
  expect(document.body.querySelector('gz-confirm-dialog')).toBeNull();
  expect(fake.sent('PUT /api/weigh-ins/2026-10-13')).toEqual([{ weight: 82.4 }]);
  expect(toasts).toEqual(['Weigh-in logged']);
  expect(fake.sent(LIST_URL)).toHaveLength(2);
});

test('asks before replacing a logged date, and Cancel sends nothing', async () => {
  answer([weighIn('2026-10-12', 82.9)]);
  const root = await open();
  log(root, '2026-10-12', '82.4');
  await settle();
  const dialog = openDialog();
  expect(find(dialog, testId('title')).textContent).toBe('Replace weigh-in?');
  find<HTMLButtonElement>(dialog, testId('cancel')).click();
  await settle();
  expect(fake.sent('PUT /api/weigh-ins/2026-10-12')).toEqual([]);
});

test('replaces a logged date once confirmed', async () => {
  answer([weighIn('2026-10-12', 82.9)]);
  fake.respondTo('PUT /api/weigh-ins/2026-10-12', 200, JSON.stringify(weighIn('2026-10-12', 82.4)));
  const root = await open();
  log(root, '2026-10-12', '82.4');
  await settle();
  find<HTMLButtonElement>(openDialog(), testId('confirm')).click();
  await settle();
  expect(fake.sent('PUT /api/weigh-ins/2026-10-12')).toEqual([{ weight: 82.4 }]);
  expect(toasts).toEqual(['Weigh-in replaced']);
});

test('removes a deleted row', async () => {
  answer([weighIn('2026-10-12', 82.9), weighIn('2026-10-13', 82.4)]);
  fake.respondTo('DELETE /api/weigh-ins/2026-10-12', 204);
  const root = await open();
  find<HTMLButtonElement>(shadow(find(root, "gz-weigh-in-row[data-date='2026-10-12']")), testId('delete')).click();
  await settle();
  find<HTMLButtonElement>(openDialog(), testId('confirm')).click();
  await settle();
  expect(dates(root)).toEqual(['2026-10-13']);
  expect(fake.sent(LIST_URL)).toHaveLength(1);
});

test('shows a failed load', async () => {
  fake.respondTo(LIST_URL, 500, '{"error":"Database is locked"}');
  const root = await open();
  expect(find(root, testId('error')).textContent).toBe('Database is locked');
});

test('requests the 90-day range and the 6 days before it by default, and no since for all', async () => {
  answer([]);
  answer([], null, 'GET /api/weigh-ins');
  await open();
  await open('/weight?range=all');
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/weigh-ins?since=${SINCE}`, '/api/weigh-ins']);
});

test('switches the range in place, pushing it into the URL', async () => {
  answer([weighIn('2026-08-01', 84)]);
  answer([weighIn('2026-10-01', 83)], weighIn('2026-10-01', 83), 'GET /api/weigh-ins?since=2026-09-07');
  const root = await open();
  const view = document.body.querySelector('gz-weight');
  find<HTMLButtonElement>(root, testId('range-30d')).click();
  await settle();
  expect(location.pathname + location.search).toBe('/weight?range=30d');
  expect(document.body.querySelector('gz-weight')).toBe(view);
  expect(find(root, testId('range-30d')).getAttribute('aria-pressed')).toBe('true');
  expect(dates(root)).toEqual(['2026-10-01']);
});

test('keeps the range and its URL when the new one fails to load', async () => {
  answer([weighIn('2026-08-01', 84)]);
  fake.respondTo('GET /api/weigh-ins?since=2026-09-07', 500, '{"error":"Database is locked"}');
  const root = await open();
  find<HTMLButtonElement>(root, testId('range-30d')).click();
  await settle();
  expect(location.pathname + location.search).toBe('/weight');
  expect(toasts).toEqual(['Database is locked']);
  expect(dates(root)).toEqual(['2026-08-01']);
});

test('shows the latest weight and the change of the 7-day average over 30 days', async () => {
  answer([weighIn('2026-09-12', 83), weighIn('2026-09-13', 83.2), weighIn('2026-10-12', 82.5), weighIn('2026-10-13', 82.5)]);
  const root = await open();
  expect(find(root, testId('subtitle')).textContent).toBe(`${formatBodyWeight(82.5)} · ▼ ${formatBodyWeight(0.6)} in 30 days`);
});

test('shows the latest weigh-in and its date when the range holds none', async () => {
  answer([], weighIn('2026-06-01', 84));
  const root = await open();
  expect(find(root, testId('subtitle')).textContent).toBe(`${formatBodyWeight(84)} · ${formatShortDate('2026-06-01')}`);
  expect(find(root, testId('history-empty'))).not.toBeNull();
});

test('leaves the 6 extra days out of the history', async () => {
  answer([weighIn('2026-07-10', 85), weighIn('2026-07-15', 84.8), weighIn('2026-10-13', 82.4)]);
  const root = await open();
  expect(dates(root)).toEqual(['2026-10-13', '2026-07-15']);
});

test('asks the server about a date older than the loaded range, and replaces only what it finds', async () => {
  answer([weighIn('2026-10-13', 82.4)]);
  fake.respondTo('GET /api/weigh-ins/2026-07-01', 200, JSON.stringify(weighIn('2026-07-01', 86)));
  fake.respondTo('GET /api/weigh-ins/2026-06-30', 404, '{"error":"Weigh-in not found"}');
  const root = await open();

  log(root, '2026-07-01', '85.5');
  await settle();
  expect(find(openDialog(), testId('title')).textContent).toBe('Replace weigh-in?');
  find<HTMLButtonElement>(openDialog(), testId('cancel')).click();
  await settle();

  log(root, '2026-06-30', '85.5');
  await settle();
  expect(document.body.querySelector('gz-confirm-dialog')).toBeNull();
  expect(fake.sent('PUT /api/weigh-ins/2026-06-30')).toEqual([{ weight: 85.5 }]);
  expect(fake.sent('PUT /api/weigh-ins/2026-07-01')).toEqual([]);
});
