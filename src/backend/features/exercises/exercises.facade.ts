import type { DB } from '../../db/db.ts';
import { ExerciseRepository, type ExerciseInput } from './internal/exercise.repository.ts';
import type { Exercise, ExerciseWithStats, SessionPoint } from './ports/exercise.ts';
import type { LiftSet } from '../workouts/ports/set.ts';

/**
 * The exercises feature's front door. Routes hold this rather than the repository, so the SQL, the
 * ExerciseInput shape and the nullable get() stay inside the feature. Rows cross the boundary
 * unchanged: mapping a row to a DTO is the route's job, and the compiler is what enforces it.
 */
export class ExerciseFacade {
  constructor(private readonly exercises: ExerciseRepository) {}

  list(): ExerciseWithStats[] {
    return this.exercises.list();
  }

  require(id: number): Exercise {
    return this.exercises.require(id);
  }

  create(input: ExerciseInput): Exercise {
    return this.exercises.create(input);
  }

  update(id: number, patch: Partial<ExerciseInput>): Exercise {
    return this.exercises.update(id, patch);
  }

  delete(id: number): void {
    this.exercises.delete(id);
  }

  progress(id: number): SessionPoint[] {
    return this.exercises.progress(id);
  }

  bestSet(id: number): (LiftSet & { performed_on: string }) | null {
    return this.exercises.bestSet(id);
  }
}

export function createExerciseFacade(db: DB): ExerciseFacade {
  return new ExerciseFacade(new ExerciseRepository(db));
}
