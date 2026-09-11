export interface LiftSetDto {
  id: number;
  workoutId: number;
  exerciseId: number;
  exerciseName: string;
  reps: number;
  weight: number;
  notes: string | null;
  position: number;
  createdAt: string;
}

/** The heaviest set ever logged for an exercise, carrying the day it happened. */
export interface BestSetDto extends LiftSetDto {
  /** ISO date, `YYYY-MM-DD`. */
  performedOn: string;
}

/** The body of `POST /workouts/:id/sets`. */
export interface CreateSetDto {
  exerciseId: number;
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
  exerciseId?: number;
  reps?: number;
  weight?: number;
  notes?: string | null;
  position?: number;
}
