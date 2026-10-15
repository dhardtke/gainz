import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../flavors.ts';
import type { ExerciseKind } from '../exercise-kind.ts';
import type { MuscleGroup, MuscleGroupFilter } from '../muscle-group.ts';
import type { BestSetDto, LiftSetDto } from './set.ts';

export interface ExerciseDto {
  id: ExerciseId;
  name: string;
  muscleGroup: MuscleGroup | null;
  notes: string | null;
  kind: ExerciseKind;
  createdAt: Iso8601DateTime;
}

export interface ExerciseWithStatsDto extends ExerciseDto {
  setCount: number;
  workoutCount: number;
  lastPerformedOn: Iso8601Date | null;
  bestWeight: number | null;
  /** Most reps in one done set. */
  bestReps: number | null;
  /** Least weight in one done set: an assisted exercise's least assistance. */
  leastWeight: number | null;
}

/** The query of `GET /api/exercises` and `GET /api/exercises/:id/position`; a missing key filters nothing. */
export interface ExerciseFilterDto {
  muscleGroup?: MuscleGroupFilter;
  type?: ExerciseKind;
  /** Matches the names containing it. */
  search?: string;
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
  /** Least weight in one set: an assisted exercise's least assistance. */
  leastWeight: number;
  /** reps × (body weight − weight); null without a weigh-in on or before the date or with assistance at or above it. */
  effectiveVolume: number | null;
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
  kind?: ExerciseKind;
}

export interface EditExerciseDto {
  name?: string;
  muscleGroup?: MuscleGroup | null;
  notes?: string | null;
  kind?: ExerciseKind;
}
