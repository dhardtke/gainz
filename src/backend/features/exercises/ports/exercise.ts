import type { ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto, SessionPointDto } from '../../../../shared/dto';
import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../../../../shared/flavors.ts';
import { type LiftSet, toBestSet } from '../../workouts/ports/set.ts';

export interface Exercise {
  id: ExerciseId;
  name: string;
  muscle_group: string | null;
  notes: string | null;
  created_at: Iso8601DateTime;
}

export interface ExerciseWithStats extends Exercise {
  set_count: number;
  workout_count: number;
  last_performed_on: Iso8601Date | null;
  best_weight: number | null;
}

export interface SessionPoint {
  workout_id: WorkoutId;
  performed_on: Iso8601Date;
  set_count: number;
  total_reps: number;
  total_volume: number;
  top_weight: number;
  est_one_rep_max: number;
}

export function toExercise(row: Exercise): ExerciseDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function toExerciseWithStats(row: ExerciseWithStats): ExerciseWithStatsDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    createdAt: row.created_at,
    setCount: row.set_count,
    workoutCount: row.workout_count,
    lastPerformedOn: row.last_performed_on,
    bestWeight: row.best_weight,
  };
}

export function toSessionPoint(row: SessionPoint): SessionPointDto {
  return {
    workoutId: row.workout_id,
    performedOn: row.performed_on,
    setCount: row.set_count,
    totalReps: row.total_reps,
    totalVolume: row.total_volume,
    topWeight: row.top_weight,
    estOneRepMax: row.est_one_rep_max,
  };
}

export function toExerciseProgress(
  exercise: Exercise,
  sessions: SessionPoint[],
  bestSet: (LiftSet & { performed_on: Iso8601Date }) | null,
): ExerciseProgressDto {
  return {
    exercise: toExercise(exercise),
    sessions: sessions.map(toSessionPoint),
    bestSet: bestSet === null ? null : toBestSet(bestSet),
  };
}
