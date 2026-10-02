import { beforeAll, expect, test } from 'bun:test';
import { mount, settle, shadow, useDom, useFetch } from '../../testing.ts';
import type { WorkoutPageDto } from '../../../shared/dto/workout.ts';
import { listedWorkout } from './workouts.fixtures.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-workout-list.component.ts');
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
  const cards = Array.from(shadow(view).querySelectorAll('gz-workout-card'));
  expect(cards.map((card) => shadow(card).querySelector('a.open')?.textContent)).toEqual(['Push day', 'Leg day']);
  expect(cards.map((card) => shadow(card).querySelector('article.done') !== null)).toEqual([true, false]);
});
