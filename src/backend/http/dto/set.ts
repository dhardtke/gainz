import type { LiftSet, SetInput } from '../../db/repos';
import type { BestSetDto, CreateSetDto, EditSetDto, LiftSetDto } from '../../../shared/dto';

export function toLiftSet(row: LiftSet): LiftSetDto {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
  };
}

/**
 * The one spread in this directory, and it spreads a DTO rather than a row: `toLiftSet` has
 * already named every field, so nothing internal can ride along. Spreading `row` here would
 * ship `workout_id`, `exercise_id` and `created_at` to the browser without a word from anyone.
 */
export function toBestSet(row: LiftSet & { performed_on: string }): BestSetDto {
  return { ...toLiftSet(row), performedOn: row.performed_on };
}

export function fromCreateSet(dto: CreateSetDto): SetInput {
  return {
    exercise_id: dto.exerciseId,
    reps: dto.reps,
    weight: dto.weight,
    notes: dto.notes ?? null,
    ...(dto.position === undefined ? {} : { position: dto.position }),
  };
}

export function fromEditSet(dto: EditSetDto): Partial<SetInput> {
  const patch: Partial<SetInput> = {};
  if (dto.exerciseId !== undefined) {
    patch.exercise_id = dto.exerciseId;
  }
  if (dto.reps !== undefined) {
    patch.reps = dto.reps;
  }
  if (dto.weight !== undefined) {
    patch.weight = dto.weight;
  }
  if (dto.notes !== undefined) {
    patch.notes = dto.notes;
  }
  if (dto.position !== undefined) {
    patch.position = dto.position;
  }
  return patch;
}
