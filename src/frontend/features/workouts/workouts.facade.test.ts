import { describe, expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { setFacade, workoutFacade } from './workouts.facade.ts';

const fetch = useFetch();

describe('workoutFacade', () => {
  test.each([
    ['list() pages from the start by default', (): Promise<unknown> => workoutFacade.list(), 'GET', '/api/workouts?limit=50&offset=0'],
    ['list() passes a partial page through', (): Promise<unknown> => workoutFacade.list({ offset: 50 }), 'GET', '/api/workouts?limit=50&offset=50'],
    ['get()', (): Promise<unknown> => workoutFacade.get(7), 'GET', '/api/workouts/7'],
    ['create()', (): Promise<unknown> => workoutFacade.create({ performedOn: '2024-06-15', title: 'Push' }), 'POST', '/api/workouts'],
    ['update()', (): Promise<unknown> => workoutFacade.update(7, { notes: 'deload' }), 'PATCH', '/api/workouts/7'],
    ['delete()', (): Promise<unknown> => workoutFacade.delete(7), 'DELETE', '/api/workouts/7'],
    ['moveExercise()', (): Promise<unknown> => workoutFacade.moveExercise(7, 2, 'up'), 'POST', '/api/workouts/7/exercises/2/move'],
  ] as const)('%s', async (_name, call, method, url) => {
    await call();

    expect(fetch.requests).toMatchObject([{ method, url }]);
  });

  test('moveExercise() sends the direction', async () => {
    await workoutFacade.moveExercise(7, 2, 'up');

    expect(fetch.sent('POST /api/workouts/7/exercises/2/move')).toEqual([{ direction: 'up' }]);
  });
});

describe('setFacade', () => {
  test('create() posts under the workout the set belongs to', async () => {
    await setFacade.create(7, { exerciseId: 2, reps: 5, weight: 100 });

    expect(fetch.requests).toEqual([
      { method: 'POST', url: '/api/workouts/7/sets', headers: { 'content-type': 'application/json' }, body: { exerciseId: 2, reps: 5, weight: 100 } },
    ]);
  });

  test.each([
    ['update()', (): Promise<unknown> => setFacade.update(3, { reps: 6 }), 'PATCH', '/api/sets/3'],
    ['delete()', (): Promise<unknown> => setFacade.delete(3), 'DELETE', '/api/sets/3'],
  ] as const)('%s addresses the set by its own id', async (_name, call, method, url) => {
    await call();

    expect(fetch.requests).toMatchObject([{ method, url }]);
  });
});
