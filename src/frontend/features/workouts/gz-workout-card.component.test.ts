import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, useDom, useFetch, useToasts } from '../../testing.ts';
import type { WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';
import { listedWorkout } from './workouts.fixtures.ts';
import type { GzWorkoutCardComponent } from './gz-workout-card.component.ts';

useDom();
const fake = useFetch();
const toasts = useToasts();

beforeAll(async () => {
  await import('./gz-workout-card.component.ts');
});

function mountCard(workout: WorkoutWithStatsDto): GzWorkoutCardComponent {
  const card = mount<GzWorkoutCardComponent>('gz-workout-card');
  card.workout = workout;
  return card;
}

test('links to the workout, titled by its title or else its date', () => {
  expect(find<HTMLAnchorElement>(shadow(mountCard(listedWorkout({ id: 4, title: 'Push day' }))), 'a.open').getAttribute('href')).toBe('/workouts/4');
  expect(find(shadow(mountCard(listedWorkout({ title: null }))), 'a.open').textContent).not.toBe('');
});

test('marks a done workout green with a "✓ Done" badge', () => {
  const card = shadow(mountCard(listedWorkout({ doneSetCount: 2, done: true })));
  expect(card.querySelector('article.done')).not.toBeNull();
  expect(card.querySelector(".badge[data-variant='success']")?.textContent).toBe('✓ Done');
});

test('leaves a workout not done plain', () => {
  const card = shadow(mountCard(listedWorkout({ doneSetCount: 1 })));
  expect(card.querySelector('article.done')).toBeNull();
  expect(card.querySelector(".badge[data-variant='success']")).toBeNull();
});

test('repeats the workout into a new session dated today', async () => {
  fake.respondTo('POST /api/workouts', 201, JSON.stringify({ ...listedWorkout({ id: 9 }), exercises: [] }));
  const card = mountCard(listedWorkout({ id: 4, title: 'Push day' }));
  find<HTMLButtonElement>(shadow(card), "[data-action='repeat']").click();
  await settle();
  expect(fake.sent('POST /api/workouts')).toMatchObject([{ title: 'Push day', copyFromWorkoutId: 4 }]);
  expect(toasts).toEqual(['Copied 0 sets into a new session']);
});
