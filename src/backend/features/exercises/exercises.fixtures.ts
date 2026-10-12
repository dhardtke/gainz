import { expect } from 'bun:test';
import type { CreateExerciseDto, ExerciseDto } from '../../../shared/dto/exercise.ts';
import { body, type TestServer } from '../../testing.ts';

export async function createExercise(post: TestServer['post'], name = 'Bench Press', extra: Partial<CreateExerciseDto> = {}): Promise<ExerciseDto> {
  const res = await post('/api/exercises', { name, ...extra });
  expect(res.status).toBe(201);
  return body<ExerciseDto>(res);
}
