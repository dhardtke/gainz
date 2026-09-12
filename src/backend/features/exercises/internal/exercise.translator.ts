import type { CreateExerciseDto, EditExerciseDto } from '../../../../shared/dto';
import type { CreateExercise, EditExercise } from './exercise.repository.ts';

export function translateToCreateExerciseDto(body: Record<string, unknown>): CreateExerciseDto {
  return {
    name: body.name as string,
    muscleGroup: body.muscleGroup as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}

export function translateToEditExerciseDto(body: Record<string, unknown>): EditExerciseDto {
  return {
    name: body.name as string | undefined,
    muscleGroup: body.muscleGroup as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}

export function translateDtoToCreateExercise(dto: CreateExerciseDto): CreateExercise {
  return {
    name: dto.name,
    muscle_group: dto.muscleGroup ?? null,
    notes: dto.notes ?? null,
  };
}

export function translateDtoToEditExercise(dto: EditExerciseDto): EditExercise {
  const patch: EditExercise = {};
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
