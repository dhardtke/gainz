import { afterEach, beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, useDom, useFetch } from '../../testing.ts';
import { todayIso } from '../../ui/format.ts';
import type { CalendarMonthDto } from '../../../shared/dto/stats.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-stats.component.ts');
});

afterEach(() => {
  history.replaceState(null, '', '/');
});

function answer(month: string): void {
  const calendar: CalendarMonthDto = { month, days: [] };
  fake.respondTo(`GET /api/stats/calendar?month=${month}`, 200, JSON.stringify(calendar));
}

async function open(path: string): Promise<HTMLElement> {
  history.replaceState(null, '', path);
  const view = mount('gz-stats');
  await settle();
  return view;
}

test('loads the current month without ?month', async () => {
  const month = todayIso().slice(0, 7);
  answer(month);
  await open('/stats');
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/stats/calendar?month=${month}`]);
});

test('loads the month given in ?month', async () => {
  answer('2025-02');
  const view = await open('/stats?month=2025-02');
  expect(fake.requests.map((request) => request.url)).toEqual(['/api/stats/calendar?month=2025-02']);
  expect(find(shadow(find(shadow(view), testId('calendar'))), '[data-date="2025-02-28"]')).not.toBeNull();
});

test('falls back to the current month on an invalid one', async () => {
  const month = todayIso().slice(0, 7);
  answer(month);
  await open('/stats?month=2025-13');
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/stats/calendar?month=${month}`]);
});

test('navigates to the month a month-change names', async () => {
  answer('2025-02');
  answer('2025-01');
  const view = await open('/stats?month=2025-02');
  find<HTMLButtonElement>(shadow(find(shadow(view), testId('calendar'))), testId('previous')).click();
  expect(location.pathname + location.search).toBe('/stats?month=2025-01');
});
