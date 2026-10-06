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
    // A socket's handlers are a serve option, not part of a route, so this is the one place the
    // server names a feature. It is passed unconditionally — only the `/dev/ws` route is gated —
    // because making the option conditional flips Bun.serve's options type for no runtime gain.
    websocket: createDevFacade().webSocket(),
    // A safety net: the access log catches every throw from a route first, and logs it with its request.
    error: (err) => {
      log.error('http', 'unhandled error outside a route', err);
      return errorResponse(err);
    },
  });
}
