import type { ExerciseId, Iso8601Date, Iso8601Month, WorkoutId } from '../flavors.ts';

export interface SummaryDto {
  workoutCount: number;
  setCount: number;
  totalReps: number;
  totalVolume: number;
  exerciseCount: number;
  lastPerformedOn: Iso8601Date | null;
  workoutsLast30Days: number;
  volumeLast30Days: number;
}

export interface CalendarWorkoutDto {
  id: WorkoutId;
  title: string | null;
  /** Mean of the compared exercises' change against their previous session, as a fraction (0.041 = +4.1%). */
  progression: number | null;
  comparedExerciseCount: number;
}

export interface CalendarDayDto {
  date: Iso8601Date;
  /** Mean of the compared exercises' change against their previous session, over all of the day's workouts. */
  progression: number | null;
  comparedExerciseCount: number;
  /** Oldest first. */
  workouts: CalendarWorkoutDto[];
}

export interface CalendarMonthDto {
  month: Iso8601Month;
  /** Only days with a workout holding a done set, oldest first. */
  days: CalendarDayDto[];
}

export interface RecentSessionDto {
  workoutId: WorkoutId;
  performedOn: Iso8601Date;
  reps: number;
  volume: number;
  /** Change against the session before it, as a fraction (0.041 = +4.1%). */
  progression: number | null;
}

export interface RecentExerciseDto {
  id: ExerciseId;
  name: string;
  bodyweight: boolean;
  /** Change of the newest shown session against the oldest shown one the rule compares, as a fraction. */
  progression: number | null;
  /** Date of the session `progression` compares against, `null` with it. */
  progressionSince: Iso8601Date | null;
  /** At most three, oldest first. */
  sessions: RecentSessionDto[];
}

export interface RecentExercisesDto {
  since: Iso8601Date;
  /** Biggest regression first, those without a value last. */
  exercises: RecentExerciseDto[];
}
