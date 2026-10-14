import { beforeAll, expect, test } from 'bun:test';
import { choose, collect, find, mount, settle, shadow, submit, testId, useDom, useFetch, useToasts } from '../../../testing.ts';
import type { ExerciseLastSessionDto, ExerciseWithStatsDto } from '../../../../shared/dto/exercise.ts';
import type { LiftSetDto } from '../../../../shared/dto/set.ts';
import { listedExercise } from '../../exercises/exercises.fixtures.ts';
import { formatShortDate } from '../../../ui/format.ts';
import { set } from '../workouts.fixtures.ts';
import type { GzAddSetFormComponent } from './gz-add-set-form.component.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-add-set-form.component.ts');
});

const EXERCISES = [listedExercise({ id: 1, name: 'Bench Press' }), listedExercise({ id: 2, name: 'Back Squat' })];

const SETS = [
  set({ id: 11, exerciseId: 1, weight: 80, reps: 5 }),
  set({ id: 12, exerciseId: 1, weight: 82.5, reps: 4 }),
  set({ id: 13, exerciseId: 2, weight: 100, reps: 6 }),
];

function mountForm(exercises: ExerciseWithStatsDto[], sets: LiftSetDto[]): GzAddSetFormComponent {
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

function answerLastSession(exerciseId: number, sets: Partial<LiftSetDto>[] | null, performedOn = '2026-10-05'): void {
  const dto: ExerciseLastSessionDto = {
    session:
      sets === null
        ? null
        : { workoutId: 1, performedOn, sets: sets.map((each, index) => set({ id: 100 + index, workoutId: 1, exerciseId, done: true, ...each })) },
  };
  fake.respondTo(`GET /api/exercises/${exerciseId}/last-session?exceptWorkout=3`, 200, JSON.stringify(dto));
}

const SQUAT_SESSION = [
  { reps: 5, weight: 100 },
  { reps: 5, weight: 100 },
  { reps: 5, weight: 105 },
];

function hint(form: HTMLElement): string | undefined {
  return form.shadowRoot?.querySelector(testId('last-session'))?.textContent;
}

test("shows the selected exercise's last session and its best weight", async () => {
  answerLastSession(2, SQUAT_SESSION);
  const form = mountForm([listedExercise({ id: 1, name: 'Bench Press' }), listedExercise({ id: 2, name: 'Back Squat', bestWeight: 110 })], SETS);
  await settle();
  expect(hint(form)).toBe(`Last · ${formatShortDate('2026-10-05')}: 5×100 · 5×100 · 5×105 · best 110 kg`);
});

test.each([0, null])('leaves out the best weight when it is %p', async (bestWeight) => {
  answerLastSession(2, [{ reps: 8, weight: 0 }]);
  const form = mountForm([listedExercise({ id: 2, name: 'Pull-up', bestWeight })], SETS);
  await settle();
  expect(hint(form)).toBe(`Last · ${formatShortDate('2026-10-05')}: 8×0`);
});

test('says so when the exercise has no history', async () => {
  answerLastSession(2, null);
  const form = mountForm(EXERCISES, SETS);
  await settle();
  expect(hint(form)).toBe('No history yet');
});

test('shows no hint when the lookup fails, without a toast', async () => {
  fake.respondTo('GET /api/exercises/2/last-session?exceptWorkout=3', 500);
  const form = mountForm(EXERCISES, SETS);
  await settle();
  expect(hint(form)).toBeUndefined();
  expect(toasts).toEqual([]);
});

test('prefills from the last session when choosing an exercise not in the workout', async () => {
  answerLastSession(1, [
    { reps: 3, weight: 90 },
    { reps: 3, weight: 95 },
  ]);
  const form = mountForm(EXERCISES, [set({ id: 13, exerciseId: 2, weight: 100, reps: 6 })]);
  choose(exerciseSelect(form), '1');
  await settle();
  expect(field(form, 'weight').value).toBe('90');
  expect(field(form, 'reps').value).toBe('3');
});

test('prefills from the last session on first render of an empty workout', async () => {
  answerLastSession(1, [{ reps: 3, weight: 90 }]);
  const form = mountForm(EXERCISES, []);
  await settle();
  expect(field(form, 'weight').value).toBe('90');
  expect(field(form, 'reps').value).toBe('3');
});

test('still prefills from this workout for an exercise already in it', async () => {
  answerLastSession(1, [{ reps: 3, weight: 90 }]);
  const form = mountForm(EXERCISES, SETS);
  choose(exerciseSelect(form), '1');
  await settle();
  expect(field(form, 'weight').value).toBe('82.5');
  expect(field(form, 'reps').value).toBe('4');
});

test('keeps the hint through the re-render after a logged set', async () => {
  answerLastSession(2, SQUAT_SESSION);
  const form = mountForm(EXERCISES, SETS);
  await settle();
  form.sets = [...SETS, set({ id: 14, exerciseId: 2, weight: 100, reps: 5 })];
  expect(hint(form)).toStartWith('Last · ');
  expect(fake.requests.filter((request) => request.url.includes('last-session'))).toHaveLength(1);
});

test('a late lookup for an exercise no longer selected leaves the hint alone', async () => {
  answerLastSession(1, [{ reps: 3, weight: 90 }]);
  answerLastSession(2, null);
  const form = mountForm(EXERCISES, SETS);
  choose(exerciseSelect(form), '1');
  choose(exerciseSelect(form), '2');
  await settle();
  expect(hint(form)).toBe('No history yet');
});

function addLastSession(form: HTMLElement): HTMLButtonElement | null {
  return form.shadowRoot?.querySelector<HTMLButtonElement>(testId('add-last-session')) ?? null;
}

test("offers to add the last session's sets for an exercise not in the workout", async () => {
  answerLastSession(1, SQUAT_SESSION);
  const form = mountForm(EXERCISES, [set({ id: 13, exerciseId: 2, weight: 100, reps: 6 })]);
  choose(exerciseSelect(form), '1');
  await settle();
  expect(addLastSession(form)?.textContent.trim()).toBe("Add last session's 3 sets");
});

test('offers no button for an exercise already in the workout or one without history', async () => {
  answerLastSession(1, null);
  answerLastSession(2, SQUAT_SESSION);
  const form = mountForm(EXERCISES, [set({ id: 13, exerciseId: 2, weight: 100, reps: 6 })]);
  await settle();
  expect(hint(form)).toStartWith('Last · ');
  expect(addLastSession(form)).toBeNull();
  choose(exerciseSelect(form), '1');
  await settle();
  expect(hint(form)).toBe('No history yet');
  expect(addLastSession(form)).toBeNull();
});

test('adds the selected exercise once and emits set-logged', async () => {
  const logged = collect('set-logged');
  answerLastSession(1, SQUAT_SESSION);
  const form = mountForm(EXERCISES, []);
  await settle();
  addLastSession(form)?.click();
  addLastSession(form)?.click();
  await settle();
  expect(fake.sent('POST /api/workouts/3/exercises')).toEqual([{ exerciseIds: [1] }]);
  expect(logged).toEqual([{ exerciseId: 1 }]);
});

test('toasts a failed add and emits nothing', async () => {
  const logged = collect('set-logged');
  answerLastSession(1, SQUAT_SESSION);
  fake.respondTo('POST /api/workouts/3/exercises', 409, JSON.stringify({ error: '"Bench Press" is already in this workout' }));
  const form = mountForm(EXERCISES, []);
  await settle();
  addLastSession(form)?.click();
  await settle();
  expect(toasts).toEqual(['"Bench Press" is already in this workout']);
  expect(logged).toHaveLength(0);
  expect(addLastSession(form)?.disabled).toBe(false);
});

const DIPS = listedExercise({ id: 3, name: 'Dips', kind: 'bodyweight' });

function weightField(form: HTMLElement): HTMLElement {
  return find(shadow(form), testId('weight-field'));
}

test('hides and disables the weight while a bodyweight exercise is selected, and shows it again', () => {
  const form = mountForm([...EXERCISES, DIPS], SETS);
  expect(weightField(form).hidden).toBe(false);
  choose(exerciseSelect(form), '3');
  expect(weightField(form).hidden).toBe(true);
  expect(field(form, 'weight').disabled).toBe(true);
  choose(exerciseSelect(form), '1');
  expect(weightField(form).hidden).toBe(false);
  expect(field(form, 'weight').disabled).toBe(false);
});

test('starts with the weight hidden when the last set is of a bodyweight exercise', () => {
  const form = mountForm([...EXERCISES, DIPS], [set({ id: 14, exerciseId: 3, weight: 0, reps: 12 })]);
  expect(weightField(form).hidden).toBe(true);
  expect(field(form, 'weight').disabled).toBe(true);
});

test('logs a bodyweight set without a weight', async () => {
  const form = mountForm([...EXERCISES, DIPS], [set({ id: 14, exerciseId: 3, weight: 0, reps: 12 })]);
  // happy-dom misreads `selected` on any option after the second.
  choose(exerciseSelect(form), '3');
  submit(find(shadow(form), testId('form')));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toEqual([{ exerciseId: 3, reps: 12, notes: '' }]);
});

test("shows a bodyweight exercise's last session in reps", async () => {
  answerLastSession(3, [
    { reps: 12, weight: 0 },
    { reps: 10, weight: 0 },
  ]);
  const form = mountForm([DIPS], []);
  await settle();
  expect(hint(form)).toBe(`Last · ${formatShortDate('2026-10-05')}: 12 · 10 reps`);
});

test("ends a bodyweight exercise's hint in its best reps", async () => {
  answerLastSession(3, [{ reps: 12, weight: 0 }]);
  const form = mountForm([{ ...DIPS, bestReps: 15 }], []);
  await settle();
  expect(hint(form)).toBe(`Last · ${formatShortDate('2026-10-05')}: 12 reps · best 15 reps`);
});

const PULL_UP = listedExercise({ id: 4, name: 'Assisted Pull-up', kind: 'assisted' });

function weightLabel(form: HTMLElement): string {
  return find(shadow(form), "label[for='weight']").textContent;
}

test('labels the weight as assistance while an assisted exercise is selected, keeping it required', () => {
  const form = mountForm([...EXERCISES, PULL_UP], SETS);
  expect(weightLabel(form)).toBe('Weight (kg)');
  choose(exerciseSelect(form), '4');
  expect(weightLabel(form)).toBe('Assistance (kg)');
  expect(weightField(form).hidden).toBe(false);
  expect(field(form, 'weight').required).toBe(true);
  expect(field(form, 'weight').disabled).toBe(false);
  choose(exerciseSelect(form), '1');
  expect(weightLabel(form)).toBe('Weight (kg)');
});

test('logs an assisted set with its assistance', async () => {
  const form = mountForm([PULL_UP], [set({ id: 14, exerciseId: 4, weight: 30, reps: 8 })]);
  expect(weightLabel(form)).toBe('Assistance (kg)');
  submit(find(shadow(form), testId('form')));
  await settle();
  expect(fake.sent('POST /api/workouts/3/sets')).toEqual([{ exerciseId: 4, reps: 8, weight: 30, notes: '' }]);
});

test("shows an assisted exercise's last session in assistance, ending in its least", async () => {
  answerLastSession(4, [
    { reps: 8, weight: 30 },
    { reps: 6, weight: 25 },
  ]);
  const form = mountForm([{ ...PULL_UP, leastWeight: 25 }], []);
  await settle();
  expect(hint(form)).toBe(`Last · ${formatShortDate('2026-10-05')}: 8×30 · 6×25 kg assist · least 25 kg`);
});
