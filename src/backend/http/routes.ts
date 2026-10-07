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

// accessLog wraps the guard so 401s are logged. Spread order is cosmetic: Bun matches by specificity.
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
    ...staticRoutes(auth),
  });
}
