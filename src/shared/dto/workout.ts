import type { Iso8601Date, Iso8601DateTime, WorkoutId } from '../flavors.ts';
import type { LiftSetDto } from './set.ts';

export interface WorkoutDto {
  id: WorkoutId;
  /** ISO date, `YYYY-MM-DD`. */
  performedOn: Iso8601Date;
  title: string | null;
  notes: string | null;
  createdAt: Iso8601DateTime;
}

export interface WorkoutWithStatsDto extends WorkoutDto {
  setCount: number;
  exerciseCount: number;
  totalReps: number;
  totalVolume: number;
}

/**
 * A workout with its sets. `GET /workouts/:id` and `POST /workouts` return this;
 * `PATCH /workouts/:id` returns the bare `WorkoutDto`.
 */
export interface WorkoutWithSetsDto extends WorkoutDto {
  sets: LiftSetDto[];
}

/** One page of the training log. */
export interface WorkoutPageDto {
  items: WorkoutWithStatsDto[];
  /** Every workout, not just this page. */
  total: number;
  limit: number;
  offset: number;
}

/**
 * The body of `POST /workouts`. Every field is optional: a workout with nothing
 * set is today's empty session.
 */
export interface CreateWorkoutDto {
  /** Defaults to today on the server. */
  performedOn?: Iso8601Date;
  title?: string | null;
  notes?: string | null;
  /** Copies that workout's sets into the new one. */
  copyFromWorkoutId?: WorkoutId;
}

/**
 * The body of `PATCH /workouts/:id`: only the fields present are written. There is no
 * `copyFromWorkoutId` here — copying belongs to creating a session, not to editing one.
 */
export interface EditWorkoutDto {
  performedOn?: Iso8601Date;
  title?: string | null;
  notes?: string | null;
}
