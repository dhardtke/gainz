import { beforeAll, expect, test } from 'bun:test';
import { useDom, useFetch, useToasts } from '../../testing.ts';
import type { ExerciseDto, ExercisePageDto } from '../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-workout-detail.component.ts');
});

function exercise(id: number, name: string): ExerciseDto {
  return { id, name, muscleGroup: null, notes: null, createdAt: '2026-08-01T10:00:00Z' };
}

function set(id: number, exerciseId: number, exerciseName: string, weight: number): LiftSetDto {
  return { id, workoutId: 3, exerciseId, exerciseName, reps: 5, weight, notes: null, position: id, createdAt: '2026-09-20T10:00:00Z' };
}

const EXERCISES: ExercisePageDto = {
  items: [exercise(1, 'Bench Press'), exercise(2, 'Back Squat')].map((item) => ({
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
  sets: [set(11, 1, 'Bench Press', 80), set(12, 1, 'Bench Press', 82.5), set(13, 2, 'Back Squat', 100)],
};

/** Long enough for the view's requests, all answered at once by the fake, to land and render. */
async function settle(): Promise<void> {
  await Bun.sleep(10);
}

async function mount(): Promise<HTMLElement> {
  fake.respondTo('GET /api/workouts/3', 200, JSON.stringify(WORKOUT));
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(EXERCISES));
  const view = document.createElement('gz-workout-detail');
  view.setAttribute('workout-id', '3');
  document.body.append(view);
  await settle();
  return view;
}

function root(view: HTMLElement): ShadowRoot {
  if (!view.shadowRoot) {
    throw new Error('gz-workout-detail has no shadow root');
  }
  return view.shadowRoot;
}

/** Where the "Add a set" form renders. */
function addSetRoot(view: HTMLElement): ParentNode {
  const child = root(view).querySelector('gz-add-set-form')?.shadowRoot;
  if (!child) {
    throw new Error('gz-workout-detail renders no gz-add-set-form');
  }
  return child;
}

function addSetForm(view: HTMLElement): HTMLFormElement {
  const form = addSetRoot(view).querySelector<HTMLFormElement>("form[data-action='add-set']");
  if (!form) {
    throw new Error('no add-set form');
  }
  return form;
}

function detailsForm(view: HTMLElement): HTMLFormElement {
  const form = root(view).querySelector<HTMLFormElement>("form[data-action='save-workout']");
  if (!form) {
    throw new Error('no details form');
  }
  return form;
}

function field(form: HTMLFormElement, name: string): HTMLInputElement {
  const found = form.querySelector<HTMLInputElement>(`[name='${name}']`);
  if (!found) {
    throw new Error(`no ${name} field`);
  }
  return found;
}

function exerciseSelect(view: HTMLElement): HTMLSelectElement {
  const found = addSetForm(view).querySelector('select');
  if (!found) {
    throw new Error('no exercise select');
  }
  return found;
}

function type(input: HTMLInputElement, value: string): void {
  input.value = value;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function choose(view: HTMLElement, value: string): void {
  const select = exerciseSelect(view);
  select.value = value;
  select.dispatchEvent(new Event('change', { bubbles: true }));
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/** Asked of the input's own root, so it holds wherever the form's shadow root is. */
function focused(input: HTMLElement): boolean {
  const rootNode = input.getRootNode();
  return rootNode instanceof ShadowRoot && rootNode.activeElement === input;
}

function posts(url: string): unknown[] {
  return fake.requests.filter((request) => request.method === 'POST' && request.url === url).map((request) => request.body);
}

test('heads the page with the title and the date', async () => {
  const view = await mount();
  expect(root(view).querySelector('h1')?.textContent).toBe('Push day');
  expect(root(view).querySelector('hgroup p')?.textContent).toContain(' · ');
});

test('shows one row per set', async () => {
  const view = await mount();
  expect(root(view).querySelectorAll('gz-set-row')).toHaveLength(3);
});

test('totals the sets, exercises, reps and volume', async () => {
  const view = await mount();
  const badges = Array.from(root(view).querySelectorAll('.totals .badge')).map((badge) => badge.textContent);
  expect(badges.slice(0, 3)).toEqual(['3 sets', '2 exercises', '15 reps']);
  expect(badges[3]).toEndWith('total volume');
});

test('preselects the exercise of the last set', async () => {
  const view = await mount();
  expect(exerciseSelect(view).value).toBe('2');
});

test('reveals the name field when a new exercise is chosen', async () => {
  const view = await mount();
  const newExercise = addSetRoot(view).querySelector('.field-new-exercise');
  expect(newExercise?.hasAttribute('hidden')).toBe(true);
  choose(view, '__new__');
  expect(newExercise?.hasAttribute('hidden')).toBe(false);
});

test('logs a set, reloads and puts focus back in the weight field', async () => {
  const view = await mount();
  const loads = fake.requests.length;
  field(addSetForm(view), 'weight').value = '102.5';
  field(addSetForm(view), 'reps').value = '3';
  submit(addSetForm(view));
  await settle();
  expect(posts('/api/workouts/3/sets')).toEqual([{ exerciseId: 2, weight: 102.5, reps: 3, notes: '' }]);
  expect(fake.requests.slice(loads).filter((request) => request.method === 'GET' && request.url === '/api/workouts/3')).toHaveLength(1);
  const weight = field(addSetForm(view), 'weight');
  expect(focused(weight)).toBe(true);
});

test('creates a new exercise first and logs the set against it', async () => {
  const view = await mount();
  fake.respondTo('POST /api/exercises', 201, JSON.stringify(exercise(9, 'Incline Press')));
  choose(view, '__new__');
  field(addSetForm(view), 'newExercise').value = 'Incline Press';
  field(addSetForm(view), 'weight').value = '60';
  field(addSetForm(view), 'reps').value = '8';
  submit(addSetForm(view));
  await settle();
  expect(posts('/api/exercises')).toEqual([{ name: 'Incline Press' }]);
  expect(posts('/api/workouts/3/sets')).toEqual([{ exerciseId: 9, weight: 60, reps: 8, notes: '' }]);
});

test('asks for a name rather than logging a set against an unnamed new exercise', async () => {
  const view = await mount();
  choose(view, '__new__');
  field(addSetForm(view), 'weight').value = '60';
  field(addSetForm(view), 'reps').value = '8';
  submit(addSetForm(view));
  await settle();
  expect(toasts).toEqual(['Give the new exercise a name']);
  expect(fake.requests.filter((request) => request.method === 'POST')).toEqual([]);
});

test('keeps unsaved text in the details form across logging a set', async () => {
  const view = await mount();
  type(field(detailsForm(view), 'title'), 'Heavy push day');
  field(addSetForm(view), 'weight').value = '100';
  field(addSetForm(view), 'reps').value = '5';
  submit(addSetForm(view));
  await settle();
  expect(posts('/api/workouts/3/sets')).toHaveLength(1);
  expect(field(detailsForm(view), 'title').value).toBe('Heavy push day');
});

test('saves the details', async () => {
  const view = await mount();
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
  const view = document.createElement('gz-workout-detail');
  view.setAttribute('workout-id', '3');
  document.body.append(view);
  await settle();
  expect(root(view).querySelector('.error-text')?.textContent).toBe('Workout not found');
  expect(root(view).querySelector("a[href='/workouts']")?.textContent).toBe('Back to all workouts');
  expect(toasts).toEqual([]);
});
