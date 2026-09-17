/**
 * The hot-reload socket, registered only when `GAINZ_DEV=1`. `/dev/ws` is more specific than `/*`,
 * so it wins without ordering care; the client module `/dev/hot.ts` is an ordinary file under
 * `src/frontend/` and is served by the static route like any other.
 */
import type { RouteTable } from '../../http/routing.ts';
import { createDevFacade, DevFacade } from './dev.facade.ts';

export function devRoutes(): RouteTable {
  if (!DevFacade.enabled()) {
    return {};
  }
  const dev = createDevFacade();
  return {
    '/dev/ws': (req, server) => dev.upgrade(req, server),
  };
}
