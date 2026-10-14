import type { DB } from '../../db/db.ts';
import type { RouteTable } from '../../http/routing.ts';
import { WeighInController } from './internal/weigh-in.controller.ts';
import { createWeighInFacade } from './weight.facade.ts';

export function weightRoutes(db: DB): RouteTable {
  const controller = new WeighInController(createWeighInFacade(db));
  return {
    '/api/weigh-ins': {
      GET: (req) => controller.list(req),
    },
    '/api/weigh-ins/import': {
      POST: (req) => controller.importAll(req),
    },
    '/api/weigh-ins/:date': {
      GET: (req) => controller.get(req),
      PUT: (req) => controller.put(req),
      DELETE: (req) => controller.delete(req),
    },
  };
}
