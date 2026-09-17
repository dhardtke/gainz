/** The Bun.serve route table this app builds, named once so partial tables can be spread together. */
export type RouteTable = Bun.Serve.RoutesWithUpgrade<undefined, string>;

/** A request as Bun hands it to a parameterised route handler. */
export type ParamRequest = Request & { params: Record<string, string | undefined> };
