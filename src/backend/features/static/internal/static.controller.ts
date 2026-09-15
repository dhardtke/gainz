import { basename, extname, resolve } from 'node:path';
import { FRONTEND_DIR, resolveStaticPath, resolveVendorPath } from './paths.ts';
import { transpileModule } from './transpile.ts';

export class StaticController {
  async vendor(req: Request): Promise<Response> {
    const vendor = resolveVendorPath(new URL(req.url).pathname);
    if (!vendor) {
      // The specifier would not resolve: the package is not installed.
      return new Response('Not found', { status: 404 });
    }

    const file = Bun.file(vendor);
    if (!(await file.exists())) {
      return new Response('Vendor stylesheet missing — run `bun install`', { status: 500 });
    }
    return this.#respond(req, await file.bytes(), { 'Content-Type': 'text/css;charset=utf-8' });
  }

  async frontend(req: Request): Promise<Response> {
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      return new Response('Method not allowed', { status: 405 });
    }

    const { pathname } = new URL(req.url);

    const resolved = resolveStaticPath(pathname);
    if (!resolved) {
      return new Response('Not found', { status: 404 });
    }

    const isDirectory = pathname === '/' || pathname.endsWith('/');
    const candidate = isDirectory ? resolve(resolved, 'index.html') : resolved;

    const file = Bun.file(candidate);
    if (await file.exists()) {
      if (extname(candidate) === '.ts') {
        return this.#module(req, candidate);
      }
      // `file.type` is Bun's MIME database lookup, so no hand-written map is kept here.
      return this.#respond(req, await file.bytes(), { 'Content-Type': file.type });
    }

    // Unknown path without a file extension: let the single-page app route it. A trailing
    // slash asked for a directory index that is not there, so it is a miss, not a route.
    if (extname(pathname) === '' && !isDirectory) {
      const index = Bun.file(resolve(FRONTEND_DIR, 'index.html'));
      if (await index.exists()) {
        return this.#respond(req, await index.bytes(), { 'Content-Type': index.type });
      }
    }
    return new Response('Not found', { status: 404 });
  }

  /** The frontend is TypeScript on disk and JavaScript on the wire. */
  async #module(req: Request, path: string): Promise<Response> {
    const code = await transpileModule(path);
    if (code === null) {
      return new Response(`Could not transpile ${basename(path)}`, { status: 500 });
    }
    return this.#respond(req, code, { 'Content-Type': 'text/javascript;charset=utf-8' });
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
