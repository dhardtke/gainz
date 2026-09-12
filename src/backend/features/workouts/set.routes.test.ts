import { describe, expect, test } from 'bun:test';
import type { LiftSetDto, WorkoutWithSetsDto } from '../../../shared/dto';
import { body, useServer } from '../../testing.ts';

const { api, post, patch, createExercise, createWorkout } = useServer();

describe('sets', () => {
  test('updates and deletes a set', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await body<LiftSetDto>(await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 }));

    const updated = await body<LiftSetDto>(await patch(`/api/sets/${set.id}`, { reps: 6, weight: 62.5 }));
    expect(updated).toMatchObject({ reps: 6, weight: 62.5 });

    expect((await api(`/api/sets/${set.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/workouts/${workout.id}`)).status).toBe(200);
    expect((await body<WorkoutWithSetsDto>(await api(`/api/workouts/${workout.id}`))).sets).toHaveLength(0);
  });

  test('rejects a patch naming an exercise that does not exist', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await body<LiftSetDto>(await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 5, weight: 60 }));

    expect((await patch(`/api/sets/${set.id}`, { exerciseId: 4242 })).status).toBe(400);
  });
});
