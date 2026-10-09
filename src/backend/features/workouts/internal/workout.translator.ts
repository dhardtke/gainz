import type {
  CreateWorkoutDto,
  EditWorkoutDto,
  MoveDirection,
  MoveWorkoutExerciseDto,
  WorkoutDto,
  WorkoutExerciseDto,
  WorkoutPageDto,
  WorkoutWithExercisesDto,
  WorkoutWithStatsDto,
} from '../../../../shared/dto/workout.ts';
import type { Iso8601Date, WorkoutId } from '../../../../shared/flavors.ts';
import { today } from '../../../shared/validate.ts';
import type { LiftSet } from '../ports/set.ts';
import type { Workout, WorkoutWithStats } from '../ports/workout.ts';
import type { WorkoutExercise } from '../ports/workout-exercise.ts';
import { translateToLiftSetDto } from './set.translator.ts';
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
    done: body.done as boolean | undefined,
  };
}

export function translateToMoveWorkoutExerciseDto(body: Record<string, unknown>): MoveWorkoutExerciseDto {
  return {
    direction: body.direction as MoveDirection,
  };
}

// `copyFromWorkoutId` is not read here; the facade passes it to the repository itself.
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
  if (dto.done !== undefined) {
    patch.done = dto.done ? 1 : 0;
  }
  return patch;
}

export function translateToWorkoutDto(row: Workout): WorkoutDto {
  return {
    id: row.id,
    performedOn: row.performed_on,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    done: row.done === 1,
  };
}

function translateToWorkoutWithStatsDto(row: WorkoutWithStats): WorkoutWithStatsDto {
  return {
    id: row.id,
    performedOn: row.performed_on,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    done: row.done === 1,
    setCount: row.set_count,
    exerciseCount: row.exercise_count,
    totalReps: row.total_reps,
    totalVolume: row.total_volume,
    doneSetCount: row.done_set_count,
  };
}

function translateToWorkoutExerciseDto(row: WorkoutExercise, sets: LiftSet[]): WorkoutExerciseDto {
  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    muscleGroup: row.muscle_group,
    position: row.position,
    sets: sets.filter((set) => set.exercise_id === row.exercise_id).map(translateToLiftSetDto),
  };
}

export function translateToWorkoutWithExercisesDto(row: Workout, exercises: WorkoutExercise[], sets: LiftSet[]): WorkoutWithExercisesDto {
  return {
    ...translateToWorkoutDto(row),
    exercises: exercises.map((exercise) => translateToWorkoutExerciseDto(exercise, sets)),
  };
}

export function translateToWorkoutPageDto(rows: WorkoutWithStats[], total: number, limit: number, offset: number): WorkoutPageDto {
  return { items: rows.map(translateToWorkoutWithStatsDto), total, limit, offset };
}
