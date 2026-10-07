import type { CreateSetDto, EditSetDto } from '../../../shared/dto/set.ts';
import type { CreateWorkoutDto, EditWorkoutDto, MoveWorkoutExerciseDto } from '../../../shared/dto/workout.ts';
import type { ExerciseId, LiftSetId, WorkoutId } from '../../../shared/flavors.ts';
import type { DB } from '../../db/db.ts';
import { optionalString, requiredBoolean, requiredDate, requiredInt, requiredNumber, requiredOneOf } from '../../shared/validate.ts';
import { SetRepository } from './internal/set.repository.ts';
import { translateDtoToCreateSet, translateDtoToEditSet } from './internal/set.translator.ts';
import { WorkoutRepository } from './internal/workout.repository.ts';
import { WorkoutExerciseRepository } from './internal/workout-exercise.repository.ts';
import { translateDtoToCreateWorkout, translateDtoToEditWorkout } from './internal/workout.translator.ts';
import type { LiftSet } from './ports/set.ts';
import type { Workout, WorkoutWithStats } from './ports/workout.ts';
import type { WorkoutExercise } from './ports/workout-exercise.ts';

const MAX_WORKOUT_NAME_LENGTH = 120;
const MAX_WORKOUT_NOTES_LENGTH = 2000;

export class WorkoutFacade {
  readonly #workouts: WorkoutRepository;

  readonly #exercises: WorkoutExerciseRepository;

  constructor(workouts: WorkoutRepository, exercises: WorkoutExerciseRepository) {
    this.#workouts = workouts;
    this.#exercises = exercises;
  }

  list(limit: number, offset: number): WorkoutWithStats[] {
    return this.#workouts.list(limit, offset);
  }

  count(): number {
    return this.#workouts.count();
  }

  require(id: WorkoutId): Workout {
    return this.#workouts.require(id);
  }

  exercises(id: WorkoutId): WorkoutExercise[] {
    return this.#exercises.list(id);
  }

  /** Validates first, so a bad direction on an unknown workout is a 400. */
  moveExercise(id: WorkoutId, exerciseId: ExerciseId, dto: MoveWorkoutExerciseDto): void {
    const direction = requiredOneOf(dto, 'direction', ['up', 'down'] as const);
    this.#workouts.require(id);
    this.#exercises.move(id, exerciseId, direction);
  }

  create(dto: CreateWorkoutDto): Workout {
    const valid = this.#validateCreate(dto);
    return this.#workouts.create(translateDtoToCreateWorkout(valid), { copyFrom: valid.copyFromWorkoutId });
  }

  update(id: WorkoutId, dto: EditWorkoutDto): Workout {
    return this.#workouts.update(id, translateDtoToEditWorkout(this.#validateEdit(dto)));
  }

  delete(id: WorkoutId): void {
    this.#workouts.delete(id);
  }

  #validateCreate(dto: CreateWorkoutDto): CreateWorkoutDto {
    return {
      ...(dto.performedOn !== undefined ? { performedOn: requiredDate(dto, 'performedOn') } : {}),
      title: optionalString(dto, 'title', MAX_WORKOUT_NAME_LENGTH),
      notes: optionalString(dto, 'notes', MAX_WORKOUT_NOTES_LENGTH),
      ...(dto.copyFromWorkoutId !== undefined ? { copyFromWorkoutId: requiredInt(dto, 'copyFromWorkoutId', { min: 1 }) } : {}),
    };
  }

  #validateEdit(dto: EditWorkoutDto): EditWorkoutDto {
    const valid: EditWorkoutDto = {};
    if (dto.performedOn !== undefined) {
      valid.performedOn = requiredDate(dto, 'performedOn');
    }
    if (dto.title !== undefined) {
      valid.title = optionalString(dto, 'title', MAX_WORKOUT_NAME_LENGTH);
    }
    if (dto.notes !== undefined) {
      valid.notes = optionalString(dto, 'notes', MAX_WORKOUT_NOTES_LENGTH);
    }
    return valid;
  }
}

// Separate from WorkoutFacade: both use the same method names (`list`, `create`, ...).
export class SetFacade {
  readonly #sets: SetRepository;

  constructor(sets: SetRepository) {
    this.#sets = sets;
  }

  list(workoutId: WorkoutId): LiftSet[] {
    return this.#sets.list(workoutId);
  }

  require(id: LiftSetId): LiftSet {
    return this.#sets.require(id);
  }

  create(workoutId: WorkoutId, dto: CreateSetDto): LiftSet {
    return this.#sets.create(workoutId, translateDtoToCreateSet(this.#validateCreate(dto)));
  }

  update(id: LiftSetId, dto: EditSetDto): LiftSet {
    return this.#sets.update(id, translateDtoToEditSet(this.#validateEdit(dto)));
  }

  delete(id: LiftSetId): void {
    this.#sets.delete(id);
  }

  #validateCreate(dto: CreateSetDto): CreateSetDto {
    return {
      exerciseId: requiredInt(dto, 'exerciseId', { min: 1 }),
      reps: requiredInt(dto, 'reps', { min: 1, max: 1000 }),
      weight: requiredNumber(dto, 'weight', { min: 0, max: 100000 }),
      notes: optionalString(dto, 'notes', MAX_WORKOUT_NOTES_LENGTH),
    };
  }

  #validateEdit(dto: EditSetDto): EditSetDto {
    const valid: EditSetDto = {};
    if (dto.reps !== undefined) {
      valid.reps = requiredInt(dto, 'reps', { min: 1, max: 1000 });
    }
    if (dto.weight !== undefined) {
      valid.weight = requiredNumber(dto, 'weight', { min: 0, max: 100000 });
    }
    if (dto.notes !== undefined) {
      valid.notes = optionalString(dto, 'notes', MAX_WORKOUT_NOTES_LENGTH);
    }
    if (dto.done !== undefined) {
      valid.done = requiredBoolean(dto, 'done');
    }
    return valid;
  }
}

export function createWorkoutFacades(db: DB): { workouts: WorkoutFacade; sets: SetFacade } {
  const workouts = new WorkoutRepository(db);
  const workoutExercises = new WorkoutExerciseRepository(db);
  return {
    workouts: new WorkoutFacade(workouts, workoutExercises),
    sets: new SetFacade(new SetRepository(db, workouts, workoutExercises)),
  };
}
