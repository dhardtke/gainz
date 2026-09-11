/**
 * The `fetch` fallback: everything that is not an `/api` route is a file on disk.
 */
import { extname, resolve } from 'node:path';
import { FRONTEND_DIR, resolveStaticPath, resolveVendorPath } from '../paths.ts';
import { transpileModule } from '../transpile.ts';

export async function serveStatic(req: Request): Promise<Response> {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return new Response('Method not allowed', { status: 405 });
  }

  const { pathname } = new URL(req.url);

  const vendor = resolveVendorPath(pathname);
  if (vendor) {
    const file = Bun.file(vendor);
    if (!(await file.exists())) {
      return new Response('Vendor stylesheet missing — run `bun install`', { status: 500 });
    }
    // Versioned by the lockfile rather than the URL, but it only changes on install.
    return new Response(file, {
      headers: { 'Content-Type': 'text/css;charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
    });
  }

  const resolved = resolveStaticPath(pathname);
  if (!resolved) {
    return new Response('Not found', { status: 404 });
  }

  const isRoot = pathname === '/' || pathname.endsWith('/');
  const candidate = isRoot ? resolve(resolved, 'index.html') : resolved;

  const file = Bun.file(candidate);
  if (await file.exists()) {
    // The frontend is TypeScript on disk and JavaScript on the wire.
    if (extname(candidate) === '.ts') {
      return transpileModule(candidate);
    }
    // No explicit Content-Type: `new Response(Bun.file(x))` carries the type Bun infers from
    // the extension, off a complete MIME database — .svg → image/svg+xml, .woff2 → font/woff2,
    // .png → image/png, .webp → image/webp, and no extension → application/octet-stream. A
    // hand-written map here would be a subset of that, and would drift as `src/frontend/` grows.
    // The app is a single page; assets carry a hash-free URL, so revalidate.
    return new Response(file, { headers: { 'Cache-Control': 'no-cache' } });
  }

  // Unknown path without a file extension: let the single-page app route it.
  if (extname(pathname) === '') {
    const index = Bun.file(resolve(FRONTEND_DIR, 'index.html'));
    if (await index.exists()) {
      return new Response(index, { headers: { 'Cache-Control': 'no-cache' } });
    }
  }
  return new Response('Not found', { status: 404 });
}
