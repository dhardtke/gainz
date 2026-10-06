import { afterEach, beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, text, useDom, useFetch } from '../../testing.ts';
import { todayIso } from '../../ui/format.ts';
import type { WorkoutPageDto } from '../../../shared/dto/workout.ts';
import { listedWorkout } from './workouts.fixtures.ts';

useDom();
const fake = useFetch();

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

test('starts a session dated today and opens it', async () => {
  fake.respondTo('GET /api/workouts?limit=10&offset=0', 200, JSON.stringify(PAGE));
  fake.respondTo('POST /api/workouts', 201, JSON.stringify({ ...listedWorkout({ id: 9 }), exercises: [] }));
  const view = mount('gz-workout-list');
  await settle();
  find<HTMLButtonElement>(shadow(view), testId('start-session')).click();
  await settle();
  expect(fake.sent('POST /api/workouts')).toEqual([{ performedOn: todayIso() }]);
  expect(location.pathname).toBe('/workouts/9');
});
