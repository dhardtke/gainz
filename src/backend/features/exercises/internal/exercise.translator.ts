import type {
  CreateExerciseDto,
  EditExerciseDto,
  ExerciseDto,
  ExerciseFilterDto,
  ExerciseLastSessionDto,
  ExercisePageDto,
  ExercisePositionDto,
  ExerciseProgressDto,
  ExerciseWithStatsDto,
  SessionPointDto,
} from '../../../../shared/dto/exercise.ts';
import type { BestSetDto, LiftSetDto } from '../../../../shared/dto/set.ts';
import type { ExerciseKind } from '../../../../shared/exercise-kind.ts';
import type { MuscleGroup } from '../../../../shared/muscle-group.ts';
import type { Iso8601Date } from '../../../../shared/flavors.ts';
import type { LiftSet } from '../../workouts/ports/set.ts';
import type { Exercise, ExerciseFilter, ExerciseWithStats, LastSession, SessionPoint } from '../ports/exercise.ts';
import type { CreateExercise, EditExercise } from './exercise.repository.ts';

export function translateToCreateExerciseDto(body: Record<string, unknown>): CreateExerciseDto {
  return {
    name: body.name as string,
    muscleGroup: body.muscleGroup as MuscleGroup | null | undefined,
    notes: body.notes as string | null | undefined,
    kind: body.kind as ExerciseKind | undefined,
  };
}

export function translateToEditExerciseDto(body: Record<string, unknown>): EditExerciseDto {
  return {
    name: body.name as string | undefined,
    muscleGroup: body.muscleGroup as MuscleGroup | null | undefined,
    notes: body.notes as string | null | undefined,
    kind: body.kind as ExerciseKind | undefined,
  };
}

export function translateDtoToCreateExercise(dto: CreateExerciseDto): CreateExercise {
  return {
    name: dto.name,
    muscle_group: dto.muscleGroup ?? null,
    notes: dto.notes ?? null,
    kind: dto.kind ?? 'weighted',
  };
}

export function translateDtoToEditExercise(dto: EditExerciseDto): EditExercise {
  return {
    name: dto.name,
    muscle_group: dto.muscleGroup,
    notes: dto.notes,
    kind: dto.kind,
  };
}

export function translateDtoToExerciseFilter(dto: ExerciseFilterDto): ExerciseFilter {
  return {
    muscle_group: dto.muscleGroup === 'none' ? null : dto.muscleGroup,
    kind: dto.type,
    name_contains: dto.search,
  };
}

export function translateToExerciseDto(row: Exercise): ExerciseDto {
  return {
    id: row.id,
    name: row.name,
    muscleGroup: row.muscle_group,
    notes: row.notes,
    kind: row.kind,
    createdAt: row.created_at,
  };
}

export function translateToExerciseWithStatsDto(row: ExerciseWithStats): ExerciseWithStatsDto {
  return {
    ...translateToExerciseDto(row),
    setCount: row.set_count,
    workoutCount: row.workout_count,
    lastPerformedOn: row.last_performed_on,
    bestWeight: row.best_weight,
    bestReps: row.best_reps,
    leastWeight: row.least_weight,
  };
}

export function translateToExercisePageDto(rows: ExerciseWithStats[], total: number, all: number, limit: number | null, offset: number): ExercisePageDto {
  return { items: rows.map(translateToExerciseWithStatsDto), total, all, limit, offset };
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
    topReps: row.top_reps,
    estOneRepMax: row.est_one_rep_max,
    leastWeight: row.least_weight,
    effectiveVolume: row.effective_volume,
  };
}

// Named field by field: spreading the row would ship its snake_case columns.
function translateToSetDto(row: LiftSet): LiftSetDto {
  return {
    id: row.id,
    workoutId: row.workout_id,
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    reps: row.reps,
    weight: row.weight,
    notes: row.notes,
    position: row.position,
    done: row.done === 1,
    createdAt: row.created_at,
  };
}

function translateToBestSetDto(row: LiftSet & { performed_on: Iso8601Date }): BestSetDto {
  return { ...translateToSetDto(row), performedOn: row.performed_on };
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

export function translateToExerciseLastSessionDto(session: LastSession | null): ExerciseLastSessionDto {
  return {
    session: session === null ? null : { workoutId: session.workout_id, performedOn: session.performed_on, sets: session.sets.map(translateToSetDto) },
  };
}
