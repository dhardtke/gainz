import type { CreateSetDto, EditSetDto } from '../../../../shared/dto';

export function translateToCreateSetDto(body: Record<string, unknown>): CreateSetDto {
  return {
    exerciseId: body.exerciseId as number,
    reps: body.reps as number,
    weight: body.weight as number,
    notes: body.notes as string | null | undefined,
    position: body.position as number | undefined,
  };
}

export function translateToEditSetDto(body: Record<string, unknown>): EditSetDto {
  return {
    exerciseId: body.exerciseId as number | undefined,
    reps: body.reps as number | undefined,
    weight: body.weight as number | undefined,
    notes: body.notes as string | null | undefined,
    position: body.position as number | undefined,
  };
}
