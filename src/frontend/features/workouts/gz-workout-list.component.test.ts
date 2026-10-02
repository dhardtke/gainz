import { beforeAll, expect, test } from 'bun:test';
import { mount, settle, shadow, useDom, useFetch } from '../../testing.ts';
import type { WorkoutPageDto, WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-workout-list.component.ts');
});

function workout(overrides: Partial<WorkoutWithStatsDto>): WorkoutWithStatsDto {
  return {
    id: 1,
    performedOn: '2026-09-20',
    title: 'Push day',
    notes: null,
    createdAt: '2026-09-20T10:00:00Z',
    setCount: 2,
    exerciseCount: 1,
    totalReps: 10,
    totalVolume: 600,
    doneSetCount: 0,
    done: false,
    ...overrides,
  };
}

const PAGE: WorkoutPageDto = {
  items: [workout({ id: 1, title: 'Push day', doneSetCount: 2, done: true }), workout({ id: 2, title: 'Leg day', doneSetCount: 1 })],
  total: 2,
  limit: 10,
  offset: 0,
};

test('marks only the done workout as done', async () => {
  fake.respondTo('GET /api/workouts?limit=10&offset=0', 200, JSON.stringify(PAGE));
  const view = mount('gz-workout-list');
  await settle();
  const cards = Array.from(shadow(view).querySelectorAll('article.open-card'));
  const done = cards.map((card) => card.querySelector(".badge[data-variant='success']")?.textContent);
  expect(done).toEqual(['✓ Done', undefined]);
});
