import { afterEach, beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, text, useDom, useFetch, useToasts } from '../../testing.ts';
import { todayIso } from '../../ui/format.ts';
import type { ExercisePageDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import type { WorkoutPageDto } from '../../../shared/dto/workout.ts';
import { listedExercise } from '../exercises/exercises.fixtures.ts';
import { listedWorkout } from './workouts.fixtures.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-workout-list.component.ts');
});

// Starting a session navigates, and the location outlives the test.
afterEach(() => {
  history.replaceState(null, '', '/');
});

const PAGE: WorkoutPageDto = {
  items: [listedWorkout({ id: 1, title: 'Push day', doneSetCount: 2, done: true }), listedWorkout({ id: 2, title: 'Leg day', doneSetCount: 1 })],
  total: 2,
  limit: 10,
  offset: 0,
};

test('renders each workout as a gz-workout-card, in order', async () => {
  fake.respondTo('GET /api/workouts?limit=10&offset=0', 200, JSON.stringify(PAGE));
  const view = mount('gz-workout-list');
  await settle();
  const cards = Array.from(shadow(view).querySelectorAll(testId('workout-card')));
  expect(cards.map((card) => shadow(card).querySelector(testId('open'))?.textContent)).toEqual(['Push day', 'Leg day']);
  expect(cards.map((card) => shadow(card).querySelector(testId('card'))?.classList.contains('done'))).toEqual([true, false]);
});

test('shows the session count as the subtitle', async () => {
  fake.respondTo('GET /api/workouts?limit=10&offset=0', 200, JSON.stringify(PAGE));
  const view = mount('gz-workout-list');
  await settle();
  expect(text(view, testId('subtitle'))).toBe('2 sessions');
});

function answerExercises(items: ExerciseWithStatsDto[]): void {
  const page: ExercisePageDto = { items, total: items.length, all: items.length, limit: null, offset: 0 };
  fake.respondTo('GET /api/exercises', 200, JSON.stringify(page));
}

const HISTORY = [
  listedExercise({ id: 1, name: 'Overhead Press', lastPerformedOn: '2026-09-28' }),
  listedExercise({ id: 2, name: 'Plank' }),
  listedExercise({ id: 3, name: 'Bench Press', lastPerformedOn: '2026-10-05' }),
  listedExercise({ id: 4, name: 'Back Squat', lastPerformedOn: '2026-10-05' }),
];

async function clickStart(): Promise<HTMLElement> {
  fake.respondTo('GET /api/workouts?limit=10&offset=0', 200, JSON.stringify(PAGE));
  fake.respondTo('POST /api/workouts', 201, JSON.stringify({ ...listedWorkout({ id: 9 }), exercises: [] }));
  const view = mount('gz-workout-list');
  await settle();
  find<HTMLButtonElement>(shadow(view), testId('start-session')).click();
  await settle();
  return view;
}

function picker(): ShadowRoot {
  return shadow(find(document.body, 'gz-start-session-dialog'));
}

function tick(id: number): void {
  const box = find<HTMLInputElement>(picker(), `input[value='${id}']`);
  box.checked = true;
  box.dispatchEvent(new Event('change', { bubbles: true }));
}

test('without exercise history, starts a session dated today and opens it', async () => {
  answerExercises([listedExercise({ id: 2, name: 'Plank' })]);
  await clickStart();
  expect(document.body.querySelector('gz-start-session-dialog')).toBeNull();
  expect(fake.sent('POST /api/workouts')).toEqual([{ performedOn: todayIso() }]);
  expect(location.pathname).toBe('/workouts/9');
});

test('offers only the exercises with history, most recent first', async () => {
  answerExercises(HISTORY);
  await clickStart();
  expect(Array.from(picker().querySelectorAll(testId('pick-name'))).map((name) => name.textContent)).toEqual(['Back Squat', 'Bench Press', 'Overhead Press']);
  expect(fake.sent('POST /api/workouts')).toEqual([]);
});

test('creates the workout, copies the picked exercises in tick order and opens it', async () => {
  answerExercises(HISTORY);
  await clickStart();
  tick(1);
  tick(4);
  find<HTMLButtonElement>(picker(), testId('start-picked')).click();
  await settle();
  expect(fake.sent('POST /api/workouts')).toEqual([{ performedOn: todayIso() }]);
  expect(fake.sent('POST /api/workouts/9/exercises')).toEqual([{ exerciseIds: [1, 4] }]);
  expect(location.pathname).toBe('/workouts/9');
});

test('starts empty without copying anything', async () => {
  answerExercises(HISTORY);
  await clickStart();
  find<HTMLButtonElement>(picker(), testId('start-empty')).click();
  await settle();
  expect(fake.sent('POST /api/workouts')).toEqual([{ performedOn: todayIso() }]);
  expect(fake.sent('POST /api/workouts/9/exercises')).toEqual([]);
  expect(location.pathname).toBe('/workouts/9');
});

test('creates nothing on Cancel and enables the button again', async () => {
  answerExercises(HISTORY);
  const view = await clickStart();
  expect(find<HTMLButtonElement>(shadow(view), testId('start-session')).disabled).toBe(true);
  find<HTMLButtonElement>(picker(), testId('cancel')).click();
  await settle();
  expect(fake.sent('POST /api/workouts')).toEqual([]);
  expect(location.pathname).toBe('/');
  expect(find<HTMLButtonElement>(shadow(view), testId('start-session')).disabled).toBe(false);
});

test('toasts a failed copy and still opens the new workout', async () => {
  answerExercises(HISTORY);
  fake.respondTo('POST /api/workouts/9/exercises', 409, JSON.stringify({ error: '"Bench Press" has no done sets to copy' }));
  await clickStart();
  tick(3);
  find<HTMLButtonElement>(picker(), testId('start-picked')).click();
  await settle();
  expect(toasts).toEqual(['"Bench Press" has no done sets to copy']);
  expect(location.pathname).toBe('/workouts/9');
});
