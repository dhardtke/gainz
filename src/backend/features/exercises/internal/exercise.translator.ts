import type {
  CreateExerciseDto,
  EditExerciseDto,
  ExerciseDto,
  ExercisePageDto,
  ExercisePositionDto,
  ExerciseProgressDto,
  ExerciseWithStatsDto,
  SessionPointDto,
} from '../../../../shared/dto/exercise.ts';
import type { BestSetDto } from '../../../../shared/dto/set.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import type { LiftSet } from '../../workouts/ports/set.ts';
import type { Exercise, ExerciseWithStats, SessionPoint } from '../ports/exercise.ts';
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

export function translateToExerciseDto(row: Exercise): ExerciseDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

export function translateToExerciseWithStatsDto(row: ExerciseWithStats): ExerciseWithStatsDto {
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

export function translateToExercisePageDto(rows: ExerciseWithStats[], total: number, limit: number | null, offset: number): ExercisePageDto {
  return { items: rows.map(translateToExerciseWithStatsDto), total, limit, offset };
}

export function translateToExercisePositionDto(index: number): ExercisePositionDto {
  return { index };
}

function translateToSessionPointDto(row: SessionPoint): SessionPointDto {
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

/**
 * The workouts feature owns `LiftSetDto`'s translation, but it is private to that feature, so
 * the best set is named here field by field — never spread from the row, which would ship
 * `workout_id`, `exercise_id` and `created_at` under their snake_case names.
 */
function translateToBestSetDto(row: LiftSet & { performed_on: Iso8601Date }): BestSetDto {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    position: row.position,
    createdAt: row.created_at,
    performedOn: row.performed_on,
  };
}

export function translateToExerciseProgressDto(
  exercise: Exercise,
  sessions: SessionPoint[],
  bestSet: (LiftSet & { performed_on: Iso8601Date }) | null,
): ExerciseProgressDto {
  return {
    exercise: translateToExerciseDto(exercise),
    sessions: sessions.map(translateToSessionPointDto),
    bestSet: bestSet === null ? null : translateToBestSetDto(bestSet),
  };
}
