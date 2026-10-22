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
import { weightRoutes } from '../features/weight/weight.routes.ts';
import { accessLog } from './access-log.ts';
import { sameOriginWrites } from './same-origin.ts';
import { securityHeaders } from './security-headers.ts';

// accessLog wraps the guards so their refusals are logged, and securityHeaders wraps it so its error responses get headers.
// Spread order is cosmetic: Bun matches by specificity.
export function allRoutes(db: DB, authOptions: AuthOptions): RouteTable {
  const auth = createAuthFacade(authOptions);
  return securityHeaders(
    accessLog(
      sameOriginWrites({
        ...metaRoutes(auth),
        ...authRoutes(auth),
        ...auth.guard({
          ...statsRoutes(db),
          ...exerciseRoutes(db),
          ...workoutRoutes(db),
          ...setRoutes(db),
          ...weightRoutes(db),
        }),
        ...devRoutes(),
        ...staticRoutes(auth),
      }),
    ),
  );
}
