import type { ExerciseId, Iso8601Date, Iso8601DateTime, WorkoutId } from '../../../../shared/flavors.ts';

export interface Exercise {
  id: ExerciseId;
  name: string;
  muscle_group: string | null;
  notes: string | null;
  created_at: Iso8601DateTime;
}

export interface ExerciseWithStats extends Exercise {
  set_count: number;
  workout_count: number;
  last_performed_on: Iso8601Date | null;
  best_weight: number | null;
}

export interface SessionPoint {
  workout_id: WorkoutId;
  performed_on: Iso8601Date;
  set_count: number;
  total_reps: number;
  total_volume: number;
  top_weight: number;
  est_one_rep_max: number;
}
