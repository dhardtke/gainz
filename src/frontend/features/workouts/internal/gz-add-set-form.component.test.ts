import { beforeAll, expect, test } from 'bun:test';
import { choose, collect, find, mount, settle, shadow, submit, testId, useDom, useFetch, useToasts } from '../../../testing.ts';
import type { ExerciseDto } from '../../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import { exercise } from '../../exercises/exercises.fixtures.ts';
import { set } from '../workouts.fixtures.ts';
import type { GzAddSetFormComponent } from './gz-add-set-form.component.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-add-set-form.component.ts');
});

const EXERCISES = [exercise({ id: 1, name: 'Bench Press' }), exercise({ id: 2, name: 'Back Squat' })];

/** Bench twice, then squat: the last set is the squat. */
const SETS = [
  set({ id: 11, exerciseId: 1, weight: 80, reps: 5 }),
  set({ id: 12, exerciseId: 1, weight: 82.5, reps: 4 }),
  set({ id: 13, exerciseId: 2, weight: 100, reps: 6 }),
];

function mountForm(exercises: ExerciseDto[], sets: LiftSetDto[]): GzAddSetFormComponent {
  const form = mount<GzAddSetFormComponent>('gz-add-set-form');
  form.workoutId = 3;
  form.exercises = exercises;
  form.sets = sets;
  return form;
}

function field(form: HTMLElement, name: string): HTMLInputElement {
  return find<HTMLInputElement>(shadow(form), testId(name));
}

function exerciseSelect(form: HTMLElement): HTMLSelectElement {
  return find<HTMLSelectElement>(shadow(form), testId('exercise'));
}

test('renders nothing until it has the sets', () => {
  const form = mount('gz-add-set-form');
  expect(form.shadowRoot?.querySelector(testId('form'))).toBeNull();
});

test('starts from the last set: its exercise, weight and reps', () => {
  const form = mountForm(EXERCISES, SETS);
  expect(exerciseSelect(form).value).toBe('2');
  expect(field(form, 'weight').value).toBe('100');
  expect(field(form, 'reps').value).toBe('6');
});

test('offers only existing exercises', () => {
  const form = mountForm(EXERCISES, SETS);
  expect(Array.from(exerciseSelect(form).options).map((option) => option.value)).toEqual(['1', '2']);
  expect(form.shadowRoot?.querySelector("input[name='newExercise']")).toBeNull();
});

test('without sets, preselects the first exercise with empty numbers', () => {
  const form = mountForm(EXERCISES, []);
  expect(exerciseSelect(form).value).toBe('1');
  expect(field(form, 'weight').value).toBe('');
  expect(field(form, 'reps').value).toBe('');
});

test('without exercises, links to the exercises page instead of a form', () => {
  const form = mountForm([], []);
  expect(form.shadowRoot?.querySelector(testId('form'))).toBeNull();
  expect(form.shadowRoot?.querySelector(testId('exercises-link'))?.getAttribute('href')).toBe('/exercises');
});

test('prefills from the last set of the exercise chosen', () => {
  const form = mountForm(EXERCISES, SETS);
  choose(exerciseSelect(form), '1');
  expect(field(form, 'weight').value).toBe('82.5');
  expect(field(form, 'reps').value).toBe('4');
});

test('logs the set and emits set-logged', async () => {
  const logged = collect('set-logged');
  const form = mountForm(EXERCISES, SETS);
  field(form, 'notes').value = ' Paused ';
  submit(find(shadow(form), testId('form')));
  await settle();
  const posted = fake.requests.filter((request) => request.method === 'POST');
  expect(posted.map((request) => request.url)).toEqual(['/api/workouts/3/sets']);
  expect(posted[0]?.body).toEqual({ exerciseId: 2, weight: 100, reps: 6, notes: 'Paused' });
  expect(logged).toEqual([{ exerciseId: 2 }]);
});

test('toasts a failed post and emits nothing', async () => {
  const logged = collect('set-logged');
  fake.respondTo('POST /api/workouts/3/sets', 400, JSON.stringify({ error: 'Reps must be positive' }));
  const form = mountForm(EXERCISES, SETS);
  submit(find(shadow(form), testId('form')));
  await settle();
  expect(toasts).toEqual(['Reps must be positive']);
  expect(logged).toHaveLength(0);
});

test('focusReps() puts focus in the reps field', () => {
  const form = mountForm(EXERCISES, SETS);
  form.focusReps();
  expect(form.shadowRoot?.activeElement).toBe(field(form, 'reps'));
});
