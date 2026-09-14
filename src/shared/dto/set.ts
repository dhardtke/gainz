import type { ExerciseId, Iso8601Date, Iso8601DateTime, LiftSetId, WorkoutId } from '../flavors.ts';

export interface LiftSetDto {
  id: LiftSetId;
  workoutId: WorkoutId;
  exerciseId: ExerciseId;
  exerciseName: string;
  reps: number;
  weight: number;
  notes: string | null;
  position: number;
  createdAt: Iso8601DateTime;
}

/** The heaviest set ever logged for an exercise, carrying the day it happened. */
export interface BestSetDto extends LiftSetDto {
  performedOn: Iso8601Date;
}

/** The body of `POST /workouts/:id/sets`. */
export interface CreateSetDto {
  exerciseId: ExerciseId;
  reps: number;
  weight: number;
  notes?: string | null;
  /** Appended to the workout when left out. */
  position?: number;
}

/**
 * The body of `PATCH /sets/:id`. Every field is optional and only the ones
 * present are written; written out in full rather than derived from
 * `CreateSetDto`, so the contract reads straight off this file.
 */
export interface EditSetDto {
  exerciseId?: ExerciseId;
  reps?: number;
  weight?: number;
  notes?: string | null;
  position?: number;
}
