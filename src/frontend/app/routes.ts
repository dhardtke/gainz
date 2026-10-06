import { authRoutes } from '../features/auth/auth.routes.ts';
import { exercisesRoutes } from '../features/exercises/exercises.routes.ts';
import type { RouteDef } from './router.ts';
import { statsRoutes } from '../features/stats/stats.routes.ts';
import { workoutsRoutes } from '../features/workouts/workouts.routes.ts';

/**
 * Every route, one spread per feature; spread order is the header order. A route's view is fetched the first time
 * it is opened, and the view statically imports whatever it renders inside itself, so awaiting it means the whole page is ready, scripts and CSS alike.
 */
export const ROUTES: readonly RouteDef[] = [...statsRoutes, ...workoutsRoutes, ...exercisesRoutes, ...authRoutes];
