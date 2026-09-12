import type { SetFacade } from './workouts.facade.ts';
import type { RouteTable } from '../../http/routing.ts';
import { SetController } from './internal/set.controller.ts';

export function setRoutes(sets: SetFacade): RouteTable {
  const controller = new SetController(sets);
  return {
    '/api/sets/:id': {
      GET: (req) => controller.show(req),
      PATCH: (req) => controller.update(req),
      DELETE: (req) => controller.delete(req),
    },
  };
}
