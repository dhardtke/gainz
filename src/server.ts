import { extname, normalize, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { DEFAULT_DB_PATH, openDatabase } from "./db";
import { errorResponse } from "./http";
import { Repo } from "./repo";
import { apiRoutes } from "./routes";

const PROJECT_ROOT = resolve(fileURLToPath(new URL("..", import.meta.url)));
const PUBLIC_DIR = resolve(PROJECT_ROOT, "public");

/**
 * Third-party stylesheets served straight out of node_modules.
 *
 * An explicit allowlist of single files rather than a served directory, so
 * installing a package never exposes anything the app did not ask to publish.
 */
const VENDOR_FILES: Record<string, string> = {
  "/vendor/pico.css": "@picocss/pico/css/pico.orange.min.css",
};

function resolveVendorPath(pathname: string): string | null {
  const specifier = VENDOR_FILES[pathname];
  if (!specifier) return null;
  try {
    return Bun.resolveSync(specifier, PROJECT_ROOT);
  } catch {
    return null;
  }
}

/**
 * Maps a URL path to a file inside public/, or null if it would escape it.
 */
function resolveStaticPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes("\0")) return null;

  const target = resolve(PUBLIC_DIR, `.${normalize(decoded)}`);
  if (target !== PUBLIC_DIR && !target.startsWith(PUBLIC_DIR + sep)) return null;
  return target;
}

async function serveStatic(req: Request): Promise<Response> {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response("Method not allowed", { status: 405 });
  }

  const { pathname } = new URL(req.url);

  const vendor = resolveVendorPath(pathname);
  if (vendor) {
    const file = Bun.file(vendor);
    if (!(await file.exists())) {
      return new Response("Vendor stylesheet missing — run `bun install`", { status: 500 });
    }
    // Versioned by the lockfile rather than the URL, but it only changes on install.
    return new Response(file, {
      headers: { "Content-Type": "text/css;charset=utf-8", "Cache-Control": "public, max-age=3600" },
    });
  }

  const resolved = resolveStaticPath(pathname);
  if (!resolved) return new Response("Not found", { status: 404 });

  const isRoot = pathname === "/" || pathname.endsWith("/");
  const candidate = isRoot ? resolve(resolved, "index.html") : resolved;

  const file = Bun.file(candidate);
  if (await file.exists()) {
    // The app is a single page; assets carry a hash-free URL, so revalidate.
    return new Response(file, { headers: { "Cache-Control": "no-cache" } });
  }

  // Unknown path without a file extension: let the single-page app route it.
  if (extname(pathname) === "") {
    const index = Bun.file(resolve(PUBLIC_DIR, "index.html"));
    if (await index.exists()) {
      return new Response(index, { headers: { "Cache-Control": "no-cache" } });
    }
  }
  return new Response("Not found", { status: 404 });
}

/** Options for Bun.serve, shared by the CLI entry point and the test suite. */
export function serveOptions(repo: Repo) {
  return {
    routes: apiRoutes(repo),
    fetch: serveStatic,
    error: (err: Error) => errorResponse(err),
  };
}

if (import.meta.main) {
  const db = openDatabase(DEFAULT_DB_PATH);
  const repo = new Repo(db);
  const port = Number(process.env.PORT ?? 3000);

  const server = Bun.serve({ port, ...serveOptions(repo) });

  console.log(`gainz is lifting on ${server.url}`);
  console.log(`  database: ${DEFAULT_DB_PATH}`);

  const shutdown = async () => {
    await server.stop();
    db.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}
