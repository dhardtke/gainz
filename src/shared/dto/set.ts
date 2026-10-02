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
  done: boolean;
  createdAt: Iso8601DateTime;
}

/** The heaviest set ever logged for an exercise, carrying the day it happened. */
export interface BestSetDto extends LiftSetDto {
  performedOn: Iso8601Date;
}

export interface CreateSetDto {
  exerciseId: ExerciseId;
  reps: number;
  weight: number;
  notes?: string | null;
}

export interface EditSetDto {
  exerciseId?: ExerciseId;
  reps?: number;
  weight?: number;
  notes?: string | null;
  done?: boolean;
}

export type SetDirection = 'up' | 'down';

export interface MoveSetDto {
  /** Toward the start (`up`) or the end (`down`) of the workout. */
  direction: SetDirection;
}
