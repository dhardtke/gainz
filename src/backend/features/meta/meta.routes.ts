import type { RouteTable } from '../../http/routing.ts';
import { MetaController } from './internal/meta.controller.ts';

export function metaRoutes(): RouteTable {
  const controller = new MetaController();
  return {
    ...healthRoute(controller),
    ...notFoundRoute(controller),
  };
}

function healthRoute(controller: MetaController): RouteTable {
  return {
    '/api/health': {
      GET: () => controller.health(),
    },
  };
}

/**
 * The /api catch-all. Bun matches by specificity, so every named /api pattern wins over it.
 *
 * `/api/*` does not match the bare prefix, so `/api` needs its own key — without it the URL
 * falls through to the static route and answers with the single-page app.
 */
function notFoundRoute(controller: MetaController): RouteTable {
  const endpointNotFound = (): Response => controller.endpointNotFound();
  return {
    '/api': endpointNotFound,
    '/api/*': endpointNotFound,
  };
}
