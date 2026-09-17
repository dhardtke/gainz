import type { Server } from 'bun';

export class DevController {
  /** Hands the request to the socket handler; after a successful upgrade there is no response. */
  upgrade(req: Request, server: Server<undefined>): Response | undefined {
    if (server.upgrade(req)) {
      return undefined;
    }
    return new Response('Upgrade required', { status: 426 });
  }
}
