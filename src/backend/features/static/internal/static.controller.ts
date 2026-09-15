import { basename, extname, resolve } from 'node:path';
import { FRONTEND_DIR, VENDOR_FILES, resolveStaticPath, resolveVendorPath } from './paths.ts';
import { transpileModule } from './transpile.ts';

export class StaticController {
  vendorUrls(): string[] {
    return Object.keys(VENDOR_FILES);
  }

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
    // Versioned by the lockfile rather than the URL, but it only changes on install.
    return new Response(file, {
      headers: { 'Content-Type': 'text/css;charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
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
        return this.#module(candidate);
      }
      // No explicit Content-Type: `new Response(Bun.file(x))` carries the type Bun infers from
      // the extension, off a complete MIME database — .svg → image/svg+xml, .woff2 → font/woff2,
      // .png → image/png, .webp → image/webp, and no extension → application/octet-stream. A
      // hand-written map here would be a subset of that, and would drift as `src/frontend/` grows.
      // The app is a single page; assets carry a hash-free URL, so revalidate.
      return new Response(file, { headers: { 'Cache-Control': 'no-cache' } });
    }

    // Unknown path without a file extension: let the single-page app route it. A trailing
    // slash asked for a directory index that is not there, so it is a miss, not a route.
    if (extname(pathname) === '' && !isDirectory) {
      const index = Bun.file(resolve(FRONTEND_DIR, 'index.html'));
      if (await index.exists()) {
        return new Response(index, { headers: { 'Cache-Control': 'no-cache' } });
      }
    }
    return new Response('Not found', { status: 404 });
  }

  /** The frontend is TypeScript on disk and JavaScript on the wire. */
  async #module(path: string): Promise<Response> {
    const code = await transpileModule(path);
    if (code === null) {
      return new Response(`Could not transpile ${basename(path)}`, { status: 500 });
    }
    return new Response(code, {
      headers: { 'Content-Type': 'text/javascript;charset=utf-8', 'Cache-Control': 'no-cache' },
    });
  }
}
