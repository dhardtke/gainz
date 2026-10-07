import { authRoutes } from '../features/auth/auth.routes.ts';
import { exercisesRoutes } from '../features/exercises/exercises.routes.ts';
import type { RouteDef } from './router.ts';
import { statsRoutes } from '../features/stats/stats.routes.ts';
import { workoutsRoutes } from '../features/workouts/workouts.routes.ts';

// Spread order is the header order.
export const ROUTES: readonly RouteDef[] = [...statsRoutes, ...workoutsRoutes, ...exercisesRoutes, ...authRoutes];
