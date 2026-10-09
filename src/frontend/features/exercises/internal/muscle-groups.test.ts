import { expect, test } from 'bun:test';
import { exercisesPath, MUSCLE_GROUPS, parseMuscleGroupFilter } from './muscle-groups.ts';

test('lists the seven groups in order', () => {
  expect(MUSCLE_GROUPS).toEqual(['Chest', 'Back', 'Shoulders', 'Arms', 'Legs', 'Core', 'Full body']);
});

test.each([
  ['', null],
  ['?page=2', null],
  ['?muscleGroup=Legs', 'Legs'],
  ['?muscleGroup=Full+body', 'Full body'],
  ['?muscleGroup=Full%20body&page=3', 'Full body'],
  ['?muscleGroup=none', 'none'],
  ['?muscleGroup=legs', null],
  ['?muscleGroup=Quads', null],
] as const)('parseMuscleGroupFilter(%p) is %p', (search, filter) => {
  expect(parseMuscleGroupFilter(search)).toBe(filter);
});

test.each([
  [null, 1, '/exercises'],
  [null, 3, '/exercises?page=3'],
  ['Legs', 1, '/exercises?muscleGroup=Legs'],
  ['Legs', 2, '/exercises?muscleGroup=Legs&page=2'],
  ['none', 1, '/exercises?muscleGroup=none'],
  ['Full body', 2, '/exercises?muscleGroup=Full+body&page=2'],
] as const)('exercisesPath(%p, %p) is %p', (filter, page, path) => {
  expect(exercisesPath(filter, page)).toBe(path);
});
