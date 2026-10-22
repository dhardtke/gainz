import type { CreateSetDto, EditSetDto, LiftSetDto } from '../../../../shared/dto/set.ts';
import type { ExerciseId } from '../../../../shared/flavors.ts';
import type { LiftSet } from '../ports/set.ts';
import type { CreateSet, EditSet } from './set.repository.ts';

export function translateToCreateSetDto(body: Record<string, unknown>): CreateSetDto {
  return {
    exerciseId: body.exerciseId as ExerciseId,
    reps: body.reps as number,
    weight: body.weight as number | undefined,
    notes: body.notes as string | null | undefined,
  };
}

export function translateToEditSetDto(body: Record<string, unknown>): EditSetDto {
  return {
    reps: body.reps as number | undefined,
    weight: body.weight as number | undefined,
    notes: body.notes as string | null | undefined,
    done: body.done as boolean | undefined,
  };
}

export function translateDtoToCreateSet(dto: CreateSetDto): CreateSet {
  return {
    exercise_id: dto.exerciseId,
    reps: dto.reps,
    weight: dto.weight ?? null,
    notes: dto.notes ?? null,
  };
}

export function translateDtoToEditSet(dto: EditSetDto): EditSet {
  return {
    reps: dto.reps,
    weight: dto.weight,
    notes: dto.notes,
    done: dto.done === undefined ? undefined : dto.done ? 1 : 0,
  };
}

export function translateToLiftSetDto(row: LiftSet): LiftSetDto {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    position: row.position,
    done: row.done === 1,
    createdAt: row.created_at,
  };
}
