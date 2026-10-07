import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, testId, useDom, useFetch, useToasts } from '../../testing.ts';
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
  expect(find<HTMLAnchorElement>(shadow(mountCard(listedWorkout({ id: 4, title: 'Push day' }))), testId('open')).getAttribute('href')).toBe('/workouts/4');
  expect(find(shadow(mountCard(listedWorkout({ title: null }))), testId('open')).textContent).not.toBe('');
});

test('marks a done workout green with a "✓ Done" badge', () => {
  const card = shadow(mountCard(listedWorkout({ doneSetCount: 2, done: true })));
  expect(find(card, testId('card')).classList.contains('done')).toBe(true);
  expect(card.querySelector(testId('done-badge'))?.textContent).toBe('✓ Done');
});

test('marks a workout done with sets skipped done all the same', () => {
  const card = shadow(mountCard(listedWorkout({ setCount: 3, doneSetCount: 1, done: true })));
  expect(find(card, testId('card')).classList.contains('done')).toBe(true);
  expect(card.querySelector(testId('done-badge'))?.textContent).toBe('✓ Done');
});

test('leaves a workout not done plain', () => {
  const card = shadow(mountCard(listedWorkout({ doneSetCount: 1 })));
  expect(find(card, testId('card')).classList.contains('done')).toBe(false);
  expect(card.querySelector(testId('done-badge'))).toBeNull();
});

test('repeats the workout into a new session dated today', async () => {
  fake.respondTo('POST /api/workouts', 201, JSON.stringify({ ...listedWorkout({ id: 9 }), exercises: [] }));
  const card = mountCard(listedWorkout({ id: 4, title: 'Push day' }));
  find<HTMLButtonElement>(shadow(card), testId('repeat')).click();
  await settle();
  expect(fake.sent('POST /api/workouts')).toMatchObject([{ title: 'Push day', copyFromWorkoutId: 4 }]);
  expect(toasts).toEqual(['Copied 0 sets into a new session']);
});

test('shows the totals as a muted line, not a badge', () => {
  const card = shadow(mountCard(listedWorkout({ setCount: 3, exerciseCount: 2 })));
  expect(find(card, testId('totals')).textContent).toContain('3 sets · 2 exercises');
  expect(card.querySelector('.badge.outline')).toBeNull();
});
