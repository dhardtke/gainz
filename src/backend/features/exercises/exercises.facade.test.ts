import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../../db/db.ts';
import { thrown } from '../../testing.ts';
import { createExerciseFacade } from './exercises.facade.ts';
import { translateToCreateExerciseDto, translateToEditExerciseDto } from './internal/exercise.translator.ts';

describe('ExerciseFacade validation', () => {
  test('create trims the name and keeps a missing muscle group null', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    expect(exercises.create({ name: '  Squat ', muscleGroup: null })).toMatchObject({ name: 'Squat', muscle_group: null });
  });

  test('create rejects a blank name', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    const err = thrown(() => exercises.create({ name: '' }));
    expect(err.status).toBe(400);
    expect(err.message).toBe('"name" is required and must be a non-empty string');
  });

  test('update clears notes and leaves the name', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    const { id } = exercises.create({ name: 'Squat', notes: 'Low bar' });
    expect(exercises.update(id, { notes: null })).toMatchObject({ name: 'Squat', notes: null });
  });

  test('update rejects a blank name', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    const { id } = exercises.create({ name: 'Squat' });
    expect(thrown(() => exercises.update(id, { name: '' })).status).toBe(400);
  });

  test('update validates before looking up the exercise', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    expect(thrown(() => exercises.update(999999, { name: '' })).status).toBe(400);
  });

  test('create makes an exercise weighted unless told otherwise', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    expect(exercises.create({ name: 'Squat' }).bodyweight).toBe(0);
    expect(exercises.create({ name: 'Dips', bodyweight: true }).bodyweight).toBe(1);
  });

  test('create and update reject a bodyweight flag that is not a boolean', () => {
    const exercises = createExerciseFacade(openDatabase(':memory:'));
    const { id } = exercises.create({ name: 'Dips' });
    const err = thrown(() => exercises.create(translateToCreateExerciseDto({ name: 'Plank', bodyweight: 'yes' })));
    expect(err.status).toBe(400);
    expect(err.message).toBe('"bodyweight" must be true or false');
    expect(thrown(() => exercises.update(id, translateToEditExerciseDto({ bodyweight: 1 }))).status).toBe(400);
  });
});
