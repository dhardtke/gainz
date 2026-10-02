import { describe, expect, test } from 'bun:test';
import { type DB, openDatabase } from '../../db/db.ts';
import { at, thrown } from '../../testing.ts';
import { today } from '../../shared/validate.ts';
import { createExerciseFacade } from '../exercises/exercises.facade.ts';
import { createWorkoutFacades } from './workouts.facade.ts';

function setup(): ReturnType<typeof createWorkoutFacades> & { db: DB; exerciseId: number } {
  const db = openDatabase(':memory:');
  return { ...createWorkoutFacades(db), db, exerciseId: createExerciseFacade(db).create({ name: 'Squat' }).id };
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

  test('deleting a workout leaves no exercise order behind', () => {
    const { db, workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });
    expect(workouts.exercises(workout.id)).toHaveLength(1);

    workouts.delete(workout.id);
    expect(db.query('SELECT 1 FROM workout_exercises WHERE workout_id = ?').all(workout.id)).toEqual([]);
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

  test('create ignores a position and appends the set', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    const first = sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });

    // Not a literal, so the extra key passes the type check, as it would arrive from a client.
    const dto = { exerciseId, reps: 5, weight: 60, position: 0 };
    expect(sets.create(workout.id, dto).position).toBe(first.position + 1);
  });

  test('update ignores a position', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    const set = sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });

    const dto = { reps: 6, position: 9 };
    expect(sets.update(set.id, dto)).toMatchObject({ reps: 6, position: set.position });
  });

  test("update keeps the set's exercise", () => {
    const { db, workouts, sets, exerciseId } = setup();
    const other = createExerciseFacade(db).create({ name: 'Bench' }).id;
    const workout = workouts.create({});
    const set = sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });

    const dto = { reps: 6, exerciseId: other };
    expect(sets.update(set.id, dto)).toMatchObject({ reps: 6, exercise_id: exerciseId });
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

  test('update stores done as 1', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    const set = sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });
    expect(sets.update(set.id, { done: true }).done).toBe(1);
  });

  test('update and delete refuse a done set with 409', () => {
    const { workouts, sets, exerciseId } = setup();
    const workout = workouts.create({});
    const set = sets.create(workout.id, { exerciseId, reps: 5, weight: 60 });
    sets.update(set.id, { done: true });
    expect(thrown(() => sets.update(set.id, { reps: 6 })).status).toBe(409);
    expect(
      thrown(() => {
        sets.delete(set.id);
      }).status,
    ).toBe(409);
  });
});

describe('WorkoutFacade.moveExercise', () => {
  function threeExercises(): ReturnType<typeof setup> & { workoutId: number; ids: number[] } {
    const facades = setup();
    const exercises = createExerciseFacade(facades.db);
    const workoutId = facades.workouts.create({}).id;
    const ids = [facades.exerciseId, exercises.create({ name: 'Bench' }).id, exercises.create({ name: 'Row' }).id];
    for (const exerciseId of ids) {
      facades.sets.create(workoutId, { exerciseId, reps: 5, weight: 60 });
    }
    return { ...facades, workoutId, ids };
  }

  function order(workouts: ReturnType<typeof setup>['workouts'], workoutId: number): number[][] {
    return workouts.exercises(workoutId).map((row) => [row.exercise_id, row.position]);
  }

  test('orders tied positions by exercise id, then swaps', () => {
    const { db, workouts, workoutId, ids } = threeExercises();
    db.query('UPDATE workout_exercises SET position = 0 WHERE workout_id = ?').run(workoutId);

    workouts.moveExercise(workoutId, at(ids, 0), { direction: 'up' });
    expect(order(workouts, workoutId)).toEqual(ids.map((id, index) => [id, index + 1]));

    workouts.moveExercise(workoutId, at(ids, 0), { direction: 'down' });
    expect(order(workouts, workoutId).map(([id]) => id)).toEqual([at(ids, 1), at(ids, 0), at(ids, 2)]);
  });

  test('renumbers positions with gaps to 1..n', () => {
    const { db, workouts, workoutId, ids } = threeExercises();
    const renumber = db.query('UPDATE workout_exercises SET position = ? WHERE workout_id = ? AND exercise_id = ?');
    for (const [index, position] of [5, 9, 40].entries()) {
      renumber.run(position, workoutId, at(ids, index));
    }

    workouts.moveExercise(workoutId, at(ids, 2), { direction: 'up' });
    expect(order(workouts, workoutId)).toEqual([
      [at(ids, 0), 1],
      [at(ids, 2), 2],
      [at(ids, 1), 3],
    ]);
  });

  test('validates the direction before looking up the workout', () => {
    const { workouts, ids } = threeExercises();
    expect(
      thrown(() => {
        // @ts-expect-error -- a client may send any string; the facade must reject it
        workouts.moveExercise(999999, at(ids, 0), { direction: 'sideways' });
      }).status,
    ).toBe(400);
  });
});
