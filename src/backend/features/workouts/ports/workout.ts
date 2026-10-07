import type { Iso8601Date, Iso8601DateTime, WorkoutId } from '../../../../shared/flavors.ts';

export interface Workout {
  id: WorkoutId;
  performed_on: Iso8601Date;
  title: string | null;
  notes: string | null;
  created_at: Iso8601DateTime;
  done: 0 | 1;
}

export interface WorkoutWithStats extends Workout {
  set_count: number;
  exercise_count: number;
  total_reps: number;
  total_volume: number;
  done_set_count: number;
}
