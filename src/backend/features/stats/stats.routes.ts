import { json } from '../../http/http.ts';
import type { StatsFacade } from './stats.facade.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guardAll } from '../../http/routing.ts';
import { toSummary } from './ports/stats.ts';

export function statsRoutes(stats: StatsFacade): RouteTable {
  return {
    '/api/stats/summary': guardAll({
      GET: () => json(toSummary(stats.summary())),
    }),
  };
}
