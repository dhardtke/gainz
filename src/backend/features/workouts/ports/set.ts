import type { BestSetDto, LiftSetDto } from '../../../../shared/dto';

export interface LiftSet {
  id: number;
  workout_id: number;
  exercise_id: number;
  exercise_name: string;
  reps: number;
  weight: number;
  notes: string | null;
  position: number;
  created_at: string;
}

export function toLiftSet(row: LiftSet): LiftSetDto {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
  };
}

/**
 * The one spread in this directory, and it spreads a DTO rather than a row: `toLiftSet` has
 * already named every field, so nothing internal can ride along. Spreading `row` here would
 * ship `workout_id`, `exercise_id` and `created_at` to the browser without a word from anyone.
 */
export function toBestSet(row: LiftSet & { performed_on: string }): BestSetDto {
  return { ...toLiftSet(row), performedOn: row.performed_on };
}
