import { normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// Relative to this module's own location: src/backend/features/static/internal/paths.ts, so
// five levels up is the repository root. `paths.test.ts` fails loudly if the file moves again.
const REPO_ROOT = resolve(fileURLToPath(new URL('../../../../..', import.meta.url)));
export const FRONTEND_DIR = resolve(REPO_ROOT, 'src', 'frontend');

/**
 * Third-party stylesheets served straight out of node_modules.
 *
 * An explicit allowlist of single files rather than a served directory, so
 * installing a package never exposes anything the app did not ask to publish.
 */
const VENDOR_FILES: Record<string, string> = {
  '/vendor/pico.css': '@picocss/pico/css/pico.min.css',
};

export function vendorUrls(): string[] {
  return Object.keys(VENDOR_FILES);
}

export function resolveVendorPath(pathname: string): string | null {
  const specifier = VENDOR_FILES[pathname];
  if (!specifier) {
    return null;
  }
  try {
    return Bun.resolveSync(specifier, REPO_ROOT);
  } catch {
    return null;
  }
}

/**
 * Maps a URL path to a file inside `src/frontend/`, or null if it would escape it.
 */
export function resolveStaticPath(pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  if (decoded.includes('\0')) {
    return null;
  }

  const target = resolve(FRONTEND_DIR, `.${normalize(decoded)}`);
  if (target !== FRONTEND_DIR && !target.startsWith(FRONTEND_DIR + sep)) {
    return null;
  }
  return target;
}
