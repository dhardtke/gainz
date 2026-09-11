import { errorResponse } from './http.ts';
import type { Repo } from '../db/repo';
import { apiRoutes } from './routes.ts';
import { serveStatic } from './static.ts';

/**
 * The subset of Bun.serve's options this app supplies. Spelled out rather than
 * taken from `Bun.Serve.Options`, whose port/unix union stops being spreadable
 * into `Bun.serve` once it is named.
 */
interface GainzServeOptions {
  routes: Bun.Serve.Routes<undefined, string>;
  fetch: (req: Request) => Promise<Response>;
  error: (err: Error) => Response;
}

/** Options for Bun.serve, shared by the CLI entry point and the test suite. */
export function serveOptions(repo: Repo): GainzServeOptions {
  return {
    routes: apiRoutes(repo),
    fetch: serveStatic,
    error: (err: Error): Response => errorResponse(err),
  };
}
