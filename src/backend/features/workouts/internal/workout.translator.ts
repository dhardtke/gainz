import type {
  CreateWorkoutDto,
  EditWorkoutDto,
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
  };
}

/**
 * A create body with no date means today, which is why this is the one DTO-to-input translation
 * that reads the clock. `copyFromWorkoutId` is deliberately not read here: the repository takes it
 * as a separate `options` argument rather than as part of the input, so `WorkoutFacade.create`
 * passes it on itself.
 */
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
  return patch;
}

export function translateToWorkoutDto(row: Workout): WorkoutDto {
  return {
    id: row.id,
    performedOn: row.performed_on,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/** Derived, never stored: unchecking any set makes its workout not done again. */
function isDone(setCount: number, doneSetCount: number): boolean {
  return setCount > 0 && doneSetCount === setCount;
}

function translateToWorkoutWithStatsDto(row: WorkoutWithStats): WorkoutWithStatsDto {
  return {
    id: row.id,
    performedOn: row.performed_on,
    title: row.title,
    notes: row.notes,
    createdAt: row.created_at,
    setCount: row.set_count,
    exerciseCount: row.exercise_count,
    totalReps: row.total_reps,
    totalVolume: row.total_volume,
    doneSetCount: row.done_set_count,
    done: isDone(row.set_count, row.done_set_count),
  };
}

function translateToWorkoutExerciseDto(row: WorkoutExercise, sets: LiftSet[]): WorkoutExerciseDto {
  return {
    exerciseId: row.exercise_id,
    exerciseName: row.exercise_name,
    position: row.position,
    sets: sets.filter((set) => set.exercise_id === row.exercise_id).map(translateToLiftSetDto),
  };
}

/** Groups the workout's sets, in their own order, under its exercises, in theirs. */
export function translateToWorkoutWithExercisesDto(row: Workout, exercises: WorkoutExercise[], sets: LiftSet[]): WorkoutWithExercisesDto {
  return {
    ...translateToWorkoutDto(row),
    exercises: exercises.map((exercise) => translateToWorkoutExerciseDto(exercise, sets)),
    done: isDone(sets.length, sets.filter((set) => set.done === 1).length),
  };
}

export function translateToWorkoutPageDto(rows: WorkoutWithStats[], total: number, limit: number, offset: number): WorkoutPageDto {
  return { items: rows.map(translateToWorkoutWithStatsDto), total, limit, offset };
}
