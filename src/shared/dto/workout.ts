import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../flavors.ts';
import type { ExerciseKind } from '../exercise-kind.ts';
import type { LiftSetDto } from './set.ts';
import type { MuscleGroup } from '../muscle-group.ts';

export interface WorkoutDto {
  id: WorkoutId;
  performedOn: Iso8601Date;
  title: string | null;
  notes: string | null;
  createdAt: Iso8601DateTime;
  done: boolean;
}

export interface WorkoutWithStatsDto extends WorkoutDto {
  setCount: number;
  exerciseCount: number;
  totalReps: number;
  totalVolume: number;
  doneSetCount: number;
}

export interface WorkoutExerciseDto {
  exerciseId: ExerciseId;
  exerciseName: string;
  muscleGroup: MuscleGroup | null;
  kind: ExerciseKind;
  /** 1-based place of the exercise in the workout. */
  position: number;
  /** Oldest first. */
  sets: LiftSetDto[];
}

export interface WorkoutWithExercisesDto extends WorkoutDto {
  exercises: WorkoutExerciseDto[];
}

export type MoveDirection = 'up' | 'down';

export interface MoveWorkoutExerciseDto {
  direction: MoveDirection;
}

/** Replaces the exercise's sets not yet done with this one's last session, or turns them into its sets when it has none. */
export interface SwapWorkoutExerciseDto {
  exerciseId: ExerciseId;
}

export interface AddWorkoutExercisesDto {
  /** Each exercise's last session is copied in this order. */
  exerciseIds: ExerciseId[];
}

export interface WorkoutPageDto {
  items: WorkoutWithStatsDto[];
  /** Every workout, not just this page. */
  total: number;
  limit: number;
  offset: number;
}

export interface CreateWorkoutDto {
  /** Defaults to today on the server. */
  performedOn?: Iso8601Date;
  title?: string | null;
  notes?: string | null;
  /** Copies that workout's sets into the new one. */
  copyFromWorkoutId?: WorkoutId;
}

export interface EditWorkoutDto {
  performedOn?: Iso8601Date;
  title?: string | null;
  notes?: string | null;
  done?: boolean;
}
