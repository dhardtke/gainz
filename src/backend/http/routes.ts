import type { DB } from '../db/db.ts';
import { type AuthOptions, createAuthFacade } from '../features/auth/auth.facade.ts';
import { authRoutes } from '../features/auth/auth.routes.ts';
import { devRoutes } from '../features/dev/dev.routes.ts';
import { exerciseRoutes } from '../features/exercises/exercise.routes.ts';
import { metaRoutes } from '../features/meta/meta.routes.ts';
import { setRoutes } from '../features/workouts/set.routes.ts';
import type { RouteTable } from './routing.ts';
import { statsRoutes } from '../features/stats/stats.routes.ts';
import { staticRoutes } from '../features/static/static.routes.ts';
import { workoutRoutes } from '../features/workouts/workout.routes.ts';
import { accessLog } from './access-log.ts';

/**
 * The registry of Bun.serve routes: one file per URL group, owned by the feature
 * whose URL prefix it names, spread into a single table here. It covers the whole
 * URL surface — the /api endpoints and, in staticRoutes(), the frontend and the
 * vendor allowlist — so there is no fetch fallback behind it.
 *
 * The data features' tables go through `auth.guard()`, which wraps each handler to
 * demand a session cookie while auth is on. The health check, the /api 404s, login
 * and logout, the dev socket and the frontend stay public.
 *
 * The whole table then goes through `accessLog()`, the outermost wrapper, outside the guard so its
 * 401s are logged too: it logs every /api request and any response ≥ 500, and turns a throw from any
 * route into its error response.
 *
 * Spread order is for readers, not for correctness: measured on Bun 1.4.2, the
 * router matches by specificity, so /api/health wins over /api/* and /api/* over
 * /* wherever they are declared. Least specific last reads the way it dispatches.
 */
export function allRoutes(db: DB, authOptions: AuthOptions): RouteTable {
  const auth = createAuthFacade(authOptions);
  return accessLog({
    ...metaRoutes(auth),
    ...authRoutes(auth),
    ...auth.guard({
      ...statsRoutes(db),
      ...exerciseRoutes(db),
      ...workoutRoutes(db),
      ...setRoutes(db),
    }),
    ...devRoutes(),
    ...staticRoutes(),
  });
}
