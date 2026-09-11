import { json } from '../http.ts';
import type { Repo } from '../../db/repos';
import { toSummary } from '../dto';
import type { RouteTable } from './shared.ts';
import { guardAll } from './shared.ts';

export function statsRoutes(repo: Repo): RouteTable {
  return {
    '/api/stats/summary': guardAll({
      GET: () => json(toSummary(repo.summary())),
    }),
  };
}
