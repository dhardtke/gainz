import type { SummaryDto } from '../../../../shared/dto';

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
  last_performed_on: string | null;
  workouts_last_30_days: number;
  volume_last_30_days: number;
}

export function toSummary(row: Summary): SummaryDto {
  return {
    workoutCount: row.workout_count,
    setCount: row.set_count,
    totalReps: row.total_reps,
    totalVolume: row.total_volume,
    exerciseCount: row.exercise_count,
    lastPerformedOn: row.last_performed_on,
    workoutsLast30Days: row.workouts_last_30_days,
    volumeLast30Days: row.volume_last_30_days,
  };
}
