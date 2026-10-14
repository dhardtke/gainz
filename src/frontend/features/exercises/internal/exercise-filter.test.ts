import { expect, test } from 'bun:test';
import type { ExerciseFilterDto } from '../../../../shared/dto/exercise.ts';
import { EXERCISE_KINDS, exercisesPath, isFiltered, kindOptions, parseExerciseFilter, typeFilterOptions } from './exercise-filter.ts';

test('lists the three kinds', () => {
  expect(EXERCISE_KINDS).toEqual(['weighted', 'bodyweight', 'assisted']);
});

const labels = (options: string): string[] => [...options.matchAll(/>([^<]+)<\/option>/g)].map((match) => match[1] ?? '');

test('offers All and the three kinds to filter by', () => {
  expect(labels(typeFilterOptions('assisted').value)).toEqual(['All', 'Weighted', 'Bodyweight', 'Assisted']);
  expect(typeFilterOptions('assisted').value).toContain('<option value="assisted" selected>');
});

test('offers the three kinds to choose from, the given one selected', () => {
  expect(labels(kindOptions('bodyweight').value)).toEqual(['Weighted', 'Bodyweight', 'Assisted']);
  expect(kindOptions('bodyweight').value).toContain('<option value="bodyweight" selected>');
});

test.each([
  ['', {}],
  ['?page=2', {}],
  ['?muscleGroup=Legs', { muscleGroup: 'Legs' }],
  ['?type=bodyweight', { type: 'bodyweight' }],
  ['?type=assisted', { type: 'assisted' }],
  ['?muscleGroup=none&type=weighted&page=3', { muscleGroup: 'none', type: 'weighted' }],
  ['?type=Bodyweight', {}],
  ['?muscleGroup=Quads&type=true', {}],
] as const)('parseExerciseFilter(%p) is %p', (search, filter) => {
  expect(parseExerciseFilter(search)).toEqual(filter);
});

test.each([
  [{}, 1, '/exercises'],
  [{}, 3, '/exercises?page=3'],
  [{ muscleGroup: 'Legs' }, 1, '/exercises?muscleGroup=Legs'],
  [{ muscleGroup: 'Legs' }, 2, '/exercises?muscleGroup=Legs&page=2'],
  [{ muscleGroup: 'none' }, 1, '/exercises?muscleGroup=none'],
  [{ muscleGroup: 'Full body' }, 2, '/exercises?muscleGroup=Full+body&page=2'],
  [{ type: 'bodyweight' }, 1, '/exercises?type=bodyweight'],
  [{ muscleGroup: 'Back', type: 'weighted' }, 2, '/exercises?muscleGroup=Back&type=weighted&page=2'],
] as const)('exercisesPath(%p, %p) is %p', (filter: ExerciseFilterDto, page, path) => {
  expect(exercisesPath(filter, page)).toBe(path);
});

test('is filtered by either filter alone', () => {
  expect([isFiltered({}), isFiltered({ muscleGroup: 'none' }), isFiltered({ type: 'weighted' })]).toEqual([false, true, true]);
});
