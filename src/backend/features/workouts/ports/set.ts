import type { ExerciseId, Iso8601DateTime, LiftSetId, WorkoutId } from '../../../../shared/flavors.ts';

export interface LiftSet {
  id: LiftSetId;
  workout_id: WorkoutId;
  exercise_id: ExerciseId;
  exercise_name: string;
  reps: number;
  weight: number;
  notes: string | null;
  position: number;
  created_at: Iso8601DateTime;
}
