/** Test-only. Workout data for any feature's component tests; never embedded in the build. */
import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutExerciseDto } from '../../../shared/dto/workout.ts';

export function set(overrides: Partial<LiftSetDto> = {}): LiftSetDto {
  const id = overrides.id ?? 1;
  return {
    id,
    workoutId: 3,
    exerciseId: 1,
    exerciseName: '',
    reps: 5,
    weight: 60,
    notes: null,
    position: id,
    done: false,
    createdAt: '2026-09-20T10:00:00Z',
    ...overrides,
  };
}

/** One exercise of a workout with its sets. */
export function group(overrides: Partial<WorkoutExerciseDto> = {}): WorkoutExerciseDto {
  return {
    exerciseId: 1,
    exerciseName: 'Bench Press',
    position: 1,
    sets: [],
    ...overrides,
  };
}
