import type { Iso8601Date } from '../../../../shared/flavors.ts';

export interface Summary {
  workout_count: number;
  set_count: number;
  total_reps: number;
  total_volume: number;
  exercise_count: number;
  last_performed_on: Iso8601Date | null;
  workouts_last_30_days: number;
  volume_last_30_days: number;
}
