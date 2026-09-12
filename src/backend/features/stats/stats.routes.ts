import type { StatsFacade } from './stats.facade.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guardAll } from '../../http/routing.ts';
import { StatsController } from './internal/stats.controller.ts';

export function statsRoutes(stats: StatsFacade): RouteTable {
  const controller = new StatsController(stats);
  return {
    '/api/stats/summary': guardAll({
      GET: () => controller.summary(),
    }),
  };
}
