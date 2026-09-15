import type { DB } from '../../db/db.ts';
import type { RouteTable } from '../../http/routing.ts';
import { StatsController } from './internal/stats.controller.ts';
import { createStatsFacade } from './stats.facade.ts';

export function statsRoutes(db: DB): RouteTable {
  const controller = new StatsController(createStatsFacade(db));
  return {
    '/api/stats/summary': {
      GET: () => controller.summary(),
    },
  };
}
