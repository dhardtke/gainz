import type { LiftSet, Workout, WorkoutInput, WorkoutWithStats } from '../../db/repos';
import type { CreateWorkoutDto, EditWorkoutDto, WorkoutDto, WorkoutPageDto, WorkoutWithSetsDto, WorkoutWithStatsDto } from '../../../shared/dto';
import { today } from '../../shared/validate.ts';
import { toLiftSet } from './set.ts';

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

/**
 * A create body with no date means today, which is why this is the one mapper that reads the
 * clock. `copyFromWorkoutId` is deliberately not read here: the repository takes it as a separate
 * `options` argument rather than as part of the input, so the handler passes it on itself.
 */
export function fromCreateWorkout(dto: CreateWorkoutDto): WorkoutInput {
  return {
    performed_on: dto.performedOn ?? today(),
    title: dto.title ?? null,
    notes: dto.notes ?? null,
  };
}

export function fromEditWorkout(dto: EditWorkoutDto): Partial<WorkoutInput> {
  const patch: Partial<WorkoutInput> = {};
  if (dto.performedOn !== undefined) {
    patch.performed_on = dto.performedOn;
  }
  if (dto.title !== undefined) {
    patch.title = dto.title;
  }
  if (dto.notes !== undefined) {
    patch.notes = dto.notes;
  }
  return patch;
}
