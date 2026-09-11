import { errorResponse, json, notFound } from '../http.ts';
import type { RouteTable } from './shared.ts';
import { guard, guardAll } from './shared.ts';

/** Routes that belong to no entity: the health probe. */
export function metaRoutes(): RouteTable {
  return {
    '/api/health': guardAll({
      GET: () => json({ status: 'ok', app: 'gainz' }),
    }),
  };
}

/** The /api catch-all. Spread last, so every named pattern wins over it. */
export function notFoundRoute(): RouteTable {
  return {
    '/api/*': guard(() => errorResponse(notFound('Endpoint'))),
  };
}
