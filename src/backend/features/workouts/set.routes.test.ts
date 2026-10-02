import { describe, expect, test } from 'bun:test';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
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
    expect((await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workout.id}`))).sets).toHaveLength(0);
  });

  test('rejects a patch naming an exercise that does not exist', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60 });

    expect((await patch(`/api/sets/${set.id}`, { exerciseId: 4242 })).status).toBe(400);
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
    const other = await createExercise(post, 'Back Squat');
    const workout = await createWorkout(post);
    const set = await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 60, notes: 'Easy' });
    const done = await markDone(patch, set.id);

    for (const change of [{ reps: 6 }, { weight: 62.5 }, { exerciseId: other.id }, { notes: 'Hard' }, { done: false, reps: 6 }]) {
      expect((await patch(`/api/sets/${set.id}`, change)).status).toBe(409);
    }
    expect((await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workout.id}`))).sets).toEqual([done]);
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

  test('validates the body before looking up the set', async () => {
    expect((await patch('/api/sets/999999', { reps: 0 })).status).toBe(400);
  });
});
