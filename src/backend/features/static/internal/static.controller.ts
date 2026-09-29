import { extname } from 'node:path';
import type { DevFacade } from '../../dev/dev.facade.ts';
import type { WebFile, WebFiles } from './web-files.ts';

export class StaticController {
  readonly #dev: DevFacade;
  readonly #files: WebFiles;

  constructor(dev: DevFacade, files: WebFiles) {
    this.#dev = dev;
    this.#files = files;
  }

  async vendor(req: Request): Promise<Response> {
    const file = await this.#files.vendor(new URL(req.url).pathname);
    if (file.kind === 'file') {
      return this.#respond(req, file.body, { 'Content-Type': file.type });
    }
    if (file.kind === 'error') {
      return new Response(file.message, { status: 500 });
    }
    return new Response('Not found', { status: 404 });
  }

  async frontend(req: Request): Promise<Response> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { pathname } = new URL(req.url);
    const isDirectory = pathname === '/' || pathname.endsWith('/');

    // `/` arrives as `/index.html`.
    const file = await this.#files.page(isDirectory ? `${pathname}index.html` : pathname);
    switch (file.kind) {
      case 'file':
        return this.#serve(req, file);
      case 'error':
        return new Response(file.message, { status: 500 });
      case 'invalid':
        return new Response('Not found', { status: 404 });
      case 'missing':
        break;
    }

    // Unknown path without a file extension: let the single-page app route it. A trailing
    // slash asked for a directory index that is not there, so it is a miss, not a route.
    if (extname(pathname) === '' && !isDirectory) {
      const index = await this.#files.page('/index.html');
      if (index.kind === 'file') {
        return this.#serve(req, index);
      }
    }
    return new Response('Not found', { status: 404 });
  }

  /** A page gets the hot-reload client injected in development — before hashing, so the ETag covers it. */
  async #serve(req: Request, file: WebFile & { kind: 'file' }): Promise<Response> {
    const body = file.type.startsWith('text/html') ? await this.#dev.injectClient(file.body) : file.body;
    return this.#respond(req, body, { 'Content-Type': file.type });
  }

  /** Assets carry a hash-free URL, so every response is revalidated against its content hash. */
  #respond(req: Request, body: string | Uint8Array<ArrayBuffer>, headers: Record<string, string>): Response {
    const etag = `"${Bun.hash(body).toString(36)}"`;
    const cache = { ETag: etag, 'Cache-Control': 'no-cache' };
    if (matchesEtag(req.headers.get('If-None-Match'), etag)) {
      return new Response(null, { status: 304, headers: cache });
    }
    return new Response(body, { headers: { ...headers, ...cache } });
  }
}

/** RFC 9110 weak comparison. */
function matchesEtag(header: string | null, etag: string): boolean {
  if (header === null) {
    return false;
  }
  return header.split(',').some((entry) => {
    const tag = entry.trim();
    return tag === '*' || tag.replace(/^W\//, '') === etag;
  });
}
