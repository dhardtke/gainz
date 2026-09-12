import { describe, expect, test } from 'bun:test';
import { openDatabase } from '../../db/db.ts';
import { HttpError } from '../../http/errors.ts';
import { today } from '../../shared/validate.ts';
import { createExerciseFacade } from '../exercises/exercises.facade.ts';
import { createWorkoutFacades } from './workouts.facade.ts';

function thrown(fn: () => unknown): HttpError {
  try {
    fn();
  } catch (err) {
    if (err instanceof HttpError) {
      return err;
    }
    throw err;
  }
  throw new Error('Expected an HttpError');
}

function setup(): ReturnType<typeof createWorkoutFacades> & { exerciseId: number } {
  const db = openDatabase(':memory:');
  return { ...createWorkoutFacades(db), exerciseId: createExerciseFacade(db).create({ name: 'Squat' }).id };
}

describe('WorkoutFacade validation', () => {
  test('create dates a workout without a date today', () => {
    const { workouts } = setup();
    expect(workouts.create({}).performed_on).toBe(today());
  });

  test('create rejects a date in another format', () => {
    const { workouts } = setup();
    expect(thrown(() => workouts.create({ performedOn: '05.01.2026' })).status).toBe(400);
  });

  test('create copies the sets of copyFromWorkoutId', () => {
    const { workouts, sets, exerciseId } = setup();
    const source = workouts.create({});
    sets.create(source.id, { exerciseId, reps: 5, weight: 60 });

    const copy = workouts.create({ copyFromWorkoutId: source.id });
    expect(sets.list(copy.id)).toHaveLength(1);
  });

  test('update validates before looking up the workout', () => {
    const { workouts } = setup();
    expect(thrown(() => workouts.update(999999, { performedOn: 'x' })).status).toBe(400);
  });
});

describe('SetFacade validation', () => {
  test('create rounds the weight, nulls blank notes and appends the set', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    const first = sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });

    const second = sets.create(workout.id, { exerciseId, reps: 5, weight: 62.555, notes: '  ' });
    expect(second).toMatchObject({ weight: 62.56, notes: null, position: first.position + 1 });
  });

  test('create rejects zero reps', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    expect(thrown(() => sets.create(workout.id, { exerciseId, reps: 0, weight: 60 })).status).toBe(400);
  });

  test('update clears notes and leaves reps', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    const set = sets.create(workout.id, { exerciseId, reps: 5, weight: 60, notes: 'Easy' });
    expect(sets.update(set.id, { notes: '' })).toMatchObject({ reps: 5, notes: null });
  });
});
