/**
 * The static half of the server, as routes: `src/frontend/` under `/*`, plus one route
 * per entry of the vendor allowlist in `paths.ts`.
 *
 * `/*` is the least specific pattern in the table, so it is reached only when no `/api`
 * pattern and no vendor URL matched — Bun matches by specificity, not by declaration
 * order. It is a bare function rather than a `{ GET, HEAD }` map because a map answers an
 * unmatched verb with an empty 404, and this route owns the 405 for the whole server.
 */
import { extname, resolve } from 'node:path';
import { FRONTEND_DIR, VENDOR_FILES, resolveStaticPath, resolveVendorPath } from '../../paths.ts';
import { transpileModule } from '../../transpile.ts';
import type { RouteTable } from './shared.ts';

export function staticRoutes(): RouteTable {
  return { ...vendorRoutes(), '/*': serveFrontend };
}

/** One route per allowlisted vendor URL, so the table names every file it will serve. */
function vendorRoutes(): RouteTable {
  return Object.fromEntries(Object.keys(VENDOR_FILES).map((url) => [url, { GET: serveVendor, HEAD: serveVendor }]));
}

async function serveVendor(req: Request): Promise<Response> {
  const vendor = resolveVendorPath(new URL(req.url).pathname);
  if (!vendor) {
    // The specifier would not resolve: the package is not installed. Today's 404.
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

async function serveFrontend(req: Request): Promise<Response> {
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
