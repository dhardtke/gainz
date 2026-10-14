import { beforeAll, expect, test } from 'bun:test';
import { find, mount, shadow, testId, useDom } from '../../../testing.ts';
import { formatPercent, formatShortDate, formatVolume } from '../../../ui/format.ts';
import type { RecentExerciseDto } from '../../../../shared/dto/stats.ts';
import type { GzExerciseProgressComponent } from './gz-exercise-progress.component.ts';

useDom();

beforeAll(async () => {
  await import('./gz-exercise-progress.component.ts');
});

const EXERCISES: RecentExerciseDto[] = [
  {
    id: 3,
    name: 'Overhead Press',
    kind: 'weighted',
    progression: -0.061,
    progressionSince: '2026-09-15',
    sessions: [
      { workoutId: 10, performedOn: '2026-09-15', reps: 30, volume: 1230, effectiveVolume: null, progression: 0.01 },
      { workoutId: 11, performedOn: '2026-09-29', reps: 30, volume: 1200, effectiveVolume: null, progression: -0.024 },
      { workoutId: 12, performedOn: '2026-10-06', reps: 28, volume: 1155, effectiveVolume: null, progression: -0.038 },
    ],
  },
  {
    id: 5,
    name: 'Pull-up',
    kind: 'bodyweight',
    progression: 0.065,
    progressionSince: '2026-10-01',
    sessions: [
      { workoutId: 13, performedOn: '2026-10-01', reps: 31, volume: 0, effectiveVolume: null, progression: null },
      { workoutId: 14, performedOn: '2026-10-08', reps: 33, volume: 0, effectiveVolume: null, progression: 0.065 },
    ],
  },
  {
    id: 7,
    name: 'Lunge',
    kind: 'weighted',
    progression: null,
    progressionSince: null,
    sessions: [{ workoutId: 15, performedOn: '2026-10-10', reps: 24, volume: 960, effectiveVolume: null, progression: null }],
  },
];

function mountProgress(exercises = EXERCISES): ShadowRoot {
  const progress = mount<GzExerciseProgressComponent>('gz-exercise-progress');
  progress.exercises = exercises;
  return shadow(progress);
}

function cards(root: ShadowRoot): HTMLElement[] {
  return Array.from(root.querySelectorAll<HTMLElement>(testId('exercise')));
}

function card(root: ShadowRoot, id: number): HTMLElement {
  return find<HTMLElement>(root, `${testId('exercise')}[data-id="${id}"]`);
}

function overall(card: HTMLElement): HTMLElement {
  return find<HTMLElement>(find(card, 'header'), testId('change'));
}

function sessions(card: HTMLElement): HTMLElement[] {
  return Array.from(card.querySelectorAll<HTMLElement>(testId('session')));
}

function level(change: Element): string | null {
  return find(change, 'gz-progress-marker').getAttribute('level');
}

test('renders a card per exercise in the given order, linking to the exercise', () => {
  const root = mountProgress();
  expect(cards(root).map((each) => each.dataset.id)).toEqual(['3', '5', '7']);
  const name = find<HTMLAnchorElement>(card(root, 3), testId('name'));
  expect(name.textContent).toBe('Overhead Press');
  expect(name.getAttribute('href')).toBe('/exercises/3');
});

test('lists each session with a link to its workout and its volume', () => {
  const rows = sessions(card(mountProgress(), 3));
  expect(rows.map((row) => find(row, 'a').getAttribute('href'))).toEqual(['/workouts/10', '/workouts/11', '/workouts/12']);
  expect(rows.map((row) => find(row, 'a').textContent)).toEqual(['2026-09-15', '2026-09-29', '2026-10-06'].map((date) => formatShortDate(date)));
  expect(rows.map((row) => find(row, '.value').textContent)).toEqual([formatVolume(1230), formatVolume(1200), formatVolume(1155)]);
  expect(formatVolume(1230)).toContain('kg');
});

test('lists the effective volume of an assisted exercise, or a dash without one', () => {
  const pullUp: RecentExerciseDto = {
    id: 9,
    name: 'Assisted Pull-up',
    kind: 'assisted',
    progression: 0.04,
    progressionSince: '2026-10-02',
    sessions: [
      { workoutId: 16, performedOn: '2026-09-25', reps: 22, volume: 600, effectiveVolume: null, progression: null },
      { workoutId: 17, performedOn: '2026-10-02', reps: 22, volume: 550, effectiveVolume: 1350, progression: null },
      { workoutId: 18, performedOn: '2026-10-09', reps: 22, volume: 495, effectiveVolume: 1405, progression: 0.041 },
    ],
  };
  expect(sessions(card(mountProgress([pullUp]), 9)).map((row) => find(row, '.value').textContent)).toEqual(['–', formatVolume(1350), formatVolume(1405)]);
});

test('shows total reps for a bodyweight exercise', () => {
  expect(sessions(card(mountProgress(), 5)).map((row) => find(row, '.value').textContent)).toEqual(['31 reps', '33 reps']);
});

test('marks the overall change with its level, % and label', () => {
  const root = mountProgress();
  const change = overall(card(root, 3));
  expect(level(change)).toBe('down');
  expect(find(change, '.percent').textContent).toBe(formatPercent(-0.061));
  expect(change.getAttribute('aria-label')).toBe(`${formatPercent(-0.061)} since ${formatShortDate('2026-09-15')}`);
  expect(overall(card(root, 5)).getAttribute('aria-label')).toBe(`${formatPercent(0.065)} since ${formatShortDate('2026-10-01')}`);
});

test("marks each session's change against the one before", () => {
  const changes = sessions(card(mountProgress(), 3)).map((row) => find(row, testId('change')));
  expect(changes.map(level)).toEqual(['held', 'held', 'down']);
  expect(changes[2]?.getAttribute('title')).toBe(`${formatPercent(-0.038)} against the session before`);
});

test('shows the ring without a % when there is nothing to compare', () => {
  const change = overall(card(mountProgress(), 7));
  expect(level(change)).toBe('none');
  expect(find(change, '.percent').textContent).toBe('');
  expect(change.getAttribute('aria-label')).toBe('nothing to compare');
});

test('says so when there is no exercise', () => {
  const root = mountProgress([]);
  expect(cards(root)).toHaveLength(0);
  expect(find(root, testId('empty')).textContent).toBe('No exercises in the last 30 days.');
});
