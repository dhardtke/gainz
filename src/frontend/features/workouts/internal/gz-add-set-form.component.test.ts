import { beforeAll, expect, test } from 'bun:test';
import { useDom, useFetch, useToasts } from '../../../testing.ts';
import type { ExerciseDto } from '../../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import type { GzAddSetFormComponent } from './gz-add-set-form.component.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-add-set-form.component.ts');
});

function exercise(id: number, name: string): ExerciseDto {
  return { id, name, muscleGroup: null, notes: null, createdAt: '2026-08-01T10:00:00Z' };
}

function set(id: number, exerciseId: number, weight: number, reps: number): LiftSetDto {
  return { id, workoutId: 3, exerciseId, exerciseName: '', reps, weight, notes: null, position: id, createdAt: '2026-09-20T10:00:00Z' };
}

const EXERCISES = [exercise(1, 'Bench Press'), exercise(2, 'Back Squat')];

/** Bench twice, then squat: the last set is the squat. */
const SETS = [set(11, 1, 80, 5), set(12, 1, 82.5, 4), set(13, 2, 100, 6)];

function mount(exercises: ExerciseDto[], sets: LiftSetDto[]): GzAddSetFormComponent {
  // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- registered in beforeAll
  const form = document.createElement('gz-add-set-form') as GzAddSetFormComponent;
  document.body.append(form);
  form.workoutId = 3;
  form.exercises = exercises;
  form.sets = sets;
  return form;
}

function field(form: HTMLElement, name: string): HTMLInputElement {
  const found = form.shadowRoot?.querySelector<HTMLInputElement>(`input[name='${name}']`);
  if (!found) {
    throw new Error(`no ${name} field`);
  }
  return found;
}

function exerciseSelect(form: HTMLElement): HTMLSelectElement {
  const found = form.shadowRoot?.querySelector('select');
  if (!found) {
    throw new Error('no exercise select');
  }
  return found;
}

function newExerciseShown(form: HTMLElement): boolean {
  return form.shadowRoot?.querySelector('.field-new-exercise')?.hasAttribute('hidden') === false;
}

function submit(form: HTMLElement): void {
  form.shadowRoot?.querySelector('form')?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

/** Counts `set-logged`, heard on the body, outside the shadow root. */
function setsLogged(): { count: number } {
  const heard = { count: 0 };
  document.body.addEventListener('set-logged', () => {
    heard.count++;
  });
  return heard;
}

test('renders nothing until it has the sets', () => {
  const form = document.createElement('gz-add-set-form');
  document.body.append(form);
  expect(form.shadowRoot?.querySelector('form')).toBeNull();
});

test('starts from the last set: its exercise, weight and reps', () => {
  const form = mount(EXERCISES, SETS);
  expect(exerciseSelect(form).value).toBe('2');
  expect(field(form, 'weight').value).toBe('100');
  expect(field(form, 'reps').value).toBe('6');
  expect(newExerciseShown(form)).toBe(false);
});

test('without sets, preselects the first exercise with empty numbers', () => {
  const form = mount(EXERCISES, []);
  expect(exerciseSelect(form).value).toBe('1');
  expect(field(form, 'weight').value).toBe('');
  expect(field(form, 'reps').value).toBe('');
});

test('without exercises, offers a new one straight away', () => {
  const form = mount([], []);
  expect(exerciseSelect(form).value).toBe('__new__');
  expect(newExerciseShown(form)).toBe(true);
});

test('prefills from the last set of the exercise chosen', () => {
  const form = mount(EXERCISES, SETS);
  const select = exerciseSelect(form);
  select.value = '1';
  select.dispatchEvent(new Event('change', { bubbles: true }));
  expect(field(form, 'weight').value).toBe('82.5');
  expect(field(form, 'reps').value).toBe('4');
});

test('logs the set and emits set-logged', async () => {
  const heard = setsLogged();
  const form = mount(EXERCISES, SETS);
  field(form, 'notes').value = ' Paused ';
  submit(form);
  await Bun.sleep(10);
  const posted = fake.requests.filter((request) => request.method === 'POST');
  expect(posted.map((request) => request.url)).toEqual(['/api/workouts/3/sets']);
  expect(posted[0]?.body).toEqual({ exerciseId: 2, weight: 100, reps: 6, notes: 'Paused' });
  expect(heard.count).toBe(1);
});

test('toasts a failed post and emits nothing', async () => {
  const heard = setsLogged();
  fake.respondTo('POST /api/workouts/3/sets', 400, JSON.stringify({ error: 'Reps must be positive' }));
  const form = mount(EXERCISES, SETS);
  submit(form);
  await Bun.sleep(10);
  expect(toasts).toEqual(['Reps must be positive']);
  expect(heard.count).toBe(0);
});

test('focusWeight() puts focus in the weight field', () => {
  const form = mount(EXERCISES, SETS);
  form.focusWeight();
  expect(form.shadowRoot?.activeElement).toBe(field(form, 'weight'));
});
