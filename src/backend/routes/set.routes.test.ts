import { describe, expect, test } from 'bun:test';
import type { LiftSet } from '../repo';
import type { WorkoutDetail } from '../testing';
import { body, useServer } from '../testing';

const { api, post, patch, createExercise, createWorkout } = useServer();

describe('sets', () => {
  test('updates and deletes a set', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    const set = await body<LiftSet>(await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 5, weight: 60 }));

    const updated = await body<LiftSet>(await patch(`/api/sets/${set.id}`, { reps: 6, weight: 62.5 }));
    expect(updated).toMatchObject({ reps: 6, weight: 62.5 });

    expect((await api(`/api/sets/${set.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await api(`/api/workouts/${workout.id}`)).status).toBe(200);
    expect((await body<WorkoutDetail>(await api(`/api/workouts/${workout.id}`))).sets).toHaveLength(0);
  });
});
