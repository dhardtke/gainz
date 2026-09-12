import { json } from '../../http/http.ts';
import type { StatsRepository } from './internal/stats.repository.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guardAll } from '../../http/routing.ts';
import { toSummary } from './ports/stats.ts';

export function statsRoutes(stats: StatsRepository): RouteTable {
  return {
    '/api/stats/summary': guardAll({
      GET: () => json(toSummary(stats.summary())),
    }),
  };
}
