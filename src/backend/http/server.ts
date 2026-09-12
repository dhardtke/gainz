import type { Server } from 'bun';
import type { DB } from '../db/db.ts';
import { errorResponse } from './errors.ts';
import { createFacades } from '../features/facades.ts';
import { allRoutes } from './routes.ts';

export function startServer(db: DB, port: number): Server<undefined> {
  return Bun.serve({
    port,
    routes: allRoutes(createFacades(db)),
    error: (err) => errorResponse(err),
  });
}
