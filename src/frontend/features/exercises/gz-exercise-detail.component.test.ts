import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, submit, type, useDom, useFetch, useToasts } from '../../testing.ts';
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
  return shadow(find(shadow(view), 'gz-progress-chart'));
}

/** Where the session history renders. */
function tableRoot(view: HTMLElement): ParentNode {
  return shadow(find(shadow(view), 'gz-session-table'));
}

function chartHeading(view: HTMLElement): string | undefined {
  return chartRoot(view).querySelector('.metric-switch')?.closest('article')?.querySelector('h2')?.textContent;
}

function metricButton(view: HTMLElement, metric: string): HTMLButtonElement {
  return find<HTMLButtonElement>(chartRoot(view), `button[data-metric='${metric}']`);
}

function field(view: HTMLElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(shadow(view), `[name='${name}']`);
}

function submitDetails(view: HTMLElement): void {
  submit(find(shadow(view), "form[data-action='save-exercise']"));
}

test('heads the page with the exercise name', async () => {
  const view = await mountView();
  expect(shadow(view).querySelector('h1')?.textContent).toBe('Bench Press');
});

test('shows four summary tiles', async () => {
  const view = await mountView();
  expect(shadow(view).querySelectorAll('gz-tile')).toHaveLength(4);
});

test('puts the tiles, chart and history first, and editing collapsed last', async () => {
  const view = await mountView();
  const order = Array.from(shadow(view).querySelectorAll('.tiles, gz-progress-chart, gz-session-table, details.edit')).map((element) =>
    element.matches('details.edit') ? 'edit' : element.matches('.tiles') ? 'tiles' : element.localName,
  );
  expect(order).toEqual(['tiles', 'gz-progress-chart', 'gz-session-table', 'edit']);
  const edit = find<HTMLDetailsElement>(shadow(view), 'details.edit');
  expect(edit.open).toBe(false);
  expect(find(edit, 'summary').textContent).toBe('Edit exercise');
  expect(find(edit, "[data-action='delete-exercise']").textContent).toBe('Delete exercise');
  expect(edit.contains(find(shadow(view), "form[data-action='save-exercise']"))).toBe(true);
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
  const rows = Array.from(tableRoot(view).querySelectorAll('tbody tr'));
  expect(rows.map((row) => row.querySelector('a')?.getAttribute('href'))).toEqual(['/workouts/3', '/workouts/2', '/workouts/1']);
  expect(rows.map((row) => row.querySelector('span.up, span.down')?.className ?? null)).toEqual(['down', 'up', null]);
});

test('says so when no set has been logged', async () => {
  const view = await mountView(progress([]));
  expect(tableRoot(view).querySelector('.empty')?.textContent).toBe('No sets logged for this exercise yet.');
  expect(tableRoot(view).querySelector('table')).toBeNull();
});

test('shows a missing exercise with a way back, without a toast', async () => {
  fake.respondTo(PROGRESS, 404, JSON.stringify({ error: 'Exercise not found' }));
  const view = mount('gz-exercise-detail', { 'exercise-id': '7' });
  await settle();
  expect(shadow(view).querySelector('.error-text')?.textContent).toBe('Exercise not found');
  expect(shadow(view).querySelector("a[href='/exercises']")?.textContent).toBe('Back to all exercises');
  expect(toasts).toEqual([]);
});
