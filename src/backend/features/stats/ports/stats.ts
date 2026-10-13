import type { ExerciseId, Iso8601Date, WorkoutId } from '../../../../shared/flavors.ts';

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

export interface CalendarWorkout {
  id: WorkoutId;
  performed_on: Iso8601Date;
  title: string | null;
  progression: number | null;
  compared_exercise_count: number;
}

export interface CalendarDay {
  date: Iso8601Date;
  progression: number | null;
  compared_exercise_count: number;
  workouts: CalendarWorkout[];
}

export interface RecentSession {
  workout_id: WorkoutId;
  performed_on: Iso8601Date;
  reps: number;
  volume: number;
  progression: number | null;
}

export interface RecentExercise {
  id: ExerciseId;
  name: string;
  bodyweight: 0 | 1;
  progression: number | null;
  progression_since: Iso8601Date | null;
  sessions: RecentSession[];
}
