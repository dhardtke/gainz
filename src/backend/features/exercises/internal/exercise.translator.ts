import type { CreateExerciseDto, EditExerciseDto } from '../../../../shared/dto';
import { isPresent, MAX_NAME, MAX_NOTES, optionalString, requiredString } from '../../../shared/validate.ts';

export function translateToCreateExerciseDto(body: Record<string, unknown>): CreateExerciseDto {
  return {
    name: requiredString(body, 'name', MAX_NAME),
    muscleGroup: optionalString(body, 'muscleGroup', 60),
    notes: optionalString(body, 'notes', MAX_NOTES),
  };
}

export function translateToEditExerciseDto(body: Record<string, unknown>): EditExerciseDto {
  const dto: EditExerciseDto = {};
  if (isPresent(body, 'name')) {
    dto.name = requiredString(body, 'name', MAX_NAME);
  }
  if (isPresent(body, 'muscleGroup')) {
    dto.muscleGroup = optionalString(body, 'muscleGroup', 60);
  }
  if (isPresent(body, 'notes')) {
    dto.notes = optionalString(body, 'notes', MAX_NOTES);
  }
  return dto;
}
