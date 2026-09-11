import { errorResponse } from '../http.ts';

/** The Bun.serve route table this app builds, named once so partial tables can be spread together. */
export type RouteTable = Bun.Serve.Routes<undefined, string>;

/** A request as Bun hands it to a parameterised route handler. */
export type ParamRequest = Request & { params: Record<string, string | undefined> };

export type Handler = (req: ParamRequest) => Response | Promise<Response>;

/** Wraps a handler so thrown HttpErrors become JSON error responses. */
export function guard(handler: Handler): Handler {
  return async (req) => {
    try {
      return await handler(req);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function guardAll(handlers: Record<string, Handler>): Record<string, Handler> {
  return Object.fromEntries(Object.entries(handlers).map(([method, handler]) => [method, guard(handler)]));
}

export const MAX_NAME = 120;
export const MAX_NOTES = 2000;
