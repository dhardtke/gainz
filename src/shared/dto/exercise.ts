import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../flavors.ts';
import type { MuscleGroup } from '../muscle-group.ts';
import type { BestSetDto } from './set.ts';

export interface ExerciseDto {
  id: ExerciseId;
  name: string;
  muscleGroup: MuscleGroup | null;
  notes: string | null;
  createdAt: Iso8601DateTime;
}

export interface ExerciseWithStatsDto extends ExerciseDto {
  setCount: number;
  workoutCount: number;
  lastPerformedOn: Iso8601Date | null;
  bestWeight: number | null;
}

export interface ExercisePageDto {
  items: ExerciseWithStatsDto[];
  /** Every exercise matching the filter, not just this page. */
  total: number;
  /** Every exercise, whatever the filter. */
  all: number;
  /** Null when the request asked for every exercise. */
  limit: number | null;
  offset: number;
}

export interface ExercisePositionDto {
  /** 0-based. */
  index: number;
}

export interface SessionPointDto {
  workoutId: WorkoutId;
  performedOn: Iso8601Date;
  setCount: number;
  totalReps: number;
  totalVolume: number;
  topWeight: number;
  /** Epley estimate from the session's best set. */
  estOneRepMax: number;
}

export interface ExerciseProgressDto {
  exercise: ExerciseDto;
  /** Oldest first. */
  sessions: SessionPointDto[];
  bestSet: BestSetDto | null;
}

export interface CreateExerciseDto {
  name: string;
  muscleGroup?: MuscleGroup | null;
  notes?: string | null;
}

export interface EditExerciseDto {
  name?: string;
  muscleGroup?: MuscleGroup | null;
  notes?: string | null;
}
