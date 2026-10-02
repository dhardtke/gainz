import { describe, expect, test } from 'bun:test';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import { body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout, markDone } from './workouts.fixtures.ts';

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
