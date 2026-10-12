import { describe, expect, test } from 'bun:test';
import type { ErrorDto } from '../../../shared/dto/error.ts';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import { body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout, markDone, markWorkoutDone } from './workouts.fixtures.ts';

const { api, post, patch } = useServer();

describe('sets', () => {
  test('updates and deletes a set', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const updated = await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { reps: 6, weight: 62.5 }));
    expect(updated).toMatchObject({ reps: 6, weight: 62.5 });

    expect((await api(`/api/sets/${set.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/workouts/${workout.id}`)).status).toBe(200);
    expect((await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`))).exercises).toEqual([]);
  });

  test("ignores an exercise in a patch: a set's exercise is fixed", async () => {
    const exercise = await createExercise(post);
    const other = await createExercise(post, 'Back Squat');
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const res = await patch(`/api/sets/${set.id}`, { exerciseId: other.id, reps: 6 });
    expect(res.status).toBe(200);
    expect(await body<LiftSetDto>(res)).toMatchObject({ reps: 6, exerciseId: exercise.id });
  });

  test('no longer moves a set', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect((await post(`/api/sets/${set.id}/move`, { direction: 'up' })).status).not.toBe(200);
  });

  test('starts a set not done and toggles it both ways', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    expect(set.done).toBe(false);

    expect(await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { done: true }))).toMatchObject({ done: true });
    expect(await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { done: false }))).toMatchObject({ done: false });
  });

  test('rejects a done state that is not a boolean', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect((await patch(`/api/sets/${set.id}`, { done: 'yes' })).status).toBe(400);
  });

  test('refuses to change a done set, even alongside unchecking it', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60, notes: 'Easy' });
    const done = await markDone(patch, set.id);

    for (const change of [{ reps: 6 }, { weight: 62.5 }, { notes: 'Hard' }, { done: false, reps: 6 }]) {
      expect((await patch(`/api/sets/${set.id}`, change)).status).toBe(409);
    }
    expect((await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`))).exercises.flatMap((group) => group.sets)).toEqual([done]);
  });

  test('changes a set again once it is unchecked', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, set.id);

    expect((await patch(`/api/sets/${set.id}`, { done: false })).status).toBe(200);
    expect((await patch(`/api/sets/${set.id}`, { reps: 6 })).status).toBe(200);
  });

  test('changes a set not done and marks it done in one patch', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    const res = await patch(`/api/sets/${set.id}`, { done: true, reps: 6 });
    expect(res.status).toBe(200);
    expect(await body<LiftSetDto>(res)).toMatchObject({ done: true, reps: 6 });
  });

  test('refuses to delete a done set but deletes one not done', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const done = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    const open = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, done.id);

    expect((await api(`/api/sets/${done.id}`, { method: 'DELETE' })).status).toBe(409);
    expect((await api(`/api/sets/${open.id}`, { method: 'DELETE' })).status).toBe(204);
  });

  test('deleting a workout still removes its done sets', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, set.id);

    expect((await api(`/api/workouts/${workout.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/sets/${set.id}`)).status).toBe(404);
  });

  test('ignores a position in a patch, on a set not done and on a done one', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const open = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    const done = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    await markDone(patch, done.id);

    for (const set of [open, done]) {
      const res = await patch(`/api/sets/${set.id}`, { position: 9 });
      expect(res.status).toBe(200);
      expect((await body<LiftSetDto>(res)).position).toBe(set.position);
    }
  });

  test("deleting an exercise's last set removes it from the workout, and deleting one of two keeps it", async () => {
    const bench = await createExercise(post);
    const row = await createExercise(post, 'Barbell Row');
    const workout = await createWorkout(post);
    const benchSet = await createSet(post, workout.id, { exerciseId: bench.id, reps: 5, weight: 80 });
    const firstRow = await createSet(post, workout.id, { exerciseId: row.id, reps: 8, weight: 60 });
    await createSet(post, workout.id, { exerciseId: row.id, reps: 8, weight: 60 });

    await api(`/api/sets/${firstRow.id}`, { method: 'DELETE' });
    await api(`/api/sets/${benchSet.id}`, { method: 'DELETE' });

    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`));
    expect(detail.exercises.map((group) => [group.exerciseId, group.sets.length])).toEqual([[row.id, 1]]);
  });

  test('logging a set of an exercise already in the workout neither adds nor moves its group', async () => {
    const bench = await createExercise(post);
    const row = await createExercise(post, 'Barbell Row');
    const workout = await createWorkout(post);
    await createSet(post, workout.id, { exerciseId: bench.id, reps: 5, weight: 80 });
    await createSet(post, workout.id, { exerciseId: row.id, reps: 8, weight: 60 });
    await createSet(post, workout.id, { exerciseId: bench.id, reps: 5, weight: 80 });

    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`));
    expect(detail.exercises.map((group) => [group.exerciseId, group.position, group.sets.length])).toEqual([
      [bench.id, 1, 2],
      [row.id, 2, 1],
    ]);
  });

  test('validates the body before looking up the set', async () => {
    expect((await patch('/api/sets/999999', { reps: 0 })).status).toBe(400);
  });
});

describe('weight', () => {
  async function setup(bodyweight: boolean): Promise<{ exerciseId: number; workoutId: number }> {
    const exercise = await createExercise(post, bodyweight ? 'Dips' : 'Bench Press', { bodyweight });
    const workout = await createWorkout(post);
    return { exerciseId: exercise.id, workoutId: workout.id };
  }

  test('is stored as 0 for a bodyweight exercise, left out or given as 0', async () => {
    const { exerciseId, workoutId } = await setup(true);
    expect((await createSet(post, workoutId, { exerciseId, reps: 12 })).weight).toBe(0);
    expect((await createSet(post, workoutId, { exerciseId, reps: 10, weight: 0 })).weight).toBe(0);
  });

  test('is refused for a bodyweight exercise unless 0', async () => {
    const { exerciseId, workoutId } = await setup(true);
    const res = await post(`/api/workouts/${workoutId}/sets`, { exerciseId, reps: 12, weight: 5 });
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"weight" must be 0 for a bodyweight exercise');
  });

  test('is required for a weighted exercise', async () => {
    const { exerciseId, workoutId } = await setup(false);
    const res = await post(`/api/workouts/${workoutId}/sets`, { exerciseId, reps: 5 });
    expect(res.status).toBe(400);
    expect((await body<ErrorDto>(res)).error).toBe('"weight" must be a number');
  });

  test('of a bodyweight set changes only to 0', async () => {
    const { exerciseId, workoutId } = await setup(true);
    const set = await createSet(post, workoutId, { exerciseId, reps: 12 });
    expect((await patch(`/api/sets/${set.id}`, { weight: 5 })).status).toBe(400);
    expect((await patch(`/api/sets/${set.id}`, { weight: 0 })).status).toBe(200);
    expect((await patch(`/api/sets/${set.id}`, { reps: 14 })).status).toBe(200);
  });

  test('leaves an unknown exercise a 400, with or without a weight', async () => {
    const { workoutId } = await setup(false);
    for (const set of [
      { exerciseId: 4242, reps: 5 },
      { exerciseId: 4242, reps: 5, weight: 60 },
    ]) {
      const res = await post(`/api/workouts/${workoutId}/sets`, set);
      expect(res.status).toBe(400);
      expect((await body<ErrorDto>(res)).error).toBe('"exerciseId" must name an existing exercise');
    }
  });

  test("is carried on the workout's groups as their exercise's flag", async () => {
    const dips = await createExercise(post, 'Dips', { bodyweight: true });
    const bench = await createExercise(post);
    const workout = await createWorkout(post);
    await createSet(post, workout.id, { exerciseId: dips.id, reps: 12 });
    await createSet(post, workout.id, { exerciseId: bench.id, reps: 5, weight: 60 });

    const detail = await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workout.id}`));
    expect(detail.exercises.map((group) => [group.exerciseName, group.bodyweight])).toEqual([
      ['Dips', true],
      ['Bench Press', false],
    ]);
  });
});

describe('a done workout', () => {
  async function doneWorkout(): Promise<{ workoutId: number; open: LiftSetDto; done: LiftSetDto }> {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const open = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });
    const done = await markDone(patch, (await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 })).id);
    await markWorkoutDone(patch, workout.id);
    return { workoutId: workout.id, open, done };
  }

  async function setsOf(workoutId: number): Promise<LiftSetDto[]> {
    return (await body<WorkoutWithExercisesDto>(await api(`/api/workouts/${workoutId}`))).exercises.flatMap((group) => group.sets);
  }

  test('refuses to change or delete its sets, and leaves them unchanged', async () => {
    const { workoutId, open, done } = await doneWorkout();

    for (const set of [open, done]) {
      for (const change of [{ done: true }, { done: false }, { reps: 6 }]) {
        expect((await patch(`/api/sets/${set.id}`, change)).status).toBe(409);
      }
      expect((await api(`/api/sets/${set.id}`, { method: 'DELETE' })).status).toBe(409);
    }
    expect(await setsOf(workoutId)).toEqual([open, done]);
  });

  test('changes and deletes its sets again once reopened', async () => {
    const { workoutId, open, done } = await doneWorkout();
    expect((await patch(`/api/workouts/${workoutId}`, { done: false })).status).toBe(200);

    expect((await patch(`/api/sets/${done.id}`, { done: false })).status).toBe(200);
    expect((await patch(`/api/sets/${open.id}`, { done: true })).status).toBe(200);
    expect((await patch(`/api/sets/${done.id}`, { reps: 6 })).status).toBe(200);
    expect((await api(`/api/sets/${done.id}`, { method: 'DELETE' })).status).toBe(204);
  });

  test('still answers a malformed body with 400', async () => {
    const { open } = await doneWorkout();

    expect((await patch(`/api/sets/${open.id}`, { reps: 0 })).status).toBe(400);
    expect((await patch(`/api/sets/${open.id}`, { done: 'yes' })).status).toBe(400);
  });
});
