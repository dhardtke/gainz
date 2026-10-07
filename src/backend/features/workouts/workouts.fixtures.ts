import { expect } from 'bun:test';
import type { CreateSetDto, LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutWithExercisesDto } from '../../../shared/dto/workout.ts';
import type { LiftSetId, WorkoutId } from '../../../shared/flavors.ts';
import { body, type TestServer } from '../../testing.ts';

export async function createWorkout(post: TestServer['post'], performedOn = '2026-01-05'): Promise<WorkoutWithExercisesDto> {
  const res = await post('/api/workouts', { performedOn, title: 'Push day' });
  expect(res.status).toBe(201);
  return body<WorkoutWithExercisesDto>(res);
}

export async function createSet(post: TestServer['post'], workoutId: WorkoutId, set: CreateSetDto): Promise<LiftSetDto> {
  const res = await post(`/api/workouts/${workoutId}/sets`, set);
  expect(res.status).toBe(201);
  return body<LiftSetDto>(res);
}

export async function markDone(patch: TestServer['patch'], setId: LiftSetId): Promise<LiftSetDto> {
  const res = await patch(`/api/sets/${setId}`, { done: true });
  expect(res.status).toBe(200);
  return body<LiftSetDto>(res);
}
