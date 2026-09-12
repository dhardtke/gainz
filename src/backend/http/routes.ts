import type { ExerciseRepository } from '../features/exercises/internal/exercise.repository.ts';
import { exerciseRoutes } from '../features/exercises/exercise.routes.ts';
import { metaRoutes } from '../features/meta/meta.routes.ts';
import { setRoutes } from '../features/workouts/set.routes.ts';
import type { SetRepository } from '../features/workouts/internal/set.repository.ts';
import type { RouteTable } from './routing.ts';
import { statsRoutes } from '../features/stats/stats.routes.ts';
import type { StatsRepository } from '../features/stats/internal/stats.repository.ts';
import { staticRoutes } from '../features/static/static.routes.ts';
import { workoutRoutes } from '../features/workouts/workout.routes.ts';
import type { WorkoutRepository } from '../features/workouts/internal/workout.repository.ts';

/**
 * Everything the route table needs to reach the database, built by whoever starts a server. A
 * parameter object rather than a class: it holds the four repositories and knows nothing itself,
 * so each route factory can be handed only the ones it actually uses.
 */
export interface Repositories {
  exercises: ExerciseRepository;
  workouts: WorkoutRepository;
  sets: SetRepository;
  stats: StatsRepository;
}

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
export function allRoutes(repos: Repositories): RouteTable {
  return {
    ...metaRoutes(),
    ...statsRoutes(repos.stats),
    ...exerciseRoutes(repos.exercises),
    ...workoutRoutes(repos.workouts, repos.sets),
    ...setRoutes(repos.sets),
    ...staticRoutes(),
  };
}
