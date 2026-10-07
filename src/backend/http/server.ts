import type { Server } from 'bun';
import type { DB } from '../db/db.ts';
import type { AuthOptions } from '../features/auth/auth.facade.ts';
import { createDevFacade } from '../features/dev/dev.facade.ts';
import { log } from '../shared/log.ts';
import { errorResponse } from './errors.ts';
import { allRoutes } from './routes.ts';

export function startServer(db: DB, port: number, auth: AuthOptions = { passwordHash: null }): Server<undefined> {
  return Bun.serve({
    port,
    routes: allRoutes(db, auth),
    // Unconditional: making it optional flips Bun.serve's options type; only `/dev/ws` is gated.
    websocket: createDevFacade().webSocket(),
    // A safety net: the access log catches every throw from a route first.
    error: (err) => {
      log.error('http', 'unhandled error outside a route', err);
      return errorResponse(err);
    },
  });
}
