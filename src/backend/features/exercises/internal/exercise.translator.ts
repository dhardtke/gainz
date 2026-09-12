import type { CreateExerciseDto, EditExerciseDto } from '../../../../shared/dto';

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
