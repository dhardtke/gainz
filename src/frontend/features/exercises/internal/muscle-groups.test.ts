import { expect, test } from 'bun:test';
import { MUSCLE_GROUPS, parseMuscleGroupFilter } from './muscle-groups.ts';

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
