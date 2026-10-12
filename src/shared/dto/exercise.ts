import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../flavors.ts';
import type { MuscleGroup, MuscleGroupFilter } from '../muscle-group.ts';
import type { BestSetDto, LiftSetDto } from './set.ts';

export interface ExerciseDto {
  id: ExerciseId;
  name: string;
  muscleGroup: MuscleGroup | null;
  notes: string | null;
  /** Logged as reps only, every set at weight 0. */
  bodyweight: boolean;
  createdAt: Iso8601DateTime;
}

export interface ExerciseWithStatsDto extends ExerciseDto {
  setCount: number;
  workoutCount: number;
  lastPerformedOn: Iso8601Date | null;
  bestWeight: number | null;
  /** Most reps in one done set. */
  bestReps: number | null;
}

/** The `type` filter of `GET /api/exercises`: the exercises with `bodyweight` set, or those without. */
export type ExerciseType = 'bodyweight' | 'weighted';

/** The query of `GET /api/exercises` and `GET /api/exercises/:id/position`; a missing key filters nothing. */
export interface ExerciseFilterDto {
  muscleGroup?: MuscleGroupFilter;
  type?: ExerciseType;
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
  /** Most reps in one set. */
  topReps: number;
  /** Epley estimate from the session's best set. */
  estOneRepMax: number;
}

export interface ExerciseProgressDto {
  exercise: ExerciseDto;
  /** Oldest first. */
  sessions: SessionPointDto[];
  bestSet: BestSetDto | null;
}

export interface LastSessionDto {
  workoutId: WorkoutId;
  performedOn: Iso8601Date;
  /** Done sets only, in logged order. */
  sets: LiftSetDto[];
}

export interface ExerciseLastSessionDto {
  session: LastSessionDto | null;
}

export interface CreateExerciseDto {
  name: string;
  muscleGroup?: MuscleGroup | null;
  notes?: string | null;
  bodyweight?: boolean;
}

export interface EditExerciseDto {
  name?: string;
  muscleGroup?: MuscleGroup | null;
  notes?: string | null;
  bodyweight?: boolean;
}
