import { describe, expect, test } from 'bun:test';
import type { Summary } from '../../db/repos';
import { body, useServer } from '../../testing.ts';

const { api, post, createExercise, createWorkout } = useServer();

describe('stats', () => {
  test('summarises the whole log', async () => {
    const exercise = await createExercise();
    const workout = await createWorkout();
    await post(`/api/workouts/${workout.id}/sets`, { exercise_id: exercise.id, reps: 10, weight: 40 });

    const summary = await body<Summary>(await api('/api/stats/summary'));
    expect(summary).toMatchObject({
      workout_count: 1,
      set_count: 1,
      total_reps: 10,
      total_volume: 400,
      exercise_count: 1,
      last_performed_on: '2026-01-05',
    });
  });
});
