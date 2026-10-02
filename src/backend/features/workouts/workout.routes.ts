import type { DB } from '../../db/db.ts';
import type { RouteTable } from '../../http/routing.ts';
import { WorkoutController } from './internal/workout.controller.ts';
import { createWorkoutFacades } from './workouts.facade.ts';

export function workoutRoutes(db: DB): RouteTable {
  const { workouts, sets } = createWorkoutFacades(db);
  const controller = new WorkoutController(workouts, sets);
  return {
    '/api/workouts': {
      GET: (req) => controller.list(req),
      POST: (req) => controller.create(req),
    },

    '/api/workouts/:id': {
      GET: (req) => controller.show(req),
      PATCH: (req) => controller.update(req),
      DELETE: (req) => controller.delete(req),
    },

    '/api/workouts/:id/sets': {
      GET: (req) => controller.listSets(req),
      POST: (req) => controller.addSet(req),
    },

    '/api/workouts/:id/exercises/:exerciseId/move': {
      POST: (req) => controller.moveExercise(req),
    },
  };
}
