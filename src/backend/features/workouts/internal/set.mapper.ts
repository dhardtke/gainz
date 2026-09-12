import type { CreateSetDto, EditSetDto } from '../../../../shared/dto';
import type { SetInput } from './set.repository.ts';

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
