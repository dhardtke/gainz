import { beforeAll, expect, test } from 'bun:test';
import { choose, collect, find, mount, openDialog, settle, shadow, submit, testId, type, useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExerciseProgressDto, SessionPointDto } from '../../../shared/dto/exercise.ts';
import { formatVolume } from '../../ui/format.ts';
import { exercise, session } from './exercises.fixtures.ts';
import { set } from '../workouts/workouts.fixtures.ts';
import type { GzView } from '../../ui/view.ts';

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

const SESSIONS = [
  session({ workoutId: 1, performedOn: '2026-09-01', estOneRepMax: 90 }),
  session({ workoutId: 2, performedOn: '2026-09-08', estOneRepMax: 95 }),
  session({ workoutId: 3, performedOn: '2026-09-15', estOneRepMax: 92.5 }),
];

async function mountView(answer: ExerciseProgressDto = progress(SESSIONS)): Promise<GzView<unknown>> {
  fake.respondTo(PROGRESS, 200, JSON.stringify(answer));
  const view = mount<GzView<unknown>>('gz-exercise-detail', { 'exercise-id': '7' });
  await settle();
  return view;
}

function chartRoot(view: HTMLElement): ParentNode {
  return shadow(find(shadow(view), testId('progress-chart')));
}

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

test('preselects the muscle group in the edit form', async () => {
  const view = await mountView();
  const select = find<HTMLSelectElement>(shadow(view), testId('muscleGroup'));
  expect(Array.from(select.options).map((option) => option.textContent)).toEqual(['None', 'Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body']);
  // happy-dom misreads `selected` on any option after the second, so this reads the markup a browser honors.
  expect(select.querySelector<HTMLOptionElement>('option[selected]')?.value).toBe('Chest');
});

test('preselects "None" for an exercise without a muscle group', async () => {
  const view = await mountView({ ...progress(SESSIONS), exercise: exercise({ id: 7, muscleGroup: null }) });
  expect(find(shadow(view), `${testId('muscleGroup')} option[selected]`).getAttribute('value')).toBe('');
});

test('saves the details trimmed', async () => {
  const view = await mountView();
  type(field(view, 'name'), '  Paused Bench ');
  choose(find<HTMLSelectElement>(shadow(view), testId('muscleGroup')), 'Legs');
  submitDetails(view);
  await settle();
  const patch = fake.requests.find((request) => request.method === 'PATCH');
  expect(patch?.url).toBe('/api/exercises/7');
  expect(patch?.body).toEqual({ name: 'Paused Bench', muscleGroup: 'Legs', notes: '', kind: 'weighted' });
});

test('clears the muscle group with "None"', async () => {
  const view = await mountView();
  choose(find<HTMLSelectElement>(shadow(view), testId('muscleGroup')), '');
  submitDetails(view);
  await settle();
  expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toMatchObject({ muscleGroup: null });
});

test("starts the type on the exercise's kind and saves it", async () => {
  const view = await mountView({ ...progress(SESSIONS), exercise: exercise({ id: 7, name: 'Dips', kind: 'bodyweight' }) });
  expect(find(shadow(view), `${testId('kind')} option[selected]`).getAttribute('value')).toBe('bodyweight');
  submitDetails(view);
  await settle();
  expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toMatchObject({ kind: 'bodyweight' });
});

test('saves the type changed', async () => {
  const view = await mountView({ ...progress(SESSIONS), exercise: exercise({ id: 7, name: 'Dips', kind: 'bodyweight' }) });
  choose(find<HTMLSelectElement>(shadow(view), testId('kind')), 'assisted');
  submitDetails(view);
  await settle();
  expect(fake.requests.find((request) => request.method === 'PATCH')?.body).toMatchObject({ kind: 'assisted' });
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

test('shows a missing exercise without a toast, and names nothing', async () => {
  fake.respondTo(PROGRESS, 404, JSON.stringify({ error: 'Exercise not found' }));
  const view = mount<GzView<unknown>>('gz-exercise-detail', { 'exercise-id': '7' });
  await settle();
  expect(shadow(view).querySelector(testId('error'))?.textContent).toBe('Exercise not found');
  expect(toasts).toEqual([]);
  expect(view.pageTitle).toBeNull();
});

test('names the exercise for the breadcrumb and the tab', async () => {
  const view = await mountView();
  expect(view.pageTitle).toBe('Bench Press');
});

test('names the exercise anew after a rename, and says so', async () => {
  const view = await mountView();
  const heard = collect('page-title');
  fake.respondTo(PROGRESS, 200, JSON.stringify({ ...progress(SESSIONS), exercise: exercise({ id: 7, name: 'Paused Bench', muscleGroup: 'Chest' }) }));
  type(field(view, 'name'), 'Paused Bench');
  submitDetails(view);
  await settle();
  expect(view.pageTitle).toBe('Paused Bench');
  expect(heard).toHaveLength(1);
});

function deleteExercise(view: HTMLElement): ShadowRoot {
  find<HTMLButtonElement>(shadow(view), testId('delete-exercise')).click();
  return openDialog();
}

test('asks in a danger dialog, naming the exercise, before deleting it, and sends nothing on Cancel', async () => {
  const view = await mountView();
  const dialog = deleteExercise(view);
  expect(find(dialog, testId('title')).textContent).toBe('Delete "Bench Press"?');
  expect(find(dialog, testId('message')).textContent).toBe('Only possible while no set uses it.');
  expect(find<HTMLButtonElement>(dialog, testId('confirm')).dataset.variant).toBe('danger');
  find<HTMLButtonElement>(dialog, testId('cancel')).click();
  await settle();
  expect(fake.sent('DELETE /api/exercises/7')).toEqual([]);
});

test('deletes the exercise once confirmed and toasts', async () => {
  const view = await mountView();
  fake.respondTo('DELETE /api/exercises/7', 204);
  find<HTMLButtonElement>(deleteExercise(view), testId('confirm')).click();
  await settle();
  expect(fake.sent('DELETE /api/exercises/7')).toEqual([undefined]);
  expect(toasts).toEqual(['Exercise deleted']);
  expect(location.pathname).toBe('/exercises');
});

test('toasts why a delete was refused', async () => {
  const view = await mountView();
  fake.respondTo('DELETE /api/exercises/7', 409, JSON.stringify({ error: 'Exercise is used by logged sets' }));
  find<HTMLButtonElement>(deleteExercise(view), testId('confirm')).click();
  await settle();
  expect(toasts).toEqual(['Exercise is used by logged sets']);
});

test('shows the muscle group with its icon', async () => {
  const view = await mountView();
  expect(find(shadow(find(shadow(view), `${testId('muscle-group')} gz-muscle-group-icon`)), 'svg').getAttribute('data-group')).toBe('Chest');
});

test('says so without a muscle group, with no icon', async () => {
  const view = await mountView({ ...progress(SESSIONS), exercise: exercise({ id: 7, muscleGroup: null }) });
  const group = find(shadow(view), testId('muscle-group'));
  expect(group.textContent.trim()).toBe('No muscle group set');
  expect(group.querySelector('gz-muscle-group-icon')).toBeNull();
});

test.each([
  ['Chest', 'Chest · Bodyweight', 'bodyweight'],
  [null, 'Bodyweight', 'bodyweight'],
  ['Back', 'Back · Assisted', 'assisted'],
  [null, 'Assisted', 'assisted'],
] as const)('labels the kind beside the muscle group %s', async (muscleGroup, label, kind) => {
  const view = await mountView({ ...progress(SESSIONS), exercise: exercise({ id: 7, muscleGroup, kind }) });
  expect(find(shadow(view), testId('muscle-group')).textContent.replace(/\s+/g, ' ').trim()).toBe(label);
});

test("shows a bodyweight exercise's progress in reps", async () => {
  const view = await mountView({
    exercise: exercise({ id: 7, name: 'Dips', kind: 'bodyweight' }),
    sessions: [
      session({ workoutId: 1, performedOn: '2026-09-01', topReps: 13, totalReps: 33 }),
      session({ workoutId: 2, performedOn: '2026-09-08', topReps: 15, totalReps: 36 }),
    ],
    bestSet: { ...set({ id: 5, reps: 15, weight: 0, done: true }), performedOn: '2026-09-08' },
  });
  const tiles = Array.from(shadow(view).querySelectorAll(testId('tile'))).map((tile) => [
    tile.getAttribute('label'),
    tile.getAttribute('value'),
    tile.getAttribute('hint'),
  ]);
  expect(tiles.map(([label]) => label)).toEqual(['Sessions', 'Best set', 'Top set', 'Total reps']);
  expect(tiles[1]?.[1]).toBe('15 reps');
  expect(tiles[2]?.slice(1)).toEqual(['15 reps', '+2 reps vs. previous session']);
  expect(tiles[3]?.slice(1)).toEqual(['69', 'across all sessions']);
  expect(chartHeading(view)).toBe('Top set');
  expect(Array.from(tableRoot(view).querySelectorAll('th')).map((th) => th.textContent)).toEqual(['Date', 'Sets', 'Top set', 'Reps']);
});

test("shows an assisted exercise's progress in assistance and effective volume", async () => {
  const view = await mountView({
    exercise: exercise({ id: 9, name: 'Assisted Pull-up', muscleGroup: 'Back', kind: 'assisted' }),
    sessions: [
      session({ workoutId: 1, performedOn: '2026-09-01', leastWeight: 22.5, effectiveVolume: null }),
      session({ workoutId: 2, performedOn: '2026-09-08', leastWeight: 20, effectiveVolume: 1350 }),
      session({ workoutId: 3, performedOn: '2026-09-15', leastWeight: 17.5, effectiveVolume: 1405 }),
    ],
    bestSet: { ...set({ id: 5, reps: 8, weight: 17.5, done: true }), performedOn: '2026-09-15' },
  });
  const tiles = Array.from(shadow(view).querySelectorAll(testId('tile'))).map((tile) => [
    tile.getAttribute('label'),
    tile.getAttribute('value'),
    tile.getAttribute('hint'),
  ]);
  expect(tiles.map(([label]) => label)).toEqual(['Sessions', 'Best set', 'Least assistance', 'Effective volume']);
  expect(tiles[1]?.[1]).toBe('17.5 kg assist × 8');
  expect(tiles[2]?.slice(1)).toEqual(['17.5 kg', '−2.5 kg vs. previous session']);
  expect(tiles[3]?.slice(1)).toEqual([formatVolume(2755), 'across all sessions']);
  expect(chartHeading(view)).toBe('Least assistance');
  expect(Array.from(tableRoot(view).querySelectorAll('th')).map((th) => th.textContent)).toEqual(['Date', 'Sets', 'Reps', 'Least assist', 'Effective volume']);
});
