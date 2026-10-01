/** Test-only. Exercise data for any feature's component tests; never embedded in the build. */
import type { ExerciseDto, SessionPointDto } from '../../../shared/dto/exercise.ts';

export function exercise(overrides: Partial<ExerciseDto> = {}): ExerciseDto {
  return { id: 1, name: 'Bench Press', muscleGroup: null, notes: null, createdAt: '2026-08-01T10:00:00Z', ...overrides };
}

export function session(overrides: Partial<SessionPointDto> = {}): SessionPointDto {
  return { workoutId: 1, performedOn: '2026-09-01', setCount: 3, totalReps: 15, totalVolume: 1200, topWeight: 80, estOneRepMax: 90, ...overrides };
}
