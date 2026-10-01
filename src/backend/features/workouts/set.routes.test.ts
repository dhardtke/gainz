import { describe, expect, test } from 'bun:test';
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import { body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout } from './workouts.fixtures.ts';

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

  test('validates the body before looking up the set', async () => {
    expect((await patch('/api/sets/999999', { reps: 0 })).status).toBe(400);
  });
});
