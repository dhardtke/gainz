import type { CreateWorkoutDto, EditWorkoutDto } from '../../../../shared/dto';
import { today } from '../../../shared/validate.ts';
import type { WorkoutInput } from './workout.repository.ts';

/**
 * A create body with no date means today, which is why this is the one mapper that reads the
 * clock. `copyFromWorkoutId` is deliberately not read here: the repository takes it as a separate
 * `options` argument rather than as part of the input, so `WorkoutController.create` passes it on itself.
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
