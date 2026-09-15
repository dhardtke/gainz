/** Test-only. Workout data for any feature's route tests; no production module imports it. */
import { expect } from 'bun:test';
import type { WorkoutWithSetsDto } from '../../../shared/dto/workout.ts';
import { body, type TestServer } from '../../testing.ts';

export async function createWorkout(post: TestServer['post'], performedOn = '2026-01-05'): Promise<WorkoutWithSetsDto> {
  const res = await post('/api/workouts', { performedOn, title: 'Push day' });
  expect(res.status).toBe(201);
  return body<WorkoutWithSetsDto>(res);
}
