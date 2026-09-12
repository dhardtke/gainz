import type { CreateWorkoutDto, EditWorkoutDto } from '../../../../shared/dto';

export function translateToCreateWorkoutDto(body: Record<string, unknown>): CreateWorkoutDto {
  return {
    performedOn: body.performedOn as string | undefined,
    title: body.title as string | null | undefined,
    notes: body.notes as string | null | undefined,
    copyFromWorkoutId: body.copyFromWorkoutId as number | undefined,
  };
}

export function translateToEditWorkoutDto(body: Record<string, unknown>): EditWorkoutDto {
  return {
    performedOn: body.performedOn as string | undefined,
    title: body.title as string | null | undefined,
    notes: body.notes as string | null | undefined,
  };
}
