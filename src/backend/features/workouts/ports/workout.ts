import type { WorkoutDto, WorkoutPageDto, WorkoutWithSetsDto, WorkoutWithStatsDto } from '../../../../shared/dto';
import type { Iso8601Date, Iso8601DateTime, WorkoutId } from '../../../../shared/flavors.ts';
import { type LiftSet, toLiftSet } from './set.ts';

export interface Workout {
  id: WorkoutId;
  performed_on: Iso8601Date;
  title: string | null;
  notes: string | null;
  created_at: Iso8601DateTime;
}

export interface WorkoutWithStats extends Workout {
  set_count: number;
  exercise_count: number;
  total_reps: number;
  total_volume: number;
}

export function toWorkout(row: Workout): WorkoutDto {
  return {
    id: row.id,
    performedOn: row.performed_on,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function toWorkoutWithStats(row: WorkoutWithStats): WorkoutWithStatsDto {
  return {
    id: row.id,
    performedOn: row.performed_on,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    setCount: row.set_count,
    exerciseCount: row.exercise_count,
    totalReps: row.total_reps,
    totalVolume: row.total_volume,
  };
}

export function toWorkoutWithSets(row: Workout, sets: LiftSet[]): WorkoutWithSetsDto {
  return { ...toWorkout(row), sets: sets.map(toLiftSet) };
}

export function toWorkoutPage(rows: WorkoutWithStats[], total: number, limit: number, offset: number): WorkoutPageDto {
  return { items: rows.map(toWorkoutWithStats), total, limit, offset };
}
