import { expect } from 'bun:test';
import type { ExerciseDto } from '../../../shared/dto/exercise.ts';
import { body, type TestServer } from '../../testing.ts';

export async function createExercise(post: TestServer['post'], name = 'Bench Press'): Promise<ExerciseDto> {
  const res = await post('/api/exercises', { name });
  expect(res.status).toBe(201);
  return body<ExerciseDto>(res);
}
