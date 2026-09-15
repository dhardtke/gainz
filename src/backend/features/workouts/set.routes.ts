import type { DB } from '../../db/db.ts';
import type { RouteTable } from '../../http/routing.ts';
import { SetController } from './internal/set.controller.ts';
import { createWorkoutFacades } from './workouts.facade.ts';

export function setRoutes(db: DB): RouteTable {
  const controller = new SetController(createWorkoutFacades(db).sets);
  return {
    '/api/sets/:id': {
      GET: (req) => controller.show(req),
      PATCH: (req) => controller.update(req),
      DELETE: (req) => controller.delete(req),
    },
  };
}
