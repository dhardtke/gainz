import { expect, test } from 'bun:test';
import { useFetch } from '../../testing.ts';
import { exerciseFacade } from './exercises.facade.ts';

const fetch = useFetch();

test.each([
  ['list()', (): Promise<unknown> => exerciseFacade.list(), 'GET', '/api/exercises'],
  ['list(page)', (): Promise<unknown> => exerciseFacade.list({ limit: 10, offset: 20 }), 'GET', '/api/exercises?limit=10&offset=20'],
  ['get()', (): Promise<unknown> => exerciseFacade.get(4), 'GET', '/api/exercises/4'],
  ['position()', (): Promise<unknown> => exerciseFacade.position(4), 'GET', '/api/exercises/4/position'],
  ['progress()', (): Promise<unknown> => exerciseFacade.progress(4), 'GET', '/api/exercises/4/progress'],
  ['create()', (): Promise<unknown> => exerciseFacade.create({ name: 'Squat' }), 'POST', '/api/exercises'],
  ['update()', (): Promise<unknown> => exerciseFacade.update(4, { muscleGroup: 'Legs' }), 'PATCH', '/api/exercises/4'],
  ['delete()', (): Promise<unknown> => exerciseFacade.delete(4), 'DELETE', '/api/exercises/4'],
] as const)('exerciseFacade.%s', async (_name, call, method, url) => {
  await call();

  expect(fetch.requests).toMatchObject([{ method, url }]);
});
