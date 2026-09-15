import type { SummaryDto } from '../../../../shared/dto/stats.ts';
import type { Summary } from '../ports/stats.ts';

export function translateToSummaryDto(row: Summary): SummaryDto {
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
