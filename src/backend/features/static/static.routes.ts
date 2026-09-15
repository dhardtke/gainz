/**
 * The static half of the server, as routes: `src/frontend/` under `/*`, plus one route
 * per entry of the vendor allowlist in `internal/paths.ts`.
 *
 * `/*` is the least specific pattern in the table, so it is reached only when no `/api`
 * pattern and no vendor URL matched — Bun matches by specificity, not by declaration
 * order. It is a bare function rather than a `{ GET, HEAD }` map because a map answers an
 * unmatched verb with an empty 404, and this route owns the 405 for the whole server.
 */
import type { RouteTable } from '../../http/routing.ts';
import { vendorUrls } from './internal/paths.ts';
import { StaticController } from './internal/static.controller.ts';

export function staticRoutes(): RouteTable {
  const controller = new StaticController();
  const vendor = (req: Request): Promise<Response> => controller.vendor(req);
  return {
    ...Object.fromEntries(vendorUrls().map((url) => [url, { GET: vendor, HEAD: vendor }])),
    '/*': (req: Request): Promise<Response> => controller.frontend(req),
  };
}
