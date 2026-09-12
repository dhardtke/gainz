import { errorResponse, notFound } from '../../http/errors.ts';
import { json } from '../../http/http.ts';
import type { RouteTable } from '../../http/routing.ts';
import { guard, guardAll } from '../../http/routing.ts';

export function metaRoutes(): RouteTable {
  return {
    ...healthRoute(),
    ...notFoundRoute(),
  };
}

function healthRoute(): RouteTable {
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
function notFoundRoute(): RouteTable {
  const endpointNotFound = guard(() => errorResponse(notFound('Endpoint')));
  return {
    '/api': endpointNotFound,
    '/api/*': endpointNotFound,
  };
}
