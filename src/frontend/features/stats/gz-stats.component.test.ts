import { afterAll, afterEach, beforeAll, expect, setSystemTime, test } from 'bun:test';
import { find, mount, settle, shadow, testId, useDom, useFetch, useToasts } from '../../testing.ts';
import type { CalendarMonthDto, RecentExerciseDto, RecentExercisesDto } from '../../../shared/dto/stats.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

const MONTH = '2026-10';
const SINCE = '2026-09-13';
const RECENT_URL = `/api/stats/exercises?since=${SINCE}`;

beforeAll(async () => {
  // Pinned, so a run across local midnight requests the same since.
  setSystemTime(new Date(2026, 9, 13, 12));
  await import('./gz-stats.component.ts');
});

afterAll(() => {
  setSystemTime();
});

afterEach(() => {
  history.replaceState(null, '', '/');
});

function answerMonth(month: string): void {
  const calendar: CalendarMonthDto = { month, days: [] };
  fake.respondTo(`GET /api/stats/calendar?month=${month}`, 200, JSON.stringify(calendar));
}

function answer(month: string, exercises: RecentExerciseDto[] = []): void {
  const recent: RecentExercisesDto = { since: SINCE, exercises };
  answerMonth(month);
  fake.respondTo(`GET ${RECENT_URL}`, 200, JSON.stringify(recent));
}

async function open(path: string): Promise<HTMLElement> {
  history.replaceState(null, '', path);
  const view = mount('gz-stats');
  await settle();
  return view;
}

function calendarOf(view: HTMLElement): ShadowRoot {
  return shadow(find(shadow(view), testId('calendar')));
}

test('loads the current month without ?month', async () => {
  answer(MONTH);
  await open('/stats');
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/stats/calendar?month=${MONTH}`, RECENT_URL]);
});

test('loads the month given in ?month', async () => {
  answer('2025-02');
  const view = await open('/stats?month=2025-02');
  expect(fake.requests.map((request) => request.url)).toEqual(['/api/stats/calendar?month=2025-02', RECENT_URL]);
  expect(find(calendarOf(view), '[data-date="2025-02-28"]')).not.toBeNull();
});

test('falls back to the current month on an invalid one', async () => {
  answer(MONTH);
  await open('/stats?month=2025-13');
  expect(fake.requests.map((request) => request.url)).toEqual([`/api/stats/calendar?month=${MONTH}`, RECENT_URL]);
});

test('shows the month a month-change names in place, without loading the exercises again', async () => {
  answer('2025-02');
  answerMonth('2025-01');
  const view = await open('/stats?month=2025-02');
  find<HTMLButtonElement>(calendarOf(view), testId('previous')).click();
  await settle();
  expect(location.pathname + location.search).toBe('/stats?month=2025-01');
  expect(fake.requests.map((request) => request.url)).toEqual(['/api/stats/calendar?month=2025-02', RECENT_URL, '/api/stats/calendar?month=2025-01']);
  expect(find(calendarOf(view), '[data-date="2025-01-31"]')).not.toBeNull();
  expect(find(shadow(view), testId('progress'))).not.toBeNull();
});

test('keeps the month and its URL when the new month fails to load', async () => {
  answer('2025-02');
  fake.respondTo('GET /api/stats/calendar?month=2025-01', 500, '{"error":"boom"}');
  const view = await open('/stats?month=2025-02');
  find<HTMLButtonElement>(calendarOf(view), testId('previous')).click();
  await settle();
  expect(location.pathname + location.search).toBe('/stats?month=2025-02');
  expect(find(calendarOf(view), '[data-date="2025-02-28"]')).not.toBeNull();
  expect(toasts).toEqual(['boom']);
});

test('lists the recent exercises below the calendar', async () => {
  answer('2025-02', [
    {
      id: 3,
      name: 'Squat',
      kind: 'weighted',
      progression: null,
      progressionSince: null,
      sessions: [{ workoutId: 9, performedOn: SINCE, reps: 5, volume: 500, effectiveVolume: null, progression: null }],
    },
  ]);
  const view = await open('/stats?month=2025-02');
  const progress = find(shadow(view), testId('progress'));
  expect(find<HTMLElement>(shadow(progress), testId('exercise')).dataset.id).toBe('3');
});

test('still shows the calendar when the exercises fail to load', async () => {
  answerMonth('2025-02');
  fake.respondTo(`GET ${RECENT_URL}`, 500, '{"error":"boom"}');
  const view = await open('/stats?month=2025-02');
  expect(find(calendarOf(view), '[data-date="2025-02-28"]')).not.toBeNull();
  expect(find(shadow(view), testId('progress-error')).textContent).toBe('boom');
  expect(toasts).toEqual(['boom']);
});
