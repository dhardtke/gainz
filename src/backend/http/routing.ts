/** The Bun.serve route table this app builds, named once so partial tables can be spread together. */
export type RouteTable = Bun.Serve.RoutesWithUpgrade<undefined, string>;

/** A request as Bun hands it to a parameterized route handler. */
export type ParamRequest = Request & { params: Record<string, string | undefined> };

/** A route handler as `RouteTable` declares it; it may return nothing for a WebSocket upgrade. */
export type RouteHandler = Extract<RouteTable[string], (...args: never[]) => unknown>;

const METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']);

/**
 * Wraps every handler in `table` — a bare function or each verb of a method map — with `wrap`. A
 * static value (a `Response`, a file, a directory) has no handler to wrap and would slip past, so
 * meeting one is a startup error, named after `label`.
 */
export function wrapHandlers(table: RouteTable, label: string, wrap: (handler: RouteHandler) => RouteHandler): RouteTable {
  const wrapped: RouteTable = {};
  for (const [path, value] of Object.entries(table)) {
    if (typeof value === 'function') {
      wrapped[path] = wrap(value);
    } else if (isMethodMap(value)) {
      wrapped[path] = Object.fromEntries(
        Object.entries(value).map(([method, handler]) => {
          if (typeof handler !== 'function') {
            throw new Error(`${label}: ${method} ${path} is a static value and cannot be wrapped`);
          }
          return [method, wrap(handler)];
        }),
      );
    } else {
      throw new Error(`${label}: ${path} is a static value and cannot be wrapped`);
    }
  }
  return wrapped;
}

/** A `{ GET, POST, … }` map rather than a `Response`, file, bundle or directory. */
function isMethodMap(value: RouteTable[string]): value is Partial<Record<Bun.Serve.HTTPMethod, RouteHandler | Response>> {
  return typeof value === 'object' && !(value instanceof Response) && !(value instanceof Blob) && Object.keys(value).every((key) => METHODS.has(key));
}
