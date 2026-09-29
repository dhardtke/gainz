import { describe, expect, test } from 'bun:test';
import type { SummaryDto } from '../../../shared/dto/stats.ts';
import { body, useServer } from '../../testing.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createWorkout } from '../workouts/workouts.fixtures.ts';

const { api, post } = useServer();

describe('stats', () => {
  test('summarizes the whole log', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await post(`/api/workouts/${workout.id}/sets`, { exerciseId: exercise.id, reps: 10, weight: 40 });

    const summary = await body<SummaryDto>(await api('/api/stats/summary'));
    expect(summary).toMatchObject({
      workoutCount: 1,
      setCount: 1,
      totalReps: 10,
      totalVolume: 400,
      exerciseCount: 1,
      lastPerformedOn: '2026-01-05',
    });
  });
});
