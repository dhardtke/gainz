import type { Exercise, ExerciseInput, ExerciseWithStats, LiftSet, SessionPoint } from '../../db/repos';
import type { CreateExerciseDto, EditExerciseDto, ExerciseDto, ExerciseProgressDto, ExerciseWithStatsDto, SessionPointDto } from '../../../shared/dto';
import { toBestSet } from './set.ts';

export function toExercise(row: Exercise): ExerciseDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function toExerciseWithStats(row: ExerciseWithStats): ExerciseWithStatsDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    createdAt: row.created_at,
    setCount: row.set_count,
    workoutCount: row.workout_count,
    lastPerformedOn: row.last_performed_on,
    bestWeight: row.best_weight,
  };
}

export function toSessionPoint(row: SessionPoint): SessionPointDto {
  return {
    workoutId: row.workout_id,
    performedOn: row.performed_on,
    setCount: row.set_count,
    totalReps: row.total_reps,
    totalVolume: row.total_volume,
    topWeight: row.top_weight,
    estOneRepMax: row.est_one_rep_max,
  };
}

export function toExerciseProgress(exercise: Exercise, sessions: SessionPoint[], bestSet: (LiftSet & { performed_on: string }) | null): ExerciseProgressDto {
  return {
    exercise: toExercise(exercise),
    sessions: sessions.map(toSessionPoint),
    bestSet: bestSet === null ? null : toBestSet(bestSet),
  };
}

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
