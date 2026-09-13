import type { CreateWorkoutDto, EditWorkoutDto } from '../../../../shared/dto';
import type { Iso8601Date, WorkoutId } from '../../../../shared/flavors.ts';
import { today } from '../../../shared/validate.ts';
import type { CreateWorkout, EditWorkout } from './workout.repository.ts';

export function translateToCreateWorkoutDto(body: Record<string, unknown>): CreateWorkoutDto {
  return {
    performedOn: body.performedOn as Iso8601Date | undefined,
    title: body.title as string | null | undefined,
    notes: body.notes as string | null | undefined,
    copyFromWorkoutId: body.copyFromWorkoutId as WorkoutId | undefined,
  };
}

export function translateToEditWorkoutDto(body: Record<string, unknown>): EditWorkoutDto {
  return {
    performedOn: body.performedOn as Iso8601Date | undefined,
    title: body.title as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}

/**
 * A create body with no date means today, which is why this is the one DTO-to-input translation
 * that reads the clock. `copyFromWorkoutId` is deliberately not read here: the repository takes it
 * as a separate `options` argument rather than as part of the input, so `WorkoutFacade.create`
 * passes it on itself.
 */
export function translateDtoToCreateWorkout(dto: CreateWorkoutDto): CreateWorkout {
  return {
    performed_on: dto.performedOn ?? today(),
    title: dto.title ?? null,
    notes: dto.notes ?? null,
  };
}

export function translateDtoToEditWorkout(dto: EditWorkoutDto): EditWorkout {
  const patch: EditWorkout = {};
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
