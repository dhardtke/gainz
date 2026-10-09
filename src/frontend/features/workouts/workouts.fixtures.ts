import type { LiftSetDto } from '../../../shared/dto/set.ts';
import type { WorkoutExerciseDto, WorkoutWithStatsDto } from '../../../shared/dto/workout.ts';

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

export function group(overrides: Partial<WorkoutExerciseDto> = {}): WorkoutExerciseDto {
  return {
    exerciseId: 1,
    exerciseName: 'Bench Press',
    muscleGroup: null,
    position: 1,
    sets: [],
    ...overrides,
  };
}

export function listedWorkout(overrides: Partial<WorkoutWithStatsDto> = {}): WorkoutWithStatsDto {
  return {
    id: 1,
    performedOn: '2026-09-20',
    title: 'Push day',
    notes: null,
    createdAt: '2026-09-20T10:00:00Z',
    setCount: 2,
    exerciseCount: 1,
    totalReps: 10,
    totalVolume: 600,
    doneSetCount: 0,
    done: false,
    ...overrides,
  };
}
