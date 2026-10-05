import { beforeAll, expect, test } from 'bun:test';
import { find, mount, settle, shadow, text, useDom, useFetch } from '../../testing.ts';
import type { ExercisePageDto, ExerciseWithStatsDto } from '../../../shared/dto/exercise.ts';
import { exercise } from './exercises.fixtures.ts';

useDom();
const fake = useFetch();

beforeAll(async () => {
  await import('./gz-exercise-list.component.ts');
});

const listed = (overrides: Partial<ExerciseWithStatsDto> = {}): ExerciseWithStatsDto => ({
  ...exercise(overrides),
  setCount: 0,
  workoutCount: 0,
  lastPerformedOn: null,
  bestWeight: null,
  ...overrides,
});

function page(items: ExerciseWithStatsDto[]): string {
  const dto: ExercisePageDto = { items, total: items.length, limit: 10, offset: 0 };
  return JSON.stringify(dto);
}

test('opens "Add an exercise" while there are no exercises', async () => {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(find<HTMLDetailsElement>(shadow(view), 'details.add').open).toBe(true);
});

test('collapses "Add an exercise" once there are some, and counts them', async () => {
  fake.respondTo('GET /api/exercises?limit=10&offset=0', 200, page([listed({ id: 1, name: 'Bench Press' }), listed({ id: 2, name: 'Back Squat' })]));
  const view = mount('gz-exercise-list');
  await settle();
  expect(find<HTMLDetailsElement>(shadow(view), 'details.add').open).toBe(false);
  expect(text(view, 'hgroup p.text-light')).toBe('2 exercises');
});
