import type { Server } from 'bun';
import type { DB } from '../db/db.ts';
import { createDevFacade } from '../features/dev/dev.facade.ts';
import { errorResponse } from './errors.ts';
import { allRoutes } from './routes.ts';

export function startServer(db: DB, port: number): Server<undefined> {
  return Bun.serve({
    port,
    routes: allRoutes(db),
    // A socket's handlers are a serve option, not part of a route, so this is the one place the
    // server names a feature. It is passed unconditionally — only the `/dev/ws` route is gated —
    // because making the option conditional flips Bun.serve's options type for no runtime gain.
    websocket: createDevFacade().webSocket(),
    error: (err) => errorResponse(err),
  });
}
