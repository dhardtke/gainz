import type { Repo } from '../db/repos';
import { exerciseRoutes } from './routes/exercise.routes.ts';
import { metaRoutes, notFoundRoute } from './routes/meta.routes.ts';
import { setRoutes } from './routes/set.routes.ts';
import type { RouteTable } from './routes/shared.ts';
import { statsRoutes } from './routes/stats.routes.ts';
import { staticRoutes } from './routes/static.routes.ts';
import { workoutRoutes } from './routes/workout.routes.ts';

/**
 * The registry of Bun.serve routes: one file per URL group under routes/,
 * spread into a single table here. It covers the whole URL surface — the /api
 * endpoints and, in staticRoutes(), the frontend and the vendor allowlist — so
 * there is no fetch fallback behind it.
 *
 * Spread order is for readers, not for correctness: measured on Bun 1.4.2, the
 * router matches by specificity, so /api/health wins over /api/* and /api/* over
 * /* wherever they are declared. Least specific last reads the way it dispatches.
 */
export function allRoutes(repo: Repo): RouteTable {
  return {
    ...metaRoutes(),
    ...statsRoutes(repo),
    ...exerciseRoutes(repo),
    ...workoutRoutes(repo),
    ...setRoutes(repo),
    ...notFoundRoute(),
    ...staticRoutes(),
  };
}
