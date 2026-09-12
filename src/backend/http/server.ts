import { errorResponse } from './errors.ts';
import type { Facades } from '../features/facades.ts';
import { allRoutes } from './routes.ts';

/**
 * The subset of Bun.serve's options this app supplies. Spelled out rather than
 * taken from `Bun.Serve.Options`, whose port/unix union stops being spreadable
 * into `Bun.serve` once it is named.
 */
interface GainzServeOptions {
  routes: Bun.Serve.Routes<undefined, string>;
  error: (err: Error) => Response;
}

/** Options for Bun.serve, shared by the CLI entry point and the test suite. */
export function serveOptions(facades: Facades): GainzServeOptions {
  return {
    routes: allRoutes(facades),
    error: (err: Error): Response => errorResponse(err),
  };
}
