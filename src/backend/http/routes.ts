import type { DB } from '../db/db.ts';
import { exerciseRoutes } from '../features/exercises/exercise.routes.ts';
import { metaRoutes } from '../features/meta/meta.routes.ts';
import { setRoutes } from '../features/workouts/set.routes.ts';
import type { RouteTable } from './routing.ts';
import { statsRoutes } from '../features/stats/stats.routes.ts';
import { staticRoutes } from '../features/static/static.routes.ts';
import { workoutRoutes } from '../features/workouts/workout.routes.ts';

/**
 * The registry of Bun.serve routes: one file per URL group, owned by the feature
 * whose URL prefix it names, spread into a single table here. It covers the whole
 * URL surface — the /api endpoints and, in staticRoutes(), the frontend and the
 * vendor allowlist — so there is no fetch fallback behind it.
 *
 * Spread order is for readers, not for correctness: measured on Bun 1.4.2, the
 * router matches by specificity, so /api/health wins over /api/* and /api/* over
 * /* wherever they are declared. Least specific last reads the way it dispatches.
 */
export function allRoutes(db: DB): RouteTable {
  return {
    ...metaRoutes(),
    ...statsRoutes(db),
    ...exerciseRoutes(db),
    ...workoutRoutes(db),
    ...setRoutes(db),
    ...staticRoutes(),
  };
}
