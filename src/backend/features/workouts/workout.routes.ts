import type { SetFacade, WorkoutFacade } from './workouts.facade.ts';
import type { RouteTable } from '../../http/routing.ts';
import { WorkoutController } from './internal/workout.controller.ts';

export function workoutRoutes(workouts: WorkoutFacade, sets: SetFacade): RouteTable {
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
  };
}
