import type { CreateExerciseDto, EditExerciseDto } from '../../../../shared/dto';
import type { ExerciseInput } from './exercise.repository.ts';

export function fromCreateExercise(dto: CreateExerciseDto): ExerciseInput {
  return {
    name: dto.name,
    muscle_group: dto.muscleGroup ?? null,
    notes: dto.notes ?? null,
  };
}

export function fromEditExercise(dto: EditExerciseDto): Partial<ExerciseInput> {
  const patch: Partial<ExerciseInput> = {};
  if (dto.name !== undefined) {
    patch.name = dto.name;
  }
  if (dto.muscleGroup !== undefined) {
    patch.muscle_group = dto.muscleGroup;
  }
  if (dto.notes !== undefined) {
    patch.notes = dto.notes;
  }
  return patch;
}
