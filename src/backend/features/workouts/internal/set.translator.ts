import type { CreateSetDto, EditSetDto } from '../../../../shared/dto';
import { isPresent, MAX_NOTES, optionalString, requiredInt, requiredNumber } from '../../../shared/validate.ts';

export function translateToCreateSetDto(body: Record<string, unknown>): CreateSetDto {
  return {
    exerciseId: requiredInt(body, 'exerciseId', { min: 1 }),
    reps: requiredInt(body, 'reps', { min: 1, max: 1000 }),
    weight: requiredNumber(body, 'weight', { min: 0, max: 100000 }),
    notes: optionalString(body, 'notes', MAX_NOTES),
    ...(isPresent(body, 'position') ? { position: requiredInt(body, 'position', { min: 0 }) } : {}),
  };
}

export function translateToEditSetDto(body: Record<string, unknown>): EditSetDto {
  const dto: EditSetDto = {};
  if (isPresent(body, 'exerciseId')) {
    dto.exerciseId = requiredInt(body, 'exerciseId', { min: 1 });
  }
  if (isPresent(body, 'reps')) {
    dto.reps = requiredInt(body, 'reps', { min: 1, max: 1000 });
  }
  if (isPresent(body, 'weight')) {
    dto.weight = requiredNumber(body, 'weight', { min: 0, max: 100000 });
  }
  if (isPresent(body, 'notes')) {
    dto.notes = optionalString(body, 'notes', MAX_NOTES);
  }
  if (isPresent(body, 'position')) {
    dto.position = requiredInt(body, 'position', { min: 0 });
  }
  return dto;
}
