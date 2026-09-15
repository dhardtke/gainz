import { expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { exerciseFacade } from './exercises.facade.ts';

const fetch = useFetch();

test.each([
  ['list()', (): Promise<unknown> => exerciseFacade.list(), 'GET', '/api/exercises'],
  ['get()', (): Promise<unknown> => exerciseFacade.get(4), 'GET', '/api/exercises/4'],
  ['progress()', (): Promise<unknown> => exerciseFacade.progress(4), 'GET', '/api/exercises/4/progress'],
  ['create()', (): Promise<unknown> => exerciseFacade.create({ name: 'Squat' }), 'POST', '/api/exercises'],
  ['update()', (): Promise<unknown> => exerciseFacade.update(4, { muscleGroup: 'Legs' }), 'PATCH', '/api/exercises/4'],
  ['delete()', (): Promise<unknown> => exerciseFacade.delete(4), 'DELETE', '/api/exercises/4'],
] as const)('exerciseFacade.%s', async (_name, call, method, url) => {
  await call();

  expect(fetch.requests).toMatchObject([{ method, url }]);
});
