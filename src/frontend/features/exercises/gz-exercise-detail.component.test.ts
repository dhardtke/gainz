import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, submit, testId, type, useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExerciseProgressDto, SessionPointDto } from '../../../shared/dto/exercise.ts';
import { exercise, session } from './exercises.fixtures.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-exercise-detail.component.ts');
});

const PROGRESS = 'GET /api/exercises/7/progress';

function progress(sessions: SessionPointDto[]): ExerciseProgressDto {
  return {
    exercise: exercise({ id: 7, name: 'Bench Press', muscleGroup: 'Chest' }),
    sessions,
    bestSet: null,
  };
}

/** Oldest first, as the API sends them: up from the first to the second, down to the third. */
const SESSIONS = [
  session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 }),
  session({ workoutId: 2, performedOn: '2026-09-08', estOneRepMax: 95 }),
  session({ workoutId: 3, performedOn: '2026-09-15', estOneRepMax: 92.5 }),
];

async function mountView(answer: ExerciseProgressDto = progress(SESSIONS)): Promise<HTMLElement> {
  fake.respondTo(PROGRESS, 200, JSON.stringify(answer));
  const view = mount('gz-exercise-detail', { 'exercise-id': '7' });
  await settle();
  return view;
}

/** Where the chart card with its metric switch renders. */
function chartRoot(view: HTMLElement): ParentNode {
  return shadow(find(shadow(view), testId('progress-chart')));
}

/** Where the session history renders. */
function tableRoot(view: HTMLElement): ParentNode {
  return shadow(find(shadow(view), testId('session-table')));
}

function chartHeading(view: HTMLElement): string | undefined {
  return chartRoot(view).querySelector(testId('heading'))?.textContent;
}

function metricButton(view: HTMLElement, metric: string): HTMLButtonElement {
  return find<HTMLButtonElement>(chartRoot(view), testId(`metric-${metric}`));
}

function field(view: HTMLElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(shadow(view), testId(name));
}

function submitDetails(view: HTMLElement): void {
  submit(find(shadow(view), testId('edit-form')));
}

test('heads the page with the exercise name', async () => {
  const view = await mountView();
  expect(shadow(view).querySelector(testId('heading'))?.textContent).toBe('Bench Press');
});

test('shows four summary tiles', async () => {
  const view = await mountView();
  expect(shadow(view).querySelectorAll(testId('tile'))).toHaveLength(4);
});

test('puts the tiles, chart and history first, and editing collapsed last', async () => {
  const view = await mountView();
  const sections = ['tiles', 'progress-chart', 'session-table', 'edit'];
  const order = Array.from(shadow(view).querySelectorAll<HTMLElement>(sections.map(testId).join(', '))).map((element) => element.dataset.testid);
  expect(order).toEqual(sections);
  const edit = find<HTMLDetailsElement>(shadow(view), testId('edit'));
  expect(edit.open).toBe(false);
  expect(find(edit, testId('edit-summary')).textContent).toBe('Edit exercise');
  expect(find(edit, testId('delete-exercise')).textContent).toBe('Delete exercise');
  expect(edit.contains(find(shadow(view), testId('edit-form')))).toBe(true);
});

test('charts the estimated 1RM first', async () => {
  const view = await mountView();
  expect(chartHeading(view)).toBe('Estimated 1RM');
  expect(metricButton(view, 'estOneRepMax').getAttribute('aria-pressed')).toBe('true');
});

test('switches the charted metric', async () => {
  const view = await mountView();
  metricButton(view, 'totalVolume').click();
  expect(chartHeading(view)).toBe('Volume');
  expect(metricButton(view, 'totalVolume').getAttribute('aria-pressed')).toBe('true');
  expect(metricButton(view, 'estOneRepMax').getAttribute('aria-pressed')).not.toBe('true');
});

test('keeps unsaved text in the details form across a metric switch', async () => {
  const view = await mountView();
  type(field(view, 'name'), 'Paused Bench');
  metricButton(view, 'totalVolume').click();
  expect(field(view, 'name').value).toBe('Paused Bench');
});

test('keeps the chosen metric after saving the details', async () => {
  const view = await mountView();
  metricButton(view, 'totalVolume').click();
  submitDetails(view);
  await settle();
  expect(toasts).toContain('Exercise updated');
  expect(chartHeading(view)).toBe('Volume');
  expect(metricButton(view, 'totalVolume').getAttribute('aria-pressed')).toBe('true');
});

test('saves the details trimmed', async () => {
  const view = await mountView();
  type(field(view, 'name'), '  Paused Bench ');
  type(field(view, 'muscleGroup'), ' Chest  ');
  submitDetails(view);
  await settle();
  const patch = fake.requests.find((request) => request.method === 'PATCH');
  expect(patch?.url).toBe('/api/exercises/7');
  expect(patch?.body).toEqual({ name: 'Paused Bench', muscleGroup: 'Chest', notes: '' });
});

test('lists the sessions newest first, each linking to its workout, with the 1RM change', async () => {
  const view = await mountView();
  const rows = Array.from(tableRoot(view).querySelectorAll(testId('session')));
  expect(rows.map((row) => row.querySelector(testId('workout-link'))?.getAttribute('href'))).toEqual(['/workouts/3', '/workouts/2', '/workouts/1']);
  expect(rows.map((row) => row.querySelector(testId('change'))?.className ?? null)).toEqual(['down', 'up', null]);
});

test('says so when no set has been logged', async () => {
  const view = await mountView(progress([]));
  expect(tableRoot(view).querySelector(testId('empty'))?.textContent).toBe('No sets logged for this exercise yet.');
  expect(tableRoot(view).querySelector(testId('table'))).toBeNull();
});

test('shows a missing exercise with a way back, without a toast', async () => {
  fake.respondTo(PROGRESS, 404, JSON.stringify({ error: 'Exercise not found' }));
  const view = mount('gz-exercise-detail', { 'exercise-id': '7' });
  await settle();
  expect(shadow(view).querySelector(testId('error'))?.textContent).toBe('Exercise not found');
  const back = find(shadow(view), testId('back-link'));
  expect([back.textContent, back.getAttribute('href')]).toEqual(['Back to all exercises', '/exercises']);
  expect(toasts).toEqual([]);
});
