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

/**
 * The /api catch-all. Bun matches by specificity, so every named /api pattern wins over it.
 *
 * `/api/*` does not match the bare prefix, so `/api` needs its own key — without it the URL
 * falls through to the static route and answers with the single-page app.
 */
export function notFoundRoute(): RouteTable {
  const endpointNotFound = guard(() => errorResponse(notFound('Endpoint')));
  return {
    '/api': endpointNotFound,
    '/api/*': endpointNotFound,
  };
}
