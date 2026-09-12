import type { DB } from '../../db/db.ts';
import { SetRepository, type SetInput } from './internal/set.repository.ts';
import { WorkoutRepository, type WorkoutInput } from './internal/workout.repository.ts';
import type { LiftSet } from './ports/set.ts';
import type { Workout, WorkoutWithStats } from './ports/workout.ts';

/**
 * The workouts half of the feature's front door. Routes hold this rather than the repository, so
 * the SQL, the WorkoutInput shape and the nullable get() stay inside the feature.
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

  /** `copyFrom` stays a separate argument, as it is on the repository: it is not part of a row. */
  create(input: WorkoutInput, options: { copyFrom?: number } = {}): Workout {
    return this.workouts.create(input, options);
  }

  update(id: number, patch: Partial<WorkoutInput>): Workout {
    return this.workouts.update(id, patch);
  }

  delete(id: number): void {
    this.workouts.delete(id);
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

  create(workoutId: number, input: SetInput): LiftSet {
    return this.sets.create(workoutId, input);
  }

  update(id: number, patch: Partial<SetInput>): LiftSet {
    return this.sets.update(id, patch);
  }

  delete(id: number): void {
    this.sets.delete(id);
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
