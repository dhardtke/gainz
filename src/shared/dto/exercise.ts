import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../flavors.ts';
import type { BestSetDto } from './set.ts';

export interface ExerciseDto {
  id: ExerciseId;
  name: string;
  muscleGroup: string | null;
  notes: string | null;
  createdAt: Iso8601DateTime;
}

export interface ExerciseWithStatsDto extends ExerciseDto {
  setCount: number;
  workoutCount: number;
  lastPerformedOn: Iso8601Date | null;
  bestWeight: number | null;
}

/** One session on an exercise's progress line. */
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

/** Everything the exercise detail view plots. */
export interface ExerciseProgressDto {
  exercise: ExerciseDto;
  /** Oldest first. */
  sessions: SessionPointDto[];
  bestSet: BestSetDto | null;
}

export interface CreateExerciseDto {
  name: string;
  muscleGroup?: string | null;
  notes?: string | null;
}

export interface EditExerciseDto {
  name?: string;
  muscleGroup?: string | null;
  notes?: string | null;
}
