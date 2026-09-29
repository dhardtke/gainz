import type { Server, WebSocketHandler } from 'bun';
import { EMBEDDED } from '../../embedded.ts';
import { createStaticFacade, type StaticFacade } from '../static/static.facade.ts';
import { DevController } from './internal/dev.controller.ts';
import { devWebSocket } from './internal/ws.ts';

const CLIENT_TAG = '<script type="module" src="/dev/hot.ts"></script>';

/**
 * The dev feature's front door: hot reload for the frontend, off unless `GAINZ_DEV=1`. It owns no
 * table; it holds the switch, the injected client tag and the socket the client connects to.
 */
export class DevFacade {
  readonly #static: StaticFacade;
  readonly #controller = new DevController();

  constructor(staticFacade: StaticFacade) {
    this.#static = staticFacade;
  }

  /**
   * Read on every call rather than once, so a test can flip the variable around a server. A built
   * file has no source tree to watch, so it is always off there, whatever `GAINZ_DEV` says.
   */
  static enabled(): boolean {
    return EMBEDDED === null && process.env.GAINZ_DEV === '1';
  }

  upgrade(req: Request, server: Server<undefined>): Response | undefined {
    return this.#controller.upgrade(req, server);
  }

  webSocket(): WebSocketHandler<undefined> {
    return devWebSocket(this.#static.webRoot());
  }

  /** Appends the hot-reload client to `<head>`, or returns the page untouched when disabled. */
  async injectClient(html: string | Uint8Array<ArrayBuffer>): Promise<Uint8Array<ArrayBuffer>> {
    if (!DevFacade.enabled()) {
      return typeof html === 'string' ? new TextEncoder().encode(html) : html;
    }
    const rewritten = new HTMLRewriter()
      .on('head', {
        element: (el) => {
          el.append(CLIENT_TAG, { html: true });
        },
      })
      .transform(new Response(html));
    return rewritten.bytes();
  }
}

export function createDevFacade(): DevFacade {
  return new DevFacade(createStaticFacade());
}
