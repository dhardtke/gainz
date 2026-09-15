import type { DB } from '../../db/db.ts';
import { createExerciseFacade } from './exercises.facade.ts';
import type { RouteTable } from '../../http/routing.ts';
import { ExerciseController } from './internal/exercise.controller.ts';

export function exerciseRoutes(db: DB): RouteTable {
  const controller = new ExerciseController(createExerciseFacade(db));

  return {
    '/api/exercises': {
      GET: () => controller.list(),
      POST: (req) => controller.create(req),
    },

    '/api/exercises/:id': {
      GET: (req) => controller.show(req),
      PATCH: (req) => controller.update(req),
      DELETE: (req) => controller.delete(req),
    },

    '/api/exercises/:id/progress': {
      GET: (req) => controller.progress(req),
    },
  };
}
