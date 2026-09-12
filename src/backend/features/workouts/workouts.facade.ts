import type { CreateSetDto, CreateWorkoutDto, EditSetDto, EditWorkoutDto } from '../../../shared/dto';
import type { DB } from '../../db/db.ts';
import { isPresent, MAX_NAME, MAX_NOTES, optionalString, requiredDate, requiredInt, requiredNumber } from '../../shared/validate.ts';
import { SetRepository } from './internal/set.repository.ts';
import { translateDtoToCreateSet, translateDtoToEditSet } from './internal/set.translator.ts';
import { WorkoutRepository } from './internal/workout.repository.ts';
import { translateDtoToCreateWorkout, translateDtoToEditWorkout } from './internal/workout.translator.ts';
import type { LiftSet } from './ports/set.ts';
import type { Workout, WorkoutWithStats } from './ports/workout.ts';

/**
 * The workouts half of the feature's front door. Controllers hold this rather than the repository,
 * so the SQL, the CreateWorkout shape and the nullable get() stay inside the feature.
 */
export class WorkoutFacade {
  constructor(private readonly workouts: WorkoutRepository) {}

  list(limit: number, offset: number): WorkoutWithStats[] {
    return this.workouts.list(limit, offset);
  }

  count(): number {
    return this.workouts.count();
  }

  require(id: number): Workout {
    return this.workouts.require(id);
  }

  create(dto: CreateWorkoutDto): Workout {
    const valid = this.validateCreate(dto);
    return this.workouts.create(translateDtoToCreateWorkout(valid), { copyFrom: valid.copyFromWorkoutId });
  }

  update(id: number, dto: EditWorkoutDto): Workout {
    return this.workouts.update(id, translateDtoToEditWorkout(this.validateEdit(dto)));
  }

  delete(id: number): void {
    this.workouts.delete(id);
  }

  private validateCreate(dto: CreateWorkoutDto): CreateWorkoutDto {
    return {
      ...(isPresent(dto, 'performedOn') ? { performedOn: requiredDate(dto, 'performedOn') } : {}),
      title: optionalString(dto, 'title', MAX_NAME),
      notes: optionalString(dto, 'notes', MAX_NOTES),
      ...(isPresent(dto, 'copyFromWorkoutId') ? { copyFromWorkoutId: requiredInt(dto, 'copyFromWorkoutId', { min: 1 }) } : {}),
    };
  }

  private validateEdit(dto: EditWorkoutDto): EditWorkoutDto {
    const valid: EditWorkoutDto = {};
    if (isPresent(dto, 'performedOn')) {
      valid.performedOn = requiredDate(dto, 'performedOn');
    }
    if (isPresent(dto, 'title')) {
      valid.title = optionalString(dto, 'title', MAX_NAME);
    }
    if (isPresent(dto, 'notes')) {
      valid.notes = optionalString(dto, 'notes', MAX_NOTES);
    }
    return valid;
  }
}

/**
 * The sets half. A second facade rather than more methods on the first, because both entities
 * answer to `list` / `require` / `create` / `update` / `delete` and merging them would mean
 * renaming every one of them.
 */
export class SetFacade {
  constructor(private readonly sets: SetRepository) {}

  list(workoutId: number): LiftSet[] {
    return this.sets.list(workoutId);
  }

  require(id: number): LiftSet {
    return this.sets.require(id);
  }

  create(workoutId: number, dto: CreateSetDto): LiftSet {
    return this.sets.create(workoutId, translateDtoToCreateSet(this.validateCreate(dto)));
  }

  update(id: number, dto: EditSetDto): LiftSet {
    return this.sets.update(id, translateDtoToEditSet(this.validateEdit(dto)));
  }

  delete(id: number): void {
    this.sets.delete(id);
  }

  private validateCreate(dto: CreateSetDto): CreateSetDto {
    return {
      exerciseId: requiredInt(dto, 'exerciseId', { min: 1 }),
      reps: requiredInt(dto, 'reps', { min: 1, max: 1000 }),
      weight: requiredNumber(dto, 'weight', { min: 0, max: 100000 }),
      notes: optionalString(dto, 'notes', MAX_NOTES),
      ...(isPresent(dto, 'position') ? { position: requiredInt(dto, 'position', { min: 0 }) } : {}),
    };
  }

  private validateEdit(dto: EditSetDto): EditSetDto {
    const valid: EditSetDto = {};
    if (isPresent(dto, 'exerciseId')) {
      valid.exerciseId = requiredInt(dto, 'exerciseId', { min: 1 });
    }
    if (isPresent(dto, 'reps')) {
      valid.reps = requiredInt(dto, 'reps', { min: 1, max: 1000 });
    }
    if (isPresent(dto, 'weight')) {
      valid.weight = requiredNumber(dto, 'weight', { min: 0, max: 100000 });
    }
    if (isPresent(dto, 'notes')) {
      valid.notes = optionalString(dto, 'notes', MAX_NOTES);
    }
    if (isPresent(dto, 'position')) {
      valid.position = requiredInt(dto, 'position', { min: 0 });
    }
    return valid;
  }
}

/**
 * Both repositories are built here because both belong to this feature: SetRepository reads
 * workouts through the WorkoutRepository it is given, and this factory is the one place that
 * decides which one that is.
 */
export function createWorkoutFacades(db: DB): { workouts: WorkoutFacade; sets: SetFacade } {
  const workouts = new WorkoutRepository(db);
  return {
    workouts: new WorkoutFacade(workouts),
    sets: new SetFacade(new SetRepository(db, workouts)),
  };
}
