import type { CreateWorkoutDto, EditWorkoutDto } from '../../../../shared/dto';
import { isPresent, MAX_NAME, MAX_NOTES, optionalString, requiredDate, requiredInt } from '../../../shared/validate.ts';

export function translateToCreateWorkoutDto(body: Record<string, unknown>): CreateWorkoutDto {
  return {
    ...(isPresent(body, 'performedOn') ? { performedOn: requiredDate(body, 'performedOn') } : {}),
    title: optionalString(body, 'title', MAX_NAME),
    notes: optionalString(body, 'notes', MAX_NOTES),
    ...(isPresent(body, 'copyFromWorkoutId') ? { copyFromWorkoutId: requiredInt(body, 'copyFromWorkoutId', { min: 1 }) } : {}),
  };
}

export function translateToEditWorkoutDto(body: Record<string, unknown>): EditWorkoutDto {
  const dto: EditWorkoutDto = {};
  if (isPresent(body, 'performedOn')) {
    dto.performedOn = requiredDate(body, 'performedOn');
  }
  if (isPresent(body, 'title')) {
    dto.title = optionalString(body, 'title', MAX_NAME);
  }
  if (isPresent(body, 'notes')) {
    dto.notes = optionalString(body, 'notes', MAX_NOTES);
  }
  return dto;
}
