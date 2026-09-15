import type { Iso8601Date } from '../../../../shared/flavors.ts';

/**
 * The published shape of a whole-log summary. The repository assembles it from two queries — a
 * whole-log totals half and a rolling-window half — but that split is its own business, so the
 * row is declared flat here and the repository has to satisfy it.
 */
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
