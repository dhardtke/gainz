import { afterEach, beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, useDom, useFetch } from '../../testing.ts';
import { todayIso } from '../../ui/format.ts';
import type { CalendarMonthDto, RecentExerciseDto, RecentExercisesDto } from '../../../shared/dto/stats.ts';
import { daysBefore, RECENT_DAYS } from './internal/dates.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-stats.component.ts');
});

afterEach(() => {
  history.replaceState(null, '', '/');
});

const since = daysBefore(todayIso(), RECENT_DAYS);
const recentUrl = `/api/stats/exercises?since=${since}`;

function answer(month: string, exercises: RecentExerciseDto[] = []): void {
  const calendar: CalendarMonthDto = { month, days: [] };
  const recent: RecentExercisesDto = { since, exercises };
  fake.respondTo(`GET /api/stats/calendar?month=${month}`, 200, JSON.stringify(calendar));
  fake.respondTo(`GET ${recentUrl}`, 200, JSON.stringify(recent));
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
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/stats/calendar?month=${month}`, recentUrl]);
});

test('loads the month given in ?month', async () => {
  answer('2025-02');
  const view = await open('/stats?month=2025-02');
  expect(fake.requests.map((request) => request.url)).toEqual(['/api/stats/calendar?month=2025-02', recentUrl]);
  expect(find(shadow(find(shadow(view), testId('calendar'))), '[data-date="2025-02-28"]')).not.toBeNull();
});

test('falls back to the current month on an invalid one', async () => {
  const month = todayIso().slice(0, 7);
  answer(month);
  await open('/stats?month=2025-13');
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/stats/calendar?month=${month}`, recentUrl]);
});

test('navigates to the month a month-change names', async () => {
  answer('2025-02');
  answer('2025-01');
  const view = await open('/stats?month=2025-02');
  find<HTMLButtonElement>(shadow(find(shadow(view), testId('calendar'))), testId('previous')).click();
  expect(location.pathname + location.search).toBe('/stats?month=2025-01');
});

test('lists the recent exercises below the calendar', async () => {
  answer('2025-02', [
    { id: 3, name: 'Squat', bodyweight: false, progression: null, sessions: [{ workoutId: 9, performedOn: since, reps: 5, volume: 500, progression: null }] },
  ]);
  const view = await open('/stats?month=2025-02');
  const progress = find(shadow(view), testId('progress'));
  expect(find<HTMLElement>(shadow(progress), testId('exercise')).dataset.id).toBe('3');
});
