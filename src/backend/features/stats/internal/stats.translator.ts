import type { CalendarMonthDto, SummaryDto } from '../../../../shared/dto/stats.ts';
import type { Iso8601Month } from '../../../../shared/flavors.ts';
import type { CalendarDay, Summary } from '../ports/stats.ts';

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

export function translateToCalendarMonthDto(month: Iso8601Month, days: CalendarDay[]): CalendarMonthDto {
  return {
    month,
    days: days.map((day) => ({
      date: day.date,
      progression: day.progression,
      comparedExerciseCount: day.compared_exercise_count,
      workouts: day.workouts.map((workout) => ({
        id: workout.id,
        title: workout.title,
        progression: workout.progression,
        comparedExerciseCount: workout.compared_exercise_count,
      })),
    })),
  };
}
