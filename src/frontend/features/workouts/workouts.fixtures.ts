/** Test-only. Workout data for any feature's component tests; never embedded in the build. */
import type { LiftSetDto } from '../../../shared/dto/set.ts';

export function set(overrides: Partial<LiftSetDto> = {}): LiftSetDto {
  const id = overrides.id ?? 1;
  return { id, workoutId: 3, exerciseId: 1, exerciseName: '', reps: 5, weight: 60, notes: null, position: id, createdAt: '2026-09-20T10:00:00Z', ...overrides };
}
