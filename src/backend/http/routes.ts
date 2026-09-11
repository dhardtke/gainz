import type { Repo } from '../db/repo';
import { exerciseRoutes } from './routes/exercise.routes.ts';
import { metaRoutes, notFoundRoute } from './routes/meta.routes.ts';
import { setRoutes } from './routes/set.routes.ts';
import type { RouteTable } from './routes/shared.ts';
import { statsRoutes } from './routes/stats.routes.ts';
import { workoutRoutes } from './routes/workout.routes.ts';

/**
 * The registry of Bun.serve routes: one file per URL group under routes/,
 * spread into a single table here. Everything lives under /api; the frontend
 * is served as static files by the server module.
 *
 * Order matters only at the ends — the /api catch-all in notFoundRoute() has to
 * come last, so that every named pattern is matched before it.
 */
export function apiRoutes(repo: Repo): RouteTable {
  return {
    ...metaRoutes(),
    ...statsRoutes(repo),
    ...exerciseRoutes(repo),
    ...workoutRoutes(repo),
    ...setRoutes(repo),
    ...notFoundRoute(),
  };
}
