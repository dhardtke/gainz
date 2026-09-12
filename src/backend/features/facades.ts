import type { DB } from '../db/db.ts';
import { createExerciseFacade, type ExerciseFacade } from './exercises/exercises.facade.ts';
import { createStatsFacade, type StatsFacade } from './stats/stats.facade.ts';
import { createWorkoutFacades, type SetFacade, type WorkoutFacade } from './workouts/workouts.facade.ts';

/**
 * Everything the route table needs to reach the database. A parameter object rather than a class:
 * it holds the four facades and knows nothing itself, so each route factory can be handed only the
 * ones it uses. Built once per process — one server, one test file, one seeder run.
 */
export interface Facades {
  exercises: ExerciseFacade;
  workouts: WorkoutFacade;
  sets: SetFacade;
  stats: StatsFacade;
}

/**
 * The single composition root: the only place the three feature factories are called, and through
 * them the only path by which a repository is constructed.
 */
export function createFacades(db: DB): Facades {
  return {
    exercises: createExerciseFacade(db),
    ...createWorkoutFacades(db),
    stats: createStatsFacade(db),
  };
}
