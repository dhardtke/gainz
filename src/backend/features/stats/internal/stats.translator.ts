import type { CalendarMonthDto, RecentExercisesDto, SummaryDto } from '../../../../shared/dto/stats.ts';
import type { Iso8601Date, Iso8601Month } from '../../../../shared/flavors.ts';
import type { CalendarDay, RecentExercise, Summary } from '../ports/stats.ts';

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

export function translateToRecentExercisesDto(since: Iso8601Date, exercises: RecentExercise[]): RecentExercisesDto {
  return {
    since,
    exercises: exercises.map((exercise) => ({
      id: exercise.id,
      name: exercise.name,
      bodyweight: exercise.bodyweight === 1,
      progression: exercise.progression,
      sessions: exercise.sessions.map((session) => ({
        workoutId: session.workout_id,
        performedOn: session.performed_on,
        reps: session.reps,
        volume: session.volume,
        progression: session.progression,
      })),
    })),
  };
}
