import { describe, expect, test } from 'bun:test';
import type { SummaryDto } from '../../../shared/dto/stats.ts';
import { body, useServer } from '../../testing.ts';
import { today } from '../../shared/validate.ts';
import { createExercise } from '../exercises/exercises.fixtures.ts';
import { createSet, createWorkout, markDone } from '../workouts/workouts.fixtures.ts';

const { api, post, patch } = useServer();

describe('stats', () => {
  test('summarizes the whole log', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post);
    await markDone(patch, (await createSet(post, workout.id, { exerciseId: exercise.id, reps: 10, weight: 40 })).id);

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

  test('leaves sets not done out of the set-based numbers, but counts their workout', async () => {
    const exercise = await createExercise(post);
    const workout = await createWorkout(post, today());
    await markDone(patch, (await createSet(post, workout.id, { exerciseId: exercise.id, reps: 10, weight: 40 })).id);
    await createSet(post, workout.id, { exerciseId: exercise.id, reps: 5, weight: 100 });

    const summary = await body<SummaryDto>(await api('/api/stats/summary'));
    expect(summary).toMatchObject({
      workoutCount: 1,
      setCount: 1,
      totalReps: 10,
      totalVolume: 400,
      workoutsLast30Days: 1,
      volumeLast30Days: 400,
    });
  });
});
