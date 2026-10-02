import { beforeAll, expect, test } from 'bun:test';
import { choose, find, mount, settle, shadow, submit, text, type, useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExercisePageDto } from '../../../shared/dto/exercise.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import { exercise } from '../exercises/exercises.fixtures.ts';
import { set } from './workouts.fixtures.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-workout-detail.component.ts');
});

const EXERCISES: ExercisePageDto = {
  items: [exercise({ id: 1, name: 'Bench Press' }), exercise({ id: 2, name: 'Back Squat' })].map((item) => ({
    ...item,
    setCount: 0,
    workoutCount: 0,
    lastPerformedOn: null,
    bestWeight: null,
  })),
  total: 2,
  limit: null,
  offset: 0,
};

const WORKOUT: WorkoutWithSetsDto = {
  id: 3,
  performedOn: '2026-09-20',
  title: 'Push day',
  notes: null,
  createdAt: '2026-09-20T10:00:00Z',
  done: false,
  sets: [
    set({ id: 11, exerciseId: 1, exerciseName: 'Bench Press', weight: 80 }),
    set({ id: 12, exerciseId: 1, exerciseName: 'Bench Press', weight: 82.5 }),
    set({ id: 13, exerciseId: 2, exerciseName: 'Back Squat', weight: 100 }),
  ],
};

async function mountView(workout: WorkoutWithSetsDto = WORKOUT): Promise<HTMLElement> {
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify(workout));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = mount('gz-workout-detail', { 'workout-id': '3' });
  await settle();
  return view;
}

/** Where the "Add a set" form renders. */
function addSetRoot(view: HTMLElement): ShadowRoot {
  return shadow(find(shadow(view), 'gz-add-set-form'));
}

function addSetForm(view: HTMLElement): HTMLFormElement {
  return find<HTMLFormElement>(addSetRoot(view), "form[data-action='add-set']");
}

function detailsForm(view: HTMLElement): HTMLFormElement {
  return find<HTMLFormElement>(shadow(view), "form[data-action='save-workout']");
}

function field(form: HTMLFormElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(form, `[name='${name}']`);
}

function exerciseSelect(view: HTMLElement): HTMLSelectElement {
  return find<HTMLSelectElement>(addSetForm(view), 'select');
}

/** Asked of the input's own root, so it holds wherever the form's shadow root is. */
function focused(input: HTMLElement): boolean {
  const rootNode = input.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.activeElement === input;
}

test('heads the page with the title and the date', async () => {
  const view = await mountView();
  expect(shadow(view).querySelector('h1')?.textContent).toBe('Push day');
  expect(shadow(view).querySelector('hgroup p')?.textContent).toContain(' · ');
});

test('shows one row per set', async () => {
  const view = await mountView();
  expect(shadow(view).querySelectorAll('gz-set-row')).toHaveLength(3);
});

test('totals the sets, exercises, reps and volume', async () => {
  const view = await mountView();
  const badges = Array.from(shadow(view).querySelectorAll('.totals .badge')).map((badge) => badge.textContent);
  expect(badges.slice(0, 3)).toEqual(['3 sets', '2 exercises', '15 reps']);
  expect(badges[3]).toEndWith('total volume');
});

function totals(view: HTMLElement): (string | null)[] {
  return Array.from(shadow(view).querySelectorAll('.totals .badge')).map((badge) => badge.textContent);
}

test('counts the sets done so far', async () => {
  const sets = WORKOUT.sets.map((item, index) => ({ ...item, done: index === 0 }));
  const view = await mountView({ ...WORKOUT, sets });
  expect(totals(view)).toContain('1/3 done');
  expect(shadow(view).querySelector(".totals .badge[data-variant='success']")).toBeNull();
});

test('shows a done workout as done', async () => {
  const sets = WORKOUT.sets.map((item) => ({ ...item, done: true }));
  const view = await mountView({ ...WORKOUT, sets, done: true });
  expect(text(view, ".totals .badge[data-variant='success']")).toBe('✓ Done');
  expect(totals(view)).not.toContain('3/3 done');
});

test('shows no done badge for a workout without sets', async () => {
  const view = await mountView({ ...WORKOUT, sets: [] });
  // Sets, exercises, reps and volume: nothing after them.
  expect(totals(view)).toHaveLength(4);
});

test('preselects the exercise of the last set', async () => {
  const view = await mountView();
  expect(exerciseSelect(view).value).toBe('2');
});

test('reveals the name field when a new exercise is chosen', async () => {
  const view = await mountView();
  const newExercise = addSetRoot(view).querySelector('.field-new-exercise');
  expect(newExercise?.hasAttribute('hidden')).toBe(true);
  choose(exerciseSelect(view), '__new__');
  expect(newExercise?.hasAttribute('hidden')).toBe(false);
});

test('logs a set, reloads and puts focus back in the reps field', async () => {
  const view = await mountView();
  const loads = fake.requests.length;
  field(addSetForm(view), 'reps').value = '3';
  field(addSetForm(view), 'weight').value = '102.5';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toEqual([{ exerciseId: 2, weight: 102.5, reps: 3, notes: '' }]);
  expect(fake.requests.slice(loads).filter((request) => request.method === 'GET' && request.url === '/api/workouts/3')).toHaveLength(1);
  const reps = field(addSetForm(view), 'reps');
  expect(focused(reps)).toBe(true);
});

test('creates a new exercise first and logs the set against it', async () => {
  const view = await mountView();
  fake.respondTo('POST /api/exercises', 201, JSON.stringify(exercise({ id: 9, name: 'Incline Press' })));
  choose(exerciseSelect(view), '__new__');
  field(addSetForm(view), 'newExercise').value = 'Incline Press';
  field(addSetForm(view), 'weight').value = '60';
  field(addSetForm(view), 'reps').value = '8';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/exercises')).toEqual([{ name: 'Incline Press' }]);
  expect(fake.sent('POST /api/workouts/3/sets')).toEqual([{ exerciseId: 9, weight: 60, reps: 8, notes: '' }]);
});

test('asks for a name rather than logging a set against an unnamed new exercise', async () => {
  const view = await mountView();
  choose(exerciseSelect(view), '__new__');
  field(addSetForm(view), 'weight').value = '60';
  field(addSetForm(view), 'reps').value = '8';
  submit(addSetForm(view));
  await settle();
  expect(toasts).toEqual(['Give the new exercise a name']);
  expect(fake.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

test('keeps unsaved text in the details form across logging a set', async () => {
  const view = await mountView();
  type(field(detailsForm(view), 'title'), 'Heavy push day');
  field(addSetForm(view), 'weight').value = '100';
  field(addSetForm(view), 'reps').value = '5';
  submit(addSetForm(view));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toHaveLength(1);
  expect(field(detailsForm(view), 'title').value).toBe('Heavy push day');
});

test('saves the details', async () => {
  const view = await mountView();
  type(field(detailsForm(view), 'title'), ' Heavy push day ');
  submit(detailsForm(view));
  await settle();
  const patch = fake.requests.find((request) => request.method === 'PATCH');
  expect(patch?.url).toBe('/api/workouts/3');
  expect(patch?.body).toEqual({ performedOn: '2026-09-20', title: 'Heavy push day', notes: '' });
  expect(toasts).toEqual(['Workout updated']);
});

test('shows a missing workout with a way back, without a toast', async () => {
  fake.respondTo('GET /api/workouts/3', 404, JSON.stringify({ error: 'Workout not found' }));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = mount('gz-workout-detail', { 'workout-id': '3' });
  await settle();
  expect(shadow(view).querySelector('.error-text')?.textContent).toBe('Workout not found');
  expect(shadow(view).querySelector("a[href='/workouts']")?.textContent).toBe('Back to all workouts');
  expect(toasts).toEqual([]);
});

function rows(view: HTMLElement): HTMLElement[] {
  return Array.from(shadow(view).querySelectorAll<HTMLElement>('gz-set-row'));
}

function arrow(row: HTMLElement, direction: 'up' | 'down'): HTMLButtonElement {
  return find<HTMLButtonElement>(shadow(row), `[data-action='move-${direction}']`);
}

function workoutLoads(): number {
  return fake.requests.filter((request) => request.method === 'GET' && request.url === '/api/workouts/3').length;
}

test("disables only the first row's ▲ and the last row's ▼", async () => {
  const view = await mountView();
  expect(rows(view).map((row) => [arrow(row, 'up').disabled, arrow(row, 'down').disabled])).toEqual([
    [true, false],
    [false, false],
    [false, true],
  ]);
});

/** Clicks a row's arrow with the reload answering the sets in `order`. */
async function moveRow(view: HTMLElement, index: number, direction: 'up' | 'down', order: number[]): Promise<void> {
  const sets = order.map((id) => WORKOUT.sets.find((item) => item.id === id) ?? set({ id }));
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify({ ...WORKOUT, sets }));
  const row = rows(view)[index];
  if (!row) {
    throw new Error(`no row at index ${index}`);
  }
  arrow(row, direction).click();
  await settle();
}

function movedRow(view: HTMLElement, id: number): HTMLElement {
  return find<HTMLElement>(shadow(view), `gz-set-row[data-id='${id}']`);
}

test('moves a set up, reloads in the new order and keeps focus on its ▲', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  await moveRow(view, 2, 'up', [11, 13, 12]);
  expect(fake.sent('POST /api/sets/13/move')).toEqual([{ direction: 'up' }]);
  expect(workoutLoads()).toBe(loads + 1);
  expect(rows(view).map((row) => row.dataset.id)).toEqual(['11', '13', '12']);
  const moved = movedRow(view, 13);
  expect(moved.dataset.index).toBe('2');
  expect(shadow(moved).activeElement).toBe(arrow(moved, 'up'));
});

test('puts focus on ▼ once a set has moved to the top', async () => {
  const view = await mountView();
  await moveRow(view, 1, 'up', [12, 11, 13]);
  const moved = movedRow(view, 12);
  expect(arrow(moved, 'up').disabled).toBe(true);
  expect(shadow(moved).activeElement).toBe(arrow(moved, 'down'));
});

test('ignores a set-moved event with a malformed detail', async () => {
  const view = await mountView();
  const loads = workoutLoads();
  find(shadow(view), 'gz-set-row').dispatchEvent(new CustomEvent('set-moved', { detail: { id: '13', direction: 'left' }, bubbles: true, composed: true }));
  await settle();
  expect(workoutLoads()).toBe(loads);
});
