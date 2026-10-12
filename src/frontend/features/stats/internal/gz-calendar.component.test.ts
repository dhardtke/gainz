import { beforeAll, expect, test } from 'bun:test';
import { collect, find, mount, shadow, testId, useDom } from '../../../testing.ts';
import { formatPercent, formatShortDate } from '../../../ui/format.ts';
import type { CalendarDayDto } from '../../../../shared/dto/stats.ts';
import type { GzCalendarComponent } from './gz-calendar.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-calendar.component.ts');
});

const DAYS: CalendarDayDto[] = [
  { date: '2026-10-01', progression: 0.041, comparedExerciseCount: 5, workouts: [{ id: 40, title: 'Push day', progression: 0.041, comparedExerciseCount: 5 }] },
  {
    date: '2026-10-09',
    progression: 0.01,
    comparedExerciseCount: 3,
    workouts: [
      { id: 41, title: 'Push day', progression: 0.06, comparedExerciseCount: 2 },
      { id: 42, title: null, progression: -0.09, comparedExerciseCount: 1 },
    ],
  },
  { date: '2026-10-12', progression: null, comparedExerciseCount: 0, workouts: [{ id: 43, title: 'Legs', progression: null, comparedExerciseCount: 0 }] },
  { date: '2026-10-14', progression: -0.03, comparedExerciseCount: 2, workouts: [{ id: 44, title: 'Pull', progression: -0.03, comparedExerciseCount: 2 }] },
];

function mountCalendar(month = '2026-10', today = '2026-10-12', days = DAYS): GzCalendarComponent {
  const calendar = mount<GzCalendarComponent>('gz-calendar');
  calendar.today = today;
  calendar.month = month;
  calendar.days = days;
  return calendar;
}

function tile(calendar: GzCalendarComponent, date: string): HTMLElement {
  return find<HTMLElement>(shadow(calendar), `[data-date='${date}']`);
}

test('renders the label, the weekdays and a Monday-first grid', () => {
  const root = shadow(mountCalendar());
  expect(find(root, testId('label')).textContent).toContain('2026');
  const cells = Array.from(find(root, testId('grid')).children);
  expect(cells.slice(0, 7).map((cell) => cell.textContent)).toEqual(['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']);
  // October 2026 starts on a Thursday.
  expect(cells.slice(7, 10).every((cell) => cell.classList.contains('blank'))).toBe(true);
  expect(cells[10]?.getAttribute('data-date')).toBe('2026-10-01');
  expect(cells).toHaveLength(7 + 3 + 31);
});

test('links a one-workout day to its workout', () => {
  const day = tile(mountCalendar(), '2026-10-01');
  expect(day.localName).toBe('a');
  expect(day.getAttribute('href')).toBe('/workouts/40');
});

test('leaves a day without workouts a plain number', () => {
  const day = tile(mountCalendar(), '2026-10-02');
  expect(day.localName).toBe('span');
  expect(day.textContent.trim()).toBe('2');
});

test('opens a menu of both workouts of a two-workout day, with their count and %', () => {
  const calendar = mountCalendar();
  const root = shadow(calendar);
  const button = tile(calendar, '2026-10-09');
  expect(button.localName).toBe('button');
  expect(button.getAttribute('popovertarget')).toBe('day-2026-10-09');
  expect(find(button, testId('count')).textContent).toBe('2');
  const items = Array.from(find(root, '#day-2026-10-09').querySelectorAll<HTMLAnchorElement>(testId('day-workout')));
  expect(items.map((item) => item.getAttribute('href'))).toEqual(['/workouts/41', '/workouts/42']);
  expect(items.map((item) => find(item, 'gz-progress-marker').getAttribute('level'))).toEqual(['up', 'down']);
  expect(items.map((item) => item.textContent.replaceAll(/\s+/g, ' ').trim())).toEqual([`Push day ${formatPercent(0.06)}`, `Workout ${formatPercent(-0.09)}`]);
});

test('marks today', () => {
  const calendar = mountCalendar();
  expect(tile(calendar, '2026-10-12').getAttribute('aria-current')).toBe('date');
  expect(tile(calendar, '2026-10-11').hasAttribute('aria-current')).toBe(false);
});

test.each([
  ['2026-10-01', 'up'],
  ['2026-10-09', 'held'],
  ['2026-10-12', 'none'],
  ['2026-10-14', 'down'],
])('gives %s the level %s and its marker', (date, level) => {
  const day = tile(mountCalendar(), date);
  expect(day.dataset.level).toBe(level);
  expect(find(day, 'gz-progress-marker').getAttribute('level')).toBe(level);
});

test('labels a tile with its date, %, exercises and workouts', () => {
  const calendar = mountCalendar();
  expect(tile(calendar, '2026-10-01').getAttribute('aria-label')).toBe(`${formatShortDate('2026-10-01')}: ${formatPercent(0.041)} across 5 exercises`);
  expect(tile(calendar, '2026-10-09').getAttribute('aria-label')).toBe(
    `${formatShortDate('2026-10-09')}: ${formatPercent(0.01)} across 3 exercises, 2 workouts`,
  );
  expect(tile(calendar, '2026-10-12').getAttribute('title')).toBe(`${formatShortDate('2026-10-12')}: nothing to compare`);
});

test('lists the four levels in the legend', () => {
  const legend = find(shadow(mountCalendar()), testId('legend'));
  const items = Array.from(legend.querySelectorAll('li'));
  expect(items.map((item) => find(item, 'gz-progress-marker').getAttribute('level'))).toEqual(['up', 'held', 'down', 'none']);
  expect(items.map((item) => item.textContent)).toEqual(['progressed', 'held', 'regressed', 'nothing to compare']);
});

test.each([
  ['2026-10', true],
  ['2026-12', true],
  ['2026-09', false],
])('in %s, › is disabled: %p', (month, disabled) => {
  expect(find<HTMLButtonElement>(shadow(mountCalendar(month)), testId('next')).disabled).toBe(disabled);
});

test('‹ emits month-change with the previous month, › the next', () => {
  const months = collect('month-change');
  const root = shadow(mountCalendar('2026-01', '2026-10-12', []));
  find<HTMLButtonElement>(root, testId('previous')).click();
  find<HTMLButtonElement>(root, testId('next')).click();
  expect(months).toEqual(['2025-12', '2026-02']);
});
